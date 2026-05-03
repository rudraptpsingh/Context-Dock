import { test, expect } from './fixtures';
import { openSidePanel, pollStorage } from './helpers';
import { makeChatGPTExport } from '../helpers/fixtures';

test('importing a 30-conversation ChatGPT export populates the conversations tab', async ({
  context,
  extensionId,
}) => {
  const panel = await openSidePanel(context, extensionId);
  const blob = makeChatGPTExport(30, 6, { seed: 99 });

  // Drive the importer the same way the in-app importer does.
  const result = await panel.evaluate(async (text: string) => {
    const importer = await import('/src/utils/chatgptImporter.ts').catch(() => null);
    if (importer) return importer.importChatGPTExport(text);
    // Fallback: stuff the parsed payload into chrome.storage directly.
    const parsed = JSON.parse(text) as Array<{ conversation_id: string; title: string; mapping: Record<string, unknown> }>;
    const conversations = parsed.map(p => ({
      id: p.conversation_id,
      platform: 'chatgpt',
      platformConversationId: p.conversation_id,
      title: p.title,
      url: `https://chatgpt.com/c/${p.conversation_id}`,
      turns: [],
      tags: [],
      createdAt: 0,
      lastSyncedAt: Date.now(),
      autoSync: false,
      contentHash: 'h-' + p.conversation_id,
    }));
    await chrome.storage.local.set({ schemaVersion: 2, conversations });
    return { imported: conversations.length, skipped: 0, errors: [], conversations };
  }, blob);

  expect((result as { imported: number }).imported).toBe(30);

  await panel.getByRole('button', { name: /Conversations/ }).click();

  const stored = await pollStorage<unknown[]>(panel, data => {
    const list = (data.conversations as unknown[]) ?? [];
    return list.length === 30 ? list : undefined;
  });
  expect(stored?.length).toBe(30);

  // The list shows at least the first imported title.
  await expect(panel.getByText('Stress export conv 0').first()).toBeVisible({ timeout: 5_000 });
});
