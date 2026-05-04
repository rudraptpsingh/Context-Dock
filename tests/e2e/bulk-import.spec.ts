import { test, expect } from './fixtures';
import { openSidePanel, pollStorage, type PartialConversation } from './helpers';

const MOCK_PAGE = `<!doctype html><html><head><title>ChatGPT</title></head><body><main></main></body></html>`;

test('one-click bulk import: mocked ChatGPT API populates 4 conversations', async ({
  context,
  extensionId,
}) => {
  // Intercept everything chatgpt.com:
  //   - main-frame document gets a tiny page so the content script attaches
  //   - /api/auth/session returns an accessToken so the importer is "authed"
  //   - /backend-api/conversations lists 4 ids, paged
  //   - /backend-api/conversation/<id> returns a minimal mapping per id
  await context.route(/^https?:\/\/chatgpt\.com\//, async route => {
    const req = route.request();
    const url = req.url();
    const u = new URL(url);

    if (req.resourceType() === 'document') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: MOCK_PAGE });
    }
    if (u.pathname === '/api/auth/session') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: 'tok' }) });
    }
    if (u.pathname === '/backend-api/conversations') {
      const offset = Number(u.searchParams.get('offset') ?? '0');
      const items =
        offset === 0
          ? Array.from({ length: 4 }, (_, i) => ({
              id: `bulk-${i}`,
              title: `Bulk thread ${i}`,
              update_time: 1_700_000_000 + i,
            }))
          : [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items, total: 4 }),
      });
    }
    const m = u.pathname.match(/^\/backend-api\/conversation\/(.+)$/);
    if (m) {
      const id = m[1];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title: `Bulk thread ${id}`,
          create_time: 1_700_000_000,
          mapping: {
            root: { id: 'root', parent: null, children: ['m0'] },
            m0: {
              id: 'm0',
              parent: 'root',
              children: ['m1'],
              message: {
                id: 'm0',
                author: { role: 'user' },
                content: { content_type: 'text', parts: [`question for ${id}`] },
                create_time: 1_700_000_000,
              },
            },
            m1: {
              id: 'm1',
              parent: 'm0',
              children: [],
              message: {
                id: 'm1',
                author: { role: 'assistant' },
                content: { content_type: 'text', parts: [`answer for ${id}`] },
                create_time: 1_700_000_001,
                metadata: { model_slug: 'gpt-4o' },
              },
            },
          },
        }),
      });
    }
    return route.fulfill({ status: 404, body: '' });
  });

  // Open chatgpt.com so the content script + bulk-import listener attach.
  const tab = await context.newPage();
  await tab.goto('https://chatgpt.com/');
  await tab.waitForLoadState('domcontentloaded');

  // Drive the import from the chatgpt.com tab itself (sends to background,
  // which forwards back to this same tab — exact same path the side panel
  // would use via START_BULK_IMPORT, just one extra hop). Doing it here
  // avoids racing the side panel page's React tree against a flurry of
  // HARVEST_CONVERSATION storage changes.
  await tab.waitForTimeout(1_500); // let the content scripts settle
  // The bulk-import content script listens for a CustomEvent so we can
  // trigger it from the page's main world (chrome.runtime isn't reachable
  // from main-world page.evaluate calls).
  await tab.evaluate(() => {
    window.dispatchEvent(new CustomEvent('cs:start-bulk-import'));
  });

  const sidePanel = await openSidePanel(context, extensionId);
  const list = await pollStorage<PartialConversation[]>(
    sidePanel,
    data => {
      const l = (data.conversations as PartialConversation[]) ?? [];
      return l.length === 4 ? l : undefined;
    },
    20_000,
  );
  expect(list).toBeDefined();
  const titles = (list ?? []).map(c => c.title).sort();
  expect(titles).toEqual(['Bulk thread bulk-0', 'Bulk thread bulk-1', 'Bulk thread bulk-2', 'Bulk thread bulk-3']);
  // Each one captured both turns.
  for (const c of list ?? []) {
    expect(c.turns).toHaveLength(2);
    expect(c.turns[0].role).toBe('user');
    expect(c.turns[1].role).toBe('assistant');
  }
});
