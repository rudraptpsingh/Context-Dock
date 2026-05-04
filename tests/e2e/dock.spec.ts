import { test, expect } from './fixtures';
import { loadFixture } from './helpers';

const CHATGPT_HTML = loadFixture('chatgpt-mock-page.html');

test('floating dock mounts on a chat page', async ({ context }) => {
  await context.route(/^https?:\/\/chatgpt\.com\//, async route => {
    if (route.request().resourceType() !== 'document') {
      return route.fulfill({ status: 404, body: '' });
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: CHATGPT_HTML });
  });

  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/dock-1');
  await page.waitForLoadState('domcontentloaded');

  // The dock lives in a Shadow DOM rooted at #cs-dock-root. Reach into it.
  await page.waitForFunction(
    () => !!document.getElementById('cs-dock-root')?.shadowRoot?.querySelector('.dock'),
    null,
    { timeout: 8_000 },
  );

  const dockText = await page.evaluate(() => {
    const root = document.getElementById('cs-dock-root')?.shadowRoot;
    return root?.querySelector('.dock')?.textContent?.trim() ?? '';
  });
  expect(dockText).toContain('ChatGPT');
});

test('saving a snippet with no project auto-creates "Quick Stash" and saves into it', async ({
  context,
  extensionId,
}) => {
  // We test the BACKGROUND's auto-create handling directly — sending the same
  // DOCK_SAVE_SELECTION message the dock fires. That isolates the
  // ensureActiveProject behaviour from page-selection plumbing.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);

  // Storage starts clean (fresh persistent profile per test).
  const initial = await panel.evaluate(async () => chrome.storage.local.get('projects'));
  expect(((initial.projects as unknown[]) ?? []).length).toBe(0);

  await panel.evaluate(async () => {
    chrome.runtime
      .sendMessage({
        type: 'DOCK_SAVE_SELECTION',
        payload: {
          text: 'Captured text from a real page',
          sourceUrl: 'https://example.com/article',
          sourceTitle: 'Example article',
        },
      })
      .catch(() => undefined);
  });

  const result = await panel.evaluate(async () => {
    const start = Date.now();
    while (Date.now() - start < 8_000) {
      const r = await chrome.storage.local.get(['projects', 'activeProjectId']);
      const projects =
        (r.projects as Array<{ id: string; name: string; snippets: Array<{ content: string }> }>) ?? [];
      if (projects.length === 1 && projects[0].snippets.length > 0) {
        return {
          name: projects[0].name,
          snippet: projects[0].snippets[0].content,
          activeMatches: r.activeProjectId === projects[0].id,
        };
      }
      await new Promise(res => setTimeout(res, 200));
    }
    return null;
  });
  expect(result).not.toBeNull();
  expect(result!.name).toBe('Quick Stash');
  expect(result!.snippet).toBe('Captured text from a real page');
  expect(result!.activeMatches).toBe(true);
});

test('dock position persists across reloads via localStorage', async ({ context, extensionId }) => {
  void extensionId;
  await context.route(/^https?:\/\/chatgpt\.com\//, async route => {
    if (route.request().resourceType() !== 'document') {
      return route.fulfill({ status: 404, body: '' });
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: CHATGPT_HTML });
  });

  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/dock-pos');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => !!document.getElementById('cs-dock-root')?.shadowRoot?.querySelector('.dock'),
    null,
    { timeout: 8_000 },
  );

  // Manually save a position to localStorage and reload — the dock should
  // pick it up on next mount. (Drag interactions in headless mode are
  // pointer-event-quirky; the storage path is what we actually need to
  // exercise.)
  await page.evaluate(() => {
    localStorage.setItem('cs:dock-pos:chatgpt.com', JSON.stringify({ left: 64, top: 200 }));
  });
  await page.reload();
  await page.waitForFunction(
    () => !!document.getElementById('cs-dock-root')?.shadowRoot?.querySelector('.dock'),
    null,
    { timeout: 8_000 },
  );

  const pos = await page.evaluate(() => {
    const root = document.getElementById('cs-dock-root')!;
    return { left: root.style.left, top: root.style.top, right: root.style.right, bottom: root.style.bottom };
  });
  expect(pos.left).toBe('64px');
  expect(pos.top).toBe('200px');
  expect(pos.right).toBe('auto');
  expect(pos.bottom).toBe('auto');
});

