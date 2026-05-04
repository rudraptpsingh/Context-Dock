import { test, expect } from './fixtures';
import { loadFixture, mockChatGPT, openSidePanel, pollStorage, type PartialConversation } from './helpers';

const STREAMING_HTML = loadFixture('chatgpt-streaming-page.html');

test('auto-sync OFF: streaming updates do not write to storage', async ({ context, extensionId }) => {
  await mockChatGPT(context, STREAMING_HTML);
  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/auto-off-1');

  // Append some "tokens" — without auto-sync enabled the harvester should ignore them.
  await page.evaluate(() => {
    (window as unknown as { __cs_stream_append: (s: string) => void }).__cs_stream_append('Token A. ');
    (window as unknown as { __cs_stream_append: (s: string) => void }).__cs_stream_append('Token B. ');
  });

  const sidePanel = await openSidePanel(context, extensionId);
  // Give the observer time to (not) fire.
  await sidePanel.waitForTimeout(2000);

  const data = await sidePanel.evaluate(async () => chrome.storage.local.get('conversations'));
  expect(((data.conversations as unknown[]) ?? []).length).toBe(0);
});

test('auto-sync ON: appended turns trigger a debounced emit and persist', async ({ context, extensionId }) => {
  await mockChatGPT(context, STREAMING_HTML);
  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/auto-on-1');

  const sidePanel = await openSidePanel(context, extensionId);

  // 1) User-initiates the first harvest (creates the conversation row).
  await sidePanel.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: '*://chatgpt.com/*' });
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'HARVEST_REQUEST' }).catch(() => undefined);
    }
  });
  const initial = await pollStorage<PartialConversation>(sidePanel, data => {
    const list = (data.conversations as PartialConversation[]) ?? [];
    return list[0];
  });
  expect(initial).toBeDefined();
  expect(initial!.turns).toHaveLength(1); // assistant bubble starts empty, only the user turn has content

  // 2) Enable auto-sync on this conversation. The harvester listens to
  //    chrome.storage.onChanged to refresh its in-memory flag map; give it a
  //    beat to propagate before we start streaming.
  await sidePanel.evaluate(async (id: string) => {
    const r = await chrome.storage.local.get(['conversations', 'settings']);
    const conversations = (r.conversations as Array<{ id: string; autoSync: boolean }>).map(c =>
      c.id === id ? { ...c, autoSync: true } : c,
    );
    const settings = { ...(r.settings as Record<string, unknown>), autoSyncEnabled: true };
    await chrome.storage.local.set({ conversations, settings });
  }, initial!.id);
  await page.waitForTimeout(500);

  // 3) Stream tokens into the assistant bubble. The harvester's MutationObserver
  //    + debounce should coalesce these into one emit when streaming ends.
  for (let i = 0; i < 6; i++) {
    await page.evaluate(chunk => {
      (window as unknown as { __cs_stream_append: (s: string, o?: object) => void }).__cs_stream_append(chunk, {
        streaming: true,
      });
    }, `chunk-${i} `);
    await page.waitForTimeout(80);
  }
  // End streaming (hide the stop button so isStreamingPartial returns false).
  await page.evaluate(() => {
    (window as unknown as { __cs_stream_append: (s: string, o?: object) => void }).__cs_stream_append('', {
      streaming: false,
    });
  });

  // 4) Poll for the assistant turn to appear with all chunks concatenated.
  const updated = await pollStorage<PartialConversation>(
    sidePanel,
    data => {
      const conv = ((data.conversations as PartialConversation[]) ?? []).find(c => c.id === initial!.id);
      return conv && conv.turns.length === 2 ? conv : undefined;
    },
    8_000,
  );
  expect(updated).toBeDefined();
  const assistantText = updated!.turns[1].content;
  expect(assistantText).toContain('chunk-0');
  expect(assistantText).toContain('chunk-5');
  expect(updated!.turns[1].role).toBe('assistant');
});
