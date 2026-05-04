// Real-world validation: spawn the compiled MCP binary, speak JSON-RPC over
// stdio, and assert it answers correctly. This is the test that proves we
// actually built a working MCP server (not just a TypeScript file that
// compiles).
//
// We seed the local store at $CONTEXT_STASH_DATA_DIR/conversations.json so the
// server has data to serve. CONTEXT_STASH_DATA_DIR is per-test temp.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_PATH = resolve(__dirname, '..', '..', 'mcp-server', 'dist', 'index.js');

interface RpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface RpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

class McpClient {
  private proc: ChildProcessWithoutNullStreams;
  private buf = '';
  private nextId = 1;
  private pending = new Map<number, (resp: RpcResponse) => void>();

  constructor(opts: { dataDir: string }) {
    this.proc = spawn(process.execPath, [SERVER_PATH], {
      env: { ...process.env, CONTEXT_STASH_DATA_DIR: opts.dataDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', chunk => {
      this.buf += chunk;
      let idx: number;
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx).trim();
        this.buf = this.buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as RpcResponse;
          if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
            this.pending.get(msg.id)!(msg);
            this.pending.delete(msg.id);
          }
        } catch {
          // Notifications or non-JSON noise — ignore.
        }
      }
    });
    // Surface server stderr only when something fails to ease debugging.
    let stderr = '';
    this.proc.stderr.setEncoding('utf8');
    this.proc.stderr.on('data', d => {
      stderr += d;
    });
    this.proc.on('exit', code => {
      if (code !== 0 && code !== null) {
        console.error(`[mcp-server exit ${code}] stderr:\n${stderr}`);
      }
    });
  }

  request<T = unknown>(method: string, params?: unknown, timeoutMs = 5_000): Promise<T> {
    const id = this.nextId++;
    const req: RpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, resp => {
        clearTimeout(timer);
        if (resp.error) reject(new Error(`${resp.error.code}: ${resp.error.message}`));
        else resolve(resp.result as T);
      });
      this.proc.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  notify(method: string, params?: unknown) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async close() {
    this.proc.stdin.end();
    await new Promise<void>(resolve => {
      if (this.proc.exitCode !== null) return resolve();
      this.proc.once('exit', () => resolve());
      setTimeout(() => {
        this.proc.kill();
        resolve();
      }, 2_000);
    });
  }
}

