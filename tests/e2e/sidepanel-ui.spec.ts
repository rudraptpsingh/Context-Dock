import { test, expect } from './fixtures';
import { openSidePanel, pollStorage } from './helpers';

test('side panel: switch tabs, create project via API, snippets list reflects', async ({
  context,
  extensionId,
}) => {
  const panel = await openSidePanel(context, extensionId);

  // Default tab is Snippets, with the no-project empty state.
  await expect(panel.getByText('Create your first project')).toBeVisible({ timeout: 5_000 });

  // Switch to Conversations tab.
  await panel.getByRole('button', { name: /Conversations/ }).click();
  await expect(panel.getByText(/No conversations yet/i)).toBeVisible();

  // Switch back, then seed a project + snippet via storage and confirm UI updates.
  await panel.getByRole('button', { name: 'Snippets' }).click();
  await panel.evaluate(async () => {
    const project = {
      id: 'p-ui-1',
      name: 'UI test',
      createdAt: Date.now(),
      snippets: [
        {
          id: 'snip-1',
          type: 'note' as const,
          content: 'Persisted note from the UI test',
          timestamp: Date.now(),
        },
      ],
    };
    await chrome.storage.local.set({ projects: [project], activeProjectId: project.id });
  });

  await expect(panel.getByText('Persisted note from the UI test')).toBeVisible({ timeout: 5_000 });
});

test('side panel: Wipe button clears all conversations', async ({ context, extensionId }) => {
  const panel = await openSidePanel(context, extensionId);

  await panel.evaluate(async () => {
    const conv = {
      id: 'wipe-me',
      platform: 'chatgpt',
      platformConversationId: 'wipe-me',
      title: 'Soon to be wiped',
      url: 'https://chatgpt.com/c/wipe-me',
      turns: [{ id: 't', role: 'user', content: 'hi', createdAt: 0 }],
      tags: [],
      createdAt: 0,
      lastSyncedAt: 0,
      autoSync: false,
      contentHash: 'h',
    };
    await chrome.storage.local.set({ schemaVersion: 2, conversations: [conv] });
  });

  await panel.getByRole('button', { name: /Conversations/ }).click();
  await expect(panel.getByText('Soon to be wiped')).toBeVisible({ timeout: 5_000 });

  // Auto-accept the confirm() dialog the wipe button triggers.
  panel.once('dialog', dialog => dialog.accept());
  await panel.getByRole('button', { name: /Wipe/ }).click();

  const empty = await pollStorage(panel, data => {
    const list = (data.conversations as unknown[]) ?? [];
    return list.length === 0 ? true : undefined;
  });
  expect(empty).toBe(true);
});

test('side panel: search box filters the conversation list', async ({ context, extensionId }) => {
  const panel = await openSidePanel(context, extensionId);

  await panel.evaluate(async () => {
    const mk = (id: string, title: string) => ({
      id,
      platform: 'chatgpt' as const,
      platformConversationId: id,
      title,
      url: `https://chatgpt.com/c/${id}`,
      turns: [{ id: 't', role: 'user' as const, content: title, createdAt: 0 }],
      tags: [],
      createdAt: 0,
      lastSyncedAt: 0,
      autoSync: false,
      contentHash: 'h-' + id,
    });
    await chrome.storage.local.set({
      schemaVersion: 2,
      conversations: [mk('a', 'Alpha launch plan'), mk('b', 'Beta launch plan'), mk('c', 'Recipes')],
    });
  });
  // Storage change subscription is sometimes laggy in CI Chrome — reload
  // so the React tree boots with the seeded data already present.
  await panel.reload();

  await panel.getByRole('button', { name: /Conversations/ }).click();
  await expect(panel.getByText('Alpha launch plan')).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText('Recipes')).toBeVisible();

  await panel.getByPlaceholder('Search conversations...').fill('launch');
  await expect(panel.getByText('Alpha launch plan')).toBeVisible();
  await expect(panel.getByText('Beta launch plan')).toBeVisible();
  await expect(panel.getByText('Recipes')).toHaveCount(0);
});
