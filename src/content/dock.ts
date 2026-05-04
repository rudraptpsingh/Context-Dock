// Floating Context Stash pill on chat pages.
//
// One-click harvest, save-selection, and (future) inject. Lives in a Shadow
// DOM root so site CSS can't bleed in and our styles can't bleed out. The
// pill is project-coloured, sticks to the top-right, and is dismissable per
// tab via the X (state lives in chrome.storage.session).
//
// Why pure TS instead of React: keeps the content-script bundle tiny (~3 KB
// gzipped), has zero React-version conflicts with sites that already ship
// React, and means we don't pay the React boot cost on every navigation.

import { findAdapter } from './platforms';
import { createLogger } from '../utils/logger';

const log = createLogger('dock');

interface ActiveProject {
  id: string;
  name: string;
  color?: string;
}

interface DockState {
  activeProject: ActiveProject | null;
  conversationKnown: boolean;
  syncing: boolean;
  dismissed: boolean;
}

const COLORS = ['#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0891b2'];
function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

const STYLES = `
  :host {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color-scheme: light dark;
  }
  .dock {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(15, 23, 42, 0.94);
    color: #f8fafc;
    padding: 6px 10px 6px 6px;
    border-radius: 999px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.18);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: pointer;
    user-select: none;
    transition: padding 120ms ease, transform 120ms ease;
  }
  .dock:hover { transform: translateY(-1px); }
  .dot {
    width: 18px; height: 18px; border-radius: 999px;
    background: var(--cs-color, #2563eb);
    flex: 0 0 auto;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.18) inset;
  }
  .dot.synced::after {
    content: "";
    display: block;
    width: 6px; height: 6px;
    border-radius: 999px;
    background: #22c55e;
    margin: 6px 0 0 6px;
    box-shadow: 0 0 0 2px #0f172a;
  }
  .label {
    font-size: 12px; font-weight: 600; letter-spacing: 0.01em;
    max-width: 0; overflow: hidden; white-space: nowrap;
    transition: max-width 160ms ease, margin-right 160ms ease;
    margin-right: 0;
  }
  .dock:hover .label, .dock[data-expanded="true"] .label {
    max-width: 240px; margin-right: 4px;
  }
  .actions {
    display: none;
    gap: 4px;
  }
  .dock[data-expanded="true"] .actions { display: flex; }
  button.action {
    appearance: none;
    border: 0;
    background: rgba(255,255,255,0.08);
    color: inherit;
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
  }
  button.action:hover { background: rgba(255,255,255,0.16); }
  button.close {
    appearance: none;
    border: 0; background: transparent; color: rgba(255,255,255,0.6);
    cursor: pointer; padding: 0 4px; font-size: 14px; line-height: 1;
  }
  button.close:hover { color: #fff; }
  .toast {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: #0f172a;
    color: #f8fafc;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.2);
    opacity: 0;
    transform: translateY(-4px);
    pointer-events: none;
    transition: opacity 160ms ease, transform 160ms ease;
    white-space: nowrap;
  }
  .toast.show { opacity: 1; transform: translateY(0); }
`;

