export interface Snippet {
  id: string;
  type: 'selection' | 'page_summary' | 'note';
  content: string;
  label?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  timestamp: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  snippets: Snippet[];
}

export interface StorageData {
  projects: Project[];
  activeProjectId: string | null;
}

export type MessageType = 
  | { type: 'REFRESH_DATA' }
  | { type: 'CLIP_PAGE' }
  | { type: 'PAGE_CONTENT'; content: string; title: string; url: string }
  | { type: 'INJECT_CONTEXT' }
  | { type: 'CONTEXT_DATA'; context: string };

