import { describe, expect, it } from 'vitest';
import { buildAskUrl, DISPATCH_LABEL, dispatchTargetIds } from '../../src/utils/aiDispatch';

describe('buildAskUrl', () => {
  it('routes to each platform with the prompt encoded', () => {
    expect(buildAskUrl('chatgpt', 'hello world')).toBe(
      'https://chatgpt.com/?prompt=hello%20world',
    );
    expect(buildAskUrl('claude', 'hello world')).toBe('https://claude.ai/new?q=hello%20world');
    expect(buildAskUrl('gemini', 'hello world')).toBe(
      'https://gemini.google.com/app?prompt=hello%20world',
    );
    expect(buildAskUrl('perplexity', 'hello world')).toBe(
      'https://www.perplexity.ai/search?q=hello%20world',
    );
  });

  it('collapses whitespace and trims long selections to 1500 chars', () => {
    const long = 'a'.repeat(2000) + ' tail';
    const url = buildAskUrl('chatgpt', long);
    expect(url.length).toBeLessThan(1700);
    // Must not contain the trailing word — it was past the trim cap.
    expect(decodeURIComponent(url.split('=')[1])).not.toContain('tail');
  });

  it('escapes URL-significant characters in the prompt', () => {
    const url = buildAskUrl('claude', 'a&b=c d?e+f#g');
    expect(url).toBe(
      'https://claude.ai/new?q=a%26b%3Dc%20d%3Fe%2Bf%23g',
    );
  });
});

describe('dispatch metadata', () => {
  it('exposes a label for every target id', () => {
    for (const id of dispatchTargetIds()) {
      expect(DISPATCH_LABEL[id]).toBeDefined();
      expect(DISPATCH_LABEL[id].length).toBeGreaterThan(0);
    }
  });
});
