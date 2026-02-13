import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createStore } from './store.js';

export function createMcpServer(storePath?: string) {
  const store = createStore(storePath);

  const server = new McpServer({
    name: 'opencontext',
    version: '1.0.0',
  });

  server.tool(
    'save_context',
    'Save a piece of context, memory, or note. Use this when the user says "remember this", "save this", or "keep this in mind".',
    {
      content: z.string().describe('The content to save'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Tags to categorize this context (e.g. ["preference", "code", "project"])'),
      source: z
        .string()
        .optional()
        .describe('Where this context came from (e.g. "chat", "code-review", "meeting")'),
    },
    async (args) => {
      const entry = store.saveContext(
        args.content,
        args.tags || [],
        args.source || 'chat',
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: `Saved context with ID: ${entry.id}\nTags: ${entry.tags.length > 0 ? entry.tags.join(', ') : 'none'}\nCreated: ${entry.createdAt}`,
          },
        ],
      };
    },
  );

  server.tool(
    'recall_context',
    'Recall saved contexts by searching content and tags. Use this when the user asks "what did I say about...", "do you remember...", or needs previous context.',
    {
      query: z.string().describe('Search query to find matching contexts'),
    },
    async (args) => {
      const results = store.recallContext(args.query);
      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No contexts found matching "${args.query}".`,
            },
          ],
        };
      }
      const formatted = results
        .map(
          (entry) =>
            `[${entry.id}] (${entry.tags.join(', ') || 'no tags'}) - ${entry.createdAt}\n${entry.content}`,
        )
        .join('\n\n---\n\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${results.length} context(s):\n\n${formatted}`,
          },
        ],
      };
    },
  );

  server.tool(
    'list_contexts',
    'List all saved contexts, optionally filtered by tag.',
    {
      tag: z
        .string()
        .optional()
        .describe('Filter by tag (e.g. "preference", "code")'),
    },
    async (args) => {
      const results = store.listContexts(args.tag);
      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: args.tag
                ? `No contexts found with tag "${args.tag}".`
                : 'No contexts saved yet.',
            },
          ],
        };
      }
      const formatted = results
        .map(
          (entry) =>
            `[${entry.id}] (${entry.tags.join(', ') || 'no tags'}) - ${entry.createdAt}\n${entry.content.substring(0, 100)}${entry.content.length > 100 ? '...' : ''}`,
        )
        .join('\n\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `${results.length} context(s):\n\n${formatted}`,
          },
        ],
      };
    },
  );

  server.tool(
    'delete_context',
    'Delete a saved context by its ID.',
    {
      id: z.string().describe('The ID of the context to delete'),
    },
    async (args) => {
      const deleted = store.deleteContext(args.id);
      return {
        content: [
          {
            type: 'text' as const,
            text: deleted
              ? `Context ${args.id} deleted.`
              : `No context found with ID "${args.id}".`,
          },
        ],
      };
    },
  );

  server.tool(
    'search_contexts',
    'Search through all saved contexts using multiple keywords. All terms must match.',
    {
      query: z
        .string()
        .describe('Space-separated search terms (all must match)'),
    },
    async (args) => {
      const results = store.searchContexts(args.query);
      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No contexts found matching "${args.query}".`,
            },
          ],
        };
      }
      const formatted = results
        .map(
          (entry) =>
            `[${entry.id}] (${entry.tags.join(', ') || 'no tags'}) - ${entry.createdAt}\n${entry.content}`,
        )
        .join('\n\n---\n\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${results.length} context(s):\n\n${formatted}`,
          },
        ],
      };
    },
  );

  server.tool(
    'update_context',
    'Update an existing saved context by its ID.',
    {
      id: z.string().describe('The ID of the context to update'),
      content: z.string().describe('The new content'),
      tags: z
        .array(z.string())
        .optional()
        .describe('New tags (replaces existing tags if provided)'),
    },
    async (args) => {
      const updated = store.updateContext(args.id, args.content, args.tags);
      if (!updated) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No context found with ID "${args.id}".`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: `Context ${updated.id} updated.\nTags: ${updated.tags.length > 0 ? updated.tags.join(', ') : 'none'}\nUpdated: ${updated.updatedAt}`,
          },
        ],
      };
    },
  );

  return server;
}
