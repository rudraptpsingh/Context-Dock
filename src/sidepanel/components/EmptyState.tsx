import { FolderPlus, Inbox, Sparkles } from 'lucide-react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  type: 'no-project' | 'no-snippets';
  projectName?: string;
  onCreateProject?: () => void;
}

export default function EmptyState({ type, projectName, onCreateProject }: EmptyStateProps) {
  if (type === 'no-project') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4 shadow-sm ring-1 ring-slate-100">
          <FolderPlus className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-2">
          Create your first project
        </h3>
        <p className="text-sm text-slate-500 mb-6 max-w-[240px] leading-relaxed">
          Projects help you organize snippets and context for different research topics.
        </p>
        <button
          onClick={onCreateProject}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
            "bg-slate-900 text-white hover:bg-slate-800",
            "shadow hover:shadow-md active:scale-[0.98]"
          )}
        >
          Create Project
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center animate-in fade-in duration-500">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 shadow-sm ring-1 ring-blue-100">
        <Inbox className="w-8 h-8 text-blue-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-2">
        No snippets yet
      </h3>
      <p className="text-sm text-slate-500 mb-6 max-w-[240px] leading-relaxed">
        Start collecting snippets for <span className="font-medium text-slate-700">"{projectName}"</span>
      </p>
      
      <div className="bg-slate-50/50 rounded-xl p-4 text-left max-w-[280px] border border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-semibold text-slate-700">Quick tips</span>
        </div>
        <ul className="text-xs text-slate-500 space-y-2.5">
          <li className="flex gap-2.5 items-start">
            <span className="text-slate-300 mt-0.5">•</span>
            <span>Select text on any page and right-click to save</span>
          </li>
          <li className="flex gap-2.5 items-start">
            <span className="text-slate-300 mt-0.5">•</span>
            <span>Use the <b>scissors</b> icon above to clip the current page</span>
          </li>
          <li className="flex gap-2.5 items-start">
            <span className="text-slate-300 mt-0.5">•</span>
            <span>Add quick notes with the <b>sticky note</b> icon</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
