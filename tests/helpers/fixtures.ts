// Fixture generators for heavy / realistic test data.
//
// Used by both unit and E2E tests. Deterministic by default (seeded RNG) so
// stress tests are reproducible across runs and CI.

import type { Conversation, ConversationTurn, Project, Snippet, TurnRole } from '../../src/types';

// ---------- Seeded RNG ----------

export function makeRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

// ---------- Realistic content samples ----------

const CODE_BLOCKS = [
  '```ts\nfunction hello(name: string) {\n  return `Hello, ${name}`\n}\n```',
  '```python\nimport asyncio\n\nasync def main():\n    await asyncio.sleep(0.1)\n    print("done")\n```',
  '```bash\n$ git rev-parse --short HEAD\nb5d7827\n$ npm test\n✓ 21 passed\n```',
];

const RTL_FRAGMENT = 'وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ';
const EMOJI_FRAGMENT = '🚀 Ship it. 🧪 Test it. 🐛 Fix it. 🔁';
const PROSE = [
  'The Model Context Protocol is an open standard for connecting AI assistants to external systems.',
  'Conversations harvested from chat UIs need to be normalized into a unified shape before any agent can query them.',
  'Streaming responses arrive token by token; a debounced observer is the only sane way to capture them.',
  'Auto-sync should default to off — it touches the user\'s active page and we want explicit opt-in.',
  'Export formats should round-trip cleanly: a JSON export followed by an import must produce byte-identical content.',
];

export function paragraph(rng: () => number, sentences = 3): string {
  return Array.from({ length: sentences }, () => pick(rng, PROSE)).join(' ');
}

export function richTurnContent(rng: () => number, opts: { length?: 'short' | 'long' } = {}): string {
  const length = opts.length ?? 'short';
  const parts: string[] = [];
  parts.push(paragraph(rng, length === 'long' ? 8 : 2));
  if (rng() < 0.5) parts.push(pick(rng, CODE_BLOCKS));
  if (rng() < 0.2) parts.push(EMOJI_FRAGMENT);
  if (rng() < 0.1) parts.push(RTL_FRAGMENT);
  if (length === 'long') parts.push(paragraph(rng, 6));
  return parts.join('\n\n');
}

// ---------- Generators ----------

export function makeTurn(
  i: number,
  role: TurnRole,
  rng: () => number,
  opts: { long?: boolean } = {},
): ConversationTurn {
  return {
    id: `t-${i}`,
    role,
    content: richTurnContent(rng, { length: opts.long ? 'long' : 'short' }),
    model: role === 'assistant' ? 'gpt-4o' : undefined,
    createdAt: 1_700_000_000_000 + i * 1000,
  };
}

export function makeConversation(
  turnCount: number,
  opts: { id?: string; long?: boolean; seed?: number } = {},
): Conversation {
  const rng = makeRng(opts.seed ?? turnCount);
  const id = opts.id ?? `conv-${turnCount}`;
  const turns: ConversationTurn[] = [];
  for (let i = 0; i < turnCount; i++) {
    turns.push(makeTurn(i, i % 2 === 0 ? 'user' : 'assistant', rng, { long: opts.long }));
  }
  return {
    id,
    platform: 'chatgpt',
    platformConversationId: id,
    title: `Stress conversation ${id}`,
    url: `https://chatgpt.com/c/${id}`,
    turns,
    tags: ['stress', `turns:${turnCount}`],
    createdAt: 1_700_000_000_000,
    lastSyncedAt: 1_700_000_001_000,
    autoSync: false,
    contentHash: `hash-${id}`,
  };
}

export function makeSnippet(i: number, rng: () => number): Snippet {
  const types: Snippet['type'][] = ['selection', 'page_summary', 'note'];
  return {
    id: `s-${i}`,
    type: types[i % 3],
    content: paragraph(rng, 4),
    label: i % 5 === 0 ? `label-${i}` : undefined,
    sourceUrl: i % 2 === 0 ? `https://example.com/page-${i}` : undefined,
    sourceTitle: i % 2 === 0 ? `Example page ${i}` : undefined,
    timestamp: 1_700_000_000_000 + i * 1000,
  };
}

export function makeProject(snippetCount: number, opts: { id?: string; seed?: number } = {}): Project {
  const rng = makeRng(opts.seed ?? snippetCount);
  return {
    id: opts.id ?? `project-${snippetCount}`,
    name: `Stress project ${snippetCount}`,
    createdAt: 1_700_000_000_000,
    snippets: Array.from({ length: snippetCount }, (_, i) => makeSnippet(i, rng)),
  };
}

// ---------- ChatGPT export shape (matches importer's expectations) ----------

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

interface RawConv {
  title: string;
  conversation_id: string;
  create_time: number;
  mapping: Record<string, RawNode>;
}

export function makeChatGPTExport(
  convCount: number,
  turnsPerConv = 6,
  opts: { wrapped?: boolean; seed?: number } = {},
): string {
  const rng = makeRng(opts.seed ?? convCount);
  const conversations: RawConv[] = [];
  for (let c = 0; c < convCount; c++) {
    const mapping: Record<string, RawNode> = {
      root: { id: 'root', parent: null, children: turnsPerConv ? ['m0'] : [] },
    };
    for (let t = 0; t < turnsPerConv; t++) {
      const isLast = t === turnsPerConv - 1;
      mapping[`m${t}`] = {
        id: `m${t}`,
        parent: t === 0 ? 'root' : `m${t - 1}`,
        children: isLast ? [] : [`m${t + 1}`],
        message: {
          id: `m${t}`,
          author: { role: t % 2 === 0 ? 'user' : 'assistant' },
          create_time: 1_700_000_000 + c * 100 + t,
          content: { content_type: 'text', parts: [richTurnContent(rng)] },
          metadata: t % 2 === 0 ? undefined : { model_slug: 'gpt-4o' },
        },
      };
    }
    conversations.push({
      title: `Stress export conv ${c}`,
      conversation_id: `cgpt-stress-${c}`,
      create_time: 1_700_000_000 + c * 1000,
      mapping,
    });
  }
  return JSON.stringify(opts.wrapped ? { conversations } : conversations);
}

// ---------- Mock ChatGPT DOM HTML ----------

export function makeChatGPTDom(turnCount: number, seed = 0): string {
  const rng = makeRng(seed);
  const turns: string[] = [];
  for (let i = 0; i < turnCount; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant';
    const content = richTurnContent(rng);
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    turns.push(`
      <div data-message-id="m-${i}" data-message-author-role="${role}"${role === 'assistant' ? ' data-message-model-slug="gpt-4o"' : ''}>
        <div class="markdown">${escaped}</div>
      </div>
    `);
  }
  return `<!doctype html><html><head><title>Stress thread ${turnCount} | ChatGPT</title></head><body><main>${turns.join('')}</main></body></html>`;
}
