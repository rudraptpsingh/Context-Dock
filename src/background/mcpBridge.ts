// Native-messaging bridge to the local MCP server.
//
// The MCP server is a separate native binary (see ./mcp-server/) that the user
// installs via the in-app setup wizard. The wizard registers a Native Messaging
// host manifest with the OS so this background script can `connectNative()`
// using the host name below.
//
// Keep this layer thin: serialise+forward messages, reconnect on disconnect.
// All MCP-specific logic lives in the binary.

const NATIVE_HOST = 'com.contextstash.mcp_bridge';

let port: chrome.runtime.Port | null = null;
let lastError: string | null = null;
let connecting = false;

type BridgeMessage =
  | { type: 'GET_CONVERSATIONS' }
  | { type: 'GET_CONVERSATION'; id: string }
  | { type: 'PUSH_SNAPSHOT'; payload: unknown };

type Listener = (message: unknown) => void;
const listeners = new Set<Listener>();

export function isConnected(): boolean {
  return port !== null;
}

export function getLastError(): string | null {
  return lastError;
}

export function connect(): boolean {
  if (port || connecting) return isConnected();
  connecting = true;
  try {
    port = chrome.runtime.connectNative(NATIVE_HOST);
    port.onMessage.addListener(msg => {
      for (const listener of listeners) listener(msg);
    });
    port.onDisconnect.addListener(() => {
      lastError = chrome.runtime.lastError?.message ?? 'Native host disconnected';
      port = null;
    });
    lastError = null;
    connecting = false;
    return true;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    port = null;
    connecting = false;
    return false;
  }
}

export function disconnect(): void {
  port?.disconnect();
  port = null;
}

export function send(message: BridgeMessage): boolean {
  if (!port) return false;
  try {
    port.postMessage(message);
    return true;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    port = null;
    return false;
  }
}

export function addListener(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
