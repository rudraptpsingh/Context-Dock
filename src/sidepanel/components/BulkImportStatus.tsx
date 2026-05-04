import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { platformLabel, type ImportProgress } from '../hooks/useBulkImport';

interface Props {
  progress: ImportProgress | null;
}

export default function BulkImportStatus({ progress }: Props) {
  if (!progress) return null;

  const pct = progress.total ? Math.round((progress.completed / progress.total) * 100) : null;
  const Icon = progress.done
    ? progress.failed > 0
      ? AlertTriangle
      : CheckCircle2
    : Loader2;
  const tone = progress.done
    ? progress.failed > 0
      ? 'amber'
      : 'emerald'
    : 'blue';
  const palette: Record<string, { bg: string; text: string; bar: string; ring: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-900', bar: 'bg-blue-600', ring: 'ring-blue-200' },
    emerald: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-900',
      bar: 'bg-emerald-600',
      ring: 'ring-emerald-200',
    },
    amber: { bg: 'bg-amber-50', text: 'text-amber-900', bar: 'bg-amber-600', ring: 'ring-amber-200' },
  };
  const c = palette[tone];

  return (
    <div className={`px-4 py-2 ${c.bg} ${c.text} text-xs ring-1 ${c.ring}`}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Icon
            className={`w-3.5 h-3.5 shrink-0 ${progress.done ? '' : 'animate-spin'}`}
          />
          <span className="font-semibold truncate">
            {progress.done
              ? `${platformLabel(progress.platform)} import ${progress.failed > 0 ? 'finished with errors' : 'complete'}`
              : `Importing from ${platformLabel(progress.platform)}…`}
          </span>
        </div>
        <span className="shrink-0 tabular-nums">
          {progress.completed} / {progress.total || '…'}
          {progress.failed > 0 ? ` · ${progress.failed} failed` : ''}
        </span>
      </div>
      <div className="h-1.5 bg-white/60 rounded overflow-hidden">
        <div
          className={`h-full ${c.bar} transition-[width] duration-300`}
          style={{ width: pct !== null ? `${pct}%` : '5%' }}
        />
      </div>
      {progress.current && !progress.done && (
        <div className="mt-1 truncate opacity-70" title={progress.current}>
          · {progress.current}
        </div>
      )}
      {progress.error && <div className="mt-1 text-red-700">{progress.error}</div>}
    </div>
  );
}
