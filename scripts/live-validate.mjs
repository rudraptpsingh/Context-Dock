#!/usr/bin/env node
// Live-driven validation of platform adapters against your real chat history.
//
// Launches a Playwright Chromium with a *persistent* user-data dir so your
// logins survive between runs. First time: it opens browser windows for each
// platform — log in once, then re-run; the script will find your conversation
// list and validate the adapter against the rendered DOM of the most recent
// thread.
//
// Per platform we:
//   1. Navigate to the chat root.
//   2. Wait for the conversation history sidebar.
//   3. Grab the link to the most recent conversation.
//   4. Click it, wait for the messages to render.
//   5. Inject the platform adapter, run extractTurns + parseConversationId.
//   6. Print a per-platform report and save the captured DOM to
//      tests/fixtures/real/<platform>/live-<timestamp>.html for offline
//      regression checks.
//
// Notes:
//   - The persistent profile is at ./.live-profile (gitignored). It's NOT
//     your real Chrome profile — Chrome locks that — but you only have to log
//     in once per platform here.
//   - If you'd rather use your real Chrome profile, close Chrome first and
//     pass --user-data-dir=/path/to/your/profile (or set CONTEXT_STASH_USER_DIR).
//   - Adapters are loaded from src/ via tsx so changes pick up without a
//     rebuild.

import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const PROFILE_DIR = process.env.CONTEXT_STASH_USER_DIR ?? join(ROOT, '.live-profile');
const FIXTURE_ROOT = join(ROOT, 'tests', 'fixtures', 'real');

const PLATFORMS = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    landing: 'https://chatgpt.com/',
    // Wait for the sidebar's most-recent conversation link.
    historyLinkSelector: 'a[href^="/c/"]',
    expectAfterClick: '[data-message-id]',
  },
  {
    id: 'claude',
    label: 'Claude',
    landing: 'https://claude.ai/',
    historyLinkSelector: 'a[href^="/chat/"]',
    expectAfterClick: '[data-test-render-count] [class*="font-user-message"], [data-testid="user-message"]',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    landing: 'https://gemini.google.com/app',
    historyLinkSelector: '[data-test-id="conversation"], [class*="conversation-"]',
    expectAfterClick: '.user-message-bubble-color, [class*="user-query"]',
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    landing: 'https://www.perplexity.ai/',
    historyLinkSelector: 'a[href^="/search/"]',
    expectAfterClick: '[data-testid="answer"], [class*="prose"]',
  },
];

async function loadAdapters() {
  const tsx = await import('tsx/esm/api');
  return {
    chatgpt: (await tsx.tsImport(`${ROOT}/src/content/platforms/chatgpt.ts`, import.meta.url)).default,
    claude: (await tsx.tsImport(`${ROOT}/src/content/platforms/claude.ts`, import.meta.url)).default,
    gemini: (await tsx.tsImport(`${ROOT}/src/content/platforms/gemini.ts`, import.meta.url)).default,
    perplexity: (await tsx.tsImport(`${ROOT}/src/content/platforms/perplexity.ts`, import.meta.url)).default,
  };
}

function ellipsis(s, n = 80) {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

async function validatePlatform(context, adapters, platform) {
  const adapter = adapters[platform.id];
  if (!adapter) {
    return { id: platform.id, status: 'skip', reason: 'no adapter loaded' };
  }
  const page = await context.newPage();
  try {
    await page.goto(platform.landing, { waitUntil: 'domcontentloaded' });

    // First-run UX: if we're stuck on a login page, give the user up to 3
    // minutes to authenticate manually before we move on.
    const isLoggedIn = await page.locator(platform.historyLinkSelector).first().isVisible({ timeout: 1000 }).catch(() => false);
    if (!isLoggedIn) {
      console.log(`[${platform.id}] not logged in — please log in manually within 3 minutes`);
      try {
        await page.waitForSelector(platform.historyLinkSelector, { timeout: 180_000 });
      } catch {
        return { id: platform.id, status: 'skip', reason: 'no conversation history detected (login timed out?)' };
      }
    }

    // Click the most recent conversation in the sidebar.
    const link = page.locator(platform.historyLinkSelector).first();
    const href = await link.getAttribute('href');
    await link.click({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForSelector(platform.expectAfterClick, { timeout: 15_000 }).catch(() => undefined);
    // Allow streaming/late renders to settle.
    await page.waitForTimeout(1_500);

    const url = page.url();
    const html = await page.content();

    // Run the adapter inside the page context. We use page.evaluate to
    // operate on the live document; that's what the real content script does.
    const adapterSource = await page.evaluate(() => null); // sanity ping
    void adapterSource;

    // Easier path: pull the rendered DOM into Node, parse with jsdom, run
    // the adapter against that. Matches what the offline validator does.
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(html, { url });
    const w = dom.window;
    const convId = adapter.parseConversationId(w.location);
    const title = adapter.getTitle(w.document);
    const turns = adapter.extractTurns(w.document);
    const roles = new Set(turns.map(t => t.role));
    const firstUser = turns.find(t => t.role === 'user');
    const firstAsst = turns.find(t => t.role === 'assistant');

    // Save the captured DOM as a regression fixture.
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const fixtureDir = join(FIXTURE_ROOT, platform.id);
    mkdirSync(fixtureDir, { recursive: true });
    const fixturePath = join(fixtureDir, `live-${ts}.html`);
    writeFileSync(
      fixturePath,
      `<!doctype html>\n<!-- captured ${new Date().toISOString()} from ${url} -->\n${html}`,
      'utf8',
    );

    return {
      id: platform.id,
      status: turns.length > 0 && roles.has('user') && roles.has('assistant') ? 'ok' : 'fail',
      url,
      href,
      convId,
      title,
      turnCount: turns.length,
      roles: [...roles].sort(),
      firstUser: ellipsis(firstUser?.content),
      firstAsst: ellipsis(firstAsst?.content),
      fixturePath: fixturePath.replace(ROOT + '/', ''),
    };
  } catch (err) {
    return {
      id: platform.id,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('Live-validating Context Stash adapters against real chat pages.');
  console.log(`Profile dir: ${PROFILE_DIR}`);
  console.log('First time: log in to each platform when its window opens; the script will resume.\n');

  const adapters = await loadAdapters();
  mkdirSync(PROFILE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  const results = [];
  for (const platform of PLATFORMS) {
    console.log(`\n--- ${platform.label} ---`);
    const result = await validatePlatform(context, adapters, platform);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  await context.close();

  console.log('\n========== Summary ==========');
  for (const r of results) {
    const emoji = r.status === 'ok' ? '✓' : r.status === 'skip' ? '·' : '✗';
    const line = r.status === 'ok'
      ? `${r.turnCount} turns, roles=${r.roles.join('+')}, convId=${r.convId ?? 'null'}`
      : r.reason || r.error || 'failed';
    console.log(`${emoji} ${r.id.padEnd(11)} ${line}`);
  }
  const ok = results.every(r => r.status === 'ok' || r.status === 'skip');
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
