// Find the active chat input on a chat page, and reliably insert text into
// it across the four platforms we support. Each one uses a different input
// primitive (textarea on ChatGPT, ProseMirror on Claude, contenteditable on
// Gemini, textarea on Perplexity) and React-tracked values that need a
// native setter to propagate.

const SELECTORS_BY_PLATFORM: Record<string, string[]> = {
  chatgpt: [
    '#prompt-textarea',
    'textarea[data-id="root"]',
    'textarea[placeholder*="Message"]',
    'div[contenteditable="true"][data-virtualkeyboard]',
    'div[contenteditable="true"]',
    'textarea',
  ],
  claude: [
    'div[contenteditable="true"].ProseMirror',
    'div[contenteditable="true"][data-placeholder]',
    'div[contenteditable="true"]',
    'textarea',
  ],
  gemini: [
    'div[contenteditable="true"].ql-editor',
    'rich-textarea div[contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea',
  ],
  perplexity: [
    'textarea[placeholder*="Ask"]',
    'textarea',
    'div[contenteditable="true"]',
  ],
};

export function findChatInput(doc: Document, platform: string): HTMLElement | null {
  const selectors = SELECTORS_BY_PLATFORM[platform] ?? [];
  for (const sel of selectors) {
    const el = doc.querySelector<HTMLElement>(sel);
    if (el && isVisible(el)) return el;
  }
  // Fallback: any visible textarea / contenteditable on the page.
  const generic = Array.from(
    doc.querySelectorAll<HTMLElement>('textarea, div[contenteditable="true"]'),
  ).find(isVisible);
  return generic ?? null;
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) return false;
  const style = (el.ownerDocument?.defaultView ?? window).getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/**
 * Insert text at the start of the input, preserving anything the user has
 * already typed (placed after our context block + a blank line). Uses the
 * native value setter for textareas (so React's tracking sees the change)
 * and execCommand('insertText') for contenteditable.
 */
export function insertIntoInput(input: HTMLElement, text: string): boolean {
  input.focus();
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const existing = input.value;
    const newValue = existing ? `${text}\n\n${existing}` : `${text}\n\n`;
    const setter =
      input instanceof HTMLTextAreaElement
        ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, newValue);
    else input.value = newValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Contenteditable: select all, insertText, then move caret to end.
  if (input.isContentEditable) {
    try {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(input);
        range.collapse(true);
        selection.addRange(range);
      }
      const ok = document.execCommand('insertText', false, text + '\n\n');
      if (!ok) {
        // Fallback: prepend a text node and dispatch input.
        const node = document.createTextNode(text + '\n\n');
        input.insertBefore(node, input.firstChild);
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
