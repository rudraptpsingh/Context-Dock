import type { LLMPlatform as Platform } from '../../types';
import type { BulkImporter, ImportProgress } from './types';
import chatgpt from './chatgpt';
import claude from './claude';
import { createLogger } from '../../utils/logger';

const log = createLogger('bulk-import');

const REGISTRY: Record<string, BulkImporter> = {
  chatgpt,
  claude,
};

export function findImporterFor(host: string): BulkImporter | null {
  for (const imp of Object.values(REGISTRY)) {
    if (imp.hosts.includes(host)) return imp;
  }
  return null;
}

export interface RunImportOptions {
  concurrency?: number;
  onProgress?: (p: ImportProgress) => void;
  signal?: AbortSignal;
}

/**
 * Drives a full bulk import end-to-end: list, then fetch each, sending each
 * one to the background as a HARVEST_CONVERSATION upsert. Calls onProgress
 * after every conversation. Honours `signal.aborted` between batches.
 */
export async function runBulkImport(importer: BulkImporter, opts: RunImportOptions = {}): Promise<ImportProgress> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 8));
  const onProgress = opts.onProgress ?? (() => undefined);

  const ok = await importer.isAuthenticated();
  if (!ok) {
    const result: ImportProgress = {
      platform: importer.platform,
      total: 0,
      completed: 0,
      failed: 0,
      done: true,
      error: `Not signed in to ${importer.platform}. Open the site in this browser, sign in, and try again.`,
    };
    onProgress(result);
    return result;
  }

  const list = await importer.listConversations();
  log.info('list', { platform: importer.platform, total: list.length });

  let completed = 0;
  let failed = 0;
  const queue = [...list];
  const inFlight = new Set<Promise<void>>();

  async function worker(): Promise<void> {
    while (queue.length) {
      if (opts.signal?.aborted) return;
      const item = queue.shift()!;
      try {
        const conv = await importer.fetchConversation(item.platformConversationId);
        await chrome.runtime.sendMessage({
          type: 'HARVEST_CONVERSATION',
          platform: conv.platform,
          platformConversationId: conv.platformConversationId,
          url: conv.url,
          title: conv.title,
          turns: conv.turns,
        });
        completed++;
      } catch (err) {
        failed++;
        log.warn('item failed', { id: item.platformConversationId, err: err instanceof Error ? err.message : String(err) });
      } finally {
        onProgress({
          platform: importer.platform,
          total: list.length,
          completed,
          failed,
          current: item.title,
          done: false,
        });
      }
    }
  }

  for (let i = 0; i < concurrency; i++) {
    const p = worker();
    inFlight.add(p);
    p.finally(() => inFlight.delete(p));
  }
  await Promise.all(inFlight);

  const result: ImportProgress = {
    platform: importer.platform,
    total: list.length,
    completed,
    failed,
    done: true,
    cancelled: opts.signal?.aborted,
  };
  onProgress(result);
  return result;
}

// Content-script message handler: listens for BULK_IMPORT_START (from the
// background, kicked off by the side panel) and pumps progress events back
// to extension pages via chrome.runtime.sendMessage.
//
// Also listens for a window CustomEvent so the test driver can trigger an
// import from the page's main world without needing chrome.runtime access.
export function installBulkImportListener() {
  function startFromHere(): Promise<{ ok: boolean; final?: unknown; error?: string }> {
    const importer = findImporterFor(location.hostname);
    if (!importer) return Promise.resolve({ ok: false, error: `no importer for ${location.hostname}` });
    return runBulkImport(importer, {
      onProgress: progress => {
        chrome.runtime.sendMessage({ type: 'BULK_IMPORT_PROGRESS', progress }).catch(() => undefined);
      },
    }).then(
      final => ({ ok: true, final }),
      err => ({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
  }

  chrome.runtime.onMessage.addListener((message: { type?: string; platform?: Platform }, _sender, sendResponse) => {
    if (message?.type !== 'BULK_IMPORT_START') return;
    const importer = findImporterFor(location.hostname);
    if (!importer) {
      sendResponse({ ok: false, error: `no importer for ${location.hostname}` });
      return false;
    }
    if (message.platform && message.platform !== importer.platform) {
      sendResponse({ ok: false, error: `tab is ${importer.platform}, asked for ${message.platform}` });
      return false;
    }
    startFromHere().then(r => sendResponse(r));
    return true;
  });

  window.addEventListener('cs:start-bulk-import', () => {
    void startFromHere();
  });
}
