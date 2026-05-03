import { beforeEach, describe, expect, it } from 'vitest';
import { makeChatGPTExport } from '../../helpers/fixtures';

interface ChromeMock { __reset(): void }
const chromeMock = (globalThis as unknown as { chrome: ChromeMock }).chrome;

async function load() {
  const { vi } = await import('vitest');
  vi.resetModules();
  const importer = await import('../../../src/utils/chatgptImporter');
  const storage = await import('../../../src/utils/storage');
  return { importer, storage };
}

describe('ChatGPT importer stress', () => {
  beforeEach(() => chromeMock.__reset());

  it('imports 200 conversations × 8 turns under a generous time budget', async () => {
    const { importer, storage } = await load();
    const blob = makeChatGPTExport(200, 8);

    const t0 = performance.now();
    const result = await importer.importChatGPTExport(blob);
    const elapsed = performance.now() - t0;

    expect(result.imported).toBe(200);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(elapsed).toBeLessThan(15_000); // CI-safe ceiling

    const stored = await storage.getConversations();
    expect(stored).toHaveLength(200);
    expect(stored.every(c => c.turns.length === 8)).toBe(true);
  });

  it('importing the same file twice is idempotent', async () => {
    const { importer, storage } = await load();
    const blob = makeChatGPTExport(50, 4);
    const a = await importer.importChatGPTExport(blob);
    const b = await importer.importChatGPTExport(blob);
    expect(a.imported).toBe(50);
    expect(b.imported).toBe(50); // upsert, not duplicate-rows
    const stored = await storage.getConversations();
    expect(stored).toHaveLength(50);
  });

  it('survives a deeply nested mapping by walking children[0]', async () => {
    const { importer } = await load();
    const blob = makeChatGPTExport(1, 100); // 100 turns deep
    const result = await importer.importChatGPTExport(blob);
    expect(result.imported).toBe(1);
    expect(result.conversations[0].turns).toHaveLength(100);
  });

  it('handles partially-malformed entries without aborting the whole batch', async () => {
    const { importer } = await load();
    const good = JSON.parse(makeChatGPTExport(3, 4));
    // Inject a junk entry between two valid ones.
    good.splice(1, 0, { not: 'a real conversation' });
    const result = await importer.importChatGPTExport(JSON.stringify(good));
    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(1);
  });
});
