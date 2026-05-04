import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export type Platform = 'chatgpt' | 'claude' | 'gemini' | 'perplexity';

export interface ImportProgress {
  platform: Platform;
  total: number;
  completed: number;
  failed: number;
  current?: string;
  done: boolean;
  error?: string;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

/**
 * Kicks off a bulk import via the background. The progress events are
 * broadcast separately and consumed by `useBulkImportProgress`. The promise
 * returned by sendMessage doesn't resolve until the orchestrator finishes,
 * which in practice can be 10–60 s — we don't await it from the caller's
 * UI; the progress hook is the source of truth.
 */
export async function startBulkImport(platform: Platform, host: string): Promise<void> {
  toast(`Starting ${PLATFORM_LABEL[platform]} import…`, {
    description: `Opening ${host} if it's not already open`,
  });
  // Don't await — let the progress hook drive the UI. Capture errors so
  // they surface as a toast.
  void chrome.runtime
    .sendMessage({ type: 'START_BULK_IMPORT', platform })
    .then((r: { ok: boolean; final?: { completed: number; failed: number; total: number }; error?: string } | undefined) => {
      if (!r?.ok) {
        toast.error(r?.error ?? 'Import failed');
        return;
      }
      if (r.final) {
        const detail = r.final.failed
          ? `${r.final.completed} of ${r.final.total} (${r.final.failed} failed)`
          : `${r.final.completed} of ${r.final.total}`;
        toast.success(`${PLATFORM_LABEL[platform]} import complete · ${detail}`);
      }
    })
    .catch(err => toast.error(err instanceof Error ? err.message : String(err)));
}

/** React hook that subscribes to BULK_IMPORT_PROGRESS broadcasts. */
export function useBulkImportProgress(): ImportProgress | null {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  useEffect(() => {
    const listener = (msg: { type?: string; progress?: ImportProgress }) => {
      if (msg?.type !== 'BULK_IMPORT_PROGRESS' || !msg.progress) return;
      setProgress(msg.progress);
      if (msg.progress.done) {
        // Auto-clear a moment after completion so the banner doesn't linger.
        setTimeout(() => {
          setProgress(p => (p?.done ? null : p));
        }, 4_000);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
  return progress;
}

export const platformLabel = (p: Platform): string => PLATFORM_LABEL[p];
