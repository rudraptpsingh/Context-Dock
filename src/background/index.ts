import {
  addProject,
  addSnippetToProject,
  getActiveProject,
  getActiveProjectId,
  setActiveProjectId,
  ensureActiveProject,
  getConversations,
  getProjects,
  getSettings,
  upsertConversation,
  upsertMemories,
} from '../utils/storage';
import * as mcp from './mcpBridge';
import { createLogger } from '../utils/logger';
import { trace } from '../utils/tracing';
import { summarizeConversation, isSummarizerReady, suggestTags, isLanguageModelReady } from '../utils/builtinAI';
import { updateConversation, getMemories } from '../utils/storage';
import { rankCandidates, type Candidate } from '../utils/ranker';
import { installOmnibox } from './omnibox';

const log = createLogger('background');

// ---------- Side panel + action ----------

chrome.action.onClicked.addListener(tab => {
  if (tab.id) chrome.sidePanel.open({ tabId: tab.id });
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

const CHAT_DOC_PATTERNS = [
  '*://chatgpt.com/*',
  '*://chat.openai.com/*',
  '*://claude.ai/*',
  '*://gemini.google.com/*',
  '*://www.perplexity.ai/*',
  '*://perplexity.ai/*',
];

// ---------- Context menus ----------
//
// Multiple events trigger a rebuild (install, startup, projects change).
// Without coordination, two concurrent runs both call removeAll() and then
// race on create() — Chrome/Edge surfaces this as "Cannot create item with
// duplicate id" runtime errors. We single-flight the rebuild and coalesce
// burst calls (e.g. when several snippets are saved in quick succession).

// chrome.contextMenus.create can race with itself across SW restarts,
// onInstalled, onStartup, and storage-change events even with a single-flight
// guard — Edge in particular surfaces the duplicate-id errors loudly. Each
// create() is wrapped so a duplicate-id from a parallel build is silently
// ignored; the functional outcome (every expected menu item exists) is what
// matters. Other failures still surface via chrome.runtime.lastError but
// don't crash the whole rebuild.
async function safeCreate(props: chrome.contextMenus.CreateProperties): Promise<void> {
  await new Promise<void>(resolve => {
    chrome.contextMenus.create(props, () => {
      const err = chrome.runtime.lastError;
      if (err && !/duplicate id/i.test(err.message ?? '')) {
        log.debug('contextMenus.create failed', { id: props.id, err: err.message });
      }
      resolve();
    });
  });
}

async function buildMenusOnce() {
  await chrome.contextMenus.removeAll();

  await safeCreate({
    id: 'save-selection-root',
    title: 'Save selection to Context Stash',
    contexts: ['selection'],
  });

  const projects = await getProjects();
  for (const project of projects) {
    await safeCreate({
      id: `save-selection-project-${project.id}`,
      parentId: 'save-selection-root',
      title: project.name,
      contexts: ['selection'],
    });
  }
  await safeCreate({
    id: 'save-selection-separator',
    parentId: 'save-selection-root',
    type: 'separator',
    contexts: ['selection'],
  });
  await safeCreate({
    id: 'save-selection-active',
    parentId: 'save-selection-root',
    title: 'Save to Active Project',
    contexts: ['selection'],
  });
  await safeCreate({
    id: 'save-selection-new-project',
    parentId: 'save-selection-root',
    title: '+ Create New Project...',
    contexts: ['selection'],
  });

  await safeCreate({
    id: 'clip-page',
    title: 'Clip Page to Context Stash',
    contexts: ['page'],
  });

  await safeCreate({
    id: 'harvest-conversation',
    title: 'Harvest this conversation to Context Stash',
    contexts: ['page'],
    documentUrlPatterns: CHAT_DOC_PATTERNS,
  });

  await safeCreate({
    id: 'paste-context-dock-root',
    title: 'Paste Context from Context Stash',
    contexts: ['editable'],
  });
  for (const project of projects) {
    await safeCreate({
      id: `paste-context-dock-project-${project.id}`,
      parentId: 'paste-context-dock-root',
      title: project.name,
      contexts: ['editable'],
    });
  }
  await safeCreate({
    id: 'paste-context-dock-separator',
    parentId: 'paste-context-dock-root',
    type: 'separator',
    contexts: ['editable'],
  });
  await safeCreate({
    id: 'paste-context-dock-active',
    parentId: 'paste-context-dock-root',
    title: 'Paste from Active Project',
    contexts: ['editable'],
  });
}

let menuRebuildInFlight: Promise<void> | null = null;
let menuRebuildPending = false;
let menuRebuildDebounce: number | undefined;

async function createContextMenus(): Promise<void> {
  if (menuRebuildInFlight) {
    // Coalesce: a rebuild is already running; mark that we want another pass
    // after it completes so we always finish on the latest projects state.
    menuRebuildPending = true;
    return menuRebuildInFlight;
  }
  menuRebuildInFlight = (async () => {
    try {
      await buildMenusOnce();
    } catch (err) {
      log.warn('context menu rebuild failed', err instanceof Error ? err.message : String(err));
    }
  })();
  await menuRebuildInFlight;
  menuRebuildInFlight = null;
  if (menuRebuildPending) {
    menuRebuildPending = false;
    return createContextMenus();
  }
}

function scheduleMenuRebuild() {
  // 200ms is short enough to feel instant but long enough to coalesce a
  // burst of storage writes (e.g. saving several snippets in a row).
  if (menuRebuildDebounce !== undefined) clearTimeout(menuRebuildDebounce);
  menuRebuildDebounce = setTimeout(() => {
    menuRebuildDebounce = undefined;
    void createContextMenus();
  }, 200) as unknown as number;
}

chrome.runtime.onInstalled.addListener(() => void createContextMenus());
chrome.runtime.onStartup.addListener(() => void createContextMenus());

// Omnibox: type "cs " in the URL bar to search the corpus.
installOmnibox();
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.projects) scheduleMenuRebuild();
});

