import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ChromeMock { __reset(): void }
const chromeMock = (globalThis as unknown as { chrome: ChromeMock }).chrome;

const sentMessages: Array<{ type: string; payload?: unknown }> = [];

let chatgpt: typeof import('../../src/content/bulk-import/chatgpt').default;
let claude: typeof import('../../src/content/bulk-import/claude').default;
let runBulkImport: typeof import('../../src/content/bulk-import').runBulkImport;

beforeEach(async () => {
  chromeMock.__reset();
  sentMessages.length = 0;
  // Each importer caches a session token / org id at module scope. Reset
  // the modules so a previous test's cached value doesn't survive.
  vi.resetModules();
  chatgpt = (await import('../../src/content/bulk-import/chatgpt')).default;
  claude = (await import('../../src/content/bulk-import/claude')).default;
  runBulkImport = (await import('../../src/content/bulk-import')).runBulkImport;
  // Stub chrome.runtime.sendMessage so the importer's worker can call it.
  // The unit-test setup mocks chrome.storage but not runtime.sendMessage.
  (
    globalThis as unknown as { chrome: { runtime: { sendMessage: (m: unknown) => Promise<unknown> } } }
  ).chrome.runtime = {
    sendMessage: async (m: unknown) => {
      sentMessages.push(m as { type: string; payload?: unknown });
      return undefined;
    },
  } as unknown as typeof chrome.runtime;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    return Promise.resolve(handler(url));
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ChatGPT bulk importer', () => {
  it('reports unauthenticated when /api/auth/session has no token', async () => {
    mockFetch(() => jsonResponse({}, 200));
    expect(await chatgpt.isAuthenticated()).toBe(false);
  });

  it('paginates the conversation list until exhausted', async () => {
    const calls: string[] = [];
    const fakePage = (offset: number) =>
      Array.from({ length: offset === 0 ? 100 : 23 }, (_, i) => ({
        id: `conv-${offset}-${i}`,
        title: `Title ${offset}-${i}`,
        update_time: 1_700_000_000 + i,
      }));
    mockFetch(url => {
      calls.push(url);
      if (url.includes('/api/auth/session')) return jsonResponse({ accessToken: 'tok' });
      const offset = Number(new URL(url, 'http://x').searchParams.get('offset') ?? '0');
      return jsonResponse({ items: fakePage(offset), total: 123 });
    });
    const list = await chatgpt.listConversations();
    expect(list).toHaveLength(123);
    expect(list[0].url).toMatch(/^https:\/\/chatgpt\.com\/c\/conv-/);
    expect(calls.some(c => c.includes('offset=0'))).toBe(true);
    expect(calls.some(c => c.includes('offset=100'))).toBe(true);
  });

  it('flattens a single-thread mapping into ordered turns', async () => {
    mockFetch(url => {
      if (url.includes('/api/auth/session')) return jsonResponse({ accessToken: 'tok' });
      if (url.includes('/backend-api/conversation/abc')) {
        return jsonResponse({
          title: 'How does sourdough work',
          create_time: 1_700_000_000,
          mapping: {
            root: { id: 'root', parent: null, children: ['m0'] },
            m0: {
              id: 'm0',
              parent: 'root',
              children: ['m1'],
              message: {
                id: 'm0',
                author: { role: 'user' },
                content: { content_type: 'text', parts: ['What hydration?'] },
                create_time: 1_700_000_000,
              },
            },
            m1: {
              id: 'm1',
              parent: 'm0',
              children: [],
              message: {
                id: 'm1',
                author: { role: 'assistant' },
                content: { content_type: 'text', parts: ['78% works for an open crumb.'] },
                create_time: 1_700_000_001,
                metadata: { model_slug: 'gpt-4o' },
              },
            },
          },
        });
      }
      return jsonResponse({}, 404);
    });
    const conv = await chatgpt.fetchConversation('abc');
    expect(conv.platform).toBe('chatgpt');
    expect(conv.title).toBe('How does sourdough work');
    expect(conv.turns).toHaveLength(2);
    expect(conv.turns[0].role).toBe('user');
    expect(conv.turns[1].role).toBe('assistant');
    expect(conv.turns[1].model).toBe('gpt-4o');
  });
});

