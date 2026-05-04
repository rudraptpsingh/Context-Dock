import { useEffect, useRef, useState } from 'react';
import { CloudDownload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Platform = 'chatgpt' | 'claude' | 'gemini' | 'perplexity';

interface ImportProgress {
  platform: Platform;
  total: number;
  completed: number;
  failed: number;
  current?: string;
  done: boolean;
  error?: string;
}

const SUPPORTED: Array<{ id: Platform; label: string }> = [
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'claude', label: 'Claude' },
];

const STUBBED: Array<{ id: Platform; label: string; reason: string }> = [
  { id: 'gemini', label: 'Gemini', reason: 'Gemini has no public conversation API yet — coming soon.' },
  { id: 'perplexity', label: 'Perplexity', reason: 'Coming soon.' },
];

export default function BulkImportButton() {
  const [open, setOpen] = useState(false);
  const [activePlatform, setActivePlatform] = useState<Platform | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Live progress: the content script broadcasts BULK_IMPORT_PROGRESS via
  // chrome.runtime.sendMessage and we listen for it here.
  useEffect(() => {
    const listener = (msg: { type?: string; progress?: ImportProgress }) => {
      if (msg?.type === 'BULK_IMPORT_PROGRESS' && msg.progress) {
        setProgress(msg.progress);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function start(platform: Platform) {
    setActivePlatform(platform);
    setProgress({ platform, total: 0, completed: 0, failed: 0, done: false });
    setOpen(false);
    try {
      const r = (await chrome.runtime.sendMessage({ type: 'START_BULK_IMPORT', platform })) as {
        ok: boolean;
        error?: string;
      };
      if (!r?.ok) {
        toast.error(r?.error ?? 'Bulk import failed');
        setActivePlatform(null);
        setProgress(null);
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setActivePlatform(null);
      setProgress(null);
    }
  }

  // Auto-clear progress UI a moment after completion.
  useEffect(() => {
    if (!progress?.done) return;
    if (progress.error) {
      toast.error(progress.error);
    } else {
      const detail = progress.failed
        ? `${progress.completed} ok · ${progress.failed} failed`
        : `${progress.completed} conversations`;
      toast.success(`${platformLabel(progress.platform)} import complete · ${detail}`);
    }
    const t = setTimeout(() => {
      setActivePlatform(null);
      setProgress(null);
    }, 2_500);
    return () => clearTimeout(t);
  }, [progress]);

  const isRunning = activePlatform !== null && !progress?.done;

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        disabled={isRunning}
        className="text-xs px-2 py-1 rounded-md border border-slate-200 hover:bg-white inline-flex items-center gap-1 disabled:opacity-60"
        title="One-click import all conversations from a platform"
      >
        {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudDownload className="w-3 h-3" />}
        Import all
      </button>

      {open && !isRunning && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-30 p-1">
          {SUPPORTED.map(p => (
            <button
              key={p.id}
              onClick={() => start(p.id)}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center justify-between"
            >
              <span>{p.label}</span>
              <span className="text-[10px] text-slate-400">via session</span>
            </button>
          ))}
          {STUBBED.map(p => (
            <button
              key={p.id}
              disabled
              title={p.reason}
              className="w-full text-left px-2 py-1.5 text-xs rounded text-slate-400 flex items-center justify-between cursor-not-allowed"
            >
              <span>{p.label}</span>
              <span className="text-[10px]">soon</span>
            </button>
          ))}
        </div>
      )}

      {isRunning && progress && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-30 p-3 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-700">
              {platformLabel(progress.platform)} import
            </span>
            <span className="text-slate-500">
              {progress.completed} / {progress.total || '…'}
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
            <div
              className="h-full bg-slate-900 transition-[width] duration-200"
              style={{
                width: progress.total ? `${(progress.completed / progress.total) * 100}%` : '5%',
              }}
            />
          </div>
          {progress.current && (
            <div className="mt-2 truncate text-slate-500" title={progress.current}>
              · {progress.current}
            </div>
          )}
          {progress.failed > 0 && (
            <div className="mt-1 text-amber-700">{progress.failed} failed (see console)</div>
          )}
        </div>
      )}
    </div>
  );
}

function platformLabel(p: Platform): string {
  return p === 'chatgpt' ? 'ChatGPT' : p === 'claude' ? 'Claude' : p === 'gemini' ? 'Gemini' : 'Perplexity';
}
