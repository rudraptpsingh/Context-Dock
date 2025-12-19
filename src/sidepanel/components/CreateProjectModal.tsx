import { useState, useRef, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

interface CreateProjectModalProps {
  onSubmit: (name: string) => Promise<void>; // Changed to Promise to support loading state
  onClose: () => void;
}

export default function CreateProjectModal({ onSubmit, onClose }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // Track async state
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    
    if (trimmedName && !isSubmitting) {
      setIsSubmitting(true);
      try {
        // We wait for the parent's async operation to finish.
        // If it succeeds, the parent will unmount this component.
        // If it fails, we catch it here to reset the loading state.
        await onSubmit(trimmedName);
      } catch (error) {
        // If save fails, we stop the loading state so the user can 
        // correct the name and try again without losing their input.
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop - Only allow closing via backdrop if not submitting */}
      <div
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={!isSubmitting ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 fade-in duration-200 ring-1 ring-slate-900/5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Create New Project</h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          <label htmlFor="project-name" className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">
            Project Name
          </label>
          <input
            ref={inputRef}
            id="project-name"
            type="text"
            disabled={isSubmitting}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Research Paper, Competitor Analysis..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all placeholder:text-slate-400 disabled:bg-slate-50"
          />

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 shadow-sm flex items-center gap-2",
                name.trim() && !isSubmitting
                  ? "bg-slate-900 text-white hover:bg-slate-800 hover:shadow-md transform active:scale-95"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
              {isSubmitting ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}