import { ConversationTurn, TurnRole } from '../../types';
import { PlatformAdapter } from './types';

const HOSTS = ['claude.ai', 'www.claude.ai'];

// Claude.ai's main message containers carry data-test-render-count and a role
// hint via class names (font-user-message / font-claude-message). These have
// been stable for the better part of a year. As a fallback we look for
// data-testid="user-message" / data-testid="message-content" which appear in
// some layouts.
const PRIMARY_SELECTOR =
  '[data-test-render-count] [class*="font-user-message"], [data-test-render-count] [class*="font-claude-message"]';
const FALLBACK_SELECTOR =
  '[data-testid="user-message"], [data-testid="message-content"]';

function readText(el: Element): string {
  const html = el as HTMLElement;
  return ((typeof html.innerText === 'string' ? html.innerText : null) ?? html.textContent ?? '').trim();
}

function pickRole(el: Element): TurnRole {
  // Class-name signals come first — they're the most reliable.
  const classNames = (el.getAttribute('class') ?? '') + ' ' + (el.parentElement?.getAttribute('class') ?? '');
  if (/font-user-message/.test(classNames)) return 'user';
  if (/font-claude-message/.test(classNames)) return 'assistant';
  // data-testid fallback.
  const tid = el.getAttribute('data-testid') ?? el.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
  if (tid === 'user-message') return 'user';
  if (tid === 'message-content') return 'assistant';
  return 'assistant';
}

const claude: PlatformAdapter = {
  platform: 'claude',
  label: 'Claude',
  hosts: HOSTS,

  matches(loc) {
    return HOSTS.includes(loc.hostname);
  },

  parseConversationId(loc) {
    // /chat/<uuid> or /project/<id>/chat/<uuid>
    const m = loc.pathname.match(/\/chat\/([\w-]+)/);
    return m ? m[1] : null;
  },

  getTitle(doc) {
    return doc.title.replace(/\s*[-|]\s*Claude.*$/i, '').trim() || 'Untitled Claude conversation';
  },

  extractTurns(doc) {
    const primary = Array.from(doc.querySelectorAll<HTMLElement>(PRIMARY_SELECTOR));
    const nodes = primary.length
      ? primary
      : Array.from(doc.querySelectorAll<HTMLElement>(FALLBACK_SELECTOR));

    const turns: ConversationTurn[] = [];
    for (const node of nodes) {
      const content = readText(node);
      if (!content) continue;
      turns.push({
        id: node.getAttribute('data-test-render-count') || crypto.randomUUID(),
        role: pickRole(node),
        content,
        createdAt: Date.now(),
      });
    }
    return turns;
  },

  getObservationRoot(doc) {
    return (
      doc.querySelector('[data-testid="conversation"]') ||
      doc.querySelector('main') ||
      doc.body
    );
  },

  isStreamingPartial(_turns, doc) {
    // Claude shows a "Stop response" / "Stop generating" button while streaming.
    return !!doc.querySelector('button[aria-label*="Stop" i]');
  },
};

export default claude;
