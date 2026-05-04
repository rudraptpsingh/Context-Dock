import { useEffect, useState } from 'react';
import { Activity, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  clearLogBuffer,
  readLogBuffer,
  setLogLevel,
  type LogEntry,
  type LogLevel,
} from '../../utils/logger';
import { clearTraceBuffer, readTraceBuffer, type Span } from '../../utils/tracing';
import { probeBuiltinAI, type BuiltinAIStatus } from '../../utils/builtinAI';

const LEVEL_TONE: Record<LogLevel, string> = {
  debug: 'text-slate-400',
  info: 'text-slate-700',
  warn: 'text-amber-700',
  error: 'text-red-700',
};

const STATUS_TONE: Record<string, string> = {
  ok: 'text-emerald-700',
  error: 'text-red-700',
};

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

export default function DiagnosticsPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [spans, setSpans] = useState<Span[]>([]);
  const [aiStatus, setAiStatus] = useState<BuiltinAIStatus | null>(null);
  const [verbose, setVerbose] = useState(false);
  const [filter, setFilter] = useState<'logs' | 'spans'>('logs');
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function refresh() {
    const [l, s, ai] = await Promise.all([readLogBuffer(), readTraceBuffer(), probeBuiltinAI()]);
    setLogs(l.slice(-200).reverse());
    setSpans(s.slice(-200).reverse());
    setAiStatus(ai);
  }

  useEffect(() => {
    void refresh();
    if (!autoRefresh) return;
    const id = setInterval(() => void refresh(), 2_000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  useEffect(() => {
    setLogLevel(verbose ? 'debug' : 'info');
    if (typeof window !== 'undefined') {
      try {
        if (verbose) localStorage.setItem('contextStashDebug', '1');
        else localStorage.removeItem('contextStashDebug');
      } catch {
        /* ignore privacy errors */
      }
    }
  }, [verbose]);

  async function copyBundle() {
    const ext = chrome.runtime.getManifest();
    const userAgent = navigator.userAgent;
    const bundle = {
      generatedAt: new Date().toISOString(),
      extension: { name: ext.name, version: ext.version },
      userAgent,
      builtinAI: aiStatus,
      logs: logs.slice(0, 50),
      spans: spans.slice(0, 50),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
      toast.success('Diagnostic bundle copied to clipboard');
    } catch {
      toast.error('Clipboard write blocked — open DevTools to copy manually');
    }
  }

  async function clearAll() {
    await Promise.all([clearLogBuffer(), clearTraceBuffer()]);
    void refresh();
    toast.success('Cleared logs and traces');
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-slate-100/80 bg-white sticky top-0 z-10">
        <Activity className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs font-semibold text-slate-700">Diagnostics</span>
        <div className="flex-1" />
        <button
          onClick={() => setAutoRefresh(a => !a)}
          className={`text-[10px] px-2 py-0.5 rounded ${autoRefresh ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
          title="Auto-refresh every 2s"
        >
          {autoRefresh ? 'live' : 'paused'}
        </button>
        <button
          onClick={() => void refresh()}
          className="p-1 text-slate-500 hover:text-slate-900"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
        <button
          onClick={() => void copyBundle()}
          className="p-1 text-slate-500 hover:text-slate-900"
          title="Copy diagnostic bundle to clipboard"
        >
          <Copy className="w-3 h-3" />
        </button>
        <button
          onClick={() => void clearAll()}
          className="p-1 text-slate-500 hover:text-red-600"
          title="Clear logs + traces"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/40">
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-white rounded px-2 py-1.5 ring-1 ring-slate-100">
            <div className="text-slate-500">Built-in Summarizer</div>
            <div className={aiStatus?.summarizer ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
              {aiStatus === null ? '…' : aiStatus.summarizer ? 'available' : 'not available'}
            </div>
          </div>
          <div className="bg-white rounded px-2 py-1.5 ring-1 ring-slate-100">
            <div className="text-slate-500">Built-in LanguageModel</div>
            <div className={aiStatus?.languageModel ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
              {aiStatus === null ? '…' : aiStatus.languageModel ? 'available' : 'not available'}
            </div>
          </div>
        </div>
        <label className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-600">
          <input type="checkbox" checked={verbose} onChange={e => setVerbose(e.target.checked)} />
          Verbose logging (debug-level)
        </label>
      </div>

      <div className="px-4 py-2 border-b border-slate-100 bg-white sticky top-[44px] z-10 flex gap-1">
        <button
          onClick={() => setFilter('logs')}
          className={`text-[11px] px-2 py-1 rounded ${filter === 'logs' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Logs · {logs.length}
        </button>
        <button
          onClick={() => setFilter('spans')}
          className={`text-[11px] px-2 py-1 rounded ${filter === 'spans' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Spans · {spans.length}
        </button>
      </div>

      <div className="px-4 py-2 font-mono text-[11px] leading-relaxed overflow-y-auto flex-1">
        {filter === 'logs' && logs.length === 0 && (
          <div className="text-slate-400 italic py-8 text-center">No log entries yet.</div>
        )}
        {filter === 'logs' &&
          logs.map((l, i) => (
            <div key={`${l.ts}-${i}`} className="py-0.5">
              <span className="text-slate-400 mr-1.5">{formatRelative(l.ts)}</span>
              <span className={`${LEVEL_TONE[l.level]} font-semibold uppercase mr-1.5`}>{l.level}</span>
              <span className="text-slate-500 mr-1.5">[{l.ns}]</span>
              <span className="text-slate-800">{l.msg}</span>
              {l.data !== undefined && (
                <span className="text-slate-500 ml-1.5">
                  {typeof l.data === 'object' && l.data
                    ? Object.entries(l.data as Record<string, unknown>)
                        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
                        .join(' ')
                    : String(l.data)}
                </span>
              )}
            </div>
          ))}
        {filter === 'spans' && spans.length === 0 && (
          <div className="text-slate-400 italic py-8 text-center">No spans recorded yet.</div>
        )}
        {filter === 'spans' &&
          spans.map((s, i) => (
            <div key={`${s.startMs}-${i}`} className="py-0.5">
              <span className="text-slate-400 mr-1.5">{formatRelative(s.startMs)}</span>
              <span className={`${STATUS_TONE[s.status] ?? 'text-slate-500'} font-semibold uppercase mr-1.5`}>
                {s.status}
              </span>
              <span className="text-slate-700 mr-1.5">{s.name}</span>
              <span className="text-slate-500">{Math.round(s.durationMs ?? 0)}ms</span>
              {s.attributes && Object.keys(s.attributes).length > 0 && (
                <span className="text-slate-500 ml-1.5">
                  {Object.entries(s.attributes)
                    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
                    .join(' ')}
                </span>
              )}
              {s.error && <span className="text-red-700 ml-1.5">{s.error}</span>}
            </div>
          ))}
      </div>
    </div>
  );
}
