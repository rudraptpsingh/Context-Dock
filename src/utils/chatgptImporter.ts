import { Conversation, ConversationTurn, TurnRole } from '../types';
import { upsertConversation } from './storage';

// Shape of an entry inside ChatGPT's official `conversations.json` export.
// (OpenAI's GDPR-style data dump.)
//
// We only model the fields we actually consume — the file has many more.
interface RawChatGPTMessage {
  id?: string;
  author?: { role?: string };
  create_time?: number;
  content?: { content_type?: string; parts?: unknown[] };
  metadata?: { model_slug?: string };
}

interface RawChatGPTNode {
  id?: string;
  message?: RawChatGPTMessage | null;
  parent?: string | null;
  children?: string[];
}

interface RawChatGPTConversation {
  title?: string;
  create_time?: number;
  update_time?: number;
  conversation_id?: string;
  id?: string;
  mapping: Record<string, RawChatGPTNode>;
}

interface RawExport {
  // ChatGPT export is an array, sometimes wrapped.
  conversations?: RawChatGPTConversation[];
}

function partsToText(parts: unknown[] | undefined): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .map(p => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object' && 'text' in (p as Record<string, unknown>)) {
        const t = (p as { text?: unknown }).text;
        return typeof t === 'string' ? t : '';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeRole(role: string | undefined): TurnRole {
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  if (role === 'tool') return 'tool';
  return 'system';
}

function linearizeMapping(raw: RawChatGPTConversation): ConversationTurn[] {
  // ChatGPT's mapping is a tree; we walk children to produce a linear thread.
  // Find the root (no parent) and follow the *first* child chain — that's the
  // active branch the user actually saw.
  const nodes = raw.mapping;
  const ids = Object.keys(nodes);
  if (!ids.length) return [];
  let rootId: string | null = null;
  for (const id of ids) {
    const node = nodes[id];
    if (!node?.parent) {
      rootId = id;
      break;
    }
  }
  if (!rootId) rootId = ids[0];

  const turns: ConversationTurn[] = [];
  const visited = new Set<string>();
  let cursor: string | null = rootId;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const node: RawChatGPTNode | undefined = nodes[cursor];
    const msg = node?.message;
    if (msg && msg.author?.role && msg.content) {
      const text = partsToText(msg.content.parts);
      if (text.trim()) {
        turns.push({
          id: msg.id || crypto.randomUUID(),
          role: normalizeRole(msg.author.role),
          content: text,
          model: msg.metadata?.model_slug,
          createdAt: (msg.create_time ? Math.round(msg.create_time * 1000) : Date.now()),
        });
      }
    }
    const children: string[] = node?.children ?? [];
    cursor = children[0] ?? null;
  }
  return turns;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  conversations: Conversation[];
}

export async function importChatGPTExport(text: string): Promise<ImportResult> {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return { imported: 0, skipped: 0, errors, conversations: [] };
  }

  let raws: RawChatGPTConversation[] = [];
  if (Array.isArray(parsed)) {
    raws = parsed as RawChatGPTConversation[];
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as RawExport).conversations)) {
    raws = (parsed as RawExport).conversations!;
  } else {
    errors.push('Unrecognised export format. Expected an array of conversations.');
    return { imported: 0, skipped: 0, errors, conversations: [] };
  }

  let imported = 0;
  let skipped = 0;
  const conversations: Conversation[] = [];
  for (const raw of raws) {
    if (!raw || !raw.mapping) {
      skipped++;
      continue;
    }
    const turns = linearizeMapping(raw);
    if (!turns.length) {
      skipped++;
      continue;
    }
    const conversationId = raw.conversation_id || raw.id || crypto.randomUUID();
    const title = raw.title || 'Untitled ChatGPT conversation';
    try {
      const result = await upsertConversation({
        platform: 'chatgpt',
        platformConversationId: conversationId,
        url: `https://chatgpt.com/c/${conversationId}`,
        title,
        turns,
      });
      conversations.push(result.conversation);
      imported++;
    } catch (e) {
      errors.push(`Failed to import "${title}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { imported, skipped, errors, conversations };
}
