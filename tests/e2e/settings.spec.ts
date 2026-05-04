import { test, expect } from './fixtures';
import { openSidePanel } from './helpers';

test('settings tab: opens General + Diagnostics, exposes auto-sync toggle and AI status', async ({
  context,
  extensionId,
}) => {
  const panel = await openSidePanel(context, extensionId);

  // The Settings tab is a gear icon next to Conversations. Click it via aria-label.
  await panel.getByRole('button', { name: 'Settings' }).click();

  await expect(panel.getByText(/Master kill-switch/)).toBeVisible({ timeout: 5_000 });
  await expect(panel.getByText('Open setup wizard')).toBeVisible();
  await expect(panel.getByText('Wipe all data')).toBeVisible();

  // Diagnostics sub-tab.
  await panel.getByRole('button', { name: 'Diagnostics' }).click();
  await expect(panel.getByText('Built-in Summarizer')).toBeVisible({ timeout: 5_000 });
  await expect(panel.getByText('Built-in LanguageModel')).toBeVisible();
});

test('conversation list shows "updated" badge when lastSyncedAt > lastViewedAt', async ({
  context,
  extensionId,
}) => {
  const panel = await openSidePanel(context, extensionId);

  await panel.evaluate(async () => {
    const now = Date.now();
    const conv = {
      id: 'updated-test',
      platform: 'chatgpt',
      platformConversationId: 'updated-test',
      title: 'Updated since you looked at it',
      url: 'https://chatgpt.com/c/updated-test',
      turns: [{ id: 't', role: 'user', content: 'q', createdAt: 0 }],
      tags: [],
      createdAt: 0,
      lastSyncedAt: now,
      lastViewedAt: now - 10_000,
      autoSync: true,
      contentHash: 'h',
    };
    await chrome.storage.local.set({ schemaVersion: 2, conversations: [conv] });
  });
  await panel.reload();

  await panel.getByRole('button', { name: /Conversations/ }).click();
  await expect(panel.getByText('Updated since you looked at it')).toBeVisible({ timeout: 10_000 });
  // Badge has a title attribute we can target unambiguously.
  await expect(panel.getByTitle('Updated since you last opened this conversation')).toBeVisible();
});
