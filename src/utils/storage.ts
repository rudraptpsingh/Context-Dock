import { Project, Snippet, StorageData } from '../types';

const DEFAULT_STORAGE: StorageData = {
  projects: [],
  activeProjectId: null,
};

export async function getStorageData(): Promise<StorageData> {
  const result = await chrome.storage.local.get(['projects', 'activeProjectId']);
  return {
    projects: result.projects ?? DEFAULT_STORAGE.projects,
    activeProjectId: result.activeProjectId ?? DEFAULT_STORAGE.activeProjectId,
  };
}

export async function setStorageData(data: Partial<StorageData>): Promise<void> {
  await chrome.storage.local.set(data);
}

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
  // If this is the first project, make it active
  if (projects.length === 0) {
    await setActiveProjectId(newProject.id);
  }
  return newProject;
}

export async function deleteProject(id: string): Promise<void> {
  const data = await getStorageData();
  const projects = data.projects.filter(p => p.id !== id);
  await setProjects(projects);
  
  // If we deleted the active project, set a new active one
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

export async function addSnippetToProject(projectId: string, snippet: Omit<Snippet, 'id' | 'timestamp'>): Promise<Snippet> {
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

export async function updateSnippet(projectId: string, snippetId: string, updates: Partial<Omit<Snippet, 'id' | 'timestamp'>>): Promise<void> {
  const projects = await getProjects();
  const projectIndex = projects.findIndex(p => p.id === projectId);
  if (projectIndex === -1) return;
  
  const snippetIndex = projects[projectIndex].snippets.findIndex(s => s.id === snippetId);
  if (snippetIndex === -1) return;
  
  projects[projectIndex].snippets[snippetIndex] = {
    ...projects[projectIndex].snippets[snippetIndex],
    ...updates
  };
  
  await setProjects(projects);
}

export async function addSnippetToActiveProject(snippet: Omit<Snippet, 'id' | 'timestamp'>): Promise<Snippet | null> {
  const activeId = await getActiveProjectId();
  if (!activeId) return null;
  return addSnippetToProject(activeId, snippet);
}

export function generateUUID(): string {
  return crypto.randomUUID();
}

