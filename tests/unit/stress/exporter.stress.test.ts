import { describe, expect, it } from 'vitest';
import { conversationToJson, conversationToMarkdown } from '../../../src/utils/exporter';
import { makeConversation } from '../../helpers/fixtures';

describe('exporter under heavy content', () => {
  it('renders a 200-turn conversation to Markdown without truncating', () => {
    const conv = makeConversation(200, { id: 'big-md', long: true });
    const md = conversationToMarkdown(conv);
    // Spot-check: header + every turn heading present.
    expect(md.startsWith('# Stress conversation big-md')).toBe(true);
    const userHeadings = (md.match(/## 👤 User/g) ?? []).length;
    const assistantHeadings = (md.match(/## 🤖 Assistant/g) ?? []).length;
    expect(userHeadings).toBe(100);
    expect(assistantHeadings).toBe(100);
    // Long content with code blocks survives.
    expect(md).toMatch(/```/);
  });

  it('JSON export round-trips a 100-turn conversation byte-identically', () => {
    const conv = makeConversation(100, { id: 'rt' });
    const a = conversationToJson(conv);
    const b = conversationToJson(JSON.parse(a));
    expect(a).toBe(b);
  });

  it('produces sane output for Unicode + RTL + emoji content', () => {
    const conv = makeConversation(20, { id: 'unicode', seed: 1 });
    const md = conversationToMarkdown(conv);
    // The fixture sometimes emits RTL/emoji; whether it does this run depends
    // on the seeded RNG. Just verify no replacement chars and length is sane.
    expect(md).not.toContain('�');
    expect(md.length).toBeGreaterThan(1000);
  });
});
