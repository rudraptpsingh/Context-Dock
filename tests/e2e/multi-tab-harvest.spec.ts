import { test, expect } from './fixtures';
import { loadFixture, mockChatGPT, openSidePanel, pollStorage, type PartialConversation } from './helpers';

const MOCK_HTML = loadFixture('chatgpt-mock-page.html');

test('two chat tabs harvest into two distinct conversations; re-harvesting either is a no-op upsert', async ({
  context,
  extensionId,
}) => {
  await mockChatGPT(context, MOCK_HTML);
  const tabA = await context.newPage();
  await tabA.goto('https://chatgpt.com/c/multi-a');
  await tabA.waitForLoadState('domcontentloaded');
  const tabB = await context.newPage();
  await tabB.goto('https://chatgpt.com/c/multi-b');
  await tabB.waitForLoadState('domcontentloaded');

  const sidePanel = await openSidePanel(context, extensionId);
  // Give both content scripts time to register their message listeners.
  // Harvester runs at document_idle, so we wait a touch longer than DCL.
  await sidePanel.waitForTimeout(1500);

  // Harvest both tabs, with a tiny gap between sends so the background can
  // upsert one before the next arrives (the in-memory mock doesn't serialise).
  await sidePanel.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: '*://chatgpt.com/*' });
    for (const t of tabs) {
      if (t.id) chrome.tabs.sendMessage(t.id, { type: 'HARVEST_REQUEST' }).catch(() => undefined);
      await new Promise(r => setTimeout(r, 250));
    }
  });

  const list = await pollStorage<PartialConversation[]>(
    sidePanel,
    data => {
      const l = (data.conversations as PartialConversation[]) ?? [];
      return l.length === 2 ? l : undefined;
    },
    10_000,
  );

  expect(list).toBeDefined();
  const ids = (list ?? []).map(c => c.platformConversationId).sort();
  expect(ids).toEqual(['multi-a', 'multi-b']);

  // Re-harvest both: upsert should not duplicate rows.
  await sidePanel.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: '*://chatgpt.com/*' });
    for (const t of tabs) {
      if (t.id) chrome.tabs.sendMessage(t.id, { type: 'HARVEST_REQUEST' }).catch(() => undefined);
    }
  });
  await sidePanel.waitForTimeout(1500);
  const after = await sidePanel.evaluate(async () => chrome.storage.local.get('conversations'));
  expect(((after.conversations as unknown[]) ?? []).length).toBe(2);
});
