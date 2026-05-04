import type { BulkImporter, ImporterConversationSummary } from './types';
import type { ConversationTurn, TurnRole } from '../../types';

interface OrgEntry { uuid: string; name?: string }
interface ConvSummary { uuid: string; name?: string; updated_at?: string; created_at?: string }
interface ConvDetail {
  uuid: string;
  name?: string;
  chat_messages: Array<{
    uuid: string;
    sender?: 'human' | 'assistant';
    text?: string;
    content?: Array<{ type?: string; text?: string }>;
    created_at?: string;
    model?: string;
  }>;
}

let cachedOrgId: string | null = null;

async function getOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const r = await fetch('/api/organizations', { credentials: 'include' });
  if (!r.ok) throw new Error(`organizations probe failed (${r.status})`);
  const orgs = (await r.json()) as OrgEntry[];
  if (!orgs.length) throw new Error('no organizations — not signed in?');
  cachedOrgId = orgs[0].uuid;
  return cachedOrgId;
}

function flattenContent(parts: Array<{ type?: string; text?: string }> | undefined, fallback?: string): string {
  if (parts && parts.length) {
    return parts
      .filter(p => (p.type === 'text' || !p.type) && p.text)
      .map(p => p.text!)
      .join('\n\n');
  }
  return fallback ?? '';
}

const importer: BulkImporter = {
  platform: 'claude',
  hosts: ['claude.ai'],

  async isAuthenticated() {
    try {
      await getOrgId();
      return true;
    } catch {
      return false;
    }
  },

  async listConversations() {
    const orgId = await getOrgId();
    const r = await fetch(`/api/organizations/${orgId}/chat_conversations`, { credentials: 'include' });
    if (!r.ok) throw new Error(`list failed (${r.status})`);
    const list = (await r.json()) as ConvSummary[];
    return list.map<ImporterConversationSummary>(c => ({
      platformConversationId: c.uuid,
      title: c.name || 'Untitled',
      url: `https://claude.ai/chat/${c.uuid}`,
      updatedAt: c.updated_at ? Date.parse(c.updated_at) : undefined,
    }));
  },

  async fetchConversation(id) {
    const orgId = await getOrgId();
    const r = await fetch(
      `/api/organizations/${orgId}/chat_conversations/${id}?tree=True&rendering_mode=messages`,
      { credentials: 'include' },
    );
    if (!r.ok) throw new Error(`fetch ${id} failed (${r.status})`);
    const data = (await r.json()) as ConvDetail;
    const turns: ConversationTurn[] = data.chat_messages
      .map(m => {
        const role: TurnRole = m.sender === 'human' ? 'user' : 'assistant';
        const content = flattenContent(m.content, m.text);
        if (!content) return null;
        return {
          id: m.uuid,
          role,
          content,
          createdAt: m.created_at ? Date.parse(m.created_at) : 0,
          model: m.model,
        } as ConversationTurn;
      })
      .filter((t): t is ConversationTurn => t !== null);
    return {
      platform: 'claude',
      platformConversationId: id,
      title: data.name || 'Untitled',
      url: `https://claude.ai/chat/${id}`,
      turns,
    };
  },
};

export default importer;
