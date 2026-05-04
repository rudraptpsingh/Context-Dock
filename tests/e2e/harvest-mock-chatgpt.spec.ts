import { test, expect } from './fixtures';
import { loadFixture, mockChatGPT, openSidePanel, pollStorage, type PartialConversation } from './helpers';

const MOCK_HTML = loadFixture('chatgpt-mock-page.html');

test('harvester captures turns from a mocked ChatGPT page and writes to chrome.storage', async ({
  context,
  extensionId,
}) => {
  await mockChatGPT(context, MOCK_HTML);

  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/e2e-test-1');

  const sidePanel = await openSidePanel(context, extensionId);
  await sidePanel.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: '*://chatgpt.com/*' });
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'HARVEST_REQUEST' }).catch(() => undefined);
    }
  });

  const conv = await pollStorage<PartialConversation>(sidePanel, data => {
    const list = (data.conversations as PartialConversation[]) ?? [];
    return list[0];
  });

  expect(conv).toBeDefined();
  expect(conv!.platform).toBe('chatgpt');
  expect(conv!.platformConversationId).toBe('e2e-test-1');
  expect(conv!.title).toBe('E2E mock thread');
  expect(conv!.turns).toHaveLength(2);
  expect(conv!.turns[0].role).toBe('user');
  expect(conv!.turns[0].content).toBe('What is the meaning of life?');
  expect(conv!.turns[1].role).toBe('assistant');
  expect(conv!.turns[1].content).toBe('42, according to Adams.');
  expect(conv!.autoSync).toBe(false);
});
