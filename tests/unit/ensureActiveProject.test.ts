import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ChromeMock { __reset(): void }
const chromeMock = (globalThis as unknown as { chrome: ChromeMock }).chrome;

async function load() {
  vi.resetModules();
  return import('../../src/utils/storage');
}

describe('ensureActiveProject', () => {
  beforeEach(() => chromeMock.__reset());

  it('creates "Quick Stash" when no projects exist and returns created=true', async () => {
    const storage = await load();
    const r = await storage.ensureActiveProject();
    expect(r.created).toBe(true);
    expect(r.project.name).toBe('Quick Stash');
    const projects = await storage.getProjects();
    expect(projects).toHaveLength(1);
    expect(await storage.getActiveProjectId()).toBe(r.project.id);
  });

  it('returns the existing active project on subsequent calls', async () => {
    const storage = await load();
    const first = await storage.ensureActiveProject();
    const second = await storage.ensureActiveProject();
    expect(second.created).toBe(false);
    expect(second.project.id).toBe(first.project.id);
    expect(await storage.getProjects()).toHaveLength(1);
  });

  it('repairs a dangling activeProjectId by picking the first existing project', async () => {
    const storage = await load();
    const a = await storage.addProject('Real');
    // Simulate a dangling pointer (e.g. from an older crashed import).
    await chrome.storage.local.set({ activeProjectId: 'nonexistent-id' });
    const r = await storage.ensureActiveProject();
    expect(r.created).toBe(false);
    expect(r.project.id).toBe(a.id);
    expect(await storage.getActiveProjectId()).toBe(a.id);
  });
});
