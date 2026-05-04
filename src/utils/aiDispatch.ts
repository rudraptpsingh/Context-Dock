// Build "Ask another AI" deep-links from a piece of selected text.
//
// Each platform's "new conversation with this prompt" URL pattern was checked
// against the live product. Falling back to the home page is fine if the
// query-param path stops working — the user can paste from clipboard, which
// we also write to as a belt-and-braces.

export type DispatchTarget = 'chatgpt' | 'claude' | 'gemini' | 'perplexity';

export const DISPATCH_LABEL: Record<DispatchTarget, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

export function buildAskUrl(target: DispatchTarget, prompt: string): string {
  // Most platforms cap the URL length implicitly via the address bar; trim
  // long selections to a sane prefix and let the user paste the rest.
  const trimmed = prompt.replace(/\s+/g, ' ').trim().slice(0, 1500);
  const q = encodeURIComponent(trimmed);
  switch (target) {
    case 'chatgpt':
      // /?prompt=… on chatgpt.com opens a fresh thread with the prompt
      // pre-filled in the composer.
      return `https://chatgpt.com/?prompt=${q}`;
    case 'claude':
      // claude.ai's "new chat" URL accepts ?q= as the seeded message.
      return `https://claude.ai/new?q=${q}`;
    case 'gemini':
      return `https://gemini.google.com/app?prompt=${q}`;
    case 'perplexity':
      // Perplexity opens directly into a search/answer flow with ?q=.
      return `https://www.perplexity.ai/search?q=${q}`;
  }
}

export function dispatchTargetIds(): DispatchTarget[] {
  return ['chatgpt', 'claude', 'gemini', 'perplexity'];
}
