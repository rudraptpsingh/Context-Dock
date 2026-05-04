// Toolbar action popup. Shown when the user clicks the Context Stash icon.
// Three primary jobs:
//   1. One-click harvest of the current chat tab.
//   2. One-click "Import all from this site" (delegates to the bulk
//      importer if we're on a supported chat host).
//   3. Project switcher and recent-conversation jumper.

interface Project {
  id: string;
  name: string;
  color?: string;
}

interface Conversation {
  id: string;
  platform: string;
  platformConversationId: string;
  title: string;
  url: string;
}

const PLATFORM_HOSTS: Record<string, string[]> = {
  chatgpt: ['chatgpt.com', 'chat.openai.com'],
  claude: ['claude.ai'],
  gemini: ['gemini.google.com'],
  perplexity: ['www.perplexity.ai', 'perplexity.ai'],
};

const $ = (id: string) => document.getElementById(id) as HTMLElement;

function platformForHost(host: string | undefined | null): string | null {
  if (!host) return null;
  for (const [p, hosts] of Object.entries(PLATFORM_HOSTS)) {
    if (hosts.includes(host)) return p;
  }
  return null;
}

function platformLabel(p: string): string {
  return p === 'chatgpt' ? 'ChatGPT' : p === 'claude' ? 'Claude' : p === 'gemini' ? 'Gemini' : 'Perplexity';
}

function colorForId(id: string): string {
  const COLORS = ['#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0891b2'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

function showToast(text: string) {
  const t = $('cs-pop-toast');
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1600);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabHost = tab?.url ? new URL(tab.url).hostname : null;
  const platform = platformForHost(tabHost);
  $('cs-pop-host').textContent = tabHost ?? '';

  const data = await chrome.storage.local.get(['projects', 'activeProjectId', 'conversations']);
  const projects = (data.projects as Project[]) ?? [];
  const activeProjectId = data.activeProjectId as string | undefined;
  const active = projects.find(p => p.id === activeProjectId);
  const conversations = ((data.conversations as Conversation[]) ?? []).slice().reverse();

  // Header — active project line.
  if (active) {
    $('cs-pop-project-name').textContent = active.name;
    ($('cs-pop-project-dot') as HTMLDivElement).style.background = active.color ?? colorForId(active.id);
  }

  // Disable platform-only actions when not on a chat tab.
  ($('cs-pop-harvest') as HTMLButtonElement).disabled = !platform || !tab?.id;
  ($('cs-pop-import-all') as HTMLButtonElement).disabled =
    !platform || !['chatgpt', 'claude'].includes(platform);

  // Harvest.
  $('cs-pop-harvest').addEventListener('click', async () => {
    if (!tab?.id) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'HARVEST_REQUEST' });
      showToast('Harvesting…');
    } catch {
      showToast('No content script — open a chat first');
    }
  });

  // One-click "import all from this site". Delegates to the same
  // START_BULK_IMPORT path the side panel uses.
  $('cs-pop-import-all').addEventListener('click', async () => {
    if (!platform) return;
    const r = (await chrome.runtime.sendMessage({
      type: 'START_BULK_IMPORT',
      platform,
    })) as { ok: boolean; final?: { completed: number; failed: number; total: number }; error?: string };
    if (!r?.ok) {
      showToast(r?.error ?? 'Import failed');
      return;
    }
    if (r.final) {
      showToast(`Imported ${r.final.completed} / ${r.final.total} from ${platformLabel(platform)}`);
    }
  });

  // Open side panel.
  $('cs-pop-open-panel').addEventListener('click', async () => {
    const winId = tab?.windowId;
    try {
      if (winId !== undefined && chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: winId });
      }
    } catch {
      /* fall through */
    }
    window.close();
  });

  // Recent conversations (top 5).
  const recentSection = $('cs-pop-recent-section');
  const recentList = $('cs-pop-recent');
  const recent = conversations.slice(0, 5);
  if (recent.length) {
    recentSection.style.display = '';
    recentList.innerHTML = '';
    for (const conv of recent) {
      const btn = document.createElement('button');
      btn.className = 'recent-item';
      btn.title = conv.title;
      btn.innerHTML = `<span class="platform-tag">${platformLabel(conv.platform)}</span>${escapeHtml(conv.title)}`;
      btn.addEventListener('click', () => {
        chrome.tabs.create({ url: conv.url });
      });
      recentList.appendChild(btn);
    }
  }

  // Project switcher.
  const projectsList = $('cs-pop-projects');
  projectsList.innerHTML = '';
  for (const p of projects) {
    const btn = document.createElement('button');
    btn.className = 'row';
    const color = p.color ?? colorForId(p.id);
    btn.innerHTML = `
      <span style="display:flex;align-items:center;gap:8px;">
        <span style="width:8px;height:8px;border-radius:999px;background:${color}"></span>
        ${escapeHtml(p.name)}
      </span>
      ${p.id === activeProjectId ? '<span class="meta">active</span>' : ''}
    `;
    btn.addEventListener('click', async () => {
      await chrome.storage.local.set({ activeProjectId: p.id });
      showToast(`Active: ${p.name}`);
      setTimeout(() => window.close(), 800);
    });
    projectsList.appendChild(btn);
  }
  // Always-available inline "+ New project" entry — no dead-end empty state.
  const newBtn = document.createElement('button');
  newBtn.className = 'row';
  newBtn.innerHTML = `
    <span style="display:flex;align-items:center;gap:8px;color:#2563eb;">
      <span style="font-weight:600;">+ New project</span>
    </span>
  `;
  newBtn.addEventListener('click', async () => {
    const name = window.prompt('Project name:');
    if (!name?.trim()) return;
    const r = (await chrome.runtime.sendMessage({
      type: 'CREATE_PROJECT_FROM_POPUP',
      name: name.trim(),
    })) as { ok: boolean; project?: { id: string; name: string } };
    if (r?.ok && r.project) {
      showToast(`Active: ${r.project.name}`);
      setTimeout(() => window.close(), 800);
    }
  });
  projectsList.appendChild(newBtn);

  $('cs-pop-settings').addEventListener('click', async () => {
    const winId = tab?.windowId;
    try {
      if (winId !== undefined && chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: winId });
      }
    } catch {
      /* ignore */
    }
    window.close();
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

init().catch(err => {
  showToast(err instanceof Error ? err.message : String(err));
});
