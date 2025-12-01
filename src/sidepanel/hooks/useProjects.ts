import { useCallback, useEffect, useState } from 'react';
import { Project, Snippet } from '../../types';
import * as storage from '../../utils/storage';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const data = await storage.getStorageData();
      setProjects(data.projects);
      setActiveProjectIdState(data.activeProjectId);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Listen for storage changes
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      
      if (changes.projects) {
        setProjects(changes.projects.newValue ?? []);
      }
      if (changes.activeProjectId) {
        setActiveProjectIdState(changes.activeProjectId.newValue ?? null);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // Listen for refresh messages from background
    const handleMessage = (message: { type: string }) => {
      if (message.type === 'REFRESH_DATA') {
        loadData();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [loadData]);

  const activeProject = projects.find(p => p.id === activeProjectId) ?? null;

  const addProject = useCallback(async (name: string): Promise<Project> => {
    const newProject = await storage.addProject(name);
    return newProject;
  }, []);

  const deleteProject = useCallback(async (id: string): Promise<void> => {
    await storage.deleteProject(id);
  }, []);

  const updateProject = useCallback(async (id: string, updates: Partial<Project>): Promise<void> => {
    await storage.updateProject(id, updates);
  }, []);

  const setActiveProjectId = useCallback(async (id: string | null): Promise<void> => {
    await storage.setActiveProjectId(id);
  }, []);

  const addSnippet = useCallback(async (
    projectId: string,
    snippet: Omit<Snippet, 'id' | 'timestamp'>
  ): Promise<Snippet> => {
    return storage.addSnippetToProject(projectId, snippet);
  }, []);

  const deleteSnippet = useCallback(async (projectId: string, snippetId: string): Promise<void> => {
    await storage.deleteSnippet(projectId, snippetId);
  }, []);

  const addSnippetToActive = useCallback(async (
    snippet: Omit<Snippet, 'id' | 'timestamp'>
  ): Promise<Snippet | null> => {
    if (!activeProjectId) return null;
    return storage.addSnippetToProject(activeProjectId, snippet);
  }, [activeProjectId]);

  return {
    projects,
    activeProject,
    activeProjectId,
    loading,
    addProject,
    deleteProject,
    updateProject,
    setActiveProjectId,
    addSnippet,
    deleteSnippet,
    addSnippetToActive,
    refresh: loadData,
  };
}

