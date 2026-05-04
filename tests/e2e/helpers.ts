import type { BrowserContext, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, '..', 'fixtures', name), 'utf8');
}

export async function openSidePanel(
  context: BrowserContext,
  extensionId: string,
  opts: { onboarding?: boolean } = {},
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  // Most tests want onboarding out of the way. Pre-set the dismissal flag and
  // reload so the modal never paints. Tests that explicitly cover onboarding
  // can pass { onboarding: true } to skip the pre-dismiss.
  if (opts.onboarding !== true) {
    await page.evaluate(async () => {
      await chrome.storage.local.set({ _cs_onboarding_done: Date.now() });
    });
    await page.reload();
  }
  return page;
}

/**
 * Polls chrome.storage.local in the side panel context until `predicate`
 * returns truthy or `timeoutMs` elapses. Returns whatever the predicate
 * returned on success, or undefined on timeout.
 */
export async function pollStorage<T>(
  page: Page,
  predicate: (storage: Record<string, unknown>) => T | undefined | null | false,
  timeoutMs = 8_000,
  intervalMs = 200,
): Promise<T | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await page.evaluate(async () => chrome.storage.local.get(null));
    const result = predicate(data);
    if (result) return result as T;
    await page.waitForTimeout(intervalMs);
  }
  return undefined;
}

/**
 * Routes every chatgpt.com request through `body` for `/c/<id>` URLs and
 * 404s everything else (so test traffic never leaks to the real service).
 */
export async function mockChatGPT(context: BrowserContext, body: string) {
  await context.route('**/chatgpt.com/**', async route => {
    const url = route.request().url();
    if (/\/c\/[\w-]+/.test(url)) {
      await route.fulfill({ status: 200, contentType: 'text/html', body });
    } else {
      await route.fulfill({ status: 404, body: '' });
    }
  });
}

/**
 * Routes any chat domain via `routes`. Each entry: { hostPattern, urlMatch, body }.
 * Anything that doesn't match urlMatch on a known host returns a 404.
 */
export async function mockHosts(
  context: BrowserContext,
  routes: Array<{ hostPattern: string; urlMatch: RegExp; body: string }>,
) {
  for (const r of routes) {
    await context.route(r.hostPattern, async route => {
      const url = route.request().url();
      if (r.urlMatch.test(url)) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: r.body });
      } else {
        await route.fulfill({ status: 404, body: '' });
      }
    });
  }
}

export interface PartialConversation {
  id: string;
  platform: string;
  platformConversationId: string;
  title: string;
  turns: Array<{ role: string; content: string }>;
  autoSync: boolean;
}
