import { ConversationTurn, TurnRole } from '../../types';
import { PlatformAdapter } from './types';

const HOSTS = ['chatgpt.com', 'chat.openai.com'];

function pickRole(el: Element): TurnRole {
  // ChatGPT's rendered DOM uses data-message-author-role on each turn.
  const explicit = el.getAttribute('data-message-author-role');
  if (explicit === 'user') return 'user';
  if (explicit === 'assistant') return 'assistant';
  if (explicit === 'system') return 'system';
  if (explicit === 'tool') return 'tool';
  // Heuristic fallback: nodes inside an `[data-testid^="conversation-turn"]` block
  // where the inner text starts with "You said" are user turns; otherwise assistant.
  const text = (el.textContent || '').trim();
  if (/^you said/i.test(text)) return 'user';
  return 'assistant';
}

function pickModel(el: Element): string | undefined {
  const m = el.getAttribute('data-message-model-slug');
  return m || undefined;
}

function readText(el: Element): string {
  const html = el as HTMLElement;
  // innerText respects visibility but isn't implemented in jsdom; textContent works in both.
  const text = (typeof html.innerText === 'string' ? html.innerText : null) ?? html.textContent ?? '';
  return text.trim();
}

function extractMarkdown(el: Element): string {
  // We grab the content node, prefer `.markdown` (assistant) or the prose container.
  const candidate =
    el.querySelector('.markdown') ||
    el.querySelector('[data-message-text]') ||
    el.querySelector('.text-message') ||
    el;
  return readText(candidate);
}

const chatgpt: PlatformAdapter = {
  platform: 'chatgpt',
  label: 'ChatGPT',
  hosts: HOSTS,

  matches(loc) {
    return HOSTS.includes(loc.hostname);
  },

  parseConversationId(loc) {
    // /c/<uuid> or /g/<gizmo>/c/<uuid>
    const m = loc.pathname.match(/\/c\/([0-9a-fA-F-]{8,})/);
    return m ? m[1] : null;
  },

  getTitle(doc) {
    return doc.title.replace(/\s*[-|]\s*ChatGPT.*$/, '').trim() || 'Untitled ChatGPT conversation';
  },

  extractTurns(doc) {
    // Stable selector: data-message-id is set per turn in the live ChatGPT UI.
    // Fall back to data-testid="conversation-turn-*" if the inner attr changes.
    const direct = Array.from(doc.querySelectorAll<HTMLElement>('[data-message-id]'));
    const fallback = direct.length
      ? []
      : Array.from(doc.querySelectorAll<HTMLElement>('[data-testid^="conversation-turn"]'));

    const nodes = direct.length ? direct : fallback;
    const turns: ConversationTurn[] = [];

    for (const node of nodes) {
      const id = node.getAttribute('data-message-id') || node.getAttribute('data-testid') || crypto.randomUUID();
      const content = extractMarkdown(node);
      if (!content) continue;
      turns.push({
        id,
        role: pickRole(node),
        content,
        model: pickModel(node),
        createdAt: Date.now(),
      });
    }
    return turns;
  },

  getObservationRoot(doc) {
    return (
      doc.querySelector('main') ||
      doc.querySelector('[role="main"]') ||
      doc.body
    );
  },

  isStreamingPartial(turns, doc) {
    // ChatGPT shows a "Stop generating" button while streaming.
    if (!turns.length) return false;
    const stopBtn = doc.querySelector('button[data-testid="stop-button"]');
    if (stopBtn) return true;
    // Heuristic: a streaming-cursor element inside the latest assistant turn.
    return !!doc.querySelector('.result-streaming, [data-streaming="true"]');
  },
};

export default chatgpt;
