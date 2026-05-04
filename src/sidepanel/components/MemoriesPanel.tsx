import { useEffect, useState } from 'react';
import { Brain, Trash2 } from 'lucide-react';
import type { LLMPlatform, MemoryEntry } from '../../types';

const PLATFORM_LABEL: Record<LLMPlatform, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  custom: 'Custom',
};

export default function MemoriesPanel() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const r = await chrome.storage.local.get('memories');
      if (mounted) setMemories(((r.memories as MemoryEntry[]) ?? []).slice().sort((a, b) => b.capturedAt - a.capturedAt));
    };
    void refresh();
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local' && changes.memories) void refresh();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  if (!memories.length) return null;

  const visible = expanded ? memories : memories.slice(0, 3);

  async function deleteMemory(id: string) {
    const r = await chrome.storage.local.get('memories');
    const next = ((r.memories as MemoryEntry[]) ?? []).filter(m => m.id !== id);
    await chrome.storage.local.set({ memories: next });
  }

  return (
    <div className="px-4 pt-3 pb-2 border-b border-slate-100 bg-amber-50/40">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
          <Brain className="w-3.5 h-3.5" />
          Memories <span className="text-amber-700/70 font-normal">· {memories.length}</span>
        </div>
        {memories.length > 3 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[11px] text-amber-800 hover:text-amber-900"
          >
            {expanded ? 'Show less' : `Show all ${memories.length}`}
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {visible.map(m => (
          <li
            key={m.id}
            className="group flex items-start gap-2 text-[12px] text-slate-700"
            title={`Captured ${new Date(m.capturedAt).toLocaleString()} from ${PLATFORM_LABEL[m.platform]}`}
          >
            <span className="text-[10px] uppercase tracking-wide text-slate-500 mt-0.5 shrink-0">
              {PLATFORM_LABEL[m.platform]}
            </span>
            <span className="flex-1 leading-snug">{m.text}</span>
            <button
              onClick={() => deleteMemory(m.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition-opacity"
              title="Forget this memory"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
