#!/usr/bin/env node
// Validates the platform adapters against captured-real DOM fixtures.
//
//   tests/fixtures/real/<platform>/<name>.html
//
// For each fixture, runs the matching adapter in a jsdom window and prints a
// per-fixture report:
//   - whether parseConversationId() returned non-null
//   - extracted turn count and role distribution
//   - first user turn + first assistant turn (truncated)
//   - title returned by adapter.getTitle()
//   - whether streaming was detected
//
// Exits 0 if every present fixture extracts at least one turn with both
// roles present, and 1 otherwise. Empty fixture directories are ignored.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const FIXTURE_ROOT = join(ROOT, 'tests', 'fixtures', 'real');

// Import adapters via tsx-compatible runtime. We register a minimal TS loader
// only if needed; otherwise import the compiled output. Easiest path: spawn
// vite-node's resolver. Cleaner for now: import the source through tsx.
async function loadAdapters() {
  const tsxImport = async path => {
    // node 22 supports `--experimental-strip-types` for a subset of TS, but
    // the platform adapters use generics + DOM types that need full TS.
    // Use tsx's loader if installed, else fall back to pre-compiled output.
    try {
      const tsx = await import('tsx/esm/api');
      return await tsx.tsImport(path, import.meta.url);
    } catch {
      const compiled = path.replace('/src/', '/dist-test/').replace(/\.ts$/, '.js');
      return await import(compiled);
    }
  };

  return {
    chatgpt: (await tsxImport(`${ROOT}/src/content/platforms/chatgpt.ts`)).default,
    claude: (await tsxImport(`${ROOT}/src/content/platforms/claude.ts`)).default,
    gemini: (await tsxImport(`${ROOT}/src/content/platforms/gemini.ts`)).default,
    perplexity: (await tsxImport(`${ROOT}/src/content/platforms/perplexity.ts`)).default,
  };
}

function listFixtures(dir) {
  if (!safeExists(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.html'))
    .map(f => join(dir, f));
}

function safeExists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function parseUrlFromComment(html) {
  // The capture-dom.js script embeds a "<!-- captured ... from <url> -->"
  // comment in the head. Pull it out so adapter.parseConversationId works.
  const m = html.match(/captured\s+\S+\s+from\s+(\S+)/);
  return m ? m[1] : null;
}

function ellipsis(s, n = 80) {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

async function run() {
  const adapters = await loadAdapters();
  const platforms = Object.keys(adapters);
  const reports = [];
  let totalFixtures = 0;
  let totalFailures = 0;

  for (const platform of platforms) {
    const dir = join(FIXTURE_ROOT, platform);
    const files = listFixtures(dir);
    if (!files.length) {
      reports.push({ platform, status: 'no-fixtures', files: 0 });
      continue;
    }

    const adapter = adapters[platform];
    for (const file of files) {
      totalFixtures++;
      const html = readFileSync(file, 'utf8');
      const sourceUrl =
        parseUrlFromComment(html) ?? `https://example.com/${platform}/captured`;
      const dom = new JSDOM(html, { url: sourceUrl });
      const w = dom.window;

      // Some adapters reach for `document` or `window.location` directly.
      // Run the extractor inside the jsdom window context.
      const convId = adapter.parseConversationId(w.location);
      const title = adapter.getTitle(w.document);
      const turns = adapter.extractTurns(w.document);
      const roles = new Set(turns.map(t => t.role));
      const firstUser = turns.find(t => t.role === 'user');
      const firstAsst = turns.find(t => t.role === 'assistant');
      const streaming = adapter.isStreamingPartial?.(turns, w.document) ?? false;
      const ok = turns.length > 0 && roles.has('user') && roles.has('assistant');
      if (!ok) totalFailures++;

      reports.push({
        platform,
        status: ok ? 'ok' : 'fail',
        file: file.replace(ROOT + '/', ''),
        sourceUrl,
        convId,
        title,
        turnCount: turns.length,
        roles: [...roles].sort(),
        firstUser: ellipsis(firstUser?.content),
        firstAsst: ellipsis(firstAsst?.content),
        streaming,
      });
    }
  }

  const w = process.stdout.write.bind(process.stdout);
  w('\n');
  w('Real-page adapter validation\n');
  w('================================\n');
  for (const r of reports) {
    if (r.status === 'no-fixtures') {
      w(`\n[${r.platform}] (no fixtures in tests/fixtures/real/${r.platform})\n`);
      continue;
    }
    const emoji = r.status === 'ok' ? '✓' : '✗';
    w(`\n${emoji} [${r.platform}] ${r.file}\n`);
    w(`   url:        ${r.sourceUrl}\n`);
    w(`   title:      ${r.title}\n`);
    w(`   convId:     ${r.convId ?? '(null — adapter could not parse)'}\n`);
    w(`   turns:      ${r.turnCount} (roles: ${r.roles.join(', ') || 'none'})\n`);
    w(`   streaming:  ${r.streaming}\n`);
    w(`   user[0]:    ${r.firstUser || '(none)'}\n`);
    w(`   asst[0]:    ${r.firstAsst || '(none)'}\n`);
  }
  w('\n--------------------------------\n');
  w(`Fixtures checked: ${totalFixtures}\n`);
  w(`Failures:         ${totalFailures}\n`);
  if (totalFixtures === 0) {
    w('\nNo real-page fixtures found yet. See TESTING.md for capture instructions.\n');
    process.exit(0);
  }
  process.exit(totalFailures === 0 ? 0 : 1);
}

run().catch(err => {
  console.error(err);
  process.exit(2);
});
