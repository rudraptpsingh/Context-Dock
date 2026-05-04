import React, { useMemo, useState } from 'react';
import { MessageSquare, RefreshCw, Trash2, Download, FileJson, FileText, Pin, PinOff } from 'lucide-react';
import { toast } from 'sonner';
import { Conversation, LLMPlatform } from '../../types';
import { downloadJson, downloadMarkdown } from '../../utils/exporter';

interface Props {
  conversations: Conversation[];
  onOpen: (id: string) => void;
  onToggleAutoSync: (id: string, autoSync: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTogglePin?: (id: string, pinned: boolean) => Promise<void>;
}

const PLATFORM_LABEL: Record<LLMPlatform, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  custom: 'Custom',
};

function highlightTerms(text: string, query: string): React.ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return text;
  // Build a single regex from all query tokens, case-insensitive. Escape
  // user input so it's safe to embed in the regex.
  const tokens = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!tokens.length) return text;
  const re = new RegExp(`(${tokens.join('|')})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) ? (
      <mark
        key={i}
        className="bg-yellow-100 text-slate-900 rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

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
  onTogglePin,
}: Props) {
  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<LLMPlatform | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter(c => platformFilter === 'all' || c.platform === platformFilter)
      .filter(c => !tagFilter || c.tags.includes(tagFilter))
      .filter(c => {
        if (!q) return true;
        if (c.title.toLowerCase().includes(q)) return true;
        if (c.summary?.toLowerCase().includes(q)) return true;
        if (c.tags.some(t => t.toLowerCase().includes(q))) return true;
        return c.turns.some(t => t.content.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        // Pinned rows float to the top; within each group, recency wins.
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return b.lastSyncedAt - a.lastSyncedAt;
      });
  }, [conversations, query, platformFilter, tagFilter]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of conversations) for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [conversations]);

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

      {allTags.length > 0 && (
        <div className="px-4 pt-2 pb-2 flex items-center flex-wrap gap-1 border-b border-slate-100/80 bg-white">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 mr-1">Tags</span>
          {tagFilter && (
            <button
              onClick={() => setTagFilter(null)}
              className="text-[11px] px-2 py-0.5 rounded-full bg-slate-900 text-white"
              title="Clear tag filter"
            >
              {tagFilter} ×
            </button>
          )}
          {!tagFilter &&
            allTags.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag)}
                className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700"
                title={`${count} conversation${count === 1 ? '' : 's'}`}
              >
                {tag}
              </button>
            ))}
        </div>
      )}

      <ul className="divide-y divide-slate-100/70">
        {filtered.map(conv => (
          <li
            key={conv.id}
            className={`group p-4 transition-colors ${
              conv.pinned ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50/80'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => onOpen(conv.id)}
                className="text-left flex-1 min-w-0"
                title="Open conversation"
              >
                <div className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
                  <span className="truncate">{highlightTerms(conv.title, query)}</span>
                  {conv.lastViewedAt !== undefined && conv.lastSyncedAt > conv.lastViewedAt && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium shrink-0"
                      title="Updated since you last opened this conversation"
                    >
                      updated
                    </span>
                  )}
                </div>
                {conv.summary && (
                  <div
                    className="text-[12px] text-slate-500 mt-0.5 line-clamp-2"
                    title={conv.summary}
                  >
                    {highlightTerms(conv.summary, query)}
                  </div>
                )}
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                    {PLATFORM_LABEL[conv.platform]}
                  </span>
                  <span>{conv.turns.length} turns</span>
                  <span>·</span>
                  <span>{relativeTime(conv.lastSyncedAt)}</span>
                  {conv.tags.slice(0, 3).map(t => (
                    <span
                      key={t}
                      className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </button>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onTogglePin && (
                  <button
                    onClick={async () => {
                      await onTogglePin(conv.id, !conv.pinned);
                      toast.success(conv.pinned ? 'Unpinned' : 'Pinned');
                    }}
                    className={`p-1.5 hover:bg-white rounded-md shadow-sm ring-1 ring-slate-200 ${conv.pinned ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}
                    title={conv.pinned ? 'Unpin' : 'Pin to top'}
                  >
                    {conv.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                  </button>
                )}
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
