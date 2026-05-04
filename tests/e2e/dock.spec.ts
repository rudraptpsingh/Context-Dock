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
