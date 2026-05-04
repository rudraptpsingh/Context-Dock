import { useEffect, useState } from 'react';
import { CloudDownload, MessageSquare, Server, Sparkles, X } from 'lucide-react';

const FLAG_KEY = '_cs_onboarding_done';

interface Step {
  icon: typeof MessageSquare;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: 'Welcome to Context Stash',
    body:
      "Capture conversations from ChatGPT, Claude, Gemini, and Perplexity, then re-use them anywhere — with the dock, the side panel, or any MCP-aware tool.",
  },
  {
    icon: MessageSquare,
    title: 'One-click harvest',
    body:
      "On any chat page, the small Context Stash dot appears in the corner. Click it → tap Harvest. The conversation appears here in the side panel.",
  },
  {
    icon: CloudDownload,
    title: 'Already have history?',
    body:
      "Click 'Import all' on the Conversations tab to pull every conversation from ChatGPT or Claude in one shot. Uses your existing browser session — no API keys.",
  },
  {
    icon: Server,
    title: 'Connect your AI agents',
    body:
      "Settings → Open setup wizard plugs Context Stash into Claude Code, Cursor, Zed, or any MCP-aware tool. Your captured conversations become first-class context for those agents.",
  },
];

export default function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    void chrome.storage.local.get(FLAG_KEY).then(r => {
      if (!r[FLAG_KEY]) setOpen(true);
    });
  }, []);

  async function dismiss() {
    setOpen(false);
    await chrome.storage.local.set({ [FLAG_KEY]: Date.now() });
  }

  if (!open) return null;
  const step = STEPS[stepIndex];
  const last = stepIndex === STEPS.length - 1;
  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px]">
      <div className="relative w-[320px] bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden">
        <button
          onClick={() => void dismiss()}
          className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-slate-700 rounded"
          aria-label="Skip onboarding"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="p-5">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mb-3 ring-1 ring-brand-100">
            <Icon className="w-6 h-6 text-brand-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1.5">{step.title}</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{step.body}</p>
        </div>
        <div className="px-5 pb-4 flex items-center gap-1.5 justify-between">
          <div className="flex items-center gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`block w-1.5 h-1.5 rounded-full transition-colors ${
                  i === stepIndex ? 'bg-brand-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {!last ? (
              <>
                <button
                  onClick={() => void dismiss()}
                  className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5"
                  aria-label="Skip onboarding tour"
                >
                  Skip
                </button>
                <button
                  onClick={() => setStepIndex(i => Math.min(i + 1, STEPS.length - 1))}
                  className="text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-md"
                >
                  Next
                </button>
              </>
            ) : (
              <button
                onClick={() => void dismiss()}
                className="text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-md"
              >
                Get started
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
