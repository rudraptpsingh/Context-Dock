import { useState } from 'react';
import { CloudDownload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { startBulkImport, type Platform } from '../hooks/useBulkImport';

const SUPPORTED: Array<{ id: Platform; label: string; host: string }> = [
  { id: 'chatgpt', label: 'ChatGPT', host: 'chatgpt.com' },
  { id: 'claude', label: 'Claude', host: 'claude.ai' },
];

const STUBBED: Array<{ id: Platform; label: string; reason: string }> = [
  { id: 'gemini', label: 'Gemini', reason: 'No public API yet — coming soon.' },
  { id: 'perplexity', label: 'Perplexity', reason: 'Coming soon.' },
];

interface Props {
  busy: boolean;
}

export default function BulkImportButton({ busy }: Props) {
  const [open, setOpen] = useState(false);

  async function start(platform: Platform, host: string) {
    setOpen(false);
    try {
      await startBulkImport(platform, host);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="text-xs px-2.5 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 inline-flex items-center gap-1 disabled:opacity-60 shadow-soft-sm"
        title="One-click import every conversation from a chat platform"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudDownload className="w-3 h-3" />}
        Import all
      </button>

      {open && !busy && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-30 p-1">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">From your account</div>
          {SUPPORTED.map(p => (
            <button
              key={p.id}
              onClick={() => start(p.id, p.host)}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-50 flex items-center justify-between"
            >
              <span>{p.label}</span>
              <span className="text-[10px] text-slate-400">{p.host}</span>
            </button>
          ))}
          <div className="border-t border-slate-100 my-1" />
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">Coming soon</div>
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
    </div>
  );
}
