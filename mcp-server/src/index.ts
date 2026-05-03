#!/usr/bin/env node
// Entry point for the Context Stash MCP binary.
//
// Two modes:
//   - default (no args): MCP server over stdio. Used by Claude Code, Cursor, Zed.
//   - --native-host: Chrome Native Messaging host loop. Spawned by Chrome when
//     the extension calls chrome.runtime.connectNative('com.contextstash.mcp_bridge').
//
// Chrome passes the host name as argv[1]; we treat any argument starting with
// `chrome-extension://` as a signal to enter native-host mode.

import { startMcpServer } from './mcp-server.js';
import { startNativeHost } from './native-host.js';

const args = process.argv.slice(2);
const isNativeHostMode =
  args.includes('--native-host') ||
  args.some(a => a.startsWith('chrome-extension://'));

if (isNativeHostMode) {
  startNativeHost();
} else {
  startMcpServer().catch(err => {
    console.error('[context-stash-mcp] fatal:', err);
    process.exit(1);
  });
}
