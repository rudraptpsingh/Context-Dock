import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MOCK_HTML = readFileSync(
  resolve(__dirname, '..', 'fixtures', 'chatgpt-mock-page.html'),
  'utf8',
);

test('harvester captures turns from a mocked ChatGPT page and writes to chrome.storage', async ({
  context,
  extensionId,
}) => {
  // Intercept all chatgpt.com requests and serve our static fixture from the
  // conversation URL. Anything else 404s — we don't want network leakage.
  await context.route('**/chatgpt.com/**', async route => {
    const url = route.request().url();
    if (/\/c\/[\w-]+/.test(url)) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: MOCK_HTML });
    } else {
      await route.fulfill({ status: 404, body: '' });
    }
  });

  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/e2e-test-1');

  // Side panel: read the conversations list out of chrome.storage.local. We
  // wait for the user-initiated harvest message to land via the runtime API.
  const sidePanel = await context.newPage();
  await sidePanel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);

  // Trigger a user-initiated harvest by sending a runtime message into the
  // chat tab (this is what the context-menu / keyboard shortcut do).
  await sidePanel.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: '*://chatgpt.com/*' });
    if (tabs[0]?.id) {
      await chrome.tabs.sendMessage(tabs[0].id, { type: 'HARVEST_REQUEST' });
    }
  });

  // Poll storage until the conversation appears (or we time out).
  const conversations = await sidePanel.evaluate(async () => {
    const start = Date.now();
    while (Date.now() - start < 8_000) {
      const r = await chrome.storage.local.get('conversations');
      const list = r.conversations ?? [];
      if (list.length > 0) return list;
      await new Promise(res => setTimeout(res, 200));
    }
    return [];
  });

  expect(Array.isArray(conversations)).toBe(true);
  expect(conversations.length).toBe(1);
  const conv = conversations[0];
  expect(conv.platform).toBe('chatgpt');
  expect(conv.platformConversationId).toBe('e2e-test-1');
  expect(conv.title).toBe('E2E mock thread');
  expect(conv.turns).toHaveLength(2);
  expect(conv.turns[0].role).toBe('user');
  expect(conv.turns[0].content).toBe('What is the meaning of life?');
  expect(conv.turns[1].role).toBe('assistant');
  expect(conv.turns[1].content).toBe('42, according to Adams.');
  expect(conv.autoSync).toBe(false); // off by default
});