export function mountDock() {
  const adapter = findAdapter(window.location);
  if (!adapter) return;

  if (document.getElementById('cs-dock-root')) return;

  const host = document.createElement('div');
  host.id = 'cs-dock-root';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  root.appendChild(style);

  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', 'Context Stash');
  dock.innerHTML = `
    <div class="dot" id="cs-dot"></div>
    <div class="label" id="cs-label">Context Stash</div>
    <div class="actions" id="cs-actions">
      <button class="action" data-action="harvest">Harvest</button>
      <button class="action" data-action="save-selection">Clip selection</button>
      <button class="action" data-action="open-panel">Open</button>
      <button class="close" data-action="close" aria-label="Hide dock for this tab">×</button>
    </div>
    <div class="toast" id="cs-toast"></div>
  `;
  root.appendChild(dock);

  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;

  const state: DockState = {
    activeProject: null,
    conversationKnown: false,
    syncing: false,
    dismissed: false,
  };

  function render() {
    const dot = $('#cs-dot') as HTMLDivElement;
    const label = $('#cs-label') as HTMLDivElement;
    const color = state.activeProject ? colorForId(state.activeProject.id) : '#64748b';
    dot.style.setProperty('--cs-color', state.activeProject?.color ?? color);
    dot.classList.toggle('synced', state.conversationKnown);
    // Always show the platform — show project name when set, else gentle "no
    // project yet" hint so the user knows the next clip will auto-create one.
    label.textContent = state.activeProject
      ? `${adapter!.label} · ${state.activeProject.name}`
      : `${adapter!.label} · Quick Stash on save`;
  }

  function showToast(text: string) {
    const t = $('#cs-toast') as HTMLDivElement;
    t.textContent = text;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1600);
  }

  let expanded = false;
  function setExpanded(next: boolean) {
    expanded = next;
    dock.setAttribute('data-expanded', String(expanded));
  }

  dock.addEventListener('click', e => {
    const btn = (e.target as Element).closest('button.action, button.close') as HTMLButtonElement | null;
    if (!btn) {
      setExpanded(!expanded);
      return;
    }
    e.stopPropagation();
    const action = btn.getAttribute('data-action');
    if (action === 'close') {
      host.remove();
      // Per-tab dismissal: session storage clears when the tab closes.
      void chrome.storage.session.set({ [`cs:dock-dismissed:${location.host}`]: true });
      return;
    }
    if (action === 'harvest') {
      // Same isolated world as the harvester content script — talk directly.
      window.dispatchEvent(new CustomEvent('cs:harvest'));
      showToast('Harvesting…');
    }
    if (action === 'save-selection') {
      const selection = window.getSelection()?.toString() ?? '';
      if (!selection.trim()) {
        showToast('Select some text first');
        return;
      }
      chrome.runtime
        .sendMessage({
          type: 'DOCK_SAVE_SELECTION',
          payload: {
            text: selection,
            sourceUrl: location.href,
            sourceTitle: document.title,
          },
        })
        .catch(() => undefined);
      showToast('Saved to active project');
    }
    if (action === 'open-panel') {
      chrome.runtime.sendMessage({ type: 'DOCK_OPEN_PANEL' }).catch(() => undefined);
    }
  });

  // Auto-collapse when clicking outside.
  document.addEventListener('click', e => {
    if (!expanded) return;
    if ((e.target as Node | null)?.contains?.(host)) return;
    setExpanded(false);
  });

  async function refreshState() {
    try {
      const data = await chrome.storage.local.get(['projects', 'activeProjectId', 'conversations']);
      const projects = (data.projects as Array<{ id: string; name: string; color?: string }>) ?? [];
      const active = projects.find(p => p.id === data.activeProjectId) ?? null;
      state.activeProject = active;

      const convId = adapter!.parseConversationId(window.location);
      const conversations = (data.conversations as Array<{ platformConversationId: string; platform: string }>) ?? [];
      state.conversationKnown =
        !!convId && conversations.some(c => c.platform === adapter!.platform && c.platformConversationId === convId);
      render();
    } catch (err) {
      log.warn('refreshState failed', err instanceof Error ? err.message : String(err));
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('projects' in changes || 'activeProjectId' in changes || 'conversations' in changes) {
      void refreshState();
    }
  });

  // Re-evaluate after SPA navigations.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      void refreshState();
    }
  }, 1500);

  void refreshState();

  // Honour per-tab dismissal.
  void (async () => {
    const r = await chrome.storage.session.get(`cs:dock-dismissed:${location.host}`);
    if (r[`cs:dock-dismissed:${location.host}`]) host.remove();
  })();

  log.info('mounted', { platform: adapter.platform, host: location.host });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountDock, { once: true });
} else {
  mountDock();
}
