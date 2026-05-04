/**
 * Uses the robust React Input Setter logic to bypass React controlled input limitations
 * This is critical for injecting text into ChatGPT, Claude, and Gemini input fields
 */
export function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (valueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter?.call(element, value);
  } else {
    valueSetter?.call(element, value);
  }
  
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Find the active chat input element based on the current AI platform
 */
export function findChatInput(): HTMLTextAreaElement | HTMLInputElement | null {
  const hostname = window.location.hostname;
  
  // ChatGPT
  if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) {
    return document.querySelector('textarea[data-id="root"]') ||
           document.querySelector('#prompt-textarea') ||
           document.querySelector('textarea');
  }
  
  // Claude
  if (hostname.includes('claude.ai')) {
    return document.querySelector('div[contenteditable="true"]') as HTMLTextAreaElement ||
           document.querySelector('textarea');
  }
  
  // Gemini
  if (hostname.includes('gemini.google.com')) {
    return document.querySelector('rich-textarea textarea') ||
           document.querySelector('textarea');
  }
  
  return null;
}

/**
 * Insert text into the chat input, handling both textarea and contenteditable elements
 */
export function insertTextIntoChat(text: string): boolean {
  const hostname = window.location.hostname;
  
  // Find the primary input based on platform
  let selector = 'textarea:not([readonly]), [contenteditable="true"]';
  if (hostname.includes('chatgpt.com')) selector = '#prompt-textarea';
  if (hostname.includes('claude.ai')) selector = 'div[contenteditable="true"]';
  if (hostname.includes('gemini.google.com')) selector = '[role="textbox"]';

  const input = document.querySelector(selector) as HTMLElement;
  
  if (!input) return false;

  input.focus();
  
  // Use the Clipboard API + execCommand for the most reliable "natural" insertion
  // which forces the AI apps to register the content.
  try {
    document.execCommand('insertText', false, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  } catch {
    // Manual fallback
    if (input instanceof HTMLTextAreaElement) {
        input.value = text + '\n\n' + input.value;
    } else {
        input.innerText = text + '\n\n' + input.innerText;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
}
/**
 * Get favicon URL for a given page URL
 */
export function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch {
    return '';
  }
}

