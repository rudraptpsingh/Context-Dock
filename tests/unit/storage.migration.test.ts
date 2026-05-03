import { describe, expect, it, beforeEach } from 'vitest';

interface ChromeMock {
  __reset(): void;
  __getRaw(): Record<string, unknown>;
}
const chromeMock = (globalThis as unknown as { chrome: ChromeMock }).chrome;

// Re-import the module fresh per test so its module-level migration flag resets.
async function loadStorage() {
  const path = '../../src/utils/storage';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await import(/* @vite-ignore */ path)) as typeof import('../../src/utils/storage');
}

describe('storage migration v1 -> v2', () => {
  beforeEach(async () => {
    chromeMock.__reset();
    // Vitest caches ES modules; reset that too so the migration-once guard re-runs.
    const { vi } = await import('vitest');
    vi.resetModules();
  });

  it('upgrades a v1-shaped store without losing projects', async () => {
    await chrome.storage.local.set({
      projects: [
        {
          id: 'p1',
          name: 'Old Project',
          createdAt: 1000,
          snippets: [{ id: 's1', type: 'note', content: 'hello', timestamp: 1000 }],
        },
      ],
      activeProjectId: 'p1',
    });

    const storage = await loadStorage();
    const data = await storage.getStorageData();

    expect(data.schemaVersion).toBe(2);
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].name).toBe('Old Project');
    expect(data.projects[0].snippets).toHaveLength(1);
    expect(data.activeProjectId).toBe('p1');
    expect(data.conversations).toEqual([]);
    expect(data.memories).toEqual([]);
    expect(data.settings.autoSyncEnabled).toBe(false);
    expect(data.settings.mcpBridgeEnabled).toBe(false);
  });

  it('initialises an empty store on first install', async () => {
    const storage = await loadStorage();
    const data = await storage.getStorageData();
    expect(data.schemaVersion).toBe(2);
    expect(data.projects).toEqual([]);
    expect(data.conversations).toEqual([]);
    expect(data.settings.autoSyncEnabled).toBe(false);
  });

  it('upserts a conversation idempotently', async () => {
    const storage = await loadStorage();
    const turns = [
      { id: 't1', role: 'user' as const, content: 'hi', createdAt: 1 },
      { id: 't2', role: 'assistant' as const, content: 'hello!', createdAt: 2 },
    ];

    const first = await storage.upsertConversation({
      platform: 'chatgpt',
      platformConversationId: 'c-1',
      url: 'https://chatgpt.com/c/c-1',
      title: 'Greeting',
      turns,
    });
    expect(first.isNew).toBe(true);
    expect(first.changed).toBe(true);

    const second = await storage.upsertConversation({
      platform: 'chatgpt',
      platformConversationId: 'c-1',
      url: 'https://chatgpt.com/c/c-1',
      title: 'Greeting',
      turns,
    });
    expect(second.isNew).toBe(false);
    expect(second.changed).toBe(false);
    expect(second.conversation.id).toBe(first.conversation.id);

    const third = await storage.upsertConversation({
      platform: 'chatgpt',
      platformConversationId: 'c-1',
      url: 'https://chatgpt.com/c/c-1',
      title: 'Greeting',
      turns: [...turns, { id: 't3', role: 'user', content: 'follow-up', createdAt: 3 }],
    });
    expect(third.isNew).toBe(false);
    expect(third.changed).toBe(true);
    expect(third.conversation.turns).toHaveLength(3);
  });

  it('wipeAll clears storage and re-initialises', async () => {
    const storage = await loadStorage();
    await storage.addProject('temp');
    expect((await storage.getProjects()).length).toBe(1);
    await storage.wipeAll();
    expect((await storage.getProjects()).length).toBe(0);
    const settings = await storage.getSettings();
    expect(settings.autoSyncEnabled).toBe(false);
  });
});
