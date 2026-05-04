import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Reset module + global between tests so the cached feature-detection in the
// real Chrome won't bleed across cases.
async function load() {
  vi.resetModules();
  return import('../../src/utils/builtinAI');
}

beforeEach(() => {
  // Strip any leftover globals from previous tests.
  delete (globalThis as { Summarizer?: unknown }).Summarizer;
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
  if (typeof window !== 'undefined') (window as Window & { ai?: unknown }).ai = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('built-in AI feature detection', () => {
  it('reports unavailable when no Summarizer global exists', async () => {
    const ai = await load();
    expect(await ai.isSummarizerReady()).toBe(false);
    expect(await ai.summarizeConversation('hello world')).toBeNull();
  });

  it('uses the standardised top-level Summarizer global when present', async () => {
    const session = {
      summarize: vi.fn(async () => 'A short TL;DR.'),
      destroy: vi.fn(),
    };
    (globalThis as { Summarizer?: unknown }).Summarizer = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => session),
    };
    const ai = await load();
    expect(await ai.isSummarizerReady()).toBe(true);
    const result = await ai.summarizeConversation('Long conversation text…');
    expect(result).toBe('A short TL;DR.');
    expect(session.destroy).toHaveBeenCalled();
  });

  it('falls back to the legacy capabilities() probe', async () => {
    const session = {
      summarize: vi.fn(async () => 'legacy summary'),
      destroy: vi.fn(),
    };
    (globalThis as { Summarizer?: unknown }).Summarizer = {
      capabilities: vi.fn(async () => ({ available: 'readily' })),
      create: vi.fn(async () => session),
    };
    const ai = await load();
    expect(await ai.isSummarizerReady()).toBe(true);
    expect(await ai.summarizeConversation('text')).toBe('legacy summary');
  });

  it('treats a thrown availability() probe as unavailable', async () => {
    (globalThis as { Summarizer?: unknown }).Summarizer = {
      availability: vi.fn(async () => {
        throw new Error('unsupported');
      }),
      create: vi.fn(),
    };
    const ai = await load();
    expect(await ai.isSummarizerReady()).toBe(false);
    expect(await ai.summarizeConversation('x')).toBeNull();
  });

  it('returns null when summarize() rejects (model loading, etc.)', async () => {
    (globalThis as { Summarizer?: unknown }).Summarizer = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        summarize: vi.fn(async () => {
          throw new Error('model still downloading');
        }),
        destroy: vi.fn(),
      })),
    };
    const ai = await load();
    expect(await ai.summarizeConversation('x')).toBeNull();
  });

  it('parses tag suggestions from the language model', async () => {
    (globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        prompt: vi.fn(async () => 'cooking, recipes, sourdough, baking, extraneous-tag-six'),
        destroy: vi.fn(),
      })),
    };
    const ai = await load();
    const tags = await ai.suggestTags('Sourdough hydration discussion');
    expect(tags).toEqual(['cooking', 'recipes', 'sourdough', 'baking']);
  });

  it('rejects malformed tag tokens (punctuation, length) but lowercases the rest', async () => {
    (globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        prompt: vi.fn(async () => 'COOKING, !!! , ok-tag, ' + 'a'.repeat(40)),
        destroy: vi.fn(),
      })),
    };
    const ai = await load();
    const tags = await ai.suggestTags('text');
    // COOKING gets lowercased to "cooking" and accepted; the punctuation
    // string fails the regex; the long string fails the length cap.
    expect(tags).toEqual(['cooking', 'ok-tag']);
  });

  it('probeBuiltinAI reports both surfaces independently', async () => {
    (globalThis as { Summarizer?: unknown }).Summarizer = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(),
    };
    // No LanguageModel defined.
    const ai = await load();
    expect(await ai.probeBuiltinAI()).toEqual({ summarizer: true, languageModel: false });
  });
});
