import { ArrowLeft, ExternalLink, FileText, FileJson, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Conversation } from '../../types';
import { downloadJson, downloadMarkdown } from '../../utils/exporter';

interface Props {
  conversation: Conversation;
  onBack: () => void;
  onToggleAutoSync: (id: string, autoSync: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const ROLE_LABEL: Record<string, string> = {
  user: '👤 You',
  assistant: '🤖 Assistant',
  system: '⚙️ System',
  tool: '🛠️ Tool',
};

export default function ConversationDetail({ conversation, onBack, onToggleAutoSync, onDelete }: Props) {
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-white sticky top-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-700 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-1">
          <a
            href={conversation.url}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md ring-1 ring-slate-200"
            title="Open original"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={() => downloadMarkdown(conversation).catch(() => toast.error('Export failed'))}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md ring-1 ring-slate-200"
            title="Export Markdown"
          >
            <FileText className="w-3 h-3" />
          </button>
          <button
            onClick={() => downloadJson(conversation).catch(() => toast.error('Export failed'))}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md ring-1 ring-slate-200"
            title="Export JSON"
          >
            <FileJson className="w-3 h-3" />
          </button>
          <button
            onClick={async () => {
              if (confirm(`Delete "${conversation.title}"?`)) {
                await onDelete(conversation.id);
                toast.success('Conversation deleted');
                onBack();
              }
            }}
            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md ring-1 ring-slate-200"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </header>

      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <h2 className="text-base font-semibold text-slate-900 truncate">{conversation.title}</h2>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
          <span>{conversation.platform}</span>
          <span>·</span>
          <span>{conversation.turns.length} turns</span>
          <span>·</span>
          <span>last synced {new Date(conversation.lastSyncedAt).toLocaleString()}</span>
        </div>
        <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
          <RefreshCw className={`w-3 h-3 ${conversation.autoSync ? 'text-emerald-500' : 'text-slate-400'}`} />
          <input
            type="checkbox"
            checked={conversation.autoSync}
            onChange={e => onToggleAutoSync(conversation.id, e.target.checked)}
            className="accent-emerald-500"
          />
          <span>Auto-sync this conversation</span>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 custom-scrollbar">
        {conversation.turns.map(turn => (
          <div
            key={turn.id}
            className="group rounded-lg border border-slate-100 bg-white p-3 shadow-sm relative"
          >
            <div className="text-[11px] font-semibold text-slate-600 mb-1.5 flex items-center justify-between gap-2">
              <span>
                {ROLE_LABEL[turn.role] ?? turn.role}
                {turn.model ? <span className="ml-2 text-slate-400 font-normal">{turn.model}</span> : null}
              </span>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(turn.content);
                    toast.success('Copied turn');
                  } catch {
                    toast.error('Clipboard write blocked');
                  }
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100"
                title="Copy this turn's content"
              >
                Copy
              </button>
            </div>
            <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed break-words">
              {turn.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
