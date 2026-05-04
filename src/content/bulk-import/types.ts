// Per-platform bulk-import contract. Implementations run in the platform's
// content-script context so same-origin fetch() carries the user's session
// cookies automatically — no API keys, no OAuth dance.

import type { ConversationTurn, LLMPlatform as Platform } from '../../types';

export interface ImporterConversationSummary {
  platformConversationId: string;
  title: string;
  url: string;
  updatedAt?: number;
}

export interface ImportedConversation {
  platform: Platform;
  platformConversationId: string;
  title: string;
  url: string;
  turns: ConversationTurn[];
  createdAt?: number;
}

export interface BulkImporter {
  platform: Platform;
  // hostnames this importer expects to run on (for guard checks).
  hosts: string[];
  // Quick auth probe: returns true if we have a session.
  isAuthenticated(): Promise<boolean>;
  // Pull the list of conversations.
  listConversations(): Promise<ImporterConversationSummary[]>;
  // Fetch one conversation in full.
  fetchConversation(id: string): Promise<ImportedConversation>;
}

export interface ImportProgress {
  platform: Platform;
  total: number;
  completed: number;
  failed: number;
  current?: string;
  done: boolean;
  cancelled?: boolean;
  error?: string;
}
