/**
 * Context Stash - Floating Widget for AI Chat Pages
 * Vanilla JS implementation for reliable content script injection
 */

// Reserved for the disabled floating widget — re-enabled in a follow-up.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ICONS = {
  folder: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect x="8" y="8" width="48" height="48" rx="8" fill="none" stroke="#64748b" stroke-width="4"/>
    <rect x="16" y="20" width="32" height="6" rx="2" fill="url(#grad1)"/>
    <rect x="16" y="30" width="32" height="6" rx="2" fill="url(#grad1)"/>
    <rect x="16" y="40" width="24" height="6" rx="2" fill="url(#grad1)"/>
    <path d="M44 40l8-8m0 0l-8-8m8 8H40" stroke="url(#grad1)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  x: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  chevronDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  loader: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="context-dock-spinner"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`,
};

// CSS Styles
const STYLES = `
  #context-dock-widget {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transition: top 0.15s ease, left 0.15s ease, bottom 0.15s ease, right 0.15s ease;
  }
  
  /* Site-specific defaults (used when dynamic anchoring is not available) */
  body[data-context-dock-site="chatgpt"] #context-dock-widget,
  body[data-context-dock-site="claude"] #context-dock-widget,
  body[data-context-dock-site="gemini"] #context-dock-widget {
    bottom: 90px;
    right: 24px;
  }
  
  /* Perplexity will be dynamically anchored next to the input via JS.
     Keep a sensible default in case anchoring fails. */
  body[data-context-dock-site="perplexity"] #context-dock-widget {
    bottom: 90px;
    right: 80px;
  }

  #context-dock-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    color: white;
    border: none;
    border-radius: 9999px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
    transition: all 0.2s ease;
  }

  #context-dock-pill:hover {
    background: linear-gradient(135deg, #334155 0%, #1e293b 100%);
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.15);
  }

  #context-dock-pill svg {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
  }

  #context-dock-panel {
    position: absolute;
    bottom: 52px;
    right: 0;
    width: 320px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 50px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
    overflow: hidden;
    animation: contextDockSlideUp 0.2s ease-out;
  }

  @keyframes contextDockSlideUp {
    from { transform: translateY(10px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  @keyframes contextDockSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .context-dock-spinner {
    animation: contextDockSpin 1s linear infinite;
  }

  .context-dock-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #e2e8f0;
    background: linear-gradient(to bottom, #f8fafc, #f1f5f9);
  }

  .context-dock-header h3 {
    font-size: 14px;
    font-weight: 600;
    color: #0f172a;
    margin: 0;
  }

  .context-dock-close {
    padding: 4px;
    background: none;
    border: none;
    cursor: pointer;
    color: #64748b;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .context-dock-close:hover {
    background: #e2e8f0;
    color: #334155;
  }

  .context-dock-content {
    padding: 16px;
    max-height: 320px;
    overflow-y: auto;
  }

  .context-dock-project {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    background: #f1f5f9;
    border-radius: 8px;
    margin-bottom: 10px;
  }

  .context-dock-project-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .context-dock-project-name {
    font-size: 13px;
    font-weight: 500;
    color: #334155;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .context-dock-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
  }

  .context-dock-project-switcher {
    flex-shrink: 0;
    position: relative;
  }

  .context-dock-project-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 9999px;
    border: 1px solid #cbd5e1;
    background: white;
    color: #475569;
    font-size: 11px;
    cursor: pointer;
  }

  .context-dock-project-toggle-label {
    max-width: 110px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .context-dock-project-toggle-chevron {
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 4px solid #94a3b8;
  }

  .context-dock-project-menu {
    position: absolute;
    top: 30px;
    right: 0;
    width: 200px;
    max-height: 210px;
    overflow-y: auto;
    background: white;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.2);
    border: 1px solid #e2e8f0;
    padding: 6px 0;
    z-index: 10;
  }

  .context-dock-project-menu-item {
    width: 100%;
    text-align: left;
    padding: 6px 10px;
    font-size: 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #475569;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .context-dock-project-menu-item-dot {
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: #cbd5e1;
  }

  .context-dock-project-menu-item.active {
    background: #eff6ff;
    color: #1d4ed8;
  }

  .context-dock-project-menu-item.active .context-dock-project-menu-item-dot {
    background: #22c55e;
  }

  .context-dock-project-menu-item:hover {
    background: #f1f5f9;
  }

  .context-dock-count {
    font-size: 12px;
    color: #64748b;
    margin-bottom: 12px;
  }

  .context-dock-preview {
    font-size: 12px;
    color: #64748b;
    background: #f8fafc;
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 12px;
    max-height: 100px;
    overflow-y: auto;
    white-space: pre-wrap;
    line-height: 1.5;
    border: 1px solid #e2e8f0;
  }

  .context-dock-inject {
    width: 100%;
    padding: 12px 16px;
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.15s ease;
  }

  .context-dock-inject:hover:not(:disabled) {
    background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
  }

  .context-dock-inject:disabled {
    background: #e2e8f0;
    color: #94a3b8;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .context-dock-empty {
    text-align: center;
    padding: 24px 16px;
    color: #64748b;
    font-size: 13px;
  }

  .context-dock-empty p {
    margin: 0 0 8px 0;
  }

  .context-dock-empty .context-dock-subtext {
    font-size: 12px;
    color: #94a3b8;
  }

  .context-dock-hidden {
    display: none !important;
  }
  /* Toast Notifications */
  .context-stash-toast {
    position: fixed;
    bottom: 40px;
    right: 24px;
    padding: 12px 20px;
    border-radius: 10px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: white;
    z-index: 2147483647;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: none;
    animation: contextDockSlideUp 0.3s ease-out;
    transition: opacity 0.3s ease;
  }

  .context-stash-toast.success {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .context-stash-toast.error {
    background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .context-stash-toast-icon {
    font-size: 16px;
  }
  @keyframes contextDockSlideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setReactTextarea(el: HTMLTextAreaElement, value: string): boolean {
  try {
    // Get the setter from the native prototype to bypass React's tracking
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;

    if (!nativeTextAreaValueSetter) return false;

    nativeTextAreaValueSetter.call(el, value);
    
    // Dispatch events to trigger React's change listeners
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    
    el.focus();
    return true;
  } catch (e) {
    console.error("Context Stash: React setter failed", e);
    return false;
  }
}

/**
 * Robustly inserts text into a ContentEditable div (Claude, Gemini)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function insertIntoContentEditable(el: HTMLElement, text: string): boolean {
  try {
    el.focus();
    
    // execCommand is deprecated but handles the complex internal event triggers 
    // required by editors like ProseMirror (Claude) better than range manipulation
    const success = document.execCommand('insertText', false, text);
    
    if (!success) {
      // Fallback: Direct Range Manipulation
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false); // Move cursor to end
        sel.addRange(range);
        
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.collapse(false); // Move cursor after inserted text
        
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
    }
    
    return true;
  } catch (e) {
    console.error("Context Stash: ContentEditable insert failed", e);
    return false;
  }
}

// --- WIDGET CLASS ---

interface Project {
  id: string;
  name: string;
  snippets: Array<{
    id: string;
    type: 'selection' | 'page_summary' | 'note';
    content: string;
    label?: string;
    sourceUrl?: string;
    sourceTitle?: string;
    timestamp: number;
  }>;
}

class ContextStashWidget {
  private container: HTMLDivElement | null = null;
  private site: string | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.detectSite();
    
    // Inject styles
    if (!document.getElementById('context-dock-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'context-dock-styles';
      styleEl.textContent = STYLES;
      document.head.appendChild(styleEl);
    }

    // Create a hidden container to maintain state if we enable the UI later
    if (!document.getElementById('context-dock-widget')) {
      this.container = document.createElement('div');
      this.container.id = 'context-dock-widget';
      document.body.appendChild(this.container);
    }
  }

  private detectSite(): void {
    const hostname = window.location.hostname;
    if (hostname.includes('perplexity.ai')) this.site = 'perplexity';
    else if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) this.site = 'chatgpt';
    else if (hostname.includes('claude.ai')) this.site = 'claude';
    else if (hostname.includes('gemini.google.com')) this.site = 'gemini';
  }

  /**
   * Formats the project snippets into a Markdown string
   * This is where Labels are handled.
   */
  private formatContext(project: Project): string {
    const lines: string[] = [];

    lines.push(`### Context from project: **${project.name}**`);
    lines.push('');
    lines.push('The following numbered references contain prior research, notes, and clips relevant to my request.');
    lines.push('');

    project.snippets.forEach((snippet, index) => {
      const n = index + 1;
      const typeLabel =
        snippet.type === 'selection' ? 'Selection' : 
        snippet.type === 'page_summary' ? 'Page summary' : 'Note';

      // --- LABEL LOGIC ---
      // If a label exists, it appends " - **LabelName**"
      const labelText = snippet.label ? ` - **${snippet.label}**` : '';
      lines.push(`#### [${n}] ${typeLabel}${labelText}`);

      if (snippet.sourceTitle || snippet.sourceUrl) {
        const title = snippet.sourceTitle ?? 'Source';
        const url = snippet.sourceUrl ?? '';
        lines.push(`- **Source**: ${url ? `[${title}](${url})` : title}`);
      }

      const date = new Date(snippet.timestamp).toLocaleDateString();
      lines.push(`- **Captured**: ${date}`);
      lines.push('');
      lines.push(snippet.content);
      lines.push('');
    });

    lines.push('---');
    lines.push('Please treat these as background references.');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Main Injection Logic
   */
  // Replace the findAndInjectText method in src/content/injector.ts

