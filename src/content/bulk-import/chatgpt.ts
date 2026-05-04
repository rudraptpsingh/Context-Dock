import type { BulkImporter, ImportedConversation, ImporterConversationSummary } from './types';
import type { ConversationTurn, TurnRole } from '../../types';

const SESSION_URL = '/api/auth/session';
const LIST_URL = '/backend-api/conversations';
const CONV_URL = (id: string) => `/backend-api/conversation/${id}`;
const PAGE = 100;

interface SessionResponse { accessToken?: string }

interface ListEntry { id: string; title: string; update_time?: number; create_time?: number }

interface RawNode {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: {
    id?: string;
    author?: { role?: string };
    create_time?: number;
    content?: { content_type?: string; parts?: unknown[] };
    metadata?: { model_slug?: string };
  } | null;
}

let cachedToken: string | null = null;
let tokenFetchedAt = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() - tokenFetchedAt < 60_000) return cachedToken;
  const r = await fetch(SESSION_URL, { credentials: 'include' });
  if (!r.ok) throw new Error(`session probe failed (${r.status})`);
  const json = (await r.json()) as SessionResponse;
  if (!json.accessToken) throw new Error('no accessToken — not signed in?');
  cachedToken = json.accessToken;
  tokenFetchedAt = Date.now();
  return cachedToken;
}

async function authedFetch(path: string): Promise<Response> {
  const token = await getToken();
  return fetch(path, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
}

function turnsFromMapping(mapping: Record<string, RawNode>): ConversationTurn[] {
  const root = Object.values(mapping).find(n => n?.parent == null);
  if (!root) return [];
  const turns: ConversationTurn[] = [];
  let cursor = root.children?.[0];
  while (cursor && mapping[cursor]) {
    const node = mapping[cursor];
    const msg = node.message;
    if (msg) {
      const role = (msg.author?.role ?? 'assistant') as TurnRole;
      const parts = msg.content?.parts ?? [];
      const content = parts
        .map(p => (typeof p === 'string' ? p : ''))
        .filter(Boolean)
        .join('\n\n');
      if (content && (role === 'user' || role === 'assistant' || role === 'system')) {
        turns.push({
          id: msg.id ?? cursor,
          role,
          content,
          createdAt: (msg.create_time ?? 0) * 1000,
          model: msg.metadata?.model_slug,
        });
      }
    }
    cursor = node.children?.[0];
  }
  return turns;
}

const importer: BulkImporter = {
  platform: 'chatgpt',
  hosts: ['chatgpt.com', 'chat.openai.com'],

  async isAuthenticated() {
    try {
      await getToken();
      return true;
    } catch {
      return false;
    }
  },

  async listConversations() {
    const out: ImporterConversationSummary[] = [];
    let offset = 0;
    while (true) {
      const r = await authedFetch(`${LIST_URL}?offset=${offset}&limit=${PAGE}&order=updated`);
      if (!r.ok) throw new Error(`list failed (${r.status})`);
      const data = (await r.json()) as { items?: ListEntry[]; total?: number };
      const items = data.items ?? [];
      if (!items.length) break;
      for (const it of items) {
        out.push({
          platformConversationId: it.id,
          title: it.title || 'Untitled',
          url: `https://chatgpt.com/c/${it.id}`,
          updatedAt: it.update_time ? it.update_time * 1000 : undefined,
        });
      }
      offset += items.length;
      if (data.total !== undefined && offset >= data.total) break;
      if (items.length < PAGE) break;
    }
    return out;
  },

  async fetchConversation(id) {
    const r = await authedFetch(CONV_URL(id));
    if (!r.ok) throw new Error(`fetch ${id} failed (${r.status})`);
    const data = (await r.json()) as { title?: string; mapping?: Record<string, RawNode>; create_time?: number };
    const turns = turnsFromMapping(data.mapping ?? {});
    return {
      platform: 'chatgpt',
      platformConversationId: id,
      title: data.title || 'Untitled',
      url: `https://chatgpt.com/c/${id}`,
      turns,
      createdAt: data.create_time ? data.create_time * 1000 : undefined,
    } satisfies ImportedConversation;
  },
};

export default importer;