test('dock "+ Context" inject flow ranks snippets and inserts into a textarea', async ({
  context,
  extensionId,
}) => {
  // Custom mock page with a chat input + relevant snippet content already
  // seeded. We pre-load chrome.storage.local in the side panel so the
  // background's ranker has candidates.
  const INJECT_HTML = `<!doctype html><html><head><title>ChatGPT</title></head><body>
    <main>
      <textarea id="prompt-textarea" placeholder="Message"></textarea>
    </main>
  </body></html>`;
  await context.route(/^https?:\/\/chatgpt\.com\//, async route => {
    if (route.request().resourceType() !== 'document') {
      return route.fulfill({ status: 404, body: '' });
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: INJECT_HTML });
  });

  // Seed snippets via the side panel's storage so the ranker has data.
  const seedPanel = await context.newPage();
  await seedPanel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await seedPanel.evaluate(async () => {
    const projects = [
      {
        id: 'p1',
        name: 'Sourdough',
        createdAt: 0,
        snippets: [
          {
            id: 's1',
            type: 'note',
            content: 'sourdough hydration: 78% works well for an open crumb',
            label: 'hydration tip',
            timestamp: 0,
          },
          {
            id: 's2',
            type: 'note',
            content: 'completely unrelated content about car engines',
            timestamp: 0,
          },
        ],
      },
    ];
    await chrome.storage.local.set({ schemaVersion: 2, projects, activeProjectId: 'p1' });
  });
  await seedPanel.close();

  const tab = await context.newPage();
  await tab.goto('https://chatgpt.com/c/inject-test');
  await tab.waitForLoadState('domcontentloaded');
  await tab.waitForFunction(
    () => !!document.getElementById('cs-dock-root')?.shadowRoot?.querySelector('.dock'),
    null,
    { timeout: 8_000 },
  );

  // Type a prompt that uniquely matches the relevant snippet.
  await tab.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('#prompt-textarea')!;
    ta.value = 'sourdough hydration percentage';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Open dock and click "+ Context".
  await tab.evaluate(() => {
    const root = document.getElementById('cs-dock-root')?.shadowRoot;
    (root?.querySelector('.dock') as HTMLElement)?.click();
    (root?.querySelector('button[data-action="inject"]') as HTMLButtonElement)?.click();
  });

  // The picker renders inside the same shadow root.
  await tab.waitForFunction(
    () => !!document.getElementById('cs-dock-root')?.shadowRoot?.querySelector('#cs-injector'),
    null,
    { timeout: 5_000 },
  );

  // Confirm and verify the textarea now contains the context block.
  await tab.evaluate(() => {
    const root = document.getElementById('cs-dock-root')?.shadowRoot;
    (root?.querySelector('#cs-injector-confirm') as HTMLButtonElement)?.click();
  });

  const textareaContent = await tab.evaluate(() => {
    return document.querySelector<HTMLTextAreaElement>('#prompt-textarea')!.value;
  });
  expect(textareaContent).toContain('Context from Context Stash');
  expect(textareaContent).toContain('hydration');
  expect(textareaContent).toContain('sourdough hydration percentage');
  // The unrelated snippet should NOT appear in the injected content.
  expect(textareaContent).not.toContain('car engines');
});

test('dock harvest button triggers a HARVEST_CONVERSATION write', async ({ context, extensionId }) => {
  await context.route(/^https?:\/\/chatgpt\.com\//, async route => {
    if (route.request().resourceType() !== 'document') {
      return route.fulfill({ status: 404, body: '' });
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: CHATGPT_HTML });
  });

  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/dock-2');
  await page.waitForLoadState('domcontentloaded');

  await page.waitForFunction(
    () => !!document.getElementById('cs-dock-root')?.shadowRoot?.querySelector('.dock'),
    null,
    { timeout: 8_000 },
  );

  // Click the harvest action via the dock's shadow root.
  await page.evaluate(() => {
    const root = document.getElementById('cs-dock-root')?.shadowRoot;
    const dock = root?.querySelector('.dock') as HTMLElement | null;
    dock?.click(); // expand
    const harvestBtn = root?.querySelector('button[data-action="harvest"]') as HTMLButtonElement | null;
    harvestBtn?.click();
  });

  // Open the side panel and poll storage for the harvested conversation.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  const conv = await panel.evaluate(async () => {
    const start = Date.now();
    while (Date.now() - start < 8_000) {
      const r = await chrome.storage.local.get('conversations');
      const list = (r.conversations as Array<{ platformConversationId: string }>) ?? [];
      const found = list.find(c => c.platformConversationId === 'dock-2');
      if (found) return found;
      await new Promise(res => setTimeout(res, 200));
    }
    return null;
  });
  expect(conv).not.toBeNull();
});
