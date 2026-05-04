import { test, expect } from './fixtures';
import { loadFixture, mockHosts, openSidePanel, pollStorage, type PartialConversation } from './helpers';

const CHATGPT_HTML = loadFixture('chatgpt-mock-page.html');
const CLAUDE_HTML = loadFixture('claude-mock-page.html');
const GEMINI_HTML = loadFixture('gemini-mock-page.html');
const PERPLEXITY_HTML = loadFixture('perplexity-mock-page.html');

test('harvester captures conversations from all four platforms', async ({ context, extensionId }) => {
  // Use regex routes so any document request to a chat host (incl. quirky
  // Perplexity behaviour where the URL gets rewritten to /?) gets the right
  // mock body. We only intercept main-frame navigations — sub-resource
  // requests (favicon etc.) just fall through to the network and 404 there.
  const routes: Array<[RegExp, string]> = [
    [/^https?:\/\/(chatgpt\.com|chat\.openai\.com)\//, CHATGPT_HTML],
    [/^https?:\/\/(www\.)?claude\.ai\//, CLAUDE_HTML],
    [/^https?:\/\/gemini\.google\.com\//, GEMINI_HTML],
    [/^https?:\/\/(www\.)?perplexity\.ai\//, PERPLEXITY_HTML],
  ];
  for (const [re, body] of routes) {
    await context.route(re, async route => {
      const req = route.request();
      if (req.resourceType() !== 'document') {
        return route.fulfill({ status: 404, body: '' });
      }
      await route.fulfill({ status: 200, contentType: 'text/html', body });
    });
  }
  // Suppress mockHosts (kept around for other specs) by referencing it in this scope.
  void mockHosts;

  const tabs = await Promise.all([
    context.newPage().then(p => p.goto('https://chatgpt.com/c/multi-cgpt').then(() => p)),
    context.newPage().then(p => p.goto('https://claude.ai/chat/multi-claude').then(() => p)),
    context.newPage().then(p => p.goto('https://gemini.google.com/app').then(() => p)),
    context.newPage().then(p => p.goto('https://www.perplexity.ai/search/multi-ppx').then(() => p)),
  ]);
  for (const t of tabs) await t.waitForLoadState('domcontentloaded');

  const sidePanel = await openSidePanel(context, extensionId);
  await sidePanel.waitForTimeout(2000); // give all four content scripts time to attach

  // URL filters live in host_permissions, so we don't need the broad `tabs`
  // permission to enumerate them.
  await sidePanel.evaluate(async () => {
    const patterns = [
      '*://chatgpt.com/*',
      '*://claude.ai/*',
      '*://gemini.google.com/*',
      '*://*.perplexity.ai/*',
    ];
    const tabs: chrome.tabs.Tab[] = [];
    for (const url of patterns) tabs.push(...(await chrome.tabs.query({ url })));
    for (const t of tabs) {
      if (t.id) chrome.tabs.sendMessage(t.id, { type: 'HARVEST_REQUEST' }).catch(() => undefined);
      await new Promise(r => setTimeout(r, 300));
    }
  });

  const list = await pollStorage<PartialConversation[]>(
    sidePanel,
    data => {
      const l = (data.conversations as PartialConversation[]) ?? [];
      return l.length === 4 ? l : undefined;
    },
    15_000,
  );

  expect(list).toBeDefined();
  const platforms = (list ?? []).map(c => c.platform).sort();
  expect(platforms).toEqual(['chatgpt', 'claude', 'gemini', 'perplexity']);

  const byPlatform = Object.fromEntries((list ?? []).map(c => [c.platform, c]));
  expect(byPlatform.chatgpt.turns[0].content).toContain('meaning of life');
  expect(byPlatform.claude.turns[0].content).toContain('sourdough');
  expect(byPlatform.gemini.turns[0].content).toContain('Model Context Protocol');
  expect(byPlatform.perplexity.turns[0].content).toContain('Native Messaging');

  // Each conversation has both roles represented.
  for (const c of list!) {
    const roles = new Set(c.turns.map(t => t.role));
    expect(roles.has('user')).toBe(true);
    expect(roles.has('assistant')).toBe(true);
  }
});
