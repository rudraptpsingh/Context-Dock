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
  searchConversations,
} from './store.js';

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'context-stash', version: '0.1.0' },
    { capabilities: { resources: {}, tools: {} } },
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const conversations = await listConversations();
    return {
      resources: conversations.map(c => ({
        uri: `context-stash://conversation/${c.id}`,
        name: c.title,
        description: `${c.platform} · ${c.turns.length} turns · last synced ${new Date(c.lastSyncedAt).toISOString()}`,
        mimeType: 'text/markdown',
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async req => {
    const uri = req.params.uri;
    const match = /^context-stash:\/\/conversation\/(.+)$/.exec(uri);
    if (!match) throw new Error(`Unknown resource: ${uri}`);
    const conv = await getConversation(match[1]);
    if (!conv) throw new Error(`Conversation not found: ${match[1]}`);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: conversationToMarkdown(conv),
        },
      ],
    };
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
    throw new Error(`Unknown tool: ${req.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
