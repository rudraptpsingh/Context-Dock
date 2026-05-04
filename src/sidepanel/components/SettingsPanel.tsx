import { useEffect, useState } from 'react';
import { AlertTriangle, Server } from 'lucide-react';
import { toast } from 'sonner';
import { getSettings, updateSettings, wipeAll } from '../../utils/storage';
import type { AppSettings } from '../../types';
import DiagnosticsPanel from './DiagnosticsPanel';

interface Props {
  onLaunchMcpWizard: () => void;
}

export default function SettingsPanel({ onLaunchMcpWizard }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [section, setSection] = useState<'general' | 'diagnostics'>('general');

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  async function patch(updates: Partial<AppSettings>) {
    const next = await updateSettings(updates);
    setSettings(next);
  }

  async function handleWipe() {
    if (
      !confirm(
        'Wipe ALL Context Stash data? Projects, snippets, conversations, memories, and settings — gone. This can\'t be undone.',
      )
    )
      return;
    await wipeAll();
    toast.success('All data wiped');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-slate-100 bg-white sticky top-0 z-10 flex gap-1">
        <button
          onClick={() => setSection('general')}
          className={`text-[11px] px-2 py-1 rounded ${section === 'general' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          General
        </button>
        <button
          onClick={() => setSection('diagnostics')}
          className={`text-[11px] px-2 py-1 rounded ${section === 'diagnostics' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Diagnostics
        </button>
      </div>

      {section === 'general' && (
        <div className="px-4 py-3 space-y-4 overflow-y-auto">
          {settings && (
            <section>
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Auto-sync
              </h3>
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={settings.autoSyncEnabled}
                  onChange={e => patch({ autoSyncEnabled: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-slate-800">Master kill-switch</span>
                  <br />
                  When off, no conversation auto-syncs even if individual rows have it enabled. User-initiated harvests
                  (right-click, dock button, keyboard shortcut) always work.
                </span>
              </label>
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
              Agents (MCP)
            </h3>
            <p className="text-[11px] text-slate-500 mb-2">
              Connect Claude Code, Cursor, Zed, or any MCP-aware tool to read your captured conversations and memories.
            </p>
            <button
              onClick={onLaunchMcpWizard}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-200 hover:bg-white inline-flex items-center gap-1.5 text-slate-700"
            >
              <Server className="w-3 h-3" />
              Open setup wizard
            </button>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Danger zone
            </h3>
            <p className="text-[11px] text-slate-500 mb-2">
              Wipe everything Context Stash has stored: projects, snippets, conversations, memories, settings.
            </p>
            <button
              onClick={() => void handleWipe()}
              className="text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
            >
              Wipe all data
            </button>
          </section>
        </div>
      )}

      {section === 'diagnostics' && <DiagnosticsPanel />}
    </div>
  );
}
