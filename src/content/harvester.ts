// Chat-domain content script.
// Watches the conversation DOM and emits HARVEST_CONVERSATION messages to
// the background service worker. Auto-sync is opt-in per conversation.
//
// User-initiated harvest (right-click menu / side panel button) bypasses the
// auto-sync flag — see HARVEST_REQUEST handling.

import { findAdapter, PlatformAdapter } from './platforms';

const STREAMING_DEBOUNCE_MS = 1500;
const IDLE_DEBOUNCE_MS = 600;

let observer: MutationObserver | null = null;
let pendingTimer: number | null = null;
let lastHash = '';
let lastEmittedConvId: string | null = null;
let autoSyncEnabledForConv: Map<string, boolean> = new Map();
let autoSyncEnabledMaster = false;

function debounce(fn: () => void, ms: number) {
  if (pendingTimer !== null) {
    window.clearTimeout(pendingTimer);
  }
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    fn();
  }, ms);
}

function quickHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function emit(adapter: PlatformAdapter, opts: { force?: boolean } = {}) {
  const convId = adapter.parseConversationId(window.location);
  if (!convId) return; // not on a conversation page
  const turns = adapter.extractTurns(document);
  if (!turns.length) return;

  const isStreaming = adapter.isStreamingPartial?.(turns, document) ?? false;
  if (isStreaming && !opts.force) {
    debounce(() => emit(adapter), STREAMING_DEBOUNCE_MS);
    return;
  }

  const summary = turns.map(t => `${t.role}:${t.content}`).join('|');
  const hash = quickHash(summary);
  if (hash === lastHash && convId === lastEmittedConvId && !opts.force) return;
  lastHash = hash;
  lastEmittedConvId = convId;

  chrome.runtime
    .sendMessage({
      type: 'HARVEST_CONVERSATION',
      platform: adapter.platform,
      platformConversationId: convId,
      url: window.location.href,
      title: adapter.getTitle(document),
      turns,
    })
    .catch(() => {
      // background not ready yet; harmless.
    });
}

function shouldAutoEmit(adapter: PlatformAdapter): boolean {
  if (!autoSyncEnabledMaster) return false;
  const convId = adapter.parseConversationId(window.location);
  if (!convId) return false;
  return autoSyncEnabledForConv.get(`${adapter.platform}:${convId}`) === true;
}

async function refreshAutoSyncFlags(adapter: PlatformAdapter) {
  try {
    const data = await chrome.storage.local.get(['conversations', 'settings']);
    const settings = data.settings || {};
    autoSyncEnabledMaster = settings.autoSyncEnabled !== false;
    const conversations: Array<{
      platform: string;
      platformConversationId: string;
      autoSync: boolean;
    }> = data.conversations || [];
    autoSyncEnabledForConv = new Map(
      conversations
        .filter(c => c.platform === adapter.platform)
        .map(c => [`${c.platform}:${c.platformConversationId}`, c.autoSync]),
    );
  } catch {
    /* ignore */
  }
}

function startObserving(adapter: PlatformAdapter) {
  if (observer) observer.disconnect();
  const root = adapter.getObservationRoot(document);
  observer = new MutationObserver(() => {
    if (!shouldAutoEmit(adapter)) return;
    debounce(() => emit(adapter), IDLE_DEBOUNCE_MS);
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function init() {
  const adapter = findAdapter();
  if (!adapter) return;

  refreshAutoSyncFlags(adapter);
  startObserving(adapter);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.conversations || changes.settings) {
      refreshAutoSyncFlags(adapter);
    }
  });

  chrome.runtime.onMessage.addListener((message: { type?: string }) => {
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'HARVEST_REQUEST') {
      // user-initiated; force-emit regardless of auto-sync flag.
      emit(adapter, { force: true });
    }
  });

  // SPA navigation: ChatGPT swaps URL without a full reload. Hook history.
  const fireUrlChange = () => {
    lastHash = '';
    lastEmittedConvId = null;
    refreshAutoSyncFlags(adapter);
    if (shouldAutoEmit(adapter)) debounce(() => emit(adapter), IDLE_DEBOUNCE_MS);
  };
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    origPush.apply(this, args as Parameters<typeof history.pushState>);
    fireUrlChange();
  };
  history.replaceState = function (...args) {
    origReplace.apply(this, args as Parameters<typeof history.replaceState>);
    fireUrlChange();
  };
  window.addEventListener('popstate', fireUrlChange);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