describe('MCP server: real protocol roundtrip via spawned binary', () => {
  let dataDir: string;
  let client: McpClient;

  beforeAll(async () => {
    if (!existsSync(SERVER_PATH)) {
      throw new Error(
        `MCP binary not found at ${SERVER_PATH}. Run 'cd mcp-server && npm run build' first.`,
      );
    }
    dataDir = mkdtempSync(join(tmpdir(), 'cs-mcp-'));
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, 'conversations.json'),
      JSON.stringify({
        memories: [
          { id: 'mem-1', platform: 'chatgpt', text: 'I prefer Indian English spellings.', capturedAt: 1_700_000_500_000 },
          { id: 'mem-2', platform: 'chatgpt', text: 'I live in Bangalore.', capturedAt: 1_700_000_600_000 },
          { id: 'mem-3', platform: 'claude', text: 'Custom instructions: be concise.', capturedAt: 1_700_000_700_000 },
        ],
        conversations: [
          {
            id: 'mcp-test-1',
            platform: 'chatgpt',
            platformConversationId: 'chatgpt-c1',
            title: 'How to deploy a node binary',
            url: 'https://chatgpt.com/c/chatgpt-c1',
            turns: [
              { id: 't1', role: 'user', content: 'How do I deploy a node binary?', createdAt: 1 },
              { id: 't2', role: 'assistant', content: 'Use bun build --compile or pkg.', createdAt: 2, model: 'gpt-4o' },
            ],
            tags: ['deployment'],
            createdAt: 1_700_000_000_000,
            lastSyncedAt: 1_700_000_000_500,
          },
          {
            id: 'mcp-test-2',
            platform: 'claude',
            platformConversationId: 'claude-c1',
            title: 'Recipe for sourdough',
            url: 'https://claude.ai/chat/claude-c1',
            turns: [
              { id: 't1', role: 'user', content: 'Best sourdough hydration?', createdAt: 1 },
              { id: 't2', role: 'assistant', content: '78% works well for an open crumb.', createdAt: 2 },
            ],
            tags: [],
            createdAt: 1_700_000_001_000,
            lastSyncedAt: 1_700_000_001_500,
          },
        ],
      }),
    );

    client = new McpClient({ dataDir });
    // MCP handshake: initialize then send the initialized notification.
    const init = await client.request<{ protocolVersion: string; capabilities: unknown }>(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: { roots: {}, sampling: {} },
        clientInfo: { name: 'context-stash-test-client', version: '0.1.0' },
      },
    );
    expect(init.protocolVersion).toBeDefined();
    client.notify('notifications/initialized');
  }, 10_000);

  afterAll(async () => {
    await client.close();
  });

  it('lists conversations as resources via resources/list', async () => {
    const r = await client.request<{ resources: Array<{ uri: string; name: string }> }>(
      'resources/list',
      {},
    );
    const convResources = r.resources.filter(x => x.uri.startsWith('context-stash://conversation/'));
    expect(convResources).toHaveLength(2);
    const titles = convResources.map(x => x.name).sort();
    expect(titles).toEqual(['How to deploy a node binary', 'Recipe for sourdough']);
  });

  it('reads a single conversation via resources/read', async () => {
    const list = await client.request<{ resources: Array<{ uri: string }> }>('resources/list', {});
    const target = list.resources.find(r => r.uri.endsWith('mcp-test-1'))!;
    const r = await client.request<{ contents: Array<{ uri: string; mimeType: string; text: string }> }>(
      'resources/read',
      { uri: target.uri },
    );
    expect(r.contents[0].mimeType).toBe('text/markdown');
    expect(r.contents[0].text).toContain('# How to deploy a node binary');
    expect(r.contents[0].text).toContain('## 👤 User');
    expect(r.contents[0].text).toContain('## 🤖 Assistant');
    expect(r.contents[0].text).toContain('bun build --compile');
  });

  it('lists tools via tools/list and they include search_context + recent_conversation + search_memories', async () => {
    const r = await client.request<{ tools: Array<{ name: string }> }>('tools/list', {});
    const names = r.tools.map(t => t.name).sort();
    expect(names).toEqual(['recent_conversation', 'search_context', 'search_memories']);
  });

  it('lists memory resources alongside conversation resources', async () => {
    const r = await client.request<{ resources: Array<{ uri: string; name: string }> }>(
      'resources/list',
      {},
    );
    const memoryResources = r.resources.filter(x => x.uri.startsWith('context-stash://memories/'));
    expect(memoryResources.map(x => x.uri).sort()).toEqual([
      'context-stash://memories/chatgpt',
      'context-stash://memories/claude',
    ]);
  });

  it('reads a memories resource as Markdown with all entries listed', async () => {
    const r = await client.request<{ contents: Array<{ uri: string; mimeType: string; text: string }> }>(
      'resources/read',
      { uri: 'context-stash://memories/chatgpt' },
    );
    expect(r.contents[0].mimeType).toBe('text/markdown');
    expect(r.contents[0].text).toContain('# chatgpt memories');
    expect(r.contents[0].text).toContain('Indian English');
    expect(r.contents[0].text).toContain('Bangalore');
  });

  it('search_memories filters across all platforms and matches partial text', async () => {
    const r = await client.request<{ content: Array<{ text: string }> }>('tools/call', {
      name: 'search_memories',
      arguments: { query: 'Bangalore' },
    });
    const matches = JSON.parse(r.content[0].text) as Array<{ text: string; platform: string }>;
    expect(matches).toHaveLength(1);
    expect(matches[0].platform).toBe('chatgpt');
    expect(matches[0].text).toContain('Bangalore');
  });

  it('search_memories with platform filter narrows results', async () => {
    const r = await client.request<{ content: Array<{ text: string }> }>('tools/call', {
      name: 'search_memories',
      arguments: { query: '', platform: 'claude' },
    });
    const matches = JSON.parse(r.content[0].text) as Array<{ platform: string }>;
    expect(matches.every(m => m.platform === 'claude')).toBe(true);
    expect(matches.length).toBe(1);
  });

  it('search_context returns matches across platforms', async () => {
    const r = await client.request<{ content: Array<{ type: string; text: string }> }>(
      'tools/call',
      { name: 'search_context', arguments: { query: 'sourdough' } },
    );
    expect(r.content[0].type).toBe('text');
    const matches = JSON.parse(r.content[0].text) as Array<{ title: string; platform: string }>;
    expect(matches).toHaveLength(1);
    expect(matches[0].platform).toBe('claude');
    expect(matches[0].title).toBe('Recipe for sourdough');
  });

  it('search_context can filter by platform', async () => {
    const r = await client.request<{ content: Array<{ text: string }> }>('tools/call', {
      name: 'search_context',
      arguments: { query: '', platform: 'chatgpt' },
    });
    const matches = JSON.parse(r.content[0].text) as Array<{ platform: string }>;
    expect(matches.every(m => m.platform === 'chatgpt')).toBe(true);
    expect(matches.length).toBe(1);
  });

  it('recent_conversation returns most recently synced first', async () => {
    const r = await client.request<{ content: Array<{ text: string }> }>('tools/call', {
      name: 'recent_conversation',
      arguments: { limit: 5 },
    });
    const list = JSON.parse(r.content[0].text) as Array<{ title: string; lastSyncedAt: number }>;
    expect(list[0].lastSyncedAt).toBeGreaterThanOrEqual(list[1].lastSyncedAt);
  });

  it('errors cleanly on unknown tool name', async () => {
    await expect(
      client.request('tools/call', { name: 'does_not_exist', arguments: {} }),
    ).rejects.toThrow();
  });

  it('errors cleanly on unknown resource URI', async () => {
    await expect(
      client.request('resources/read', { uri: 'context-stash://conversation/nope' }),
    ).rejects.toThrow();
  });
});
