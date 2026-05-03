import { ConversationTurn, TurnRole } from '../../types';
import { PlatformAdapter } from './types';

const HOSTS = ['gemini.google.com'];

// Gemini doesn't put the conversation id in the URL — it's in the SPA's
// internal routing. We hash the first user message to derive a stable id
// scoped to the page session. This is good enough for upsert dedup; once
// Google exposes a public id we'll switch.
function deriveConversationId(doc: Document): string | null {
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

  parseConversationId() {
    return deriveConversationId(document);
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
