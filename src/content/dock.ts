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

// Per-project hashed color palette. Curated set of saturated colors that
// read well as small dots and against our dark popover background.
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#db2777', '#f97316', '#7c3aed', '#0891b2'];
function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

const STYLES = `
  :host {
    position: fixed;
    /* Bottom-right with breathing room above the composer. Inline left/top
       overrides this when the user has dragged. */
    bottom: 120px;
    right: 16px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color-scheme: light dark;
  }

  /* ---------- Launcher (default state, ~32px brand chip) ----------
     Designed: gradient brand chip with a thin highlight rim and a centred
     glyph — distinguishes from generic flat-color extension dots and
     reads as a deliberately-designed object even at small sizes. */
  .launcher {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--cs-color, #4f46e5), color-mix(in srgb, var(--cs-color, #4f46e5) 70%, #000));
    box-shadow:
      0 0 0 1.5px rgba(255, 255, 255, 0.2) inset,
      0 6px 18px -4px rgba(15, 23, 42, 0.32),
      0 1px 2px rgba(15, 23, 42, 0.18);
    cursor: pointer;
    user-select: none;
    position: relative;
    transition: transform 140ms cubic-bezier(0.2, 0, 0, 1.2), box-shadow 140ms ease;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.94);
  }
  /* Centred glyph — a brand mark (•) so the chip reads as designed even at
     small sizes. */
  .launcher::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.16);
  }
  .launcher:hover { transform: translateY(-1px) scale(1.04); }
  .launcher.dragging { cursor: grabbing; transform: scale(1.08); }
  /* Sync indicator — a tiny green dot at the bottom-right corner when this
     conversation has been captured. */
  .launcher.synced::after {
    content: "";
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #10b981;
    box-shadow:
      0 0 0 2px #ffffff,
      0 1px 2px rgba(15, 23, 42, 0.25);
  }
  /* Hide the launcher while the popover is open so the popover sits cleanly. */
  :host([data-expanded="true"]) .launcher { display: none; }

  /* ---------- Popover (expanded state) ---------- */
  .popover {
    display: none;
    background: rgba(15, 23, 42, 0.96);
    color: #f8fafc;
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    width: 232px;
    overflow: hidden;
    animation: cs-pop 140ms cubic-bezier(0.2, 0, 0, 1.2);
  }
  @keyframes cs-pop {
    from { opacity: 0; transform: translateY(4px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  :host([data-expanded="true"]) .popover { display: block; }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .header .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--cs-color, #2563eb);
    flex: 0 0 auto;
  }
  .header .title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header .drag-handle {
    cursor: grab;
    padding: 2px;
    display: flex;
    align-items: center;
    color: rgba(255, 255, 255, 0.4);
  }
  .header .drag-handle:hover { color: rgba(255, 255, 255, 0.7); }
  .header .drag-handle:active { cursor: grabbing; }
  .header .close {
    appearance: none;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    padding: 0 2px;
    font-size: 16px;
    line-height: 1;
  }
  .header .close:hover { color: #fff; }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: rgba(255, 255, 255, 0.04);
  }
  button.action {
    appearance: none;
    border: 0;
    background: rgba(15, 23, 42, 0.96);
    color: inherit;
    font: inherit;
    font-size: 12px;
    padding: 10px 8px;
    text-align: center;
    cursor: pointer;
    transition: background 120ms ease;
  }
  button.action:hover { background: rgba(255, 255, 255, 0.08); }
  /* Span the row when there's an odd one out, e.g. "Open side panel". */
  button.action.full { grid-column: 1 / -1; }

  .toast {
    position: absolute;
    bottom: calc(100% + 6px);
    right: 0;
    background: #0f172a;
    color: #f8fafc;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.22);
    opacity: 0;
    transform: translateY(4px);
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

  // Two stacked elements share the host's positioning: a 28px launcher
  // (default) and a popover (expanded). Toggling [data-expanded] on the
  // host swaps which one is visible.
  const dock = document.createElement('div');
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', 'Context Stash');
  dock.innerHTML = `
    <div class="launcher" id="cs-launcher" title="Context Stash" aria-label="Context Stash"></div>
    <div class="popover" id="cs-popover" role="dialog" aria-label="Context Stash actions">
      <div class="header">
        <div class="dot" id="cs-dot"></div>
        <div class="title" id="cs-label">Context Stash</div>
        <div class="drag-handle" id="cs-drag" title="Drag to move" aria-label="Drag to move">
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="3" cy="3" r="1.2"/><circle cx="7" cy="3" r="1.2"/>
            <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
            <circle cx="3" cy="11" r="1.2"/><circle cx="7" cy="11" r="1.2"/>
          </svg>
        </div>
        <button class="close" data-action="close" aria-label="Hide dock for this tab">×</button>
      </div>
      <div class="actions">
        <button class="action" data-action="harvest">Harvest</button>
        <button class="action" data-action="save-selection">Clip selection</button>
        <button class="action" data-action="inject">+ Context</button>
        <button class="action" data-action="open-panel">Side panel</button>
      </div>
      <div class="toast" id="cs-toast"></div>
    </div>
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
    const launcher = $('#cs-launcher') as HTMLDivElement;
    const popoverDot = $('#cs-dot') as HTMLDivElement;
    const label = $('#cs-label') as HTMLDivElement;
    const color = state.activeProject ? state.activeProject.color ?? colorForId(state.activeProject.id) : '#4f46e5';
    launcher.style.setProperty('--cs-color', color);
    popoverDot.style.setProperty('--cs-color', color);
    launcher.classList.toggle('synced', state.conversationKnown);
    label.textContent = state.activeProject
      ? `${adapter!.label} · ${state.activeProject.name}`
      : `${adapter!.label} · Quick Stash on save`;
    // Title-attr tooltip on the launcher tells the whole story without
    // expanding. Always carries the platform; project + sync state when set.
    const parts: string[] = [`Context Stash · ${adapter!.label}`];
    if (state.activeProject) parts.push(state.activeProject.name);
    if (state.conversationKnown) parts.push('synced');
    launcher.title = parts.join(' · ');
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
    // Style hooks live on `:host([data-expanded])` so we set the attr on
    // the host element rather than the inner dock div.
    if (expanded) host.setAttribute('data-expanded', 'true');
    else host.removeAttribute('data-expanded');
  }

  // ---------- Drag-to-reposition ----------
  //
  // Per-host saved position: localStorage (Edge-safe; chrome.storage.session
  // sometimes throws "Access to storage is not allowed" in content contexts).
  // Position is stored as { left, top } in viewport-pixel coordinates, then
  // re-applied on init. Snaps to viewport edges when within 24px.

  const POS_KEY = `cs:dock-pos:${location.host}`;

  function readSavedPos(): { left: number; top: number } | null {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { left: number; top: number };
      if (typeof parsed.left === 'number' && typeof parsed.top === 'number') return parsed;
    } catch {
      /* ignore corrupt value */
    }
    return null;
  }

  function applyPosition(pos: { left: number; top: number }) {
    // Use left/top so we override the CSS bottom/right defaults cleanly.
    host.style.left = `${pos.left}px`;
    host.style.top = `${pos.top}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  // Apply any saved position immediately so we don't see a flash at the
  // default location.
  const savedPos = readSavedPos();
  if (savedPos) applyPosition(savedPos);

  // Shared drag plumbing — both the launcher (default state) and the drag
  // handle in the popover header trigger the same flow. We track whether
  // the pointer actually moved more than a few px so a click doesn't
  // accidentally open the popover after a drag.
  let dragState: { startX: number; startY: number; origLeft: number; origTop: number } | null = null;
  let launcherDragMoved = false;

  function attachDrag(target: HTMLElement, opts: { addDraggingClass?: boolean } = {}) {
    target.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      target.setPointerCapture(e.pointerId);
      const rect = host.getBoundingClientRect();
      dragState = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft: rect.left,
        origTop: rect.top,
      };
      launcherDragMoved = false;
      if (opts.addDraggingClass) target.classList.add('dragging');
    });
    target.addEventListener('pointermove', e => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) launcherDragMoved = true;
      const dockRect = host.getBoundingClientRect();
      const left = clamp(dragState.origLeft + dx, 0, window.innerWidth - dockRect.width);
      const top = clamp(dragState.origTop + dy, 0, window.innerHeight - dockRect.height);
      applyPosition({ left, top });
    });
    target.addEventListener('pointerup', e => {
      if (!dragState) return;
      try { target.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      dragState = null;
      if (opts.addDraggingClass) target.classList.remove('dragging');
      const rect = host.getBoundingClientRect();
      const SNAP = 24;
      let left = rect.left;
      let top = rect.top;
      if (left < SNAP) left = 8;
      else if (window.innerWidth - rect.right < SNAP) left = window.innerWidth - rect.width - 8;
      if (top < SNAP) top = 8;
      else if (window.innerHeight - rect.bottom < SNAP) top = window.innerHeight - rect.height - 8;
      applyPosition({ left, top });
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ left, top }));
      } catch {
        /* ignore quota / privacy errors */
      }
    });
  }

  attachDrag($('#cs-launcher') as HTMLDivElement, { addDraggingClass: true });
  attachDrag($('#cs-drag') as HTMLDivElement);
  // Suppress accidental click on the popover header drag handle.
  ($('#cs-drag') as HTMLDivElement).addEventListener('click', e => e.stopPropagation());

  // Launcher tap-to-expand. We listen on pointerup rather than click because
  // pointerdown.preventDefault() (used by the drag plumbing to stop text
  // selection mid-drag) can suppress the synthetic click on some browsers.
  // launcherDragMoved is set in attachDrag's pointermove when distance > 4px,
  // so a real drag doesn't accidentally open the popover.
  ($('#cs-launcher') as HTMLDivElement).addEventListener('pointerup', () => {
    if (launcherDragMoved) return;
    if (expanded) return;
    setExpanded(true);
  });

  // Action handlers in the popover.
  dock.addEventListener('click', e => {
    const btn = (e.target as Element).closest('button.action, button.close') as HTMLButtonElement | null;
    if (!btn) return;
    e.stopPropagation();
    const action = btn.getAttribute('data-action');
    if (action === 'close') {
      host.remove();
      try {
        void chrome.storage.session
          ?.set({ [`cs:dock-dismissed:${location.host}`]: true })
          .catch(() => undefined);
      } catch {
        /* ignored — degrade to per-page-load dismissal */
      }
      return;
    }
    if (action === 'harvest') {
      window.dispatchEvent(new CustomEvent('cs:harvest'));
      showToast('Harvesting…');
      setExpanded(false);
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
      setExpanded(false);
    }
    if (action === 'inject') {
      setExpanded(false);
      void openInjectPopover();
    }
    if (action === 'open-panel') {
      chrome.runtime.sendMessage({ type: 'DOCK_OPEN_PANEL' }).catch(() => undefined);
      setExpanded(false);
    }
  });

  // Click outside the host while expanded — collapse.
  document.addEventListener('mousedown', e => {
    if (!expanded) return;
    const t = e.target as Node | null;
    if (t && host.contains(t)) return;
    setExpanded(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && expanded) setExpanded(false);
  });

  // ---------- Inject popover ----------
  //
  // Opens an in-page popover (rendered into the same Shadow DOM root) that
  // shows the top-N most relevant pieces of context for what the user has
  // currently typed into the chat input. One click pastes a formatted
  // block into that input. Entirely client-side BM25; no server roundtrip.

  async function openInjectPopover() {
    const { findChatInput, insertIntoInput } = await import('../utils/chatInput');
    const input = findChatInput(document, adapter!.platform);
    if (!input) {
      showToast('No chat input found');
      return;
    }
    // Use whatever's currently in the input as the query. If empty, fall
    // back to the page title so the user still sees something useful.
    const queryText =
      ((input as HTMLTextAreaElement).value ?? input.textContent ?? '').trim() ||
      document.title;

    const r = (await chrome.runtime.sendMessage({
      type: 'DOCK_RANK_CONTEXT',
      query: queryText,
    })) as { ok: boolean; items?: Array<{ score: number; kind: string; title: string; content: string }> };
    if (!r?.ok || !r.items?.length) {
      showToast('No context matches this prompt yet');
      return;
    }

    // Render a tiny picker into the same shadow root.
    const old = root.querySelector('#cs-injector');
    old?.remove();
    const picker = document.createElement('div');
    picker.id = 'cs-injector';
    picker.style.cssText = `
      position: fixed; top: 56px; right: 12px; z-index: 2147483646;
      width: 320px; max-height: 60vh; overflow: auto;
      background: rgba(15, 23, 42, 0.96); color: #f8fafc;
      border-radius: 12px; padding: 8px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.28);
      backdrop-filter: blur(10px);
      font: 12px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    `;
    picker.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px 8px;">
        <span style="font-weight:600;">Inject context</span>
        <button id="cs-injector-close" style="background:transparent;border:0;color:#94a3b8;cursor:pointer;font-size:14px;">×</button>
      </div>
      <div id="cs-injector-list"></div>
      <div style="display:flex;justify-content:flex-end;gap:6px;padding:8px 4px 0;">
        <button id="cs-injector-confirm" style="background:#2563eb;color:#fff;border:0;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit;">Insert</button>
      </div>
    `;
    root.appendChild(picker);

    const list = picker.querySelector('#cs-injector-list') as HTMLDivElement;
    const checked = new Set<number>([0, 1, 2].filter(i => i < r.items!.length));
    r.items!.forEach((item, i) => {
      const row = document.createElement('label');
      row.style.cssText =
        'display:flex;align-items:flex-start;gap:8px;padding:6px;border-radius:6px;cursor:pointer;';
      row.addEventListener('mouseenter', () => (row.style.background = 'rgba(255,255,255,0.06)'));
      row.addEventListener('mouseleave', () => (row.style.background = ''));
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = checked.has(i);
      check.style.marginTop = '2px';
      check.addEventListener('change', () => {
        if (check.checked) checked.add(i); else checked.delete(i);
      });
      const meta = document.createElement('div');
      meta.style.flex = '1';
      const dim = '#94a3b8';
      meta.innerHTML = `
        <div style="font-size:10px;color:${dim};text-transform:uppercase;letter-spacing:.04em;">${item.kind}</div>
        <div style="font-weight:600;color:#f8fafc;">${escapeHtml(item.title || '(untitled)')}</div>
        <div style="color:#cbd5e1;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(item.content.slice(0, 240))}</div>
      `;
      row.append(check, meta);
      list.appendChild(row);
    });

    (picker.querySelector('#cs-injector-close') as HTMLButtonElement).addEventListener('click', () => picker.remove());
    (picker.querySelector('#cs-injector-confirm') as HTMLButtonElement).addEventListener('click', () => {
      const selected = [...checked].sort().map(i => r.items![i]);
      if (!selected.length) {
        picker.remove();
        return;
      }
      const block = formatContextBlock(selected);
      insertIntoInput(input, block);
      picker.remove();
      showToast(`Injected ${selected.length} item${selected.length === 1 ? '' : 's'}`);
    });
  }

  function formatContextBlock(items: Array<{ kind: string; title: string; content: string }>): string {
    const lines: string[] = [];
    lines.push('--- Context from Context Stash ---');
    for (const item of items) {
      lines.push(`[${item.kind}] ${item.title}`.trim());
      lines.push(item.content.trim());
      lines.push('');
    }
    lines.push('--- end ---');
    return lines.join('\n');
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  }

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

  // Honour per-tab dismissal. Both the get and the surrounding context can
  // throw on Edge, so we belt-and-braces it.
  void (async () => {
    try {
      const key = `cs:dock-dismissed:${location.host}`;
      const r = await chrome.storage.session?.get(key);
      if (r && r[key]) host.remove();
    } catch {
      /* ignored — show the dock if we can't read dismissal state */
    }
  })();

  log.info('mounted', { platform: adapter.platform, host: location.host });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountDock, { once: true });
} else {
  mountDock();
}
