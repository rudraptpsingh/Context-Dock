# Context Stash MCP server

A local Model Context Protocol server that exposes the conversations Context
Stash has harvested from ChatGPT, Claude, Gemini, and Perplexity. Any
MCP-aware agent (Claude Code, Cursor, Zed, Windsurf) can query them.

## Two roles, one binary

The compiled binary `context-stash-mcp` runs in either:

1. **MCP stdio mode** (default) — speaks MCP over stdin/stdout. This is what
   coding agents spawn.
2. **Chrome Native Messaging mode** — when launched by Chrome (the extension
   calls `chrome.runtime.connectNative('com.contextstash.mcp_bridge')`), it
   reads framed messages from the extension and writes them into the local
   conversation store.

Mode is auto-detected from argv: Chrome appends a `chrome-extension://...` arg.
You can also force the mode with `--native-host`.

## Local store

Conversations live at `$CONTEXT_STASH_DATA_DIR/conversations.json`, defaulting
to `~/.config/context-stash/conversations.json`. Plain JSON, no DB required.

## Build

```bash
cd mcp-server
npm install
npm run build           # tsc → dist/index.js
npm run build:binary    # bun build --compile (single-file binary)
```

## MCP config snippets

### Claude Code

```json
{
  "mcpServers": {
    "context-stash": {
      "command": "context-stash-mcp"
    }
  }
}
```

### Cursor

```json
{
  "mcpServers": {
    "context-stash": {
      "command": "context-stash-mcp"
    }
  }
}
```

### Zed

```json
{
  "context_servers": {
    "context-stash": {
      "command": { "path": "context-stash-mcp", "args": [] }
    }
  }
}
```

## Native Messaging host install

Copy `native-host-manifest.template.json` into the OS-correct directory, with
`{{ABSOLUTE_PATH_TO_BINARY}}` and `{{EXTENSION_ID}}` filled in.

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.contextstash.mcp_bridge.json` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/com.contextstash.mcp_bridge.json` |
| Windows | `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.contextstash.mcp_bridge` (registry key, default value = path to JSON) |

The in-app Setup Wizard automates this. Manual install is for advanced users.

## Install pre-built binary

Single-file binaries are published per release. Download the matching
target and put it on your PATH:

```bash
# macOS arm64
curl -L https://github.com/rudraptpsingh/Context-Dock/releases/latest/download/context-stash-mcp-darwin-arm64 \
  -o /usr/local/bin/context-stash-mcp
chmod +x /usr/local/bin/context-stash-mcp
```

Targets shipped per release:
- `context-stash-mcp-darwin-arm64` (Apple Silicon)
- `context-stash-mcp-darwin-x64`
- `context-stash-mcp-linux-x64`
- `context-stash-mcp-linux-arm64`
- `context-stash-mcp-windows-x64.exe`

Each binary's SHA-256 is in the release's `SHA256SUMS` asset.

## Cut a release

Tag the repo and the `Release MCP server binary` workflow does the rest:

```bash
git tag mcp-v0.1.0
git push origin mcp-v0.1.0
```

The workflow:
1. Builds every target via `bun build --compile` on a matrix of runners.
2. (Optional) Signs + notarises the macOS arm64 binary when the Apple
   Developer secrets are configured — see `.github/workflows/release-mcp.yml`
   for the exact secret names. Toggle with the repo variable
   `MCP_SIGN_MACOS=true`.
3. Uploads everything (plus a `SHA256SUMS` file) to a GitHub Release.

Without signing secrets, releases still publish — the macOS binaries
just trip Gatekeeper on first launch (right-click → Open, or
`xattr -d com.apple.quarantine`).

## Cross-compile locally

Needs Bun ≥ 1.1:

```bash
npm run build:all-platforms
ls dist/
```

This is what CI runs per matrix leg.
