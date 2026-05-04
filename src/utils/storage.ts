import {
  AppSettings,
  Conversation,
  ConversationTurn,
  DEFAULT_SETTINGS,
  LLMPlatform,
  MemoryEntry,
  Project,
  Snippet,
  STORAGE_SCHEMA_VERSION,
  StorageData,
} from '../types';

// ---------- Migration ----------

interface RawStorageRead {
  schemaVersion?: number;
  projects?: Project[];
  activeProjectId?: string | null;
  conversations?: Conversation[];
  memories?: MemoryEntry[];
  settings?: Partial<AppSettings>;
}

let migrationDone = false;

async function ensureMigrated(): Promise<void> {
  if (migrationDone) return;
  const raw = (await chrome.storage.local.get([
    'schemaVersion',
    'projects',
    'activeProjectId',
    'conversations',
    'memories',
    'settings',
  ])) as RawStorageRead;

  const currentVersion = raw.schemaVersion ?? 1;
  if (currentVersion >= STORAGE_SCHEMA_VERSION && raw.settings && raw.conversations && raw.memories) {
    migrationDone = true;
    return;
  }

  const migrated: StorageData = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    projects: raw.projects ?? [],
    activeProjectId: raw.activeProjectId ?? null,
    conversations: raw.conversations ?? [],
    memories: raw.memories ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
  };
  await chrome.storage.local.set(migrated);
  migrationDone = true;
}

// ---------- Top-level reads/writes ----------

export async function getStorageData(): Promise<StorageData> {
  await ensureMigrated();
  const result = (await chrome.storage.local.get([
    'schemaVersion',
    'projects',
    'activeProjectId',
    'conversations',
    'memories',
    'settings',
  ])) as RawStorageRead;
  return {
    schemaVersion: result.schemaVersion ?? STORAGE_SCHEMA_VERSION,
    projects: result.projects ?? [],
    activeProjectId: result.activeProjectId ?? null,
    conversations: result.conversations ?? [],
    memories: result.memories ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(result.settings ?? {}) },
  };
}

export async function setStorageData(data: Partial<StorageData>): Promise<void> {
  await ensureMigrated();
  await chrome.storage.local.set(data);
}

// ---------- Projects (legacy) ----------

export async function getProjects(): Promise<Project[]> {
  const data = await getStorageData();
  return data.projects;
}

export async function setProjects(projects: Project[]): Promise<void> {
  await setStorageData({ projects });
}

export async function getActiveProjectId(): Promise<string | null> {
  const data = await getStorageData();
  return data.activeProjectId;
}

export async function setActiveProjectId(id: string | null): Promise<void> {
  await setStorageData({ activeProjectId: id });
}

export async function getActiveProject(): Promise<Project | null> {
  const data = await getStorageData();
  if (!data.activeProjectId) return null;
  return data.projects.find(p => p.id === data.activeProjectId) ?? null;
}

export async function addProject(name: string): Promise<Project> {
  const projects = await getProjects();
  const newProject: Project = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    snippets: [],
  };
  await setProjects([...projects, newProject]);
  if (projects.length === 0) {
    await setActiveProjectId(newProject.id);
  }
  return newProject;
}

/**
 * Returns the currently-active project, creating one named "Quick Stash" if
 * the user doesn't have any yet OR if the active id is dangling. The result
 * is the safe target for any "save right now" action — clip selection, page
 * summary, dock save — so users never hit a "no project" dead end on first
 * use. The flag tells the caller whether a project was just created so they
 * can show a more informative toast.
 */
export async function ensureActiveProject(): Promise<{ project: Project; created: boolean }> {
  const data = await getStorageData();
  const existing = data.projects.find(p => p.id === data.activeProjectId);
  if (existing) return { project: existing, created: false };
  if (data.projects.length) {
    // We have projects but no valid active id — pick the first one.
    const first = data.projects[0];
    await setActiveProjectId(first.id);
    return { project: first, created: false };
  }
  const project = await addProject('Quick Stash');
  return { project, created: true };
}

export async function deleteProject(id: string): Promise<void> {
  const data = await getStorageData();
  const projects = data.projects.filter(p => p.id !== id);
  await setProjects(projects);
  if (data.activeProjectId === id) {
    await setActiveProjectId(projects.length > 0 ? projects[0].id : null);
  }
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<void> {
  const projects = await getProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) return;
  projects[index] = { ...projects[index], ...updates };
  await setProjects(projects);
}

