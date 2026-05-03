import { useMemo, useState } from 'react';
import { MessageSquare, RefreshCw, Trash2, Download, FileJson, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Conversation, LLMPlatform } from '../../types';
import { downloadJson, downloadMarkdown } from '../../utils/exporter';

interface Props {
  conversations: Conversation[];
  onOpen: (id: string) => void;
  onToggleAutoSync: (id: string, autoSync: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const PLATFORM_LABEL: Record<LLMPlatform, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  custom: 'Custom',
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ConversationList({
  conversations,
  onOpen,
  onToggleAutoSync,
  onDelete,
}: Props) {
  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<LLMPlatform | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter(c => platformFilter === 'all' || c.platform === platformFilter)
      .filter(c => {
        if (!q) return true;
        if (c.title.toLowerCase().includes(q)) return true;
        if (c.tags.some(t => t.toLowerCase().includes(q))) return true;
        return c.turns.some(t => t.content.toLowerCase().includes(q));
      })
      .sort((a, b) => b.lastSyncedAt - a.lastSyncedAt);
  }, [conversations, query, platformFilter]);

  const platforms = useMemo(() => {
    const s = new Set<LLMPlatform>();
    conversations.forEach(c => s.add(c.platform));
    return Array.from(s);
  }, [conversations]);

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-slate-500">
        <MessageSquare className="w-10 h-10 text-slate-300 mb-3" />
        <h3 className="font-semibold text-slate-700 mb-1">No conversations yet</h3>
        <p className="text-sm leading-relaxed max-w-xs">
          Open ChatGPT and right-click → "Harvest this conversation to Context Stash" to capture it
          here. Or import an existing <code className="text-xs bg-slate-100 px-1 rounded">conversations.json</code> from
          ChatGPT's data export.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-slate-100/80 bg-white sticky top-0 z-10">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search conversations..."
          className="flex-1 text-sm px-3 py-1.5 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <select
          value={platformFilter}
          onChange={e => setPlatformFilter(e.target.value as LLMPlatform | 'all')}
          className="text-xs px-2 py-1.5 rounded-md border border-slate-200 bg-white"
        >
          <option value="all">All platforms</option>
          {platforms.map(p => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
        </select>
      </div>

      <ul className="divide-y divide-slate-100/70">
        {filtered.map(conv => (
          <li key={conv.id} className="group p-4 hover:bg-slate-50/80 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => onOpen(conv.id)}
                className="text-left flex-1 min-w-0"
                title="Open conversation"
              >
                <div className="text-sm font-semibold text-slate-800 truncate">{conv.title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                    {PLATFORM_LABEL[conv.platform]}
                  </span>
                  <span>{conv.turns.length} turns</span>
                  <span>·</span>
                  <span>{relativeTime(conv.lastSyncedAt)}</span>
                </div>
              </button>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => downloadMarkdown(conv).catch(() => toast.error('Export failed'))}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-md shadow-sm ring-1 ring-slate-200"
                  title="Export Markdown"
                >
                  <FileText className="w-3 h-3" />
                </button>
                <button
                  onClick={() => downloadJson(conv).catch(() => toast.error('Export failed'))}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-md shadow-sm ring-1 ring-slate-200"
                  title="Export JSON"
                >
                  <FileJson className="w-3 h-3" />
                </button>
                <button
                  onClick={async () => {
                    if (confirm(`Delete "${conv.title}"?`)) {
                      await onDelete(conv.id);
                      toast.success('Conversation deleted');
                    }
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-md shadow-sm ring-1 ring-slate-200"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <a
                href={conv.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-600 hover:underline truncate max-w-[60%]"
              >
                {conv.url}
              </a>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                <RefreshCw className={`w-3 h-3 ${conv.autoSync ? 'text-emerald-500' : 'text-slate-300'}`} />
                <input
                  type="checkbox"
                  checked={conv.autoSync}
                  onChange={e =>
                    onToggleAutoSync(conv.id, e.target.checked).then(() =>
                      toast.success(
                        e.target.checked ? 'Auto-sync enabled for this conversation' : 'Auto-sync paused',
                      ),
                    )
                  }
                  className="accent-emerald-500"
                />
                <span>Auto-sync</span>
              </label>
            </div>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <div className="text-center text-slate-400 text-sm py-8 flex flex-col items-center gap-2">
          <Download className="w-4 h-4" />
          <div>No conversations match your search.</div>
        </div>
      )}
    </div>
  );
}
