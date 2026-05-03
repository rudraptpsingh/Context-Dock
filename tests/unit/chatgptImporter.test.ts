import { describe, it, expect, beforeEach } from 'vitest';

interface ChromeMock { __reset(): void }
const chromeMock = (globalThis as unknown as { chrome: ChromeMock }).chrome;

async function loadModules() {
  const { vi } = await import('vitest');
  vi.resetModules();
  const importer = await import('../../src/utils/chatgptImporter');
  const storage = await import('../../src/utils/storage');
  return { importer, storage };
}

const fixture = [
  {
    title: 'Fixture conversation',
    conversation_id: 'cgpt-fix-1',
    create_time: 1_700_000_000,
    mapping: {
      root: { id: 'root', children: ['m1'], parent: null },
      m1: {
        id: 'm1',
        parent: 'root',
        children: ['m2'],
        message: {
          id: 'm1',
          author: { role: 'user' },
          create_time: 1_700_000_001,
          content: { content_type: 'text', parts: ['Hello there'] },
        },
      },
      m2: {
        id: 'm2',
        parent: 'm1',
        children: [],
        message: {
          id: 'm2',
          author: { role: 'assistant' },
          create_time: 1_700_000_002,
          content: { content_type: 'text', parts: ['General Kenobi'] },
          metadata: { model_slug: 'gpt-4o' },
        },
      },
    },
  },
];

describe('ChatGPT conversations.json importer', () => {
  beforeEach(() => chromeMock.__reset());

  it('imports a single conversation, linearising the mapping tree', async () => {
    const { importer, storage } = await loadModules();
    const result = await importer.importChatGPTExport(JSON.stringify(fixture));
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.conversations).toHaveLength(1);

    const stored = await storage.getConversations();
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Fixture conversation');
    expect(stored[0].turns.map(t => t.role)).toEqual(['user', 'assistant']);
    expect(stored[0].turns[0].content).toBe('Hello there');
    expect(stored[0].turns[1].content).toBe('General Kenobi');
    expect(stored[0].turns[1].model).toBe('gpt-4o');
  });

  it('rejects malformed JSON', async () => {
    const { importer } = await loadModules();
    const result = await importer.importChatGPTExport('{not json');
    expect(result.imported).toBe(0);
    expect(result.errors[0]).toMatch(/Invalid JSON/i);
  });

  it('skips entries without a mapping', async () => {
    const { importer } = await loadModules();
    const result = await importer.importChatGPTExport(JSON.stringify([{ title: 'x' }]));
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('accepts the wrapped { conversations: [...] } shape', async () => {
    const { importer } = await loadModules();
    const result = await importer.importChatGPTExport(JSON.stringify({ conversations: fixture }));
    expect(result.imported).toBe(1);
  });
});
