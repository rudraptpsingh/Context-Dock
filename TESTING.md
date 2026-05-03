# Testing

## Layers

1. **Unit (Vitest + jsdom)** — pure-logic and DOM-extraction tests. Run in
   under a second; safe to run on every save.
2. **E2E (Playwright + system Chrome)** — loads the unpacked extension into
   Chrome, drives a mocked ChatGPT page, asserts that the harvester writes
   the captured turns into `chrome.storage.local`.
3. **Build smoke** — `npm run build` (extension) and
   `cd mcp-server && npm run build` (MCP server). Both must be green for any
   commit.

## Commands

```bash
npm run build         # extension: tsc + vite build
npm run test:unit     # vitest run (fast)
npm run test:watch    # vitest watch
npm run test:e2e      # playwright test (requires built dist/ + system Chrome)
npm run test          # unit + e2e
```

```bash
cd mcp-server && npm run build      # tsc
```

## E2E: how the harvester is exercised without hitting real ChatGPT

`tests/e2e/harvest-mock-chatgpt.spec.ts` uses Playwright's `context.route` to
intercept every request to `chatgpt.com` and serve
[`tests/fixtures/chatgpt-mock-page.html`](tests/fixtures/chatgpt-mock-page.html)
in place of it. The browser's URL bar still says `chatgpt.com`, so the
extension's content-script match pattern fires and the harvester loads
exactly as it would in production. We then send a `HARVEST_REQUEST` to the
content script (the same message the right-click menu sends) and poll
`chrome.storage.local` for the captured conversation.

Auto-sync stays off in this test on purpose — Phase A's locked-in default —
and the test asserts the harvested record's `autoSync` flag is `false`.

## Logging + tracing

- **Extension side**: `src/utils/logger.ts` and `src/utils/tracing.ts`. Both
  ring-buffer to `chrome.storage.local` (capped at 500 / 200 entries) for the
  side-panel debug view; verbose logging activates with
  `localStorage.contextStashDebug = '1'` or `?cs_debug=1` in the side-panel
  URL.
- **MCP server side**: `mcp-server/src/logger.ts`. Writes to **stderr only**
  (stdout is reserved for MCP frames) and appends to
  `$CONTEXT_STASH_DATA_DIR/logs/server.log`.

## Why not bundled Playwright Chromium

We use the user's system Chrome (`/Applications/Google Chrome.app` on macOS,
falling back to other channels on Linux) to skip a 250 MB Playwright download
and to test against the same Chrome the user actually runs.

If you don't have Chrome installed, run `npx playwright install chromium`
once and remove the `executablePath` line in `tests/e2e/fixtures.ts`.

## Validating adapters against real chat pages

The mocked HTML fixtures keep CI fast and offline, but real ChatGPT / Claude /
Gemini / Perplexity pages drift over time. To validate selectors against what
your browser actually sees:

1. Open the conversation in your normal Chrome session.
2. DevTools → Console → paste [`scripts/capture-dom.js`](scripts/capture-dom.js)
   → Enter. The minimised, redacted DOM lands on your clipboard.
3. Save it as `tests/fixtures/<platform>-real-<n>.html` (e.g.
   `tests/fixtures/claude-real-2026-05.html`).
4. Add a test against it in `tests/unit/platforms.test.ts` or run an existing
   E2E pointing at the captured fixture (substitute the real-page HTML for the
   synthetic one in `tests/fixtures/<platform>-mock-page.html`).
5. If the existing adapter fails, the test pinpoints the selector that drifted
   — patch `src/content/platforms/<platform>.ts` and re-run.

The capture script strips inline styles, scripts, SVGs, and data: URLs. Class
names, `data-*`, `role`, and `aria-*` attributes are preserved because that's
what the adapters key off. Always inspect the dump before committing — if it
contains anything you don't want in the repo, edit it down.

## Known limitations

- The harvester E2E exercises the right-click / shortcut path
  (`HARVEST_REQUEST` → user-initiated emit). Auto-sync is intentionally not
  E2E-tested in Phase A (it would require driving a streaming ChatGPT
  response with `MutationObserver` timing assumptions).
- The MCP Native Messaging bridge needs a registered host manifest to work
  end-to-end; that's covered by the install wizard in the side panel and is
  out of scope for the headless E2E suite. A separate integration test (run
  manually) will be added in Phase B.