private findAndInjectText(text: string): boolean {
  // 1. Use the class property 'this.site' which was set during init()
  const selectors: string[] = [];
  
  switch (this.site) {
    case 'chatgpt':
      selectors.push('#prompt-textarea', '[contenteditable="true"]', 'textarea[data-id="root"]');
      break;
    case 'claude':
      selectors.push('div[contenteditable="true"]', 'textarea[placeholder*="Claude"]');
      break;
    case 'perplexity':
      selectors.push('textarea[placeholder*="Ask"]', 'textarea', '[contenteditable="true"]');
      break;
    case 'gemini':
      selectors.push('[role="textbox"][contenteditable="true"]', 'rich-textarea textarea', 'textarea');
      break;
    default:
      // Generic fallbacks for unknown sites
      selectors.push('textarea:not([readonly])', '[contenteditable="true"]', '[role="textbox"]');
      break;
  }

  // 2. Find the visible element
  let element: HTMLElement | null = null;
  for (const selector of selectors) {
    const found = document.querySelector(selector) as HTMLElement;
    if (found && found.offsetParent !== null) {
      element = found;
      break;
    }
  }

  if (!element) return false;

  try {
    element.focus();

    // 3. Try to insert via execCommand (Best for framework-based editors like ChatGPT/Claude)
    const isContentEditable = element.getAttribute('contenteditable') === 'true' || element.tagName !== 'TEXTAREA';
    
    if (isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
      
      const success = document.execCommand('insertText', false, text);
      if (success) return true;
    }

    // 4. Fallback for standard Textareas
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const target = element as HTMLTextAreaElement;
      const valueSetter = Object.getOwnPropertyDescriptor(target, 'value')?.set;
      const prototype = Object.getPrototypeOf(target);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

      const fullText = text + (target.value ? '\n\n' + target.value : '');

      if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(target, fullText);
      } else {
        target.value = fullText;
      }
      
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } 
    
    return false;
  } catch (err) {
    console.error('[Context Stash] Injection failed:', err);
    return false;
  }
}
  /**
   * Called via Message from Background Script
   */
  public async injectContextFromMenu(projectId?: string): Promise<void> {
    try {
      // Fetch Data
      const result = await chrome.storage.local.get(['projects', 'activeProjectId']);
      const projects = (result.projects || []) as Project[];
      const activeProjectId = (result.activeProjectId as string | null) ?? null;
      const idToUse = projectId ?? activeProjectId;
      
      const project = projects.find((p) => p.id === idToUse);
      
      if (!project || project.snippets.length === 0) {
        this.showToast('Project is empty or not found', 'error');
        return;
      }

      const contextText = this.formatContext(project);
      
      // Attempt Auto-Injection
      const injected = this.findAndInjectText(contextText);

      if (injected) {
        this.showToast('Context pasted successfully!', 'success');
      } else {
        // Fallback: Copy to Clipboard
        await navigator.clipboard.writeText(contextText);
        this.showToast('Input not found. Copied to Clipboard!', 'success');
      }

    } catch (error) {
      console.error('[Context Stash] Injection error:', error);
      this.showToast('Error pasting context', 'error');
    }
  }

  private showToast(message: string, type: 'success' | 'error'): void {
  // Remove existing toasts to prevent stacking
  const existingToasts = document.querySelectorAll('.context-stash-toast');
  existingToasts.forEach(t => t.remove());

  const toast = document.createElement('div');
  
  // Apply the base class and the specific type class
  toast.className = `context-stash-toast ${type}`;
  
  const icon = type === 'success' ? '✓' : '✕';
  
  toast.innerHTML = `
    <span class="context-stash-toast-icon">${icon}</span>
    <span class="context-stash-toast-message">${message}</span>
  `;
  
  document.body.appendChild(toast);

  // Animate out and remove
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
}

// --- INITIALIZATION ---

let contextStashWidget: ContextStashWidget | null = null;

function initContextStash(): void {
  if (contextStashWidget) return;
  // Cleanup old instances if DOM reloaded
  const existing = document.getElementById('context-dock-widget');
  if (existing) existing.remove();
  
  contextStashWidget = new ContextStashWidget();
}

// Listen for messages
chrome.runtime.onMessage.addListener(async (message) => {
  if (message?.type === 'INJECT_CONTEXT_FROM_MENU') {
    if (!contextStashWidget) initContextStash();
    if (contextStashWidget) {
      await contextStashWidget.injectContextFromMenu(message.projectId);
    }
  }
});

// Run immediately
initContextStash();

// Re-run if DOM changes significantly (SPA navigation)
const observer = new MutationObserver(() => {
  if (!document.getElementById('context-dock-styles') && !contextStashWidget) {
    initContextStash();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
