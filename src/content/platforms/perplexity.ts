import { ConversationTurn, TurnRole } from '../../types';
import { PlatformAdapter } from './types';

const HOSTS = ['www.perplexity.ai', 'perplexity.ai'];

// Perplexity is structured as a thread of "blocks": each block has a question
// (user prompt) and an answer. Selectors target the markdown-prose content
// inside each block; an aria-label / data-attr hints which side it is.

function readText(el: Element): string {
  const html = el as HTMLElement;
  return ((typeof html.innerText === 'string' ? html.innerText : null) ?? html.textContent ?? '').trim();
}

const perplexity: PlatformAdapter = {
  platform: 'perplexity',
  label: 'Perplexity',
  hosts: HOSTS,

  matches(loc) {
    return HOSTS.includes(loc.hostname);
  },

  parseConversationId(loc) {
    // /search/<id> or ?uuid=<id>
    const m = loc.pathname.match(/\/search\/([\w-]+)/);
    if (m) return m[1];
    const params = new URLSearchParams(loc.search);
    return params.get('uuid');
  },

  getTitle(doc) {
    return doc.title.replace(/\s*[-|]\s*Perplexity.*$/i, '').trim() || 'Perplexity thread';
  },

  extractTurns(doc) {
    const turns: ConversationTurn[] = [];
    const userNodes = Array.from(
      doc.querySelectorAll<HTMLElement>('[data-testid="search-query"], h1.text-3xl, [class*="query-bar"]'),
    );
    const answerNodes = Array.from(
      doc.querySelectorAll<HTMLElement>('[data-testid="answer"], [class*="prose"], [class*="answer-block"]'),
    );

    const max = Math.max(userNodes.length, answerNodes.length);
    for (let i = 0; i < max; i++) {
      const u = userNodes[i];
      if (u) {
        const content = readText(u);
        if (content) turns.push({ id: `ppx-u-${i}`, role: 'user' as TurnRole, content, createdAt: Date.now() });
      }
      const a = answerNodes[i];
      if (a) {
        const content = readText(a);
        if (content) turns.push({ id: `ppx-a-${i}`, role: 'assistant' as TurnRole, content, createdAt: Date.now() });
      }
    }
    return turns;
  },

  getObservationRoot(doc) {
    return doc.querySelector('main') || doc.body;
  },

  isStreamingPartial(_turns, doc) {
    return !!doc.querySelector('button[aria-label*="Stop" i]');
  },
};

export default perplexity;
