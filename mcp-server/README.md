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
