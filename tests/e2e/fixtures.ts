import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default to Playwright's bundled Chromium — extension loading + service-worker
// observation is more reliable there than against system Chrome under
// automation. Pass CONTEXT_STASH_USE_SYSTEM_CHROME=1 to force system Chrome.
function chromePath(): string | undefined {
  if (process.env.CONTEXT_STASH_USE_SYSTEM_CHROME !== '1') return undefined;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  return candidates.find(p => existsSync(p));
}

const EXTENSION_PATH = resolve(__dirname, '..', '..', 'dist');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({ }, use) => {
    if (!existsSync(EXTENSION_PATH)) {
      throw new Error(
        `Extension build not found at ${EXTENSION_PATH}. Run 'npm run build' first.`,
      );
    }
    const exePath = chromePath();
    const userDataDir = mkdtempSync(join(tmpdir(), 'cs-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      executablePath: exePath,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // The service worker carries the extension id in its URL. It registers
    // lazily, so we may need to nudge it by opening any extension page first.
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      // Open about:blank just to ensure there's an active page in the context.
      // (Persistent contexts sometimes start with zero pages, which keeps the
      // SW in a registered-but-not-started state.)
      const pages = context.pages();
      if (!pages.length) {
        const p = await context.newPage();
        await p.goto('about:blank').catch(() => undefined);
      }
      worker = context.serviceWorkers()[0];
    }
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    }
    const id = new URL(worker.url()).host;
    await use(id);
  },
});

export const expect = test.expect;
