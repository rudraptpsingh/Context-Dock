// MCP server: exposes Context Stash conversations as MCP resources + tools.
//
// We talk MCP over stdio when invoked as a regular agent integration
// (Claude Code, Cursor, Zed all spawn the binary and pipe stdio).
//
// The native-host mode (Chrome Native Messaging) uses a different framing,
// so the binary picks one mode at startup based on argv.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  conversationToMarkdown,
  getConversation,
  listConversations,
  listMemories,
  searchConversations,
  searchMemories,
} from './store.js';

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'context-stash', version: '0.1.0' },
    { capabilities: { resources: {}, tools: {} } },
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const [conversations, memories] = await Promise.all([listConversations(), listMemories()]);
    const convResources = conversations.map(c => ({
      uri: `context-stash://conversation/${c.id}`,
      name: c.title,
      description: `${c.platform} · ${c.turns.length} turns · last synced ${new Date(c.lastSyncedAt).toISOString()}`,
      mimeType: 'text/markdown',
    }));
    // Group memories per platform into one resource each — N small memories
    // would balloon the resource list. The reader builds a single Markdown
    // document.
    const platforms = Array.from(new Set(memories.map(m => m.platform)));
    const memoryResources = platforms.map(p => ({
      uri: `context-stash://memories/${p}`,
      name: `${p} memories`,
      description: `${memories.filter(m => m.platform === p).length} captured memories from ${p}`,
      mimeType: 'text/markdown',
    }));
    return { resources: [...convResources, ...memoryResources] };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async req => {
    const uri = req.params.uri;
    const convMatch = /^context-stash:\/\/conversation\/(.+)$/.exec(uri);
    if (convMatch) {
      const conv = await getConversation(convMatch[1]);
      if (!conv) throw new Error(`Conversation not found: ${convMatch[1]}`);
      return {
        contents: [{ uri, mimeType: 'text/markdown', text: conversationToMarkdown(conv) }],
      };
    }
    const memMatch = /^context-stash:\/\/memories\/(.+)$/.exec(uri);
    if (memMatch) {
      const platform = memMatch[1];
      const memories = await listMemories({ platform });
      if (!memories.length) throw new Error(`No memories for platform: ${platform}`);
      const md = [
        `# ${platform} memories`,
        '',
        `${memories.length} entries captured by Context Stash.`,
        '',
        '---',
        '',
        ...memories.map(m => `- ${m.text}  \n  _captured ${new Date(m.capturedAt).toISOString()}_`),
      ].join('\n');
      return { contents: [{ uri, mimeType: 'text/markdown', text: md }] };
    }
    throw new Error(`Unknown resource: ${uri}`);
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search_context',
        description:
          'Search across all harvested AI conversations (ChatGPT, Claude, Gemini, Perplexity). Returns matching conversations with metadata; fetch full content via the resource URI.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Free-text search across titles, tags, and turn content.' },
            platform: {
              type: 'string',
              description: 'Optional platform filter (chatgpt, claude, gemini, perplexity).',
            },
            limit: { type: 'number', description: 'Max results (default 20).' },
          },
          required: ['query'],
        },
      },
      {
        name: 'recent_conversation',
        description: 'Return the N most recently synced conversations, optionally filtered by platform.',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string' },
            limit: { type: 'number', description: 'Default 10.' },
          },
        },
      },
      {
        name: 'search_memories',
        description:
          'Search captured memories (ChatGPT saved memories, Claude personalization instructions, etc.). Returns matching memory texts.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            platform: { type: 'string' },
            limit: { type: 'number', description: 'Default 20.' },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async req => {
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    if (req.params.name === 'search_context') {
      const matches = await searchConversations(String(args.query ?? ''), {
        platform: typeof args.platform === 'string' ? args.platform : undefined,
        limit: typeof args.limit === 'number' ? args.limit : 20,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              matches.map(c => ({
                uri: `context-stash://conversation/${c.id}`,
                title: c.title,
                platform: c.platform,
                turns: c.turns.length,
                lastSyncedAt: c.lastSyncedAt,
                url: c.url,
              })),
              null,
              2,
            ),
          },
        ],
      };
    }
    if (req.params.name === 'recent_conversation') {
      const all = await listConversations();
      const platform = typeof args.platform === 'string' ? args.platform : undefined;
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      const filtered = (platform ? all.filter(c => c.platform === platform) : all).slice(0, limit);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              filtered.map(c => ({
                uri: `context-stash://conversation/${c.id}`,
                title: c.title,
                platform: c.platform,
                turns: c.turns.length,
                lastSyncedAt: c.lastSyncedAt,
              })),
              null,
              2,
            ),
          },
        ],
      };
    }
    if (req.params.name === 'search_memories') {
      const matches = await searchMemories(String(args.query ?? ''), {
        platform: typeof args.platform === 'string' ? args.platform : undefined,
        limit: typeof args.limit === 'number' ? args.limit : 20,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              matches.map(m => ({
                platform: m.platform,
                text: m.text,
                capturedAt: m.capturedAt,
              })),
              null,
              2,
            ),
          },
        ],
      };
    }
    throw new Error(`Unknown tool: ${req.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
