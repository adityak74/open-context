import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createStore } from './store.js';
import { loadSchema, describeSchema } from './schema.js';
import { createObserver } from './observer.js';
import { buildSelfModel, formatSelfModel } from './awareness.js';
import { ContextAnalyzer } from './analyzer.js';
import { createControlPlane } from './control-plane.js';

// Module-level singleton — avoids re-checking Ollama availability (a network call)
// on every tool invocation that uses the analyzer.
const sharedAnalyzer = new ContextAnalyzer();

export function createMcpServer(storePath?: string) {
  const observer = createObserver();
  const store = createStore(storePath, observer);
  // Shared control-plane instance — avoids re-creating a closure (and re-reading
  // awareness.json for protections/pending actions) on every approve/dismiss call.
  const sharedControlPlane = createControlPlane(observer);

  const server = new McpServer({
    name: 'opencontext',
    version: '1.0.0',
  });

  // ---------------------------------------------------------------------------
  // Context tools
  // ---------------------------------------------------------------------------

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
      bubbleId: z
        .string()
        .optional()
        .describe('ID of the bubble (project) to associate this context with'),
    },
    async (args) => {
      const entry = store.saveContext(
        args.content,
        args.tags || [],
        args.source || 'chat',
        args.bubbleId,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: `Saved context with ID: ${entry.id}\nTags: ${entry.tags.length > 0 ? entry.tags.join(', ') : 'none'}${entry.bubbleId ? `\nBubble: ${entry.bubbleId}` : ''}\nCreated: ${entry.createdAt}`,
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
            `[${entry.id}] (${entry.tags.join(', ') || 'no tags'})${entry.bubbleId ? ` [bubble:${entry.bubbleId}]` : ''} - ${entry.createdAt}\n${entry.content}`,
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
            `[${entry.id}] (${entry.tags.join(', ') || 'no tags'})${entry.bubbleId ? ` [bubble:${entry.bubbleId}]` : ''} - ${entry.createdAt}\n${entry.content.substring(0, 100)}${entry.content.length > 100 ? '...' : ''}`,
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
            `[${entry.id}] (${entry.tags.join(', ') || 'no tags'})${entry.bubbleId ? ` [bubble:${entry.bubbleId}]` : ''} - ${entry.createdAt}\n${entry.content}`,
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
      bubbleId: z
        .string()
        .nullable()
        .optional()
        .describe('Bubble ID to assign (null to unassign from bubble)'),
    },
    async (args) => {
      const updated = store.updateContext(args.id, args.content, args.tags, args.bubbleId);
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
            text: `Context ${updated.id} updated.\nTags: ${updated.tags.length > 0 ? updated.tags.join(', ') : 'none'}${updated.bubbleId ? `\nBubble: ${updated.bubbleId}` : ''}\nUpdated: ${updated.updatedAt}`,
          },
        ],
      };
    },
  );

  // ---------------------------------------------------------------------------
  // Bubble tools
  // ---------------------------------------------------------------------------

  server.tool(
    'create_bubble',
    'Create a new bubble (project workspace) to group related contexts together.',
    {
      name: z.string().describe('The name of the bubble / project'),
      description: z
        .string()
        .optional()
        .describe('Optional description of what this bubble is for'),
    },
    async (args) => {
      const bubble = store.createBubble(args.name, args.description);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Created bubble "${bubble.name}" with ID: ${bubble.id}${bubble.description ? `\nDescription: ${bubble.description}` : ''}\nCreated: ${bubble.createdAt}`,
          },
        ],
      };
    },
  );

  server.tool(
    'list_bubbles',
    'List all bubbles (project workspaces).',
    {},
    async () => {
      const bubbles = store.listBubbles();
      if (bubbles.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No bubbles created yet.' }],
        };
      }
      const formatted = bubbles
        .map((b) => {
          const contexts = store.listContextsByBubble(b.id);
          return `[${b.id}] ${b.name}${b.description ? ` — ${b.description}` : ''} (${contexts.length} context${contexts.length === 1 ? '' : 's'})`;
        })
        .join('\n');
      return {
        content: [{ type: 'text' as const, text: `${bubbles.length} bubble(s):\n\n${formatted}` }],
      };
    },
  );

  server.tool(
    'get_bubble',
    'Get a bubble and all of its contexts.',
    {
      id: z.string().describe('The ID of the bubble'),
    },
    async (args) => {
      const bubble = store.getBubble(args.id);
      if (!bubble) {
        return {
          content: [{ type: 'text' as const, text: `No bubble found with ID "${args.id}".` }],
        };
      }
      const contexts = store.listContextsByBubble(args.id);
      const ctxText =
        contexts.length === 0
          ? 'No contexts in this bubble.'
          : contexts
              .map(
                (e) =>
                  `  [${e.id}] (${e.tags.join(', ') || 'no tags'}) - ${e.updatedAt}\n  ${e.content.substring(0, 150)}${e.content.length > 150 ? '...' : ''}`,
              )
              .join('\n\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `Bubble: ${bubble.name} [${bubble.id}]${bubble.description ? `\n${bubble.description}` : ''}\nCreated: ${bubble.createdAt} | Updated: ${bubble.updatedAt}\n\nContexts (${contexts.length}):\n${ctxText}`,
          },
        ],
      };
    },
  );

  server.tool(
    'update_bubble',
    'Update the name or description of a bubble.',
    {
      id: z.string().describe('The ID of the bubble to update'),
      name: z.string().describe('New name for the bubble'),
      description: z
        .string()
        .optional()
        .describe('New description (omit to leave unchanged)'),
    },
    async (args) => {
      const updated = store.updateBubble(args.id, args.name, args.description);
      if (!updated) {
        return {
          content: [{ type: 'text' as const, text: `No bubble found with ID "${args.id}".` }],
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: `Bubble ${updated.id} updated.\nName: ${updated.name}${updated.description ? `\nDescription: ${updated.description}` : ''}\nUpdated: ${updated.updatedAt}`,
          },
        ],
      };
    },
  );

  server.tool(
    'delete_bubble',
    'Delete a bubble. Contexts inside the bubble are unassigned (not deleted) unless deleteContexts is true.',
    {
      id: z.string().describe('The ID of the bubble to delete'),
      deleteContexts: z
        .boolean()
        .optional()
        .describe('If true, also delete all contexts inside the bubble (default: false)'),
    },
    async (args) => {
      const deleted = store.deleteBubble(args.id, args.deleteContexts ?? false);
      return {
        content: [
          {
            type: 'text' as const,
            text: deleted
              ? `Bubble ${args.id} deleted.${args.deleteContexts ? ' All its contexts were also deleted.' : ' Its contexts have been unassigned.'}`
              : `No bubble found with ID "${args.id}".`,
          },
        ],
      };
    },
  );

  // ---------------------------------------------------------------------------
  // Self-Aware Context Runtime tools
  // ---------------------------------------------------------------------------

  server.tool(
    'describe_schema',
    'Returns all user-defined context types with their fields and descriptions. Call this to understand what context types the user cares about.',
    {},
    async () => {
      const schema = loadSchema();
      if (!schema || schema.types.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No schema defined. Users can create ~/.opencontext/schema.json to define custom context types.' }],
        };
      }
      return { content: [{ type: 'text' as const, text: describeSchema(schema) }] };
    },
  );

  server.tool(
    'save_typed_context',
    'Save a context entry with structured data matching a user-defined schema type. Falls back to untyped save if the type is unknown.',
    {
      type: z.string().describe('The schema type name (e.g. "decision", "preference")'),
      data: z.record(z.string(), z.unknown()).describe('Key-value pairs matching the schema type fields'),
      tags: z.array(z.string()).optional().describe('Additional tags'),
      source: z.string().optional().describe('Source of this context'),
      bubbleId: z.string().optional().describe('Bubble (project) to associate with'),
    },
    async (args) => {
      const schema = loadSchema();
      if (!schema) {
        const entry = store.saveContext(
          JSON.stringify(args.data),
          args.tags ?? [],
          args.source ?? 'chat',
          args.bubbleId,
        );
        return { content: [{ type: 'text' as const, text: `No schema found. Saved as untyped context: ${entry.id}` }] };
      }
      const { entry, errors } = store.saveTypedContext(
        schema,
        args.type,
        args.data as Record<string, unknown>,
        args.tags ?? [],
        args.source ?? 'chat',
        args.bubbleId,
      );
      const warn = errors.length > 0 ? `\nValidation warnings: ${errors.join('; ')}` : '';
      return {
        content: [{ type: 'text' as const, text: `Saved typed context [${args.type}] with ID: ${entry.id}${warn}` }],
      };
    },
  );

  server.tool(
    'query_by_type',
    'Query all context entries of a given type, with optional field filters and relevance ranking.',
    {
      type: z.string().describe('The context type to query (e.g. "decision")'),
      filter: z.record(z.string(), z.unknown()).optional().describe('Field values to filter by'),
      ranked: z.boolean().optional().describe('If true, rank results by semantic relevance (requires Ollama)'),
    },
    async (args) => {
      const results = store.queryByType(args.type, args.filter as Record<string, unknown> | undefined);
      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: `No entries found for type "${args.type}".` }] };
      }
      let entries = results;
      if (args.ranked) {
        try {
          const ranked = await sharedAnalyzer.rankByRelevance(results, args.type);
          entries = ranked.map((r) => r.entry);
        } catch {
          // Fall through — return unranked
        }
      }
      const formatted = entries.map((e) =>
        `[${e.id}] type:${e.contextType ?? 'none'} (${e.tags.join(', ') || 'no tags'}) - ${e.updatedAt}\n${e.content}`,
      ).join('\n\n---\n\n');
      return { content: [{ type: 'text' as const, text: `Found ${entries.length} entries of type "${args.type}":\n\n${formatted}` }] };
    },
  );

  server.tool(
    'introspect',
    'Returns a self-model of the context store: what is known, gaps, contradictions, and health score. Use deep=true for Ollama-enhanced analysis.',
    {
      deep: z.boolean().optional().describe('If true, use Ollama-powered semantic analysis (slower, falls back to deterministic if Ollama unavailable)'),
    },
    async (args) => {
      const schema = loadSchema();
      const model = buildSelfModel(store, schema, observer);

      if (args.deep) {
        try {
          const allEntries = store.listContexts();
          const deepContradictions = await sharedAnalyzer.detectContradictions(allEntries);
          if (deepContradictions.length > 0) {
            model.contradictions = deepContradictions;
          }
        } catch {
          // Fall back to deterministic (already in model)
        }
      }

      return { content: [{ type: 'text' as const, text: formatSelfModel(model) }] };
    },
  );

  server.tool(
    'get_gaps',
    'Returns only the gaps from the self-model — what context types are defined but empty, and what agents have searched for without finding results.',
    {},
    async () => {
      const schema = loadSchema();
      const model = buildSelfModel(store, schema, observer);
      if (model.gaps.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No gaps identified. The context store looks complete.' }] };
      }
      const lines = model.gaps.map((g) => {
        const icon = g.severity === 'warning' ? '⚠' : 'ℹ';
        return `${icon} ${g.description}\n  → ${g.suggestion}`;
      });
      return { content: [{ type: 'text' as const, text: `${model.gaps.length} gap(s) identified:\n\n${lines.join('\n\n')}` }] };
    },
  );

  server.tool(
    'report_usefulness',
    'Report whether retrieved context entries were actually useful. Closes the feedback loop for self-improvement.',
    {
      context_ids: z.array(z.string()).describe('IDs of context entries that were used'),
      useful: z.boolean().describe('Whether the context was helpful'),
      notes: z.string().optional().describe('Optional explanation'),
    },
    async (args) => {
      observer.log({
        action: 'read',
        tool: 'report_usefulness',
        entryIds: args.context_ids,
        useful: args.useful,
        query: args.notes,
      });
      return {
        content: [{ type: 'text' as const, text: `Feedback recorded. ${args.context_ids.length} entry(ies) marked as ${args.useful ? 'useful' : 'not useful'}.${args.notes ? ` Notes: ${args.notes}` : ''}` }],
      };
    },
  );

  server.tool(
    'analyze_contradictions',
    'Detect contradictory entries in the context store. Uses Ollama for semantic analysis if available, otherwise uses keyword heuristics.',
    {
      type: z.string().optional().describe('Limit analysis to a specific context type'),
    },
    async (args) => {
      const entries = args.type ? store.queryByType(args.type) : store.listContexts().filter((e) => !e.archived);
      const contradictions = await sharedAnalyzer.detectContradictions(entries);
      if (contradictions.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No contradictions detected.' }] };
      }
      const lines = contradictions.map((c) =>
        `⚠ ${c.description}\n  Entry A: ${c.entryA}\n  Entry B: ${c.entryB}`,
      );
      return { content: [{ type: 'text' as const, text: `${contradictions.length} contradiction(s) detected:\n\n${lines.join('\n\n')}` }] };
    },
  );

  server.tool(
    'suggest_schema',
    'Analyze untyped context entries and suggest schema types that would organize them. Uses Ollama if available.',
    {},
    async () => {
      const untyped = store.listContexts().filter((e) => !e.contextType && !e.archived);
      if (untyped.length < 3) {
        return { content: [{ type: 'text' as const, text: `Only ${untyped.length} untyped entries — need at least 3 to suggest schema types.` }] };
      }
      const suggestions = await sharedAnalyzer.suggestSchemaTypes(untyped);
      if (suggestions.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No schema type suggestions at this time. Try adding more untyped entries.' }] };
      }
      const lines = suggestions.map((s) => {
        const fields = s.fields.map((f) => `  - ${f.name} (${f.type}): ${f.description}`).join('\n');
        return `Type: ${s.typeName}\nDescription: ${s.description}\nFields:\n${fields}`;
      });
      return { content: [{ type: 'text' as const, text: `${suggestions.length} schema suggestion(s):\n\n${lines.join('\n\n')}` }] };
    },
  );

  server.tool(
    'summarize_context',
    'Generate a briefing summary of context entries for agent session start. Uses Ollama if available.',
    {
      type: z.string().optional().describe('Limit summary to a specific context type'),
      bubbleId: z.string().optional().describe('Limit summary to a specific bubble/project'),
      focus: z.string().optional().describe('What the agent is about to work on'),
    },
    async (args) => {
      let entries = store.listContexts().filter((e) => !e.archived);
      if (args.type) entries = entries.filter((e) => e.contextType === args.type);
      if (args.bubbleId) entries = entries.filter((e) => e.bubbleId === args.bubbleId);
      if (entries.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No entries to summarize.' }] };
      }
      const summary = await sharedAnalyzer.summarizeContext(entries, args.focus);
      return { content: [{ type: 'text' as const, text: summary }] };
    },
  );

  server.tool(
    'get_improvements',
    'Returns recent autonomous self-improvement actions taken by the system.',
    {
      since: z.string().optional().describe('ISO date string. Defaults to last 24 hours.'),
    },
    async (args) => {
      const improvements = observer.getRecentImprovements(args.since);
      if (improvements.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No self-improvement actions in the requested time range.' }] };
      }
      const lines = improvements.map((r) => {
        const actionList = r.actions.map((a) => `  - ${a.type} (${a.count})`).join('\n');
        return `${r.timestamp}:\n${actionList}`;
      });
      return { content: [{ type: 'text' as const, text: `${improvements.length} improvement event(s):\n\n${lines.join('\n\n')}` }] };
    },
  );

  server.tool(
    'review_pending_actions',
    'List self-improvement actions awaiting human approval.',
    {},
    async () => {
      const pending = sharedControlPlane.listPending();
      if (pending.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No pending actions. The system is up to date.' }] };
      }
      const lines = pending.map((a) =>
        `[${a.id}] [${a.risk.toUpperCase()}] ${a.description}\n  Reasoning: ${a.reasoning}\n  Expires: ${a.expiresAt}`,
      );
      return {
        content: [{
          type: 'text' as const,
          text: `${pending.length} pending action(s) awaiting approval:\n\n${lines.join('\n\n')}\n\nUse approve_action or dismiss_action with the action ID.`,
        }],
      };
    },
  );

  server.tool(
    'approve_action',
    'Approve one or more pending self-improvement actions.',
    {
      action_id: z.string().optional().describe('ID of the action to approve'),
      action_ids: z.array(z.string()).optional().describe('IDs of multiple actions to approve'),
    },
    async (args) => {
      const ids = args.action_ids ?? (args.action_id ? [args.action_id] : []);
      if (ids.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No action IDs provided.' }] };
      }
      const schema = loadSchema();
      const results: string[] = [];
      for (const id of ids) {
        const { approved, result, action: approvedAction } = sharedControlPlane.approve(id);
        if (approved && approvedAction) {
          try {
            const { executeImprovement } = await import('./improver.js');
            await executeImprovement(approvedAction.action, store, schema, observer);
            results.push(`✓ ${id}: ${result}`);
          } catch (err) {
            results.push(`✗ ${id}: approved but execution failed — ${err}`);
          }
        } else {
          results.push(`- ${id}: ${result}`);
        }
      }
      return { content: [{ type: 'text' as const, text: results.join('\n') }] };
    },
  );

  server.tool(
    'dismiss_action',
    'Dismiss one or more pending self-improvement actions.',
    {
      action_id: z.string().optional().describe('ID of the action to dismiss'),
      action_ids: z.array(z.string()).optional().describe('IDs of multiple actions to dismiss'),
      reason: z.string().optional().describe('Why you are dismissing this action'),
    },
    async (args) => {
      const ids = args.action_ids ?? (args.action_id ? [args.action_id] : []);
      if (ids.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No action IDs provided.' }] };
      }
      const results = ids.map((id) => {
        const dismissed = sharedControlPlane.dismiss(id, args.reason);
        return dismissed ? `✓ ${id}: dismissed` : `- ${id}: not found or already resolved`;
      });
      return { content: [{ type: 'text' as const, text: results.join('\n') }] };
    },
  );

  return server;
}
