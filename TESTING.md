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

## Validating against your real chat history

Synthetic fixtures keep CI fast and offline. Two ways to validate selectors
against what your browser actually sees on logged-in pages:

### Option A — One-shot capture (paste into DevTools)

Best for occasional checks or when you want to add a regression fixture to git.

1. Open the conversation in your normal Chrome session.
2. DevTools → Console → paste the contents of
   [`scripts/capture-dom.js`](scripts/capture-dom.js) → Enter.
3. Console prints the suggested filename:
   `tests/fixtures/real/<platform>/<slug>.html`. The captured HTML is on your
   clipboard.
4. Save the file. Inspect it before committing — strip anything sensitive.
5. Run:
   ```bash
   npm run validate:fixtures
   ```
   The harness loads each fixture, runs the matching adapter against it, and
   prints turn count, role distribution, conversation id, and content samples.
   Exits non-zero if any fixture fails to extract turns from both roles.

The capture script preserves only class names, `role`, `aria-*`, and `data-*`
attributes — that's what the adapters key off — and strips scripts, styles,
SVGs, base64 images, and any `<input>`/`<textarea>` so an in-progress prompt
doesn't leak into the fixture.

### Option B — Live driver (Playwright with a persistent profile)

Best for end-to-end validation across all four platforms in one run.

```bash
npm run validate:live
```

What it does:

1. Launches Chromium with a persistent user-data dir at `./.live-profile/`
   (gitignored, separate from your real Chrome profile so we don't fight
   Chrome's own lock).
2. Visits ChatGPT, Claude, Gemini, and Perplexity in turn.
3. First run: each site's window opens to the login page. Log in manually
   — the script gives you 3 minutes per platform. Logins persist across runs.
4. After login it finds the most recent conversation in the sidebar, opens
   it, runs the adapter against the rendered DOM, and prints a per-platform
   report.
5. Each captured DOM is saved to
   `tests/fixtures/real/<platform>/live-<timestamp>.html` (gitignored) so you
   can re-run the offline validator over the captures.

If you'd rather use your real Chrome profile (close Chrome first), set
`CONTEXT_STASH_USER_DIR=/path/to/your/Chrome/profile`.

### Option C — Capture once, regression-test forever

Combine the two: run `validate:live` once to populate
`tests/fixtures/real/<platform>/live-*.html`, rename the most useful captures
without the `live-` prefix (so they're tracked in git), commit them, and add
adapter unit tests that run against them. From then on, any selector drift
breaks `npm run test:unit` and `npm run validate:fixtures` immediately.

## Known limitations

- The harvester E2E exercises the right-click / shortcut path
  (`HARVEST_REQUEST` → user-initiated emit). Auto-sync is intentionally not
  E2E-tested in Phase A (it would require driving a streaming ChatGPT
  response with `MutationObserver` timing assumptions).
- The MCP Native Messaging bridge needs a registered host manifest to work
  end-to-end; that's covered by the install wizard in the side panel and is
  out of scope for the headless E2E suite. A separate integration test (run
  manually) will be added in Phase B.