// ---------- On-device summarisation + auto-tagging (Chrome/Edge built-in AI) ----------

async function summarizeAndStore(conversationId: string): Promise<void> {
  try {
    const conversations = await getConversations();
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv) return;
    const text = conv.turns
      .map(t => `${t.role === 'user' ? 'USER' : 'ASSISTANT'}: ${t.content}`)
      .join('\n\n')
      .slice(0, 6_000);
    if (!text) return;

    // Run summarisation and tagging in parallel — they're independent on-device
    // calls and we don't want to serialise the latency.
    const [summary, tags] = await Promise.all([
      isSummarizerReady().then(ok => (ok ? summarizeConversation(text) : null)),
      // Only re-run tag suggestion when the user hasn't manually tagged
      // (preserve their curation), and only when LanguageModel is ready.
      isLanguageModelReady().then(ok => (ok && conv.tags.length === 0 ? suggestTags(text) : [])),
    ]);

    const updates: Partial<typeof conv> = {};
    if (summary) {
      updates.summary = summary;
      updates.summaryGeneratedAt = Date.now();
    }
    if (tags && tags.length) {
      updates.tags = tags;
    }
    if (Object.keys(updates).length) {
      await updateConversation(conv.id, updates);
      log.info('auto-enrich', {
        id: conv.id,
        summary: summary ? summary.length : 0,
        tags: tags?.length ?? 0,
      });
    }
  } catch (err) {
    log.debug('summarizeAndStore failed', err instanceof Error ? err.message : String(err));
  }
}

// ---------- Toast helper (injected into pages) ----------

