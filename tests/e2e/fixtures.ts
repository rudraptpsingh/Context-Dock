import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Locates the system Chrome binary so we don't need Playwright's bundled one.
function systemChromePath(): string | undefined {
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
    const chromePath = systemChromePath();
    const userDataDir = mkdtempSync(join(tmpdir(), 'cs-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      executablePath: chromePath,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=DialMediaRouteProvider',
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // The service worker (or background page) carries the extension id in its URL.
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 10_000 });
    }
    const id = new URL(worker.url()).host;
    await use(id);
  },
});

export const expect = test.expect;
