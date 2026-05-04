// Thin wrapper around Chrome / Edge's built-in on-device AI APIs.
//
// These ship in MV3-friendly Chromium and run Gemini Nano locally — no API
// keys, no network, no data leaves the user's machine. The exact global
// names have shifted across Chrome milestones, so we feature-detect both
// the legacy `window.ai.*` location and the standardised top-level names
// (`Summarizer`, `LanguageModel`, …).
//
// Every call returns null on failure so the caller can degrade gracefully
// — Context Stash never *requires* on-device AI; it's a polish layer.

import { createLogger } from './logger';

const log = createLogger('built-in-ai');

interface SummarizerSession {
  summarize(text: string, options?: { context?: string }): Promise<string>;
  destroy?: () => void;
}

interface SummarizerCtor {
  availability?: () => Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  capabilities?: () => Promise<{ available?: 'no' | 'after-download' | 'readily' }>;
  create: (opts?: {
    type?: 'tldr' | 'key-points' | 'teaser' | 'headline';
    format?: 'plain-text' | 'markdown';
    length?: 'short' | 'medium' | 'long';
    sharedContext?: string;
  }) => Promise<SummarizerSession>;
}

interface LanguageModelSession {
  prompt(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?: () => void;
}

interface LanguageModelCtor {
  availability?: () => Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  capabilities?: () => Promise<{ available?: 'no' | 'after-download' | 'readily' }>;
  create: (opts?: { systemPrompt?: string; temperature?: number; topK?: number }) => Promise<LanguageModelSession>;
}

interface AiNamespace {
  summarizer?: SummarizerCtor;
  languageModel?: LanguageModelCtor;
}

declare global {
  var Summarizer: SummarizerCtor | undefined;
  var LanguageModel: LanguageModelCtor | undefined;
  interface Window {
    ai?: AiNamespace;
  }
}

function getSummarizerCtor(): SummarizerCtor | null {
  if (typeof globalThis.Summarizer !== 'undefined') return globalThis.Summarizer ?? null;
  const w = (typeof window !== 'undefined' ? window : null) as Window | null;
  return w?.ai?.summarizer ?? null;
}

function getLanguageModelCtor(): LanguageModelCtor | null {
  if (typeof globalThis.LanguageModel !== 'undefined') return globalThis.LanguageModel ?? null;
  const w = (typeof window !== 'undefined' ? window : null) as Window | null;
  return w?.ai?.languageModel ?? null;
}

async function isAvailable(ctor: SummarizerCtor | LanguageModelCtor): Promise<boolean> {
  try {
    if (ctor.availability) {
      const a = await ctor.availability();
      return a === 'available';
    }
    if (ctor.capabilities) {
      const c = await ctor.capabilities();
      return c.available === 'readily';
    }
  } catch (err) {
    log.debug('availability probe failed', err instanceof Error ? err.message : String(err));
  }
  return false;
}

export async function isSummarizerReady(): Promise<boolean> {
  const ctor = getSummarizerCtor();
  if (!ctor) return false;
  return isAvailable(ctor);
}

export async function isLanguageModelReady(): Promise<boolean> {
  const ctor = getLanguageModelCtor();
  if (!ctor) return false;
  return isAvailable(ctor);
}

/**
 * Generate a one-line TL;DR for a conversation. Returns null when the API
 * isn't available; callers should fall back to title-only display.
 */
export async function summarizeConversation(text: string): Promise<string | null> {
  const ctor = getSummarizerCtor();
  if (!ctor) return null;
  if (!(await isAvailable(ctor))) return null;
  let session: SummarizerSession | null = null;
  try {
    session = await ctor.create({
      type: 'tldr',
      format: 'plain-text',
      length: 'short',
      sharedContext:
        'You are summarising AI chat transcripts so the user can find relevant past conversations.',
    });
    const summary = await session.summarize(text);
    return summary.trim() || null;
  } catch (err) {
    log.warn('summarize failed', err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    session?.destroy?.();
  }
}

/**
 * Suggest 1–4 single-word tags for a conversation. Best-effort; returns
 * an empty array if the model isn't available or the response can't be
 * parsed.
 */
export async function suggestTags(text: string): Promise<string[]> {
  const ctor = getLanguageModelCtor();
  if (!ctor) return [];
  if (!(await isAvailable(ctor))) return [];
  let session: LanguageModelSession | null = null;
  try {
    session = await ctor.create({
      systemPrompt:
        'Reply with 1–4 lowercase, single-word tags for the topic of the user\'s text. Output only a comma-separated list, no explanations.',
      temperature: 0.2,
    });
    const raw = await session.prompt(text);
    return raw
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => /^[a-z][a-z0-9-]{1,30}$/.test(t))
      .slice(0, 4);
  } catch (err) {
    log.warn('suggestTags failed', err instanceof Error ? err.message : String(err));
    return [];
  } finally {
    session?.destroy?.();
  }
}

export interface BuiltinAIStatus {
  summarizer: boolean;
  languageModel: boolean;
}

export async function probeBuiltinAI(): Promise<BuiltinAIStatus> {
  const [summarizer, languageModel] = await Promise.all([isSummarizerReady(), isLanguageModelReady()]);
  return { summarizer, languageModel };
}