function showPageToast(tabId: number, message: string) {
  chrome.scripting
    .executeScript({
      target: { tabId },
      func: (msg: string) => {
        const toast = document.createElement('div');
        toast.innerHTML = `
          <div style="
            position: fixed; bottom: 24px; right: 24px;
            background: #0f172a; color: white;
            padding: 12px 20px; border-radius: 8px;
            font-family: Inter, system-ui, sans-serif; font-size: 14px;
            z-index: 999999; box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            animation: cdSlideIn 0.3s ease-out;
          ">${msg}</div>
          <style>@keyframes cdSlideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }</style>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      },
      args: [message],
    })
    .catch(() => {});
}

// ---------- Context menu click handlers ----------

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // CREATE NEW PROJECT
  if (info.menuItemId === 'save-selection-new-project' && info.selectionText) {
    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (text: string) => {
          const name = prompt('Enter name for new project:');
          if (name) {
            chrome.runtime.sendMessage({
              type: 'CREATE_PROJECT_AND_SAVE',
              name,
              content: text,
              url: window.location.href,
              title: document.title,
            });
          }
        },
        args: [info.selectionText],
      });
    }
    return;
  }

  // SAVE SELECTION
  if (
    (info.menuItemId === 'save-selection-active' ||
      (typeof info.menuItemId === 'string' &&
        info.menuItemId.startsWith('save-selection-project-'))) &&
    info.selectionText
  ) {
    let targetProjectId: string | null = null;
    let targetProjectName: string | null = null;
    let createdNew = false;
    if (info.menuItemId === 'save-selection-active') {
      const ensured = await ensureActiveProject();
      targetProjectId = ensured.project.id;
      targetProjectName = ensured.project.name;
      createdNew = ensured.created;
    } else if (typeof info.menuItemId === 'string') {
      targetProjectId = info.menuItemId.replace('save-selection-project-', '');
    }
    if (!targetProjectId) return;
    if (createdNew && tab?.id && targetProjectName) {
      showPageToast(tab.id, `Created project "${targetProjectName}" — saving here.`);
    }
    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (text: string, projectId: string) => {
          const label = prompt('Enter a label for this context:', '');
          if (label !== null) {
            chrome.runtime.sendMessage({
              type: 'SAVE_SELECTION_WITH_LABEL',
              projectId,
              content: text,
              label: label || undefined,
              url: window.location.href,
              title: document.title,
            });
          }
        },
        args: [info.selectionText, targetProjectId],
      });
    }
    return;
  }

  // CLIP PAGE
  if (info.menuItemId === 'clip-page' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'CLIP_PAGE' }, async response => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: () => {
            const content = document.body.innerText.slice(0, 5000);
            chrome.runtime.sendMessage({
              type: 'PAGE_CONTENT',
              content,
              title: document.title,
              url: window.location.href,
            });
          },
        });
        return;
      }
      if (response && response.success) {
        const activeProjectId = await getActiveProjectId();
        if (activeProjectId) {
          await addSnippetToProject(activeProjectId, {
            type: 'page_summary',
            content: response.content,
            sourceUrl: response.url,
            sourceTitle: response.title,
          });
          chrome.runtime.sendMessage({ type: 'REFRESH_DATA' }).catch(() => {});
          showPageToast(tab.id!, `✓ Clipped "${String(response.title).slice(0, 20)}..." to Context Stash`);
        } else {
          chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => alert('Please open Context Stash and create a project first.'),
          });
        }
      }
    });
    return;
  }

  // HARVEST CONVERSATION (user-initiated)
  if (info.menuItemId === 'harvest-conversation' && tab?.id) {
    const tabId = tab.id;
    chrome.tabs.sendMessage(tabId, { type: 'HARVEST_REQUEST' }).catch(async err => {
      log.warn('harvest sendMessage failed', err instanceof Error ? err.message : String(err));
      // Fast diagnostic: try to inject a probe via the activeTab/scripting
      // permission. If THAT also fails, it's a site-access issue. If it
      // succeeds but the content script wasn't there, the manifest didn't
      // match this URL.
      let diagnosis = 'Context Stash could not reach this page.';
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({
            href: location.href,
            host: location.hostname,
            ready: document.readyState,
            harvesterAlive: !!(window as unknown as { __cs_harvester__?: boolean }).__cs_harvester__,
          }),
        });
        const probe = result?.result;
        if (probe?.harvesterAlive) {
          diagnosis = 'Harvester loaded but did not respond — please refresh the tab and try again.';
        } else {
          diagnosis =
            'Content script not injected. In edge://extensions or chrome://extensions, open Context Stash → Details → Site access → set to "On all sites", then refresh this tab.';
        }
        log.warn('harvest diagnostic', probe);
      } catch (probeErr) {
        log.warn('probe also failed', probeErr instanceof Error ? probeErr.message : String(probeErr));
        diagnosis =
          'Site access blocked. In edge://extensions or chrome://extensions, open Context Stash → Details → Site access → set to "On all sites", then refresh this tab.';
      }
      showPageToast(tabId, `Context Stash: ${diagnosis}`);
    });
    return;
  }

  // PASTE CONTEXT
  if (
    info.menuItemId === 'paste-context-dock-active' ||
    (typeof info.menuItemId === 'string' &&
      info.menuItemId.startsWith('paste-context-dock-project-'))
  ) {
    let targetProjectId: string | null = null;
    if (info.menuItemId === 'paste-context-dock-active') {
      targetProjectId = await getActiveProjectId();
    } else if (typeof info.menuItemId === 'string') {
      targetProjectId = info.menuItemId.replace('paste-context-dock-project-', '');
    }
    if (!tab?.id || !targetProjectId) return;
    chrome.tabs
      .sendMessage(tab.id, { type: 'INJECT_CONTEXT_FROM_MENU', projectId: targetProjectId })
      .catch(() => {});
  }
});

// ---------- Keyboard commands ----------

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'open-side-panel') {
    if (tab?.id) chrome.sidePanel.open({ tabId: tab.id });
    return;
  }
  if (command === 'harvest-current-conversation') {
    if (tab?.id) {
      chrome.tabs
        .sendMessage(tab.id, { type: 'HARVEST_REQUEST' })
        .catch(() => showPageToast(tab.id!, 'Context Stash: this page does not support harvesting.'));
    }
    return;
  }
  if (command === 'paste-active-context') {
    const activeProjectId = await getActiveProjectId();
    if (!tab?.id || !activeProjectId) return;
    chrome.tabs
      .sendMessage(tab.id, { type: 'INJECT_CONTEXT_FROM_MENU', projectId: activeProjectId })
      .catch(() => {});
  }
});

// ---------- Runtime messages ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Legacy snippet flow
  if (message.type === 'SAVE_SELECTION_WITH_LABEL') {
    (async () => {
      await addSnippetToProject(message.projectId, {
        type: 'selection',
        content: message.content,
        label: message.label,
        sourceUrl: message.url,
        sourceTitle: message.title,
      });
      chrome.runtime.sendMessage({ type: 'REFRESH_DATA' }).catch(() => {});
      if (sender.tab?.id) {
        const labelText = message.label ? ` [${message.label}]` : '';
        const trimmed = String(message.content).slice(0, 25);
        const ellipsis = String(message.content).length > 25 ? '...' : '';
        showPageToast(sender.tab.id, `✓ Saved "${trimmed}${ellipsis}"${labelText} to Context Stash`);
      }
    })();
    return false;
  }

  if (message.type === 'PAGE_CONTENT') {
    (async () => {
      const { project, created } = await ensureActiveProject();
      await addSnippetToProject(project.id, {
        type: 'page_summary',
        content: message.content.slice(0, 10000),
        sourceUrl: message.url,
        sourceTitle: message.title,
      });
      if (sender.tab?.id) {
        const verb = created ? `Created "${project.name}", clipped page` : `Clipped page to ${project.name}`;
        showPageToast(sender.tab.id, `✓ ${verb}`);
      }
      chrome.runtime.sendMessage({ type: 'REFRESH_DATA' }).catch(() => {});
      sendResponse({ success: true, projectId: project.id, projectName: project.name });
    })();
    return true;
  }

  if (message.type === 'CREATE_PROJECT_AND_SAVE') {
    (async () => {
      const newProject = await addProject(message.name);
      await addSnippetToProject(newProject.id, {
        type: 'selection',
        content: message.content,
        sourceUrl: message.url,
        sourceTitle: message.title,
      });
      chrome.runtime.sendMessage({ type: 'REFRESH_DATA' }).catch(() => {});
      if (sender.tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          func: (projectName: string) => alert(`Created project "${projectName}" and saved selection.`),
          args: [newProject.name],
        });
      }
    })();
    return false;
  }

  if (message.type === 'GET_CONTEXT') {
    (async () => {
      const project = await getActiveProject();
      if (!project || project.snippets.length === 0) {
        sendResponse({ context: null });
        return;
      }
      sendResponse({ context: null });
    })();
    return true;
  }

  // ---------- Floating dock actions ----------

  if (message.type === 'DOCK_SAVE_SELECTION') {
    (async () => {
      const { project, created } = await ensureActiveProject();
      await addSnippetToProject(project.id, {
        type: 'selection',
        content: String(message.payload?.text ?? ''),
        sourceUrl: String(message.payload?.sourceUrl ?? ''),
        sourceTitle: String(message.payload?.sourceTitle ?? ''),
      });
      if (sender.tab?.id) {
        const verb = created ? `Created "${project.name}", saved` : `Saved to ${project.name}`;
        showPageToast(sender.tab.id, `✓ ${verb}`);
      }
      chrome.runtime.sendMessage({ type: 'REFRESH_DATA' }).catch(() => {});
    })();
    return false;
  }

  // ---------- Bulk import orchestration ----------
  //
  // Side panel sends START_BULK_IMPORT { platform }. We find an open tab on
  // that platform (or open one), forward BULK_IMPORT_START to it, and let
  // the content script's importer drive the rest. Progress messages from
  // the content script come back as BULK_IMPORT_PROGRESS via runtime
  // broadcast and the side panel listens directly.

  if (message.type === 'START_BULK_IMPORT') {
    (async () => {
      const platformHosts: Record<string, string[]> = {
        chatgpt: ['chatgpt.com', 'chat.openai.com'],
        claude: ['claude.ai'],
        gemini: ['gemini.google.com'],
        perplexity: ['www.perplexity.ai', 'perplexity.ai'],
      };
      const hosts = platformHosts[message.platform] ?? [];
      if (!hosts.length) {
        sendResponse({ ok: false, error: `unknown platform ${message.platform}` });
        return;
      }
      const tabUrlPatterns = hosts.map(h => `*://${h}/*`);
      const candidates: chrome.tabs.Tab[] = [];
      for (const url of tabUrlPatterns) candidates.push(...(await chrome.tabs.query({ url })));
      let tab = candidates[0];
      if (!tab) {
        tab = await chrome.tabs.create({ url: `https://${hosts[0]}/`, active: false });
        // Wait briefly for the content script to install.
        await new Promise(r => setTimeout(r, 2_500));
      }
      if (!tab?.id) {
        sendResponse({ ok: false, error: 'could not open platform tab' });
        return;
      }
      try {
        const r = (await chrome.tabs.sendMessage(tab.id, {
          type: 'BULK_IMPORT_START',
          platform: message.platform,
        })) as { ok: boolean; final?: unknown; error?: string };
        sendResponse(r);
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return true;
  }

  // Refresh-all: re-runs the bulk importer once per platform we already have
  // conversations for. The importer's upsert path is already idempotent — it
  // matches on (platform, platformConversationId) and replaces turns.
  if (message.type === 'REFRESH_ALL_CONVERSATIONS') {
    (async () => {
      const all = await getConversations();
      const platforms = Array.from(new Set(all.map(c => c.platform))).filter(p =>
        ['chatgpt', 'claude'].includes(p),
      );
      const results: Array<{ platform: string; ok: boolean; error?: string }> = [];
      for (const platform of platforms) {
        try {
          const r = (await chrome.runtime.sendMessage({
            type: 'START_BULK_IMPORT',
            platform,
          })) as { ok: boolean; error?: string };
          results.push({ platform, ok: !!r?.ok, error: r?.error });
        } catch (err) {
          results.push({ platform, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
      sendResponse({ ok: true, results });
    })();
    return true;
  }

  if (message.type === 'CREATE_PROJECT_FROM_POPUP') {
    (async () => {
      const name = String(message.name ?? '').trim();
      if (!name) {
        sendResponse({ ok: false, error: 'name required' });
        return;
      }
      const project = await addProject(name);
      await setActiveProjectId(project.id);
      chrome.runtime.sendMessage({ type: 'REFRESH_DATA' }).catch(() => {});
      sendResponse({ ok: true, project: { id: project.id, name: project.name } });
    })();
    return true;
  }

  // Bidirectional inject: rank candidate context for the user's current
  // prompt. Runs in the SW (no DOM dependency) and returns the top-N items
  // for the dock to render in its picker.
  if (message.type === 'DOCK_RANK_CONTEXT') {
    (async () => {
      try {
        const [projects, conversations, memories] = await Promise.all([
          getProjects(),
          getConversations(),
          getMemories(),
        ]);
        const activeId = await getActiveProjectId();
        const candidates: Candidate[] = [];
        for (const p of projects) {
          for (const s of p.snippets) {
            candidates.push({
              kind: 'snippet',
              id: s.id,
              projectId: p.id,
              projectName: p.name,
              content: s.content,
              label: s.label,
              sourceUrl: s.sourceUrl,
            });
          }
        }
        // Recent assistant turns (last 30 days), to surface "I asked Claude
        // about this last week" answers.
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        for (const conv of conversations) {
          if (conv.lastSyncedAt < thirtyDaysAgo) continue;
          for (const t of conv.turns) {
            if (t.role !== 'assistant') continue;
            candidates.push({
              kind: 'turn',
              conversationId: conv.id,
              conversationTitle: conv.title,
              platform: conv.platform,
              content: t.content,
              role: t.role,
            });
          }
        }
        for (const m of memories) {
          candidates.push({ kind: 'memory', id: m.id, platform: m.platform, content: m.text });
        }
        // Lightly favour items from the active project.
        const ranked = rankCandidates(message.query ?? '', candidates, {
          limit: 8,
          minScore: 0.3,
          weights: { snippet: 1.2, memory: 1.1, turn: 1 },
        }).map(r => {
          const isActive =
            r.candidate.kind === 'snippet' && r.candidate.projectId === activeId;
          return {
            score: r.score,
            kind: r.candidate.kind,
            title:
              r.candidate.kind === 'snippet'
                ? `${r.candidate.label ?? r.candidate.projectName}${isActive ? ' · active' : ''}`
                : r.candidate.kind === 'turn'
                  ? r.candidate.conversationTitle
                  : `${r.candidate.platform} memory`,
            content: r.candidate.content,
          };
        });
        sendResponse({ ok: true, items: ranked });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  }

  if (message.type === 'DOCK_OPEN_PANEL') {
    (async () => {
      try {
        const winId = sender.tab?.windowId;
        if (winId !== undefined && chrome.sidePanel?.open) {
          await chrome.sidePanel.open({ windowId: winId });
        }
      } catch {
        /* sidePanel.open may not be available in all Chromium builds */
      }
    })();
    return false;
  }

  // ---------- Memory upsert (called by bulk-import content script) ----------

  if (message.type === 'UPSERT_MEMORIES') {
    (async () => {
      const r = await upsertMemories(message.platform, message.items ?? []);
      log.info('memories upserted', { platform: message.platform, ...r });
      sendResponse(r);
    })();
    return true;
  }

  // ---------- Conversation harvest ----------

  if (message.type === 'HARVEST_CONVERSATION') {
    (async () => {
      const result = await trace(
        'background.harvest_upsert',
        () =>
          upsertConversation({
            platform: message.platform,
            platformConversationId: message.platformConversationId,
            url: message.url,
            title: message.title,
            turns: message.turns,
          }),
        { platform: message.platform, turns: message.turns?.length ?? 0 },
      );
      log.info('harvested', {
        platform: message.platform,
        title: result.conversation.title,
        isNew: result.isNew,
        changed: result.changed,
        turns: result.conversation.turns.length,
      });
      chrome.runtime.sendMessage({ type: 'REFRESH_DATA' }).catch(() => {});
      // Fire-and-forget on-device summarisation when the content changed.
      // Non-blocking; storage already reflects the harvested turns.
      if (result.changed || result.isNew) void summarizeAndStore(result.conversation.id);
      // Push snapshot to MCP bridge if connected
      if (mcp.isConnected()) {
        mcp.send({
          type: 'PUSH_SNAPSHOT',
          payload: { conversationId: result.conversation.id, changed: result.changed },
        });
      }
      // First-time harvest of a conversation: surface a toast on the originating tab.
      if (result.isNew && sender.tab?.id) {
        showPageToast(
          sender.tab.id,
          `✓ Harvested "${result.conversation.title.slice(0, 28)}" to Context Stash`,
        );
      }
      sendResponse?.({
        ok: true,
        conversationId: result.conversation.id,
        isNew: result.isNew,
        changed: result.changed,
      });
    })();
    return true;
  }

  if (message.type === 'MCP_BRIDGE_CONNECT') {
    const ok = mcp.connect();
    sendResponse({ ok, connected: mcp.isConnected(), error: mcp.getLastError() });
    return false;
  }

  if (message.type === 'MCP_BRIDGE_DISCONNECT') {
    mcp.disconnect();
    sendResponse({ ok: true, connected: false });
    return false;
  }

  if (message.type === 'MCP_BRIDGE_PING') {
    sendResponse({ connected: mcp.isConnected(), error: mcp.getLastError() });
    return false;
  }

  return false;
});

// ---------- Auto-connect MCP bridge if user enabled it ----------

(async () => {
  try {
    const settings = await getSettings();
    if (settings.mcpBridgeEnabled) mcp.connect();
  } catch {
    /* settings unavailable on first install */
  }
  // Touch storage to ensure migration runs on cold start.
  void getConversations();
})();
