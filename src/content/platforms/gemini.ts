import { ConversationTurn, TurnRole } from '../../types';
import { PlatformAdapter } from './types';

const HOSTS = ['gemini.google.com'];

// Preferred path: Gemini exposes /app/<hex-id> in the URL once you've opened
// a specific conversation. That's stable across sessions and matches the
// platform's native id, so re-harvest finds the same row.
//
// Fallback: on the listing page (/app with no id) we derive a session-scoped
// id by hashing the first user message text, so the harvester still has
// something to upsert against. Anything captured this way is replaced by
// the URL-based id the next time the user re-harvests.
function urlId(loc: Location): string | null {
  const m = loc.pathname.match(/\/app\/([\w-]+)/);
  return m ? m[1] : null;
}

function hashedId(doc: Document): string | null {
  const firstUser = doc.querySelector<HTMLElement>('.user-message-bubble-color, [class*="user-query"]');
  const text = (firstUser?.textContent ?? '').trim();
  if (!text) return null;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `gemini-${(h >>> 0).toString(36)}`;
}

function readText(el: Element): string {
  const html = el as HTMLElement;
  return ((typeof html.innerText === 'string' ? html.innerText : null) ?? html.textContent ?? '').trim();
}

const gemini: PlatformAdapter = {
  platform: 'gemini',
  label: 'Gemini',
  hosts: HOSTS,

  matches(loc) {
    return HOSTS.includes(loc.hostname);
  },

  parseConversationId(loc) {
    return urlId(loc) ?? hashedId(document);
  },

  getTitle(doc) {
    return doc.title.replace(/\s*[-|]\s*Gemini.*$/i, '').trim() || 'Gemini conversation';
  },

  extractTurns(doc) {
    // Each "turn" is a group with one user-message-bubble and one
    // model-response. We walk the conversation container in order.
    const root =
      doc.querySelector('[class*="conversation-container"]') ||
      doc.querySelector('main') ||
      doc.body;
    const turns: ConversationTurn[] = [];
    let i = 0;
    const userNodes = root.querySelectorAll<HTMLElement>('.user-message-bubble-color, [class*="user-query"]');
    const modelNodes = root.querySelectorAll<HTMLElement>('[class*="model-response"], message-content');

    const max = Math.max(userNodes.length, modelNodes.length);
    for (let idx = 0; idx < max; idx++) {
      const u = userNodes[idx];
      if (u) {
        const content = readText(u);
        if (content) turns.push({ id: `gem-u-${i++}`, role: 'user' as TurnRole, content, createdAt: Date.now() });
      }
      const m = modelNodes[idx];
      if (m) {
        const content = readText(m);
        if (content) turns.push({ id: `gem-a-${i++}`, role: 'assistant' as TurnRole, content, createdAt: Date.now() });
      }
    }
    return turns;
  },

  getObservationRoot(doc) {
    return doc.querySelector('[class*="conversation-container"]') || doc.querySelector('main') || doc.body;
  },

  isStreamingPartial(_turns, doc) {
    // Gemini renders a "Stop generating" button while streaming.
    return !!doc.querySelector('button[aria-label*="Stop" i]');
  },
};

export default gemini;
