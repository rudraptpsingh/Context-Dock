import { beforeEach, describe, expect, it } from 'vitest';
import claude from '../../src/content/platforms/claude';
import gemini from '../../src/content/platforms/gemini';
import perplexity from '../../src/content/platforms/perplexity';
import { findAdapter } from '../../src/content/platforms';

function setLocation(href: string) {
  Object.defineProperty(window, 'location', { configurable: true, value: new URL(href) });
}

function setDom(html: string, title: string) {
  document.head.innerHTML = `<title>${title}</title>`;
  document.body.innerHTML = html;
}

describe('platform registry', () => {
  it('routes by hostname', () => {
    setLocation('https://chatgpt.com/c/abc-123');
    expect(findAdapter(window.location)?.platform).toBe('chatgpt');
    setLocation('https://claude.ai/chat/abc-123');
    expect(findAdapter(window.location)?.platform).toBe('claude');
    setLocation('https://gemini.google.com/app');
    expect(findAdapter(window.location)?.platform).toBe('gemini');
    setLocation('https://www.perplexity.ai/search/foo-uuid');
    expect(findAdapter(window.location)?.platform).toBe('perplexity');
    setLocation('https://example.com/');
    expect(findAdapter(window.location)).toBeNull();
  });
});

describe('Claude.ai adapter', () => {
  beforeEach(() => setLocation('https://claude.ai/chat/8c7e2f10-2b1d-4d9a-9b1f-cafe1234dead'));

  it('parses conversation id from /chat/<uuid>', () => {
    expect(claude.parseConversationId(window.location)).toBe('8c7e2f10-2b1d-4d9a-9b1f-cafe1234dead');
  });

  it('parses /project/<id>/chat/<uuid>', () => {
    setLocation('https://claude.ai/project/p-1/chat/conv-2');
    expect(claude.parseConversationId(window.location)).toBe('conv-2');
  });

  it('strips the " - Claude" suffix from titles', () => {
    setDom('<main></main>', 'Sourdough hydration - Claude');
    expect(claude.getTitle(document)).toBe('Sourdough hydration');
  });

  it('extracts turns by font-user-message / font-claude-message classes', () => {
    setDom(
      `
      <main>
        <div data-test-render-count="1">
          <div class="font-user-message"><p>What is the best hydration?</p></div>
        </div>
        <div data-test-render-count="2">
          <div class="font-claude-message"><p>78% works for an open crumb.</p></div>
        </div>
      </main>
    `,
      'Sourdough - Claude',
    );
    const turns = claude.extractTurns(document);
    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe('user');
    expect(turns[0].content).toBe('What is the best hydration?');
    expect(turns[1].role).toBe('assistant');
    expect(turns[1].content).toBe('78% works for an open crumb.');
  });

  it('falls back to data-testid selectors when class hints are missing', () => {
    setDom(
      `
      <main>
        <div data-testid="user-message"><p>Fallback question</p></div>
        <div data-testid="message-content"><p>Fallback answer</p></div>
      </main>
    `,
      'X',
    );
    const turns = claude.extractTurns(document);
    expect(turns.map(t => t.role)).toEqual(['user', 'assistant']);
  });

  it('detects streaming via the Stop button aria-label', () => {
    setDom(
      `<main><div data-test-render-count="1"><div class="font-user-message">hi</div></div><button aria-label="Stop response">Stop</button></main>`,
      'X',
    );
    expect(claude.isStreamingPartial?.([], document)).toBe(true);
  });
});

describe('Gemini adapter', () => {
  beforeEach(() => setLocation('https://gemini.google.com/app'));

  it('prefers /app/<id> from the URL when present', () => {
    setLocation('https://gemini.google.com/app/6b754af87338b14b?hl=en-IN');
    setDom(
      `<main><div class="conversation-container"><div class="user-message-bubble-color">irrelevant</div></div></main>`,
      'X',
    );
    expect(gemini.parseConversationId(window.location)).toBe('6b754af87338b14b');
  });

  it('falls back to hashing the first user message on the listing page', () => {
    setDom(
      `<main><div class="conversation-container"><div class="user-message-bubble-color">What is RAG?</div></div></main>`,
      'X',
    );
    const id = gemini.parseConversationId(window.location);
    expect(id).toMatch(/^gemini-[\w]+$/);
    expect(gemini.parseConversationId(window.location)).toBe(id);
    setDom(
      `<main><div class="conversation-container"><div class="user-message-bubble-color">Different question entirely</div></div></main>`,
      'X',
    );
    expect(gemini.parseConversationId(window.location)).not.toBe(id);
  });

  it('returns null when there is no URL id and no user message yet', () => {
    setDom('<main><div class="conversation-container"></div></main>', 'X');
    expect(gemini.parseConversationId(window.location)).toBeNull();
  });

  it('extracts user + model turns in alternating order', () => {
    setDom(
      `
      <main>
        <div class="conversation-container">
          <div class="user-message-bubble-color">Q1</div>
          <div class="model-response">A1</div>
          <div class="user-message-bubble-color">Q2</div>
          <div class="model-response">A2</div>
        </div>
      </main>
    `,
      'X',
    );
    const turns = gemini.extractTurns(document);
    expect(turns.map(t => `${t.role}:${t.content}`)).toEqual([
      'user:Q1',
      'assistant:A1',
      'user:Q2',
      'assistant:A2',
    ]);
  });
});

describe('Perplexity adapter', () => {
  beforeEach(() => setLocation('https://www.perplexity.ai/search/abc-123'));

  it('parses /search/<id>', () => {
    expect(perplexity.parseConversationId(window.location)).toBe('abc-123');
  });

  it('parses ?uuid=<id> as a fallback', () => {
    setLocation('https://www.perplexity.ai/?uuid=cafe-9999');
    expect(perplexity.parseConversationId(window.location)).toBe('cafe-9999');
  });

  it('extracts query + answer pairs', () => {
    setDom(
      `
      <main>
        <h1 class="text-3xl">What is MCP?</h1>
        <div data-testid="answer">A protocol for connecting agents to tools.</div>
      </main>
    `,
      'X',
    );
    const turns = perplexity.extractTurns(document);
    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe('user');
    expect(turns[0].content).toBe('What is MCP?');
    expect(turns[1].role).toBe('assistant');
    expect(turns[1].content).toBe('A protocol for connecting agents to tools.');
  });
});
