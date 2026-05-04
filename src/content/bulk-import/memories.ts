// Per-platform memory fetchers. Runs in the platform's content-script
// context so cookies attach automatically.

import type { LLMPlatform } from '../../types';

export interface MemoryItem {
  platformId?: string;
  text: string;
  capturedAt?: number;
}

export interface MemoryFetcher {
  platform: LLMPlatform;
  hosts: string[];
  fetchMemories(getToken: () => Promise<string | null>): Promise<MemoryItem[]>;
}

interface ChatGPTMemoryEntry {
  id?: string;
  content?: string;
  memory?: string;
  text?: string;
  created_at?: string | number;
  updated_at?: string | number;
}

interface ChatGPTMemoriesResponse {
  items?: ChatGPTMemoryEntry[];
  memories?: ChatGPTMemoryEntry[];
  data?: ChatGPTMemoryEntry[];
}

function parseTimestamp(value: string | number | undefined): number | undefined {
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  if (typeof value === 'string') {
    const n = Date.parse(value);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

const chatgpt: MemoryFetcher = {
  platform: 'chatgpt',
  hosts: ['chatgpt.com', 'chat.openai.com'],

  async fetchMemories(getToken) {
    const token = await getToken();
    if (!token) return [];
    const headers: HeadersInit = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    // Endpoint name has shifted across releases. Try the most likely paths
    // in order; first 200 wins.
    const candidates = ['/backend-api/memories', '/backend-api/me/memories'];
    for (const path of candidates) {
      try {
        const r = await fetch(path, { credentials: 'include', headers });
        if (!r.ok) continue;
        const data = (await r.json()) as ChatGPTMemoriesResponse;
        const items = data.items ?? data.memories ?? data.data ?? [];
        if (!items.length) continue;
        return items
          .map<MemoryItem>(it => ({
            platformId: it.id,
            text: (it.content ?? it.memory ?? it.text ?? '').trim(),
            capturedAt: parseTimestamp(it.updated_at ?? it.created_at),
          }))
          .filter(m => m.text.length > 0);
      } catch {
        // Try the next candidate.
      }
    }
    return [];
  },
};

interface ClaudePreferencesResponse {
  // Claude exposes per-organization "personalization" or "preferences"
  // endpoints. The exact JSON shape varies; we look for any string fields
  // that look like user-supplied instructions and capture them as
  // memories. Best-effort.
  preferences?: { custom_instructions?: string; personality?: string };
  custom_instructions?: string;
  personalization?: { instructions?: string };
}

const claude: MemoryFetcher = {
  platform: 'claude',
  hosts: ['claude.ai'],

  async fetchMemories(_getToken) {
    try {
      const orgsRes = await fetch('/api/organizations', { credentials: 'include' });
      if (!orgsRes.ok) return [];
      const orgs = (await orgsRes.json()) as Array<{ uuid: string }>;
      if (!orgs.length) return [];
      const orgId = orgs[0].uuid;
      // Try a couple of likely endpoints, take the first 200 that yields a
      // string we can interpret.
      const candidates = [
        `/api/organizations/${orgId}/preferences`,
        `/api/organizations/${orgId}/personalization`,
        `/api/account/profile`,
      ];
      const out: MemoryItem[] = [];
      for (const path of candidates) {
        try {
          const r = await fetch(path, { credentials: 'include' });
          if (!r.ok) continue;
          const data = (await r.json()) as ClaudePreferencesResponse;
          const candidates: Array<string | undefined> = [
            data.preferences?.custom_instructions,
            data.preferences?.personality,
            data.custom_instructions,
            data.personalization?.instructions,
          ];
          for (const text of candidates) {
            if (typeof text === 'string' && text.trim()) {
              out.push({ text: text.trim(), capturedAt: Date.now() });
            }
          }
        } catch {
          /* try next */
        }
      }
      return out;
    } catch {
      return [];
    }
  },
};

const REGISTRY: Record<string, MemoryFetcher> = {
  chatgpt,
  claude,
};

export function findMemoryFetcher(host: string): MemoryFetcher | null {
  for (const f of Object.values(REGISTRY)) if (f.hosts.includes(host)) return f;
  return null;
}
