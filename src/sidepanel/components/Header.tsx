import { ChevronDown, Scissors, StickyNote, Plus, Trash2, Check } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Project } from '../../types';
import { cn } from '../../utils/cn';

interface HeaderProps {
  activeProject: Project | null;
  projects: Project[];
  onProjectSelect: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onClipPage: () => void;
  onAddNote: (content: string) => void;
}

export default function Header({
  activeProject,
  projects,
  onProjectSelect,
  onCreateProject,
  onDeleteProject,
  onClipPage,
  onAddNote,
}: HeaderProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNoteSubmit = () => {
    if (noteContent.trim()) {
      onAddNote(noteContent.trim());
      setNoteContent('');
      setShowNoteInput(false);
    }
  };

  return (
    <div className="flex flex-col border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-20 shadow-sm transition-all">
      {/* Main Header Row */}
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex-shrink-0">
             <svg viewBox="0 0 64 64" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
              <rect x="24" y="8" width="32" height="44" rx="4" fill="#94a3b8" />
              <rect x="16" y="14" width="32" height="44" rx="4" fill="#3b82f6" />
              <rect x="8" y="20" width="32" height="44" rx="4" fill="#1e3a8a" />
              <rect x="14" y="29" width="20" height="4" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="14" y="37" width="20" height="4" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="14" y="45" width="14" height="4" rx="1" fill="white" fillOpacity="0.9" />
            </svg>
          </div>

          {/* Project Switcher Trigger */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex flex-col items-start text-left hover:bg-slate-100/50 px-2 py-1 rounded-lg transition-colors -ml-2"
            >
              <span className="text-[10px] text-slate-500 font-medium leading-none mb-0.5 uppercase tracking-wider">
                Current Project
              </span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-slate-900 max-w-[120px] truncate leading-none">
                  {activeProject?.name || 'Select Project'}
                </span>
                <ChevronDown className={cn("w-3 h-3 text-slate-400 transition-transform duration-200", isExpanded && "rotate-180")} />
              </div>
            </button>

            {/* Dropdown Menu */}
            {isExpanded && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-left ring-1 ring-black/5">
                <div className="max-h-[300px] overflow-y-auto">
                  {projects.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-slate-500 text-center">
                      No projects yet
                    </div>
                  ) : (
                    projects.map(project => (
                      <div
                        key={project.id}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm flex items-center justify-between group hover:bg-slate-50 transition-colors cursor-pointer",
                          activeProject?.id === project.id && "bg-slate-50/80"
                        )}
                        onClick={() => {
                          onProjectSelect(project.id);
                          setIsExpanded(false);
                        }}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          {activeProject?.id === project.id && (
                            <Check className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                          )}
                          <span className={cn(
                            "truncate",
                            activeProject?.id === project.id ? "text-slate-900 font-medium pl-0" : "text-slate-600 pl-[22px]"
                          )}>
                            {project.name}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteProject(project.id);
                          }}
                          className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-slate-100 mt-1 pt-1 px-2 pb-2">
                  <button
                    onClick={() => {
                      onCreateProject();
                      setIsExpanded(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Project
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={onClipPage}
            disabled={!activeProject}
            className={cn(
              "p-2 rounded-lg transition-all active:scale-95 hover:bg-slate-100 text-slate-500 hover:text-slate-900",
              !activeProject && "opacity-50 cursor-not-allowed"
            )}
            title="Clip Page"
          >
            <Scissors className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowNoteInput(!showNoteInput)}
            disabled={!activeProject}
            className={cn(
              "p-2 rounded-lg transition-all active:scale-95 hover:bg-slate-100 text-slate-500 hover:text-slate-900",
              !activeProject && "opacity-50 cursor-not-allowed"
            )}
            title="Add Note"
          >
            <StickyNote className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Note Input */}
      {showNoteInput && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-inner ring-1 ring-slate-200/50">
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Type a quick note..."
              className="w-full bg-transparent text-sm border-none focus:ring-0 p-0 placeholder:text-slate-400 text-slate-700 resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-200/50">
              <button
                onClick={() => setShowNoteInput(false)}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-200/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNoteSubmit}
                disabled={!noteContent.trim()}
                className={cn(
                  "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shadow-sm",
                  noteContent.trim()
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                )}
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
