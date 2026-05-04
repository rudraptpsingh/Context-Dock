// Chat-domain content script.
// Watches the conversation DOM and emits HARVEST_CONVERSATION messages to
// the background service worker. Auto-sync is opt-in per conversation.
//
// User-initiated harvest (right-click menu / side panel button) bypasses the
// auto-sync flag — see HARVEST_REQUEST handling.

import { findAdapter, PlatformAdapter } from './platforms';
import { createLogger } from '../utils/logger';
import { startSpan } from '../utils/tracing';

const log = createLogger('harvester');

const STREAMING_DEBOUNCE_MS = 1500;
const IDLE_DEBOUNCE_MS = 600;

let observer: MutationObserver | null = null;
let pendingTimer: number | null = null;
let lastHash = '';
let lastEmittedConvId: string | null = null;
let autoSyncEnabledForConv: Map<string, boolean> = new Map();
let autoSyncEnabledMaster = false;

function surfaceUserError(adapter: PlatformAdapter, msg: string) {
  // Render a small in-page toast so the user sees what went wrong without
  // having to open DevTools. Best-effort — fails silently if injection blocked.
  try {
    const toast = document.createElement('div');
    toast.style.cssText =
      'position:fixed;bottom:24px;right:24px;background:#0f172a;color:#fff;padding:12px 16px;border-radius:8px;font:14px/1.4 Inter,system-ui,sans-serif;z-index:2147483647;box-shadow:0 10px 40px rgba(0,0,0,0.25);max-width:340px;';
    toast.textContent = `Context Stash · ${adapter.label}: ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  } catch {
    /* ignore */
  }
}

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
  const span = startSpan('harvester.emit', { platform: adapter.platform, force: !!opts.force });
  const convId = adapter.parseConversationId(window.location);
  if (!convId) {
    span.setAttribute('skip', 'no-conv-id');
    span.end('ok');
    if (opts.force) {
      log.warn('user-initiated harvest skipped: no conversation id detected', {
        platform: adapter.platform,
        host: window.location.hostname,
        path: window.location.pathname,
      });
      surfaceUserError(
        adapter,
        'Open a conversation first — Context Stash could not detect a conversation id on this page.',
      );
    }
    return;
  }
  const turns = adapter.extractTurns(document);
  span.setAttribute('turns', turns.length);
  if (!turns.length) {
    span.setAttribute('skip', 'no-turns');
    span.end('ok');
    if (opts.force) {
      log.warn('user-initiated harvest skipped: no turns extracted', {
        platform: adapter.platform,
        convId,
      });
      surfaceUserError(
        adapter,
        'Could not find any messages on this page. The site may have changed its layout — please report this so we can update the selectors.',
      );
    }
    return;
  }

  const isStreaming = adapter.isStreamingPartial?.(turns, document) ?? false;
  if (isStreaming && !opts.force) {
    span.setAttribute('skip', 'streaming');
    span.end('ok');
    debounce(() => emit(adapter), STREAMING_DEBOUNCE_MS);
    return;
  }

  const summary = turns.map(t => `${t.role}:${t.content}`).join('|');
  const hash = quickHash(summary);
  if (hash === lastHash && convId === lastEmittedConvId && !opts.force) {
    span.setAttribute('skip', 'unchanged');
    span.end('ok');
    return;
  }
  lastHash = hash;
  lastEmittedConvId = convId;

  log.info('emit', { platform: adapter.platform, convId, turns: turns.length });
  chrome.runtime
    .sendMessage({
      type: 'HARVEST_CONVERSATION',
      platform: adapter.platform,
      platformConversationId: convId,
      url: window.location.href,
      title: adapter.getTitle(document),
      turns,
    })
    .then(() => span.end('ok'))
    .catch(err => {
      log.warn('sendMessage failed', err);
      span.end('error', err);
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
  // Mark the page so the background's diagnostic probe can confirm we ran.
  (window as unknown as { __cs_harvester__?: { host: string; ready: boolean } }).__cs_harvester__ = {
    host: window.location.hostname,
    ready: false,
  };
  const adapter = findAdapter();
  if (!adapter) {
    log.warn('no-adapter', { host: window.location.hostname });
    // Still register a listener so the background can hear us and report
    // a useful error instead of a generic "page can't be harvested" toast.
    chrome.runtime.onMessage.addListener((message: { type?: string }) => {
      if (message?.type === 'HARVEST_REQUEST') {
        log.warn('harvest requested but no adapter matched', { host: window.location.hostname });
      }
    });
    return;
  }
  log.info('init', { platform: adapter.platform, host: window.location.hostname });
  (window as unknown as { __cs_harvester__: { host: string; ready: boolean; platform: string } }).__cs_harvester__ = {
    host: window.location.hostname,
    ready: true,
    platform: adapter.platform,
  };

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
