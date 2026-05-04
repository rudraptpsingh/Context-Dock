import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ChromeMock { __reset(): void }
const chromeMock = (globalThis as unknown as { chrome: ChromeMock }).chrome;

async function load() {
  vi.resetModules();
  return import('../../src/utils/storage');
}

describe('upsertMemories', () => {
  beforeEach(() => chromeMock.__reset());

  it('adds new entries deduped on (platform, text)', async () => {
    const storage = await load();
    const r = await storage.upsertMemories('chatgpt', [
      { text: 'I prefer TypeScript over JS' },
      { text: 'I prefer TypeScript over JS' }, // duplicate within the batch
      { text: 'I live in Bangalore' },
    ]);
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(1);
    const memories = await storage.getMemories();
    expect(memories).toHaveLength(2);
  });

  it('updates capturedAt only when the incoming timestamp is newer', async () => {
    const storage = await load();
    await storage.upsertMemories('chatgpt', [
      { text: 'Memory A', capturedAt: 1_700_000_000_000 },
    ]);
    const r1 = await storage.upsertMemories('chatgpt', [
      { text: 'Memory A', capturedAt: 1_600_000_000_000 }, // older
    ]);
    expect(r1.skipped).toBe(1);
    expect(r1.updated).toBe(0);

    const r2 = await storage.upsertMemories('chatgpt', [
      { text: 'Memory A', capturedAt: 1_800_000_000_000 }, // newer
    ]);
    expect(r2.updated).toBe(1);
    const stored = await storage.getMemories();
    expect(stored).toHaveLength(1);
    expect(stored[0].capturedAt).toBe(1_800_000_000_000);
  });

  it('keeps memories from different platforms separate even with identical text', async () => {
    const storage = await load();
    await storage.upsertMemories('chatgpt', [{ text: 'Same text' }]);
    await storage.upsertMemories('claude', [{ text: 'Same text' }]);
    const all = await storage.getMemories();
    expect(all).toHaveLength(2);
    expect(new Set(all.map(m => m.platform))).toEqual(new Set(['chatgpt', 'claude']));
  });

  it('strips empty / whitespace-only entries', async () => {
    const storage = await load();
    const r = await storage.upsertMemories('chatgpt', [
      { text: '  ' },
      { text: 'Valid' },
      { text: '' },
    ]);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(2);
  });

  it('deleteMemory removes one without touching the others', async () => {
    const storage = await load();
    await storage.upsertMemories('chatgpt', [
      { text: 'a' },
      { text: 'b' },
      { text: 'c' },
    ]);
    const all = await storage.getMemories();
    await storage.deleteMemory(all[0].id);
    const after = await storage.getMemories();
    expect(after).toHaveLength(2);
    expect(after.map(m => m.text).sort()).toEqual(['b', 'c'].sort());
  });
});