export async function addSnippetToProject(
  projectId: string,
  snippet: Omit<Snippet, 'id' | 'timestamp'>,
): Promise<Snippet> {
  const projects = await getProjects();
  const index = projects.findIndex(p => p.id === projectId);
  if (index === -1) throw new Error('Project not found');

  const newSnippet: Snippet = {
    ...snippet,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };

  projects[index].snippets.push(newSnippet);
  await setProjects(projects);
  return newSnippet;
}

export async function deleteSnippet(projectId: string, snippetId: string): Promise<void> {
  const projects = await getProjects();
  const index = projects.findIndex(p => p.id === projectId);
  if (index === -1) return;
  projects[index].snippets = projects[index].snippets.filter(s => s.id !== snippetId);
  await setProjects(projects);
}

export async function updateSnippet(
  projectId: string,
  snippetId: string,
  updates: Partial<Omit<Snippet, 'id' | 'timestamp'>>,
): Promise<void> {
  const projects = await getProjects();
  const projectIndex = projects.findIndex(p => p.id === projectId);
  if (projectIndex === -1) return;

  const snippetIndex = projects[projectIndex].snippets.findIndex(s => s.id === snippetId);
  if (snippetIndex === -1) return;

  projects[projectIndex].snippets[snippetIndex] = {
    ...projects[projectIndex].snippets[snippetIndex],
    ...updates,
  };

  await setProjects(projects);
}

export async function addSnippetToActiveProject(
  snippet: Omit<Snippet, 'id' | 'timestamp'>,
): Promise<Snippet | null> {
  const activeId = await getActiveProjectId();
  if (!activeId) return null;
  return addSnippetToProject(activeId, snippet);
}

// ---------- Conversations ----------

export async function getConversations(): Promise<Conversation[]> {
  const data = await getStorageData();
  return data.conversations;
}

export async function setConversations(conversations: Conversation[]): Promise<void> {
  await setStorageData({ conversations });
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const conversations = await getConversations();
  return conversations.find(c => c.id === id) ?? null;
}

export async function getConversationByPlatformId(
  platform: LLMPlatform,
  platformConversationId: string,
): Promise<Conversation | null> {
  const conversations = await getConversations();
  return (
    conversations.find(
      c => c.platform === platform && c.platformConversationId === platformConversationId,
    ) ?? null
  );
}