describe('Claude.ai bulk importer', () => {
  it('grabs the first organization and lists its conversations', async () => {
    mockFetch(url => {
      if (url.endsWith('/api/organizations')) {
        return jsonResponse([{ uuid: 'org-1' }, { uuid: 'org-2' }]);
      }
      if (url.endsWith('/api/organizations/org-1/chat_conversations')) {
        return jsonResponse([
          { uuid: 'c1', name: 'Recipe', updated_at: '2026-04-01T00:00:00Z' },
          { uuid: 'c2', name: 'Code review', updated_at: '2026-04-02T00:00:00Z' },
        ]);
      }
      return jsonResponse({}, 404);
    });
    const list = await claude.listConversations();
    expect(list.map(c => c.title)).toEqual(['Recipe', 'Code review']);
    expect(list[0].url).toBe('https://claude.ai/chat/c1');
  });

  it('flattens chat_messages content blocks into turns', async () => {
    mockFetch(url => {
      if (url.endsWith('/api/organizations')) return jsonResponse([{ uuid: 'org-1' }]);
      if (url.includes('/chat_conversations/c1')) {
        return jsonResponse({
          uuid: 'c1',
          name: 'X',
          chat_messages: [
            { uuid: 'a', sender: 'human', content: [{ type: 'text', text: 'hi' }], created_at: '2026-04-01T00:00:00Z' },
            {
              uuid: 'b',
              sender: 'assistant',
              content: [{ type: 'text', text: 'hello' }, { type: 'text', text: 'there' }],
              model: 'claude-opus-4-7',
              created_at: '2026-04-01T00:00:01Z',
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    });
    const conv = await claude.fetchConversation('c1');
    expect(conv.turns).toHaveLength(2);
    expect(conv.turns[0].content).toBe('hi');
    expect(conv.turns[1].content).toBe('hello\n\nthere');
    expect(conv.turns[1].model).toBe('claude-opus-4-7');
  });
});

describe('runBulkImport orchestrator', () => {
  it('drives list+fetch+upsert end-to-end and reports progress', async () => {
    const events: Array<{ completed: number; total: number; done: boolean }> = [];
    const ids = ['a', 'b', 'c'];
    mockFetch(url => {
      if (url.endsWith('/api/auth/session')) return jsonResponse({ accessToken: 'tok' });
      if (url.includes('/backend-api/conversations')) {
        return jsonResponse({
          items: ids.map(id => ({ id, title: `t-${id}`, update_time: 1 })),
          total: ids.length,
        });
      }
      const m = url.match(/\/backend-api\/conversation\/(\w+)/);
      if (m) {
        return jsonResponse({
          title: `t-${m[1]}`,
          mapping: {
            root: { id: 'root', parent: null, children: ['x'] },
            x: {
              id: 'x',
              parent: 'root',
              children: [],
              message: {
                id: 'x',
                author: { role: 'user' },
                content: { content_type: 'text', parts: [`q-${m[1]}`] },
                create_time: 1,
              },
            },
          },
        });
      }
      return jsonResponse({}, 404);
    });
    const result = await runBulkImport(chatgpt, {
      onProgress: p => events.push({ completed: p.completed, total: p.total, done: p.done }),
    });
    expect(result.done).toBe(true);
    expect(result.completed).toBe(3);
    expect(result.failed).toBe(0);
    expect(events.some(e => e.done)).toBe(true);
    // Each completed conversation should have caused a HARVEST_CONVERSATION send.
    expect(sentMessages.filter(m => m.type === 'HARVEST_CONVERSATION')).toHaveLength(3);
  });

  it('returns error progress when not authenticated', async () => {
    mockFetch(() => jsonResponse({}, 200));
    const result = await runBulkImport(chatgpt);
    expect(result.done).toBe(true);
    expect(result.completed).toBe(0);
    expect(result.error).toMatch(/Not signed in/);
  });

  it('counts per-item failures without aborting the batch', async () => {
    const ids = ['ok', 'fail', 'ok2'];
    mockFetch(url => {
      if (url.endsWith('/api/auth/session')) return jsonResponse({ accessToken: 'tok' });
      if (url.includes('/backend-api/conversations'))
        return jsonResponse({ items: ids.map(id => ({ id, title: id })), total: ids.length });
      const m = url.match(/\/backend-api\/conversation\/(\w+)/);
      if (m && m[1] === 'fail') return jsonResponse({}, 500);
      if (m) {
        return jsonResponse({
          title: m[1],
          mapping: {
            root: { id: 'root', parent: null, children: ['x'] },
            x: {
              id: 'x',
              parent: 'root',
              children: [],
              message: { id: 'x', author: { role: 'user' }, content: { content_type: 'text', parts: ['q'] } },
            },
          },
        });
      }
      return jsonResponse({}, 404);
    });
    const result = await runBulkImport(chatgpt);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(1);
  });
});
