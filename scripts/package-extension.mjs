#!/usr/bin/env node
// Package the production-built extension into a versioned ZIP for the
// Chrome Web Store.
//
//   1. Reads the version from src/manifest.json (already bumped by hand or by
//      a release tag).
//   2. Rebuilds dist/ from a clean slate so we never ship stale assets.
//   3. Writes releases/context-stash-<version>.zip with stable mtimes so the
//      hash is reproducible.
//   4. Computes the sha-256 of the zip and writes it next to the artifact
//      for verification + the release-notes blurb.
//
// Used by:
//   - `npm run package` for local builds before a manual CWS upload.
//   - .github/workflows/release-extension.yml in CI for tag-pushed releases.

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');
const RELEASES = join(ROOT, 'releases');

function sh(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function main() {
  const manifestPath = join(ROOT, 'src', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const version = manifest.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`manifest version must be x.y.z (got "${version}")`);
  }

  console.log(`Packaging Context Stash v${version}`);
  // Clean rebuild so we never ship a stale dist.
  sh('rm -rf dist && npm run build');

  if (!existsSync(DIST)) throw new Error('dist/ missing after build');
  // Sanity: every content_script + background source listed in the manifest
  // must have produced an output asset (catches misconfigured Vite inputs).
  const outFiles = new Set((await walk(DIST)).map(f => relative(DIST, f)));
  if (!outFiles.has('manifest.json')) {
    throw new Error(`dist/manifest.json missing — Vite/CRX plugin not running?`);
  }

  mkdirSync(RELEASES, { recursive: true });
  const zipName = `context-stash-${version}.zip`;
  const zipPath = join(RELEASES, zipName);
  // Force a stable file order + zero out timestamps so the zip's sha is
  // reproducible across machines. The `find | sort` pipeline + zip's -X
  // (drop extra-fields) gives us byte-identical output.
  sh(
    `cd "${DIST}" && rm -f "${zipPath}" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 zip -X -q "${zipPath}"`,
  );

  const buf = readFileSync(zipPath);
  const sha = createHash('sha256').update(buf).digest('hex');
  writeFileSync(`${zipPath}.sha256`, `${sha}  ${zipName}\n`, 'utf8');

  const sizeKb = Math.round(statSync(zipPath).size / 1024);
  console.log(`\n✓ ${relative(ROOT, zipPath)}  (${sizeKb} KB)`);
  console.log(`  sha256: ${sha}`);
  console.log(`\nNext: upload to Chrome Web Store → see PUBLISHING.md`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
