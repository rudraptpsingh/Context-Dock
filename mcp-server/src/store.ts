// Local persistence for conversations the bridge has pushed in.
//
// The MCP server keeps its own JSON store so it can answer queries even when
// Chrome is closed. The bridge mirrors the extension's storage on the way in.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export interface Turn {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  model?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  platform: string;
  platformConversationId: string;
  title: string;
  url: string;
  turns: Turn[];
  tags: string[];
  createdAt: number;
  lastSyncedAt: number;
}

const DATA_DIR = process.env.CONTEXT_STASH_DATA_DIR ??
  join(homedir(), '.config', 'context-stash');
const DATA_FILE = join(DATA_DIR, 'conversations.json');

export interface Memory {
  id: string;
  platform: string;
  text: string;
  capturedAt: number;
}

interface Store {
  conversations: Conversation[];
  memories?: Memory[];
}

let cache: Store | null = null;

export async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    cache = JSON.parse(raw) as Store;
  } catch {
    cache = { conversations: [] };
  }
  return cache;
}

export async function save(): Promise<void> {
  if (!cache) return;
  await mkdir(dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

export async function upsert(conv: Conversation): Promise<void> {
  const store = await load();
  const i = store.conversations.findIndex(
    c => c.platform === conv.platform && c.platformConversationId === conv.platformConversationId,
  );
  if (i === -1) store.conversations.push(conv);
  else store.conversations[i] = conv;
  await save();
}

export async function replaceAll(conversations: Conversation[]): Promise<void> {
  cache = { conversations };
  await save();
}

export async function listConversations(): Promise<Conversation[]> {
  const store = await load();
  return [...store.conversations].sort((a, b) => b.lastSyncedAt - a.lastSyncedAt);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const store = await load();
  return store.conversations.find(c => c.id === id) ?? null;
}

export async function listMemories(opts: { platform?: string } = {}): Promise<Memory[]> {
  const store = await load();
  const memories = store.memories ?? [];
  const filtered = opts.platform ? memories.filter(m => m.platform === opts.platform) : memories;
  return [...filtered].sort((a, b) => b.capturedAt - a.capturedAt);
}

export async function searchMemories(query: string, opts: { platform?: string; limit?: number } = {}): Promise<Memory[]> {
  const all = await listMemories({ platform: opts.platform });
  const q = query.trim().toLowerCase();
  const filtered = q ? all.filter(m => m.text.toLowerCase().includes(q)) : all;
  return filtered.slice(0, opts.limit ?? 20);
}

export async function replaceMemories(memories: Memory[]): Promise<void> {
  const store = await load();
  cache = { ...store, memories };
  await save();
}

export async function searchConversations(
  query: string,
  opts: { platform?: string; limit?: number } = {},
): Promise<Conversation[]> {
  const store = await load();
  const q = query.trim().toLowerCase();
  const limit = opts.limit ?? 20;
  return store.conversations
    .filter(c => !opts.platform || c.platform === opts.platform)
    .filter(c => {
      if (!q) return true;
      if (c.title.toLowerCase().includes(q)) return true;
      if (c.tags.some(t => t.toLowerCase().includes(q))) return true;
      return c.turns.some(t => t.content.toLowerCase().includes(q));
    })
    .sort((a, b) => b.lastSyncedAt - a.lastSyncedAt)
    .slice(0, limit);
}

export function conversationToMarkdown(conv: Conversation): string {
  const header = [
    `# ${conv.title}`,
    '',
    `- Platform: ${conv.platform}`,
    `- Source: ${conv.url}`,
    `- Last synced: ${new Date(conv.lastSyncedAt).toISOString()}`,
    '',
    '---',
    '',
  ].join('\n');
  const body = conv.turns
    .map(t => {
      const head =
        t.role === 'user'
          ? '## 👤 User'
          : t.role === 'assistant'
            ? '## 🤖 Assistant'
            : t.role === 'system'
              ? '## ⚙️ System'
              : '## 🛠️ Tool';
      const meta = t.model ? `*${t.model}*\n\n` : '';
      return `${head}\n\n${meta}${t.content}\n`;
    })
    .join('\n');
  return header + body;
}
