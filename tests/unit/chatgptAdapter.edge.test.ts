import { beforeEach, describe, expect, it } from 'vitest';
import chatgpt from '../../src/content/platforms/chatgpt';
import { makeChatGPTDom } from '../helpers/fixtures';

function setLocation(href: string) {
  Object.defineProperty(window, 'location', { configurable: true, value: new URL(href) });
}

describe('ChatGPT adapter edge cases', () => {
  beforeEach(() => {
    setLocation('https://chatgpt.com/c/abcd-1234');
  });

  it('extracts 50 turns from a heavy fixture DOM', () => {
    const html = makeChatGPTDom(50, 7);
    document.documentElement.innerHTML = html.replace(/<!doctype html><html>|<\/html>/g, '');
    const turns = chatgpt.extractTurns(document);
    expect(turns).toHaveLength(50);
    const roles = new Set(turns.map(t => t.role));
    expect(roles).toEqual(new Set(['user', 'assistant']));
  });

  it('parses non-hex slug ids (forward-compatible regex)', () => {
    setLocation('https://chatgpt.com/c/some_NEW-format-2026');
    expect(chatgpt.parseConversationId(window.location)).toBe('some_NEW-format-2026');
  });

  it('parses gizmo-prefixed paths /g/<gizmo>/c/<id>', () => {
    setLocation('https://chatgpt.com/g/g-foo/c/abcdef-1234');
    expect(chatgpt.parseConversationId(window.location)).toBe('abcdef-1234');
  });

  it('returns null on the listing root and on /share/* pages', () => {
    setLocation('https://chatgpt.com/');
    expect(chatgpt.parseConversationId(window.location)).toBeNull();
    setLocation('https://chatgpt.com/share/abcd-1234');
    expect(chatgpt.parseConversationId(window.location)).toBeNull();
  });

  it('ignores empty turn nodes (no markdown, no text-message)', () => {
    document.body.innerHTML = `
      <main>
        <div data-message-id="empty" data-message-author-role="user"></div>
        <div data-message-id="real" data-message-author-role="user">
          <div class="markdown">Real content</div>
        </div>
      </main>
    `;
    const turns = chatgpt.extractTurns(document);
    // The empty node yields '' which should be filtered.
    expect(turns).toHaveLength(1);
    expect(turns[0].content).toBe('Real content');
  });

  it('reads model slug from the assistant turn metadata', () => {
    document.body.innerHTML = `
      <main>
        <div data-message-id="m1" data-message-author-role="user">
          <div class="markdown">q</div>
        </div>
        <div data-message-id="m2" data-message-author-role="assistant" data-message-model-slug="claude-style-thinking-2026">
          <div class="markdown">a</div>
        </div>
      </main>
    `;
    const [, asst] = chatgpt.extractTurns(document);
    expect(asst.model).toBe('claude-style-thinking-2026');
  });

  it('survives sibling DOM noise (ads, toolbars, popups)', () => {
    document.body.innerHTML = `
      <header>Site nav <button>Sign in</button></header>
      <aside><div class="ad">unrelated content</div></aside>
      <main>
        <div data-message-id="m1" data-message-author-role="user"><div class="markdown">hi</div></div>
        <div data-message-id="m2" data-message-author-role="assistant"><div class="markdown">hello</div></div>
      </main>
      <footer>© Contoso</footer>
    `;
    const turns = chatgpt.extractTurns(document);
    expect(turns).toHaveLength(2);
    expect(turns[0].content).toBe('hi');
    expect(turns[1].content).toBe('hello');
  });
});
