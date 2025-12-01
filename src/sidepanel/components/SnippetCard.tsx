import { Trash2, FileText, Quote, StickyNote, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Snippet } from '../../types';
import { getFaviconUrl } from '../../utils/dom';

interface SnippetCardProps {
  snippet: Snippet;
  onDelete: () => void;
}

const typeIcons = {
  selection: Quote,
  page_summary: FileText,
  note: StickyNote,
};

export default function SnippetCard({ snippet, onDelete }: SnippetCardProps) {
  const Icon = typeIcons[snippet.type];
  const faviconUrl = snippet.sourceUrl ? getFaviconUrl(snippet.sourceUrl) : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.content);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="group relative p-4 hover:bg-slate-50/80 transition-colors border-b border-slate-100/50 last:border-0">
      {/* Metadata Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {faviconUrl ? (
            <img 
              src={faviconUrl} 
              className="w-3.5 h-3.5 rounded-sm opacity-70"
              alt="" 
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          ) : (
            <Icon className="w-3.5 h-3.5 text-slate-400" />
          )}
          
          {snippet.sourceTitle ? (
            <a 
              href={snippet.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-slate-700 hover:text-blue-600 truncate max-w-[180px] transition-colors"
            >
              {snippet.sourceTitle}
            </a>
          ) : (
            <span className="text-xs font-medium text-slate-700">Note</span>
          )}
          
          <span className="text-[10px] text-slate-400 flex-shrink-0">
            {formatDate(snippet.timestamp)}
          </span>
        </div>

        {/* Actions (Hidden by default, shown on hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={handleCopy}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-md shadow-sm ring-1 ring-slate-200 transition-all"
            title="Copy"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button 
            onClick={onDelete}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-md shadow-sm ring-1 ring-slate-200 transition-all"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="text-sm text-slate-600 leading-relaxed break-words line-clamp-4 group-hover:line-clamp-none transition-all">
        {snippet.content}
      </div>
    </div>
  );
}
