import { ConversationTurn, LLMPlatform } from '../../types';

export interface PlatformAdapter {
  /** Unique platform id used across the app. */
  platform: LLMPlatform;
  /** Human-readable label shown in UI. */
  label: string;
  /** Hostnames this adapter claims (e.g. ['chatgpt.com', 'chat.openai.com']). */
  hosts: string[];
  /** Returns true if this adapter should run on `location`. */
  matches(location: Location): boolean;
  /** Extracts the platform's native conversation id from the URL, or null on listing pages. */
  parseConversationId(location: Location): string | null;
  /** Returns the human-readable title for the current conversation, best effort. */
  getTitle(doc: Document): string;
  /** Walks the DOM and returns the current set of turns (in order). */
  extractTurns(doc: Document): ConversationTurn[];
  /**
   * The DOM root we should observe for changes. Default is `document.body`,
   * but a tighter root (e.g. the message list container) is more efficient.
   */
  getObservationRoot(doc: Document): Node;
  /**
   * Optional: returns true if the latest turn looks like a streaming partial
   * (so we can debounce / not emit until it stabilises).
   */
  isStreamingPartial?(turns: ConversationTurn[], doc: Document): boolean;
}
