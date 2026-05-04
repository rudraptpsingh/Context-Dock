# Publishing the extension

Two paths: a one-shot manual upload (recommended for the first publish), and a tag-driven CI workflow that auto-uploads + (optionally) submits for review.

## What gets shipped

`releases/context-stash-<version>.zip` — built by `npm run package`. The zip:
- Is the production `dist/` tree, nothing else (no source, no node_modules).
- Has stable file ordering + zeroed extra-fields, so the sha-256 is reproducible across machines.
- Is around 124 KB at v1.1.0.

The version number lives in `src/manifest.json` (and is mirrored in `package.json` for npm-tooling sanity). Bump both before packaging.

## One-shot manual upload (first time, or if you don't want the API set up)

1. Build + package locally:
   ```bash
   npm run package
   ls releases/
   # context-stash-1.1.0.zip
   # context-stash-1.1.0.zip.sha256
   ```
2. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Sign in.
3. **First publish only:** click *New item*, drop the zip, fill in the listing — store name, summary (132 chars), description, category (`Developer Tools` is the right fit), 1280×800 screenshots (at least one), small + large promotional tiles, privacy policy URL. Submit for review.
4. **Update an existing listing:** open the listing → *Package* → *Upload new package* → drop `context-stash-<version>.zip` → *Save draft* → *Submit for review*.

Review usually takes 1-3 business days.

## Auto-publish via GitHub Actions

`.github/workflows/release-extension.yml` triggers on `ext-v*` tag pushes. It builds, packages, attaches the zip to a GitHub Release, and (when configured) uploads to the CWS.

### Tag a release

```bash
git tag ext-v1.1.0
git push origin ext-v1.1.0
```

### Enable auto-upload to CWS

Set these in **Settings → Secrets and variables → Actions** of the GitHub repo:

| Kind     | Name                | Value |
|----------|---------------------|-------|
| variable | `CWS_PUBLISH`       | `true` to attempt CWS upload, anything else for build-only |
| variable | `CWS_AUTO_PUBLISH`  | `true` to also submit-for-review after upload (else stays in draft) |
| secret   | `CWS_EXTENSION_ID`  | the listing's id from the dashboard URL (`/edit/<id>`) |
| secret   | `CWS_CLIENT_ID`     | OAuth 2.0 client id from Google Cloud Console |
| secret   | `CWS_CLIENT_SECRET` | OAuth 2.0 client secret |
| secret   | `CWS_REFRESH_TOKEN` | long-lived refresh token (one-time mint, see below) |

Without `CWS_PUBLISH=true`, the workflow still publishes a GitHub Release with the zip attached — useful for sharing builds with testers who side-load via "Load unpacked".

### Mint the refresh token (one-time)

The CWS API uses Google OAuth 2.0. You need a refresh token bound to a Google account that has Edit access to the listing.

1. In **Google Cloud Console**, create a new project (or reuse one). Enable the *Chrome Web Store API*.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID** → application type *Desktop*. Note the client id + secret.
3. Visit `https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=<CLIENT_ID>&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fchromewebstore&redirect_uri=urn:ietf:wg:oauth:2.0:oob&access_type=offline` (URL-encoded). Sign in with the dashboard-Edit account, copy the code Google shows.
4. Exchange the code for a refresh token:
   ```bash
   curl -X POST https://oauth2.googleapis.com/token \
     -d "client_id=<CLIENT_ID>" \
     -d "client_secret=<CLIENT_SECRET>" \
     -d "code=<CODE_FROM_STEP_3>" \
     -d "grant_type=authorization_code" \
     -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob"
   ```
   Copy the `refresh_token` from the response. That's the long-lived credential the workflow uses.

The refresh token is sensitive but scoped to the CWS API only. Treat it like a password.

## Bumping the version

Semver applies. As of writing:
- `1.0.0` was the original side panel + ChatGPT-export importer.
- `1.1.0` (this release) adds the cross-LLM harvester, floating dock, bulk import, MCP server, on-device AI summaries + auto-tags, omnibox `cs` search, settings + diagnostics, conversation pin / per-turn copy / search-highlighting / first-run onboarding, brand identity polish.

When bumping:
```bash
# Open both files and change "version": "1.1.0" → "1.2.0" (or whatever).
$EDITOR src/manifest.json package.json
git add src/manifest.json package.json
git commit -m "Bump to 1.2.0"
```

The CWS rejects re-uploads of the same version. Always bump before re-uploading.

## Rolling back

The CWS doesn't support arbitrary rollback. To "roll back" you have to upload the previous version's zip with a *higher* version number (e.g. revert content to `1.1.0` but bump manifest to `1.2.0`). Better: don't ship broken builds. The full `npm run lint && npm run test:unit && npm run test:e2e && npm run build && npm run package` sequence catches most regressions before they leave a developer machine.
