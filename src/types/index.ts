// ---------- Snippets / Projects (v1, kept for back-compat) ----------

export interface Snippet {
  id: string;
  type: 'selection' | 'page_summary' | 'note';
  content: string;
  label?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  timestamp: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  snippets: Snippet[];
}

// ---------- Conversations (v2 — harvested from LLM web UIs) ----------

export type LLMPlatform =
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'perplexity'
  | 'custom';

export type TurnRole = 'user' | 'assistant' | 'system' | 'tool';

export interface TurnAttachment {
  kind: 'image' | 'file' | 'link';
  url?: string;
  name?: string;
}

export interface ConversationTurn {
  id: string;
  role: TurnRole;
  content: string;            // markdown-normalized
  attachments?: TurnAttachment[];
  model?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;                          // our id
  platform: LLMPlatform;
  platformConversationId: string;      // native id from URL
  title: string;
  url: string;
  turns: ConversationTurn[];
  tags: string[];
  projectId?: string;                  // optional bucket link
  createdAt: number;
  lastSyncedAt: number;
  autoSync: boolean;
  contentHash: string;                 // for dedup + change detection
  // Optional, AI-generated. Auto-populated by the on-device Summarizer API
  // (Chrome/Edge built-in AI) when content changes; null when the API is
  // unavailable or the user declined it.
  summary?: string;
  summaryGeneratedAt?: number;
  // Last time the user opened this conversation in the side panel. The list
  // shows an "updated" badge when lastSyncedAt > lastViewedAt so auto-sync
  // changes are visible without requiring a manual diff.
  lastViewedAt?: number;
}

// ---------- Memory entries (ChatGPT Memory, Claude Memory, etc.) ----------

export interface MemoryEntry {
  id: string;
  platform: LLMPlatform;
  text: string;
  capturedAt: number;
}

// ---------- Settings ----------

export interface AppSettings {
  autoSyncEnabled: boolean;            // master kill-switch
  syncIntervalMs: number;
  optInTelemetry: boolean;
  mcpBridgeEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoSyncEnabled: false,              // off by default per Phase A decision
  syncIntervalMs: 2000,
  optInTelemetry: false,
  mcpBridgeEnabled: false,
};

// ---------- Top-level storage shape (v2) ----------

export const STORAGE_SCHEMA_VERSION = 2;

export interface StorageData {
  schemaVersion: number;
  projects: Project[];
  activeProjectId: string | null;
  conversations: Conversation[];
  memories: MemoryEntry[];
  settings: AppSettings;
}

// ---------- Message bus types ----------

export type MessageType =
  // legacy snippet flow
  | { type: 'REFRESH_DATA' }
  | { type: 'CLIP_PAGE' }
  | { type: 'PAGE_CONTENT'; content: string; title: string; url: string }
  | { type: 'INJECT_CONTEXT' }
  | { type: 'CONTEXT_DATA'; context: string }
  | { type: 'SAVE_SELECTION_WITH_LABEL'; projectId: string; content: string; label?: string; url: string; title: string }
  | { type: 'CREATE_PROJECT_AND_SAVE'; name: string; content: string; url: string; title: string }
  | { type: 'INJECT_CONTEXT_FROM_MENU'; projectId: string }
  | { type: 'GET_CONTEXT' }
  // new conversation harvest flow
  | { type: 'HARVEST_CONVERSATION'; platform: LLMPlatform; platformConversationId: string; url: string; title: string; turns: ConversationTurn[] }
  | { type: 'HARVEST_REQUEST'; tabId?: number }
  | { type: 'START_AUTO_SYNC'; conversationId: string }
  | { type: 'STOP_AUTO_SYNC'; conversationId: string }
  | { type: 'AUTO_SYNC_STATUS'; conversationId: string; lastSyncedAt: number }
  // MCP bridge
  | { type: 'MCP_BRIDGE_PING' }
  | { type: 'MCP_BRIDGE_STATUS'; connected: boolean; error?: string };