function hashTurns(turns: ConversationTurn[]): string {
  // small, deterministic, fast — good enough for change detection.
  const s = turns.map(t => `${t.role}:${t.content}`).join('\n--\n');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(36)}-${turns.length}`;
}

interface UpsertResult {
  conversation: Conversation;
  isNew: boolean;
  changed: boolean;
}

// Serialise all upserts through a single promise chain. chrome.storage.local
// is read-modify-write; without a mutex, concurrent upserts (e.g. a bulk
// import sending 4 parallel HARVEST_CONVERSATION messages) collide and only
// the last writer's array sticks. The chain is process-local — that's fine
// because the background SW is the only writer for this key.
let upsertChain: Promise<unknown> = Promise.resolve();

export function upsertConversation(input: {
  platform: LLMPlatform;
  platformConversationId: string;
  url: string;
  title: string;
  turns: ConversationTurn[];
}): Promise<UpsertResult> {
  const next = upsertChain.then(() => upsertConversationLocked(input));
  upsertChain = next.catch(() => undefined);
  return next;
}

async function upsertConversationLocked(input: {
  platform: LLMPlatform;
  platformConversationId: string;
  url: string;
  title: string;
  turns: ConversationTurn[];
}): Promise<UpsertResult> {
  const conversations = await getConversations();
  const existingIndex = conversations.findIndex(
    c =>
      c.platform === input.platform &&
      c.platformConversationId === input.platformConversationId,
  );

  const now = Date.now();
  const contentHash = hashTurns(input.turns);

  if (existingIndex === -1) {
    const conv: Conversation = {
      id: crypto.randomUUID(),
      platform: input.platform,
      platformConversationId: input.platformConversationId,
      title: input.title,
      url: input.url,
      turns: input.turns,
      tags: [],
      createdAt: now,
      lastSyncedAt: now,
      autoSync: false,
      contentHash,
    };
    await setConversations([...conversations, conv]);
    return { conversation: conv, isNew: true, changed: true };
  }

  const existing = conversations[existingIndex];
  const changed = existing.contentHash !== contentHash;
  const updated: Conversation = {
    ...existing,
    title: input.title || existing.title,
    url: input.url || existing.url,
    turns: input.turns,
    contentHash,
    lastSyncedAt: now,
  };
  conversations[existingIndex] = updated;
  await setConversations(conversations);
  return { conversation: updated, isNew: false, changed };
}

export async function updateConversation(
  id: string,
  updates: Partial<Omit<Conversation, 'id'>>,
): Promise<void> {
  const conversations = await getConversations();
  const index = conversations.findIndex(c => c.id === id);
  if (index === -1) return;
  conversations[index] = { ...conversations[index], ...updates };
  await setConversations(conversations);
}

export async function deleteConversation(id: string): Promise<void> {
  const conversations = await getConversations();
  await setConversations(conversations.filter(c => c.id !== id));
}

export async function setConversationAutoSync(
  id: string,
  autoSync: boolean,
): Promise<void> {
  await updateConversation(id, { autoSync });
}

// ---------- Memories ----------

export async function getMemories(): Promise<MemoryEntry[]> {
  const data = await getStorageData();
  return data.memories;
}

export async function setMemories(memories: MemoryEntry[]): Promise<void> {
  await setStorageData({ memories });
}

export async function addMemory(platform: LLMPlatform, text: string): Promise<MemoryEntry> {
  const memories = await getMemories();
  const entry: MemoryEntry = {
    id: crypto.randomUUID(),
    platform,
    text,
    capturedAt: Date.now(),
  };
  await setMemories([...memories, entry]);
  return entry;
}

// Same single-flight pattern as upsertConversation. Bulk memory imports run
// concurrent fetches and would race on read-modify-write of the memories key
// without serialisation.
let memoriesChain: Promise<unknown> = Promise.resolve();

export interface MemoryUpsertResult {
  added: number;
  updated: number;
  skipped: number;
}

export function upsertMemories(
  platform: LLMPlatform,
  items: Array<{ text: string; platformId?: string; capturedAt?: number }>,
): Promise<MemoryUpsertResult> {
  const next = memoriesChain.then(() => upsertMemoriesLocked(platform, items));
  memoriesChain = next.catch(() => undefined);
  return next;
}

async function upsertMemoriesLocked(
  platform: LLMPlatform,
  items: Array<{ text: string; platformId?: string; capturedAt?: number }>,
): Promise<MemoryUpsertResult> {
  const existing = await getMemories();
  // Dedup on (platform, text). Same content from the same platform = same
  // memory; ChatGPT etc. can return the same item with different ids
  // across pages.
  const byKey = new Map<string, MemoryEntry>();
  for (const m of existing) byKey.set(`${m.platform} ${m.text}`, m);

  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const item of items) {
    const trimmed = item.text.trim();
    if (!trimmed) {
      skipped++;
      continue;
    }
    const key = `${platform} ${trimmed}`;
    const prior = byKey.get(key);
    if (prior) {
      if (item.capturedAt && item.capturedAt > prior.capturedAt) {
        byKey.set(key, { ...prior, capturedAt: item.capturedAt });
        updated++;
      } else {
        skipped++;
      }
      continue;
    }
    byKey.set(key, {
      id: crypto.randomUUID(),
      platform,
      text: trimmed,
      capturedAt: item.capturedAt ?? Date.now(),
    });
    added++;
  }
  await setMemories([...byKey.values()].sort((a, b) => b.capturedAt - a.capturedAt));
  return { added, updated, skipped };
}

export async function deleteMemory(id: string): Promise<void> {
  const memories = await getMemories();
  await setMemories(memories.filter(m => m.id !== id));
}

// ---------- Settings ----------

export async function getSettings(): Promise<AppSettings> {
  const data = await getStorageData();
  return data.settings;
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...updates };
  await setStorageData({ settings: next });
  return next;
}

// ---------- Wipe ----------

export async function wipeAll(): Promise<void> {
  await chrome.storage.local.clear();
  migrationDone = false;
  await ensureMigrated();
}

// ---------- Misc ----------

export function generateUUID(): string {
  return crypto.randomUUID();
}
