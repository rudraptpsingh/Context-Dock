/**
 * Context Stash - Floating Widget for AI Chat Pages
 * Vanilla JS implementation for reliable content script injection
 */

// SVG Icons as strings
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
`;

interface Project {
  id: string;
  name: string;
  snippets: Array<{
    id: string;
    type: 'selection' | 'page_summary' | 'note';
    content: string;
    sourceUrl?: string;
    sourceTitle?: string;
    timestamp: number;
  }>;
}

class ContextStashWidget {
  private container: HTMLDivElement | null = null;
  private isOpen = false;
  private project: Project | null = null;
  private projects: Project[] = [];
  private activeProjectId: string | null = null;
  private site: string | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    // Detect site and set data attribute for CSS positioning
    this.detectSite();
    
    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.id = 'context-dock-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    // Create widget container
    this.container = document.createElement('div');
    this.container.id = 'context-dock-widget';
    this.container.innerHTML = this.renderWidget();
    document.body.appendChild(this.container);

    // Initial positioning relative to chat input (especially important for Perplexity)
    this.updatePosition();

    // Bind events
    this.bindEvents();
    
    console.log('[Context Stash] Widget initialized');
  }

  private detectSite(): void {
    const hostname = window.location.hostname;
    
    if (hostname.includes('perplexity.ai')) {
      this.site = 'perplexity';
    } else if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) {
      this.site = 'chatgpt';
    } else if (hostname.includes('claude.ai')) {
      this.site = 'claude';
    } else if (hostname.includes('gemini.google.com')) {
      this.site = 'gemini';
    }
    
    if (this.site) {
      document.body.setAttribute('data-context-dock-site', this.site);
    }
  }

  private renderWidget(): string {
    // UI has been intentionally disabled; we keep the injection logic for
    // right-click \"Paste Context\" but do not render any floating widget.
    return '';
  }

  private bindEvents(): void {
    const pill = document.getElementById('context-dock-pill');
    const closeBtn = document.getElementById('context-dock-close-btn');

    pill?.addEventListener('click', () => this.togglePanel());
    closeBtn?.addEventListener('click', () => this.closePanel());

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isOpen && this.container && !this.container.contains(e.target as Node)) {
        this.closePanel();
      }
    });

    // Reposition on resize/scroll like Grammarly does to stay near the input
    window.addEventListener('resize', () => this.updatePosition());
    window.addEventListener('scroll', () => this.updatePosition(), true);
  }

  /**
   * Find the primary chat input element for the current site.
   * This is used to anchor the floating Dock near the input, similar to Grammarly.
   */
  private getAnchorElement(): HTMLElement | null {
    const hostname = window.location.hostname;

    // Perplexity: textarea inside the main search box
    if (hostname.includes('perplexity.ai')) {
      const selectors = [
        'textarea[placeholder*="Ask anything"]',
        'textarea[placeholder*="Ask Anything"]',
        'textarea[placeholder*="ask anything"]',
        'textarea',
        '[role="textbox"][contenteditable="true"]',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el && el.offsetParent !== null) {
          return el;
        }
      }
    }

    // ChatGPT
    if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) {
      const el =
        (document.querySelector('#prompt-textarea') as HTMLElement | null) ||
        (document.querySelector('textarea[data-id="root"]') as HTMLElement | null) ||
        (document.querySelector('textarea') as HTMLElement | null);
      if (el && el.offsetParent !== null) return el;
    }

    // Claude
    if (hostname.includes('claude.ai')) {
      const editable = document.querySelector('div[contenteditable="true"]') as HTMLElement | null;
      if (editable && editable.offsetParent !== null && editable.offsetHeight > 20) return editable;
      const ta = document.querySelector('textarea') as HTMLElement | null;
      if (ta && ta.offsetParent !== null) return ta;
    }

    // Gemini
    if (hostname.includes('gemini.google.com')) {
      const textbox = document.querySelector('[role="textbox"][contenteditable="true"]') as HTMLElement | null;
      if (textbox && textbox.offsetParent !== null) return textbox;
      const ta =
        (document.querySelector('rich-textarea textarea') as HTMLElement | null) ||
        (document.querySelector('textarea') as HTMLElement | null);
      if (ta && ta.offsetParent !== null) return ta;
    }

    return null;
  }

  /**
   * Position the Dock relative to the detected chat input element.
   * For anchored sites (like Perplexity), this keeps the pill visually attached
   * to the input, instead of a hard-coded viewport position.
   */
  private updatePosition(): void {
    if (!this.container) return;

    const anchor = this.getAnchorElement();
    if (!anchor) {
      // Fall back to CSS defaults
      this.container.style.top = '';
      this.container.style.left = '';
      this.container.style.bottom = '';
      this.container.style.right = '';
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const widgetRect = this.container.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 16;

    // Default: hug the bottom-right corner of the input, just outside it
    let top = rect.bottom + window.scrollY - widgetRect.height - margin / 2;
    let left = rect.right + window.scrollX - widgetRect.width - margin / 2;

    // Perplexity has a very wide centered input. Anchor the Dock just to the right,
    // vertically centered to feel \"attached\" to the bar on large screens.
    if (this.site === 'perplexity') {
      left = rect.right + window.scrollX + margin / 2;
      top = rect.top + window.scrollY + rect.height / 2 - widgetRect.height / 2;
    }

    // Clamp within viewport so it never goes off-screen
    const maxTop = window.scrollY + viewportHeight - widgetRect.height - margin;
    const minTop = window.scrollY + margin;
    const maxLeft = window.scrollX + viewportWidth - widgetRect.width - margin;

    top = Math.min(Math.max(top, minTop), maxTop);
    left = Math.min(left, maxLeft);

    this.container.style.top = `${top}px`;
    this.container.style.left = `${left}px`;
    this.container.style.right = 'auto';
    this.container.style.bottom = 'auto';
  }

  private async togglePanel(): Promise<void> {
    if (this.isOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  private async openPanel(): Promise<void> {
    this.isOpen = true;
    const panel = document.getElementById('context-dock-panel');
    panel?.classList.remove('context-dock-hidden');
    await this.loadProject();
  }

  private closePanel(): void {
    this.isOpen = false;
    const panel = document.getElementById('context-dock-panel');
    panel?.classList.add('context-dock-hidden');
  }

  private async loadProject(): Promise<void> {
    const content = document.getElementById('context-dock-content');
    if (!content) return;

    content.innerHTML = `
      <div class="context-dock-empty">
        ${ICONS.loader}
        <p style="margin-top: 8px;">Loading...</p>
      </div>
    `;

    try {
      const result = await chrome.storage.local.get(['projects', 'activeProjectId']);
      this.projects = (result.projects || []) as Project[];
      this.activeProjectId = (result.activeProjectId as string | null) ?? null;

      if (this.activeProjectId) {
        this.project = this.projects.find((p) => p.id === this.activeProjectId) || null;
      } else {
        this.project = this.projects[0] ?? null;
        this.activeProjectId = this.project?.id ?? null;
      }

      this.renderContent();
    } catch (error) {
      console.error('[Context Stash] Error loading project:', error);
      content.innerHTML = `
        <div class="context-dock-empty">
          <p>Error loading project</p>
          <p class="context-dock-subtext">Please try again</p>
        </div>
      `;
    }
  }

  private renderContent(): void {
    const content = document.getElementById('context-dock-content');
    if (!content) return;

    if (!this.project) {
      content.innerHTML = `
        <div class="context-dock-empty">
          <p>No active project</p>
          <p class="context-dock-subtext">Open Context Stash side panel to create or select a project.</p>
        </div>
      `;
      return;
    }

    const snippetCount = this.project.snippets.length;
    const preview = this.getPreviewText();

    content.innerHTML = `
      <div class="context-dock-project">
        <div class="context-dock-project-main">
          <span class="context-dock-status-dot"></span>
          <span class="context-dock-project-name">
            ${this.escapeHtml(this.project.name)}
          </span>
        </div>
        ${
          this.projects.length > 1
            ? `
          <div class="context-dock-project-switcher">
            <button id="context-dock-project-toggle" class="context-dock-project-toggle" type="button">
              <span class="context-dock-project-toggle-label">
                ${this.escapeHtml(this.project.name)}
              </span>
              <span class="context-dock-project-toggle-chevron"></span>
            </button>
            <div id="context-dock-project-menu" class="context-dock-project-menu context-dock-hidden">
              ${this.projects
                .map(
                  (p) => `
                <button
                  class="context-dock-project-menu-item ${
                    p.id === this.activeProjectId ? 'active' : ''
                  }"
                  data-project-id="${p.id}"
                  type="button"
                >
                  <span class="context-dock-project-menu-item-dot"></span>
                  <span class="context-dock-project-menu-item-label">
                    ${this.escapeHtml(p.name)}
                  </span>
                </button>`
                )
                .join('')}
            </div>
          </div>
        `
            : ''
        }
      </div>
      <p class="context-dock-count">${snippetCount} snippet${snippetCount !== 1 ? 's' : ''} ready to inject</p>
      ${snippetCount > 0 ? `<div class="context-dock-preview">${this.escapeHtml(preview)}</div>` : ''}
      <button class="context-dock-inject" id="context-dock-inject-btn" ${snippetCount === 0 ? 'disabled' : ''}>
        ${ICONS.folder}
        Inject Context
      </button>
    `;

    // Bind inject button
    const injectBtn = document.getElementById('context-dock-inject-btn');
    injectBtn?.addEventListener('click', () => this.handleInject());

    // Bind project switcher (if present)
    const toggle = document.getElementById('context-dock-project-toggle') as HTMLButtonElement | null;
    const menu = document.getElementById('context-dock-project-menu') as HTMLDivElement | null;
    if (toggle && menu) {
      const closeMenu = () => {
        menu.classList.add('context-dock-hidden');
      };

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('context-dock-hidden');
      });

      // Click on a project
      menu.querySelectorAll<HTMLButtonElement>('.context-dock-project-menu-item').forEach((item) => {
        item.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const newId = item.getAttribute('data-project-id') ?? null;
          this.activeProjectId = newId;
          await chrome.storage.local.set({ activeProjectId: newId });
          await this.loadProject();
          const selectedProject = this.projects.find((p) => p.id === newId);
          if (selectedProject) {
            this.showToast(`Switched to project "${selectedProject.name}"`, 'success');
          }
          closeMenu();
        });
      });

      // Close menu when clicking anywhere else inside the panel
      const panel = document.getElementById('context-dock-panel');
      panel?.addEventListener(
        'click',
        () => {
          closeMenu();
        },
        { capture: true }
      );
    }
  }

  private formatContext(project: Project): string {
    const lines: string[] = [];

    lines.push(`### Context from project: **${project.name}**`);
    lines.push('');
    lines.push('The following numbered references contain prior research, notes, and clips relevant to my request.');
    lines.push('');

    project.snippets.forEach((snippet, index) => {
      const n = index + 1;
      const label =
        snippet.type === 'selection'
          ? 'Selection'
          : snippet.type === 'page_summary'
          ? 'Page summary'
          : 'Note';

      lines.push(`#### [${n}] ${label}`);

      if (snippet.sourceTitle || snippet.sourceUrl) {
        const title = snippet.sourceTitle ?? 'Source';
        const url = snippet.sourceUrl ?? '';
        if (url) {
          lines.push(`- **Source**: [${title}](${url})`);
        } else {
          lines.push(`- **Source**: ${title}`);
        }
      }

      const date = new Date(snippet.timestamp).toISOString();
      lines.push(`- **Captured at**: ${date}`);
      lines.push('');
      lines.push(snippet.content);
      lines.push('');
    });

    lines.push('---');
    lines.push(
      'Please treat these as background references: use them to ground your answer, quote or cite where helpful, and note if any references appear outdated or inconsistent.'
    );
    lines.push('');

    return lines.join('\n');
  }

  private getPreviewText(): string {
    if (!this.project) return '';
    const context = this.formatContext(this.project);
    return context.length > 200 ? context.slice(0, 200) + '...' : context;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
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

  private findAndInjectText(text: string): boolean {
    const hostname = window.location.hostname;
    console.log('[Context Stash] Attempting to inject into:', hostname);

    // ChatGPT
    if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) {
      const element = document.querySelector('#prompt-textarea') || 
                      document.querySelector('textarea[data-id="root"]') || 
                      document.querySelector('textarea');

      if (element) {
        // Handle ContentEditable (div or other)
        if (element.getAttribute('contenteditable') === 'true') {
            const el = element as HTMLElement;
            const currentContent = el.innerText || '';
            el.focus();
            
            // Try execCommand first as it handles React updates better for contenteditable
            document.execCommand('selectAll', false);
            document.execCommand('insertText', false, text + (currentContent ? '\n\n' + currentContent : ''));
            
            // Fallback if execCommand didn't work (e.g. empty text)
            if (el.innerText === currentContent) {
               el.innerText = text + (currentContent ? '\n\n' + currentContent : '');
               el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return true;
        }
        
        // Handle Textarea
        if (element instanceof HTMLTextAreaElement) {
            const currentValue = element.value || '';
            this.setNativeValue(element, text + (currentValue ? '\n\n' + currentValue : ''));
            element.focus();
            element.style.height = 'auto';
            element.style.height = element.scrollHeight + 'px';
            return true;
        }
      }
    }

    // Claude
    if (hostname.includes('claude.ai')) {
      console.log('[Context Stash] Detected Claude, searching for input...');
      
      // Try contenteditable first (Claude's main input)
      const contentEditable = document.querySelector('div[contenteditable="true"]') as HTMLDivElement;
      if (contentEditable) {
        const currentContent = contentEditable.innerText || '';
        const newContent = text + (currentContent ? '\n\n' + currentContent : '');
        contentEditable.focus();
        
        // Use execCommand for better compatibility with contenteditable
        document.execCommand('selectAll', false);
        document.execCommand('insertText', false, newContent);
        console.log('[Context Stash] Injected into Claude contenteditable');
        return true;
      }

      // Fallback to textarea
      const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
      if (textarea) {
        const currentValue = textarea.value || '';
        this.setNativeValue(textarea, text + (currentValue ? '\n\n' + currentValue : ''));
        textarea.focus();
        console.log('[Context Stash] Injected into Claude textarea');
        return true;
      }
    }

    // Gemini
    if (hostname.includes('gemini.google.com')) {
      console.log('[Context Stash] Detected Gemini, searching for input...');
      
      // Gemini uses a contenteditable div with role="textbox"
      const textbox = document.querySelector('[role="textbox"][contenteditable="true"]') as HTMLElement;
      if (textbox) {
        const currentContent = textbox.innerText || '';
        textbox.focus();
        document.execCommand('selectAll', false);
        document.execCommand('insertText', false, text + (currentContent ? '\n\n' + currentContent : ''));
        console.log('[Context Stash] Injected into Gemini textbox');
        return true;
      }
      
      // Fallback to regular textarea
      const richTextarea = document.querySelector('rich-textarea textarea') as HTMLTextAreaElement;
      const regularTextarea = document.querySelector('textarea') as HTMLTextAreaElement;
      const textarea = richTextarea || regularTextarea;

      if (textarea) {
        const currentValue = textarea.value || '';
        this.setNativeValue(textarea, text + (currentValue ? '\n\n' + currentValue : ''));
        textarea.focus();
        console.log('[Context Stash] Injected into Gemini textarea');
        return true;
      }
    }

    // Perplexity
    if (hostname.includes('perplexity.ai')) {
      console.log('[Context Stash] Detected Perplexity, searching for input...');
      
      // Perplexity uses a textarea inside a complex structure
      // Try multiple approaches
      const textareas = document.querySelectorAll('textarea');
      console.log('[Context Stash] Found', textareas.length, 'textareas');
      
      for (const textarea of textareas) {
        const ta = textarea as HTMLTextAreaElement;
        // Check if it looks like the main input (has placeholder or is visible)
        const placeholder = ta.placeholder || '';
        const isVisible = ta.offsetParent !== null;
        console.log('[Context Stash] Textarea:', { placeholder, isVisible, value: ta.value?.slice(0, 50) });
        
        if (isVisible && (placeholder.toLowerCase().includes('ask') || placeholder.toLowerCase().includes('anything') || placeholder.toLowerCase().includes('follow'))) {
          const currentValue = ta.value || '';
          this.setNativeValue(ta, text + (currentValue ? '\n\n' + currentValue : ''));
          ta.focus();
          // Trigger additional events that Perplexity might need
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          ta.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
          console.log('[Context Stash] Successfully injected into Perplexity textarea');
          return true;
        }
      }
      
      // Fallback: try the first visible textarea
      for (const textarea of textareas) {
        const ta = textarea as HTMLTextAreaElement;
        if (ta.offsetParent !== null) {
          const currentValue = ta.value || '';
          this.setNativeValue(ta, text + (currentValue ? '\n\n' + currentValue : ''));
          ta.focus();
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('[Context Stash] Injected into first visible Perplexity textarea');
          return true;
        }
      }
      
      // Try contenteditable
      const editables = document.querySelectorAll('[contenteditable="true"]');
      console.log('[Context Stash] Found', editables.length, 'contenteditable elements');
      for (const editable of editables) {
        const el = editable as HTMLElement;
        if (el.offsetParent !== null && el.offsetHeight > 20) {
          const currentContent = el.innerText || '';
          el.focus();
          document.execCommand('selectAll', false);
          document.execCommand('insertText', false, text + (currentContent ? '\n\n' + currentContent : ''));
          console.log('[Context Stash] Injected into Perplexity contenteditable');
          return true;
        }
      }
    }

    // Fallback: try any textarea or contenteditable
    const anyTextarea = document.querySelector('textarea:not([readonly])') as HTMLTextAreaElement;
    if (anyTextarea) {
      const currentValue = anyTextarea.value || '';
      this.setNativeValue(anyTextarea, text + (currentValue ? '\n\n' + currentValue : ''));
      anyTextarea.focus();
      return true;
    }
    
    // Try contenteditable elements
    const editables = document.querySelectorAll('[contenteditable="true"]');
    for (const editable of editables) {
      const el = editable as HTMLElement;
      // Skip if it's a tiny element (likely not the main input)
      if (el.offsetHeight < 20) continue;
      
      const currentContent = el.innerText || '';
      el.focus();
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, text + (currentContent ? '\n\n' + currentContent : ''));
      return true;
    }

    return false;
  }

  private async handleInject(): Promise<void> {
    if (!this.project || this.project.snippets.length === 0) return;

    const injectBtn = document.getElementById('context-dock-inject-btn');
    if (injectBtn) {
      injectBtn.innerHTML = `${ICONS.loader} Injecting...`;
      (injectBtn as HTMLButtonElement).disabled = true;
    }

    try {
      const contextText = this.formatContext(this.project);
      const success = this.findAndInjectText(contextText);

      if (success) {
        this.closePanel();
        this.showToast('Context injected successfully!', 'success');
      } else {
        this.showToast('Could not find chat input', 'error');
      }
    } catch (error) {
      console.error('[Context Stash] Injection error:', error);
      this.showToast('Failed to inject context', 'error');
    } finally {
      if (injectBtn) {
        injectBtn.innerHTML = `${ICONS.folder} Inject Context`;
        (injectBtn as HTMLButtonElement).disabled = false;
      }
    }
  }

  /**
   * Used when the user triggers \"Paste Context from Context Dock\" via
   * the right-click menu on an editable field.
   */
  private async injectFromContextMenu(projectId?: string): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['projects', 'activeProjectId']);
      const projects = (result.projects || []) as Project[];
      const activeProjectId = (result.activeProjectId as string | null) ?? null;

      const idToUse = projectId ?? activeProjectId;
      const project = projects.find((p) => p.id === idToUse);
      if (!project || project.snippets.length === 0) {
        this.showToast('No context available in the selected project', 'error');
        return;
      }

      const contextText = this.formatContext(project);
      const success = this.findAndInjectText(contextText);

      if (success) {
        this.showToast('Context pasted from Context Stash', 'success');
      } else {
        this.showToast('Could not find chat input to paste into', 'error');
      }
    } catch (error) {
      console.error('[Context Stash] injectFromContextMenu error:', error);
      this.showToast('Failed to paste context', 'error');
    }
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 160px;
      right: 24px;
      background: ${type === 'success' ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' : '#dc2626'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      z-index: 2147483647;
      box-shadow: 0 10px 40px rgba(0,0,0,0.25);
      animation: contextDockSlideUp 0.3s ease-out;
    `;
    toast.textContent = `${type === 'success' ? '✓' : '✕'} ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }
}

// Initialize widget when DOM is ready
function initContextStash(): void {
  // Don't initialize if already exists
  if (document.getElementById('context-dock-widget')) {
    return;
  }

  const widget = new ContextStashWidget();

  // Listen for background requests to inject context (right-click menu on editable fields)
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'INJECT_CONTEXT_FROM_MENU') {
      widget['injectFromContextMenu']?.(message.projectId);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContextStash);
} else {
  initContextStash();
}

// Also try to initialize after a short delay for SPAs
setTimeout(initContextStash, 1000);

