import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, X, Server } from 'lucide-react';
import { toast } from 'sonner';
import { updateSettings } from '../../utils/storage';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface BridgeStatus {
  connected: boolean;
  error?: string;
}

const NATIVE_HOST_NAME = 'com.contextstash.mcp_bridge';

const CLAUDE_CODE_SNIPPET = `{
  "mcpServers": {
    "context-stash": {
      "command": "context-stash-mcp",
      "args": []
    }
  }
}`;

const CURSOR_SNIPPET = `{
  "mcpServers": {
    "context-stash": {
      "command": "context-stash-mcp"
    }
  }
}`;

const ZED_SNIPPET = `// settings.json
{
  "context_servers": {
    "context-stash": {
      "command": { "path": "context-stash-mcp", "args": [] }
    }
  }
}`;

async function pingBridge(): Promise<BridgeStatus> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'MCP_BRIDGE_PING' }, (resp: BridgeStatus | undefined) => {
      resolve(resp ?? { connected: false, error: 'No response from background' });
    });
  });
}

async function connectBridge(): Promise<BridgeStatus> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'MCP_BRIDGE_CONNECT' }, (resp: BridgeStatus | undefined) => {
      resolve(resp ?? { connected: false, error: 'No response from background' });
    });
  });
}

function CopyableSnippet({ label, snippet }: { label: string; snippet: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-white rounded-t-md">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <button
          onClick={() =>
            navigator.clipboard
              .writeText(snippet)
              .then(() => toast.success('Copied to clipboard'))
              .catch(() => toast.error('Copy failed'))
          }
          className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
        >
          <Copy className="w-3 h-3" /> Copy
        </button>
      </div>
      <pre className="text-[11px] leading-snug p-3 overflow-x-auto whitespace-pre">{snippet}</pre>
    </div>
  );
}

export default function McpSetupWizard({ open, onClose }: Props) {
  const [status, setStatus] = useState<BridgeStatus>({ connected: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    pingBridge().then(setStatus);
  }, [open]);

  if (!open) return null;

  const handleConnect = async () => {
    setBusy(true);
    try {
      const next = await connectBridge();
      setStatus(next);
      if (next.connected) {
        await updateSettings({ mcpBridgeEnabled: true });
        toast.success('Connected to local MCP server');
      } else {
        toast.error(next.error || 'Could not connect — is the MCP server installed?');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl border border-slate-200 max-h-[85vh] overflow-y-auto">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">Connect to your agents (MCP)</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Context Stash exposes your harvested conversations as an{' '}
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
            >
              MCP server <ExternalLink className="w-3 h-3" />
            </a>
            . Any MCP-aware agent (Claude Code, Cursor, Zed, Windsurf) can then query them.
          </p>

          <div className="rounded-md border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-800">1. Install the local MCP server</div>
              {status.connected ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              ) : (
                <span className="text-xs text-slate-400">Not connected</span>
              )}
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-2">
              Download the signed binary and Native Messaging host manifest for your OS. Once
              installed, click Connect.
            </p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <a
                href="https://github.com/your-org/context-stash/releases/latest"
                target="_blank"
                rel="noreferrer"
                className="px-2 py-1 rounded-md bg-slate-900 text-white inline-flex items-center gap-1 hover:bg-slate-700"
              >
                Download <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={handleConnect}
                disabled={busy}
                className="px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
            {status.error && !status.connected && (
              <p className="mt-2 text-[11px] text-red-600 leading-snug">{status.error}</p>
            )}
            <p className="mt-2 text-[10px] text-slate-400 leading-snug">
              Native host name: <code className="bg-slate-100 px-1 rounded">{NATIVE_HOST_NAME}</code>
            </p>
          </div>

          <div className="rounded-md border border-slate-200 p-3 space-y-3">
            <div className="text-sm font-semibold text-slate-800">2. Wire it into your agent</div>
            <CopyableSnippet
              label="Claude Code (~/.claude.json or .claude/mcp.json)"
              snippet={CLAUDE_CODE_SNIPPET}
            />
            <CopyableSnippet label="Cursor (~/.cursor/mcp.json)" snippet={CURSOR_SNIPPET} />
            <CopyableSnippet label="Zed (settings.json)" snippet={ZED_SNIPPET} />
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            All conversation data stays on your machine. The MCP server reads from your local
            Context Stash store and never makes network calls unless you opt into cloud sync.
          </p>
        </div>
      </div>
    </div>
  );
}
