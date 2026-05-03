import { test, expect } from './fixtures';

test('the extension loads and registers a service worker', async ({ context, extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  expect(context.serviceWorkers().length).toBeGreaterThan(0);
});

test('the side panel HTML loads in a new tab', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await expect(page.locator('text=Snippets')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('text=Conversations')).toBeVisible();
});
