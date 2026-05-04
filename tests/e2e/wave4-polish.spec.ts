import { test, expect } from './fixtures';
import { loadFixture, openSidePanel } from './helpers';

const CHATGPT_HTML = loadFixture('chatgpt-mock-page.html');

test('dock launcher is a small dot until clicked; popover opens on click', async ({ context }) => {
  await context.route(/^https?:\/\/chatgpt\.com\//, async route => {
    if (route.request().resourceType() !== 'document') {
      return route.fulfill({ status: 404, body: '' });
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: CHATGPT_HTML });
  });

  const page = await context.newPage();
  await page.goto('https://chatgpt.com/c/launcher-test');
  await page.waitForFunction(
    () => !!document.getElementById('cs-dock-root')?.shadowRoot?.querySelector('.launcher'),
    null,
    { timeout: 8_000 },
  );

  // Default state: launcher visible, popover hidden.
  const visibility = await page.evaluate(() => {
    const root = document.getElementById('cs-dock-root')?.shadowRoot;
    const launcher = root?.querySelector('.launcher') as HTMLElement | null;
    const popover = root?.querySelector('.popover') as HTMLElement | null;
    return {
      hasLauncher: !!launcher,
      launcherDisplay: launcher && getComputedStyle(launcher).display,
      popoverDisplay: popover && getComputedStyle(popover).display,
    };
  });
  expect(visibility.hasLauncher).toBe(true);
  expect(visibility.popoverDisplay).toBe('none');

  // Tap the launcher; popover appears, launcher hides.
  await page.evaluate(() => {
    const root = document.getElementById('cs-dock-root')?.shadowRoot;
    const launcher = root?.querySelector('.launcher') as HTMLElement | null;
    launcher?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  const afterTap = await page.evaluate(() => {
    const root = document.getElementById('cs-dock-root')?.shadowRoot;
    const launcher = root?.querySelector('.launcher') as HTMLElement | null;
    const popover = root?.querySelector('.popover') as HTMLElement | null;
    return {
      launcherDisplay: launcher && getComputedStyle(launcher).display,
      popoverDisplay: popover && getComputedStyle(popover).display,
    };
  });
  expect(afterTap.launcherDisplay).toBe('none');
  expect(afterTap.popoverDisplay).toBe('block');
});

test('pin conversation: pinned rows float to the top', async ({ context, extensionId }) => {
  const panel = await openSidePanel(context, extensionId);

  await panel.evaluate(async () => {
    const mk = (id: string, title: string, lastSyncedAt: number, pinned = false) => ({
      id,
      platform: 'chatgpt',
      platformConversationId: id,
      title,
      url: `https://chatgpt.com/c/${id}`,
      turns: [{ id: 't', role: 'user', content: title, createdAt: 0 }],
      tags: [],
      createdAt: 0,
      lastSyncedAt,
      autoSync: false,
      contentHash: 'h-' + id,
      pinned,
    });
    const now = Date.now();
    await chrome.storage.local.set({
      schemaVersion: 2,
      // Pre-dismiss onboarding so it doesn't get in the way of this test.
      _cs_onboarding_done: now,
      conversations: [
        mk('a', 'Recent unpinned', now),
        mk('b', 'Older but pinned', now - 100_000, true),
        mk('c', 'Recent unpinned 2', now - 1_000),
      ],
    });
  });
  await panel.reload();

  await panel.getByRole('button', { name: /Conversations/ }).click();
  await expect(panel.getByText('Older but pinned')).toBeVisible({ timeout: 8_000 });

  // First row in the rendered list (under the search bar) should be the pinned one.
  const firstTitle = await panel.evaluate(() => {
    const items = Array.from(document.querySelectorAll('li'));
    const first = items.find(li => li.textContent?.includes('pinned') || li.textContent?.includes('Recent'));
    return first?.querySelector('.text-sm.font-semibold')?.textContent ?? '';
  });
  expect(firstTitle).toContain('Older but pinned');
});

test('first-run onboarding modal appears, persists dismissal', async ({ context, extensionId }) => {
  const panel = await openSidePanel(context, extensionId, { onboarding: true });

  // Modal should be on the screen on a fresh profile.
  await expect(panel.getByText('Welcome to Context Stash')).toBeVisible({ timeout: 5_000 });
  await panel.getByRole('button', { name: 'Skip onboarding tour' }).click();
  await expect(panel.getByText('Welcome to Context Stash')).toHaveCount(0);

  // Reload and confirm it doesn't reappear.
  await panel.reload();
  await expect(panel.getByText('Welcome to Context Stash')).toHaveCount(0, { timeout: 3_000 });
});
