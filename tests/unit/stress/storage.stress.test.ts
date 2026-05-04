import { beforeEach, describe, expect, it } from 'vitest';
import { makeConversation, makeProject, makeRng, makeSnippet } from '../../helpers/fixtures';

interface ChromeMock { __reset(): void; __getRaw(): Record<string, unknown> }
const chromeMock = (globalThis as unknown as { chrome: ChromeMock }).chrome;

async function load() {
  const { vi } = await import('vitest');
  vi.resetModules();
  return import('../../../src/utils/storage');
}

describe('storage stress', () => {
  beforeEach(() => chromeMock.__reset());

  it('migrates a v1 store with 100 projects and >1k snippets cleanly', async () => {
    const projects = Array.from({ length: 100 }, (_, i) => makeProject(15, { id: `p-${i}` }));
    await chrome.storage.local.set({ projects, activeProjectId: 'p-0' });

    const t0 = performance.now();
    const storage = await load();
    const data = await storage.getStorageData();
    const elapsed = performance.now() - t0;

    expect(data.schemaVersion).toBe(2);
    expect(data.projects).toHaveLength(100);
    expect(data.projects[0].snippets).toHaveLength(15);
    expect(data.activeProjectId).toBe('p-0');
    expect(elapsed).toBeLessThan(2_000); // generous bound; should be <100ms in practice
  });

  it('handles 50 distinct conversations and assigns unique content hashes', async () => {
    const storage = await load();
    const rng = makeRng(42);
    for (let i = 0; i < 50; i++) {
      // Per-conversation seed so content actually differs between conversations.
      // (Identical content correctly produces identical hashes — that's how
      // upsert detects no-op updates.)
      const conv = makeConversation(20 + Math.floor(rng() * 30), {
        id: `bulk-${i}`,
        seed: i + 1,
      });
      await storage.upsertConversation({
        platform: conv.platform,
        platformConversationId: conv.platformConversationId,
        url: conv.url,
        title: conv.title,
        turns: conv.turns,
      });
    }
    const all = await storage.getConversations();
    expect(all).toHaveLength(50);

    const hashes = new Set(all.map(c => c.contentHash));
    expect(hashes.size).toBe(50); // no collisions across genuinely distinct content
  });

  it('upsert with the exact same turns is a no-op (changed=false)', async () => {
    const storage = await load();
    const conv = makeConversation(40, { id: 'idem' });
    const a = await storage.upsertConversation(conv);
    const b = await storage.upsertConversation(conv);
    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(false);
    expect(b.changed).toBe(false);
  });

  it('detects single-turn deltas as changed', async () => {
    const storage = await load();
    const base = makeConversation(10, { id: 'delta' });
    await storage.upsertConversation(base);
    const updated = {
      ...base,
      turns: [
        ...base.turns,
        { id: 'extra', role: 'user' as const, content: 'follow-up', createdAt: Date.now() },
      ],
    };
    const r = await storage.upsertConversation(updated);
    expect(r.changed).toBe(true);
    expect(r.conversation.turns).toHaveLength(11);
  });

  it('persists 1000 snippets under one project and roundtrips', async () => {
    const storage = await load();
    const project = await storage.addProject('big');
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const s = makeSnippet(i, rng);
      await storage.addSnippetToProject(project.id, {
        type: s.type,
        content: s.content,
        label: s.label,
        sourceUrl: s.sourceUrl,
        sourceTitle: s.sourceTitle,
      });
    }
    const projects = await storage.getProjects();
    expect(projects[0].snippets).toHaveLength(1000);
    // Each snippet has a unique id
    const ids = new Set(projects[0].snippets.map(s => s.id));
    expect(ids.size).toBe(1000);
  });
});
