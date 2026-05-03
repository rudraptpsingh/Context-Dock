import { describe, it, expect, beforeEach } from 'vitest';
import chatgpt from '../../src/content/platforms/chatgpt';

function setLocation(href: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(href),
  });
}

function setDom(html: string, title = 'ChatGPT') {
  document.head.innerHTML = `<title>${title}</title>`;
  document.body.innerHTML = html;
}

describe('ChatGPT platform adapter', () => {
  beforeEach(() => {
    setLocation('https://chatgpt.com/c/abcd-1234');
    document.body.innerHTML = '';
  });

  it('matches chatgpt.com', () => {
    expect(chatgpt.matches(window.location)).toBe(true);
    setLocation('https://example.com/');
    expect(chatgpt.matches(window.location)).toBe(false);
  });

  it('parses the conversation id from /c/<uuid>', () => {
    expect(chatgpt.parseConversationId(window.location)).toBe('abcd-1234');
    setLocation('https://chatgpt.com/');
    expect(chatgpt.parseConversationId(window.location)).toBeNull();
  });

  it('strips the " | ChatGPT" suffix from the page title', () => {
    setDom('<main></main>', 'My research thread | ChatGPT');
    expect(chatgpt.getTitle(document)).toBe('My research thread');
    setDom('<main></main>', 'Untitled');
    expect(chatgpt.getTitle(document)).toBe('Untitled');
  });

  it('extracts user + assistant turns from data-message-id nodes', () => {
    setDom(`
      <main>
        <div data-message-id="m-1" data-message-author-role="user">
          <div class="markdown">Hello there</div>
        </div>
        <div data-message-id="m-2" data-message-author-role="assistant" data-message-model-slug="gpt-4o">
          <div class="markdown">General Kenobi</div>
        </div>
      </main>
    `);
    const turns = chatgpt.extractTurns(document);
    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe('user');
    expect(turns[0].content).toBe('Hello there');
    expect(turns[1].role).toBe('assistant');
    expect(turns[1].model).toBe('gpt-4o');
  });

  it('falls back to data-testid="conversation-turn-*" when data-message-id is missing', () => {
    setDom(`
      <main>
        <article data-testid="conversation-turn-2">
          <div class="text-message">Old layout user message</div>
        </article>
        <article data-testid="conversation-turn-3">
          <div class="text-message">Old layout assistant reply</div>
        </article>
      </main>
    `);
    const turns = chatgpt.extractTurns(document);
    expect(turns).toHaveLength(2);
    expect(turns[0].content).toBe('Old layout user message');
    // No explicit role attr → heuristic → assistant
    expect(turns.every(t => t.role === 'user' || t.role === 'assistant')).toBe(true);
  });

  it('detects streaming when the stop-button is present', () => {
    setDom(`
      <main>
        <div data-message-id="m-1" data-message-author-role="user"><div class="markdown">hi</div></div>
        <button data-testid="stop-button">Stop</button>
      </main>
    `);
    const turns = chatgpt.extractTurns(document);
    expect(chatgpt.isStreamingPartial?.(turns, document)).toBe(true);
  });

  it('does not flag non-streaming pages as streaming', () => {
    setDom(`
      <main>
        <div data-message-id="m-1" data-message-author-role="user"><div class="markdown">hi</div></div>
      </main>
    `);
    const turns = chatgpt.extractTurns(document);
    expect(chatgpt.isStreamingPartial?.(turns, document) ?? false).toBe(false);
  });
});
