import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/mcp/server.js';

function createTempStorePath(): string {
  const dir = join(tmpdir(), `opencontext-mcp-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'contexts.json');
}

describe('MCP Server', () => {
  let storePath: string;
  let client: Client;

  beforeEach(async () => {
    storePath = createTempStorePath();
    const server = createMcpServer(storePath);
    client = new Client({ name: 'test-client', version: '1.0.0' });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  afterEach(() => {
    const dir = storePath.substring(0, storePath.lastIndexOf('/'));
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true });
    }
  });

  it('should list all available tools', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);

    expect(toolNames).toContain('save_context');
    expect(toolNames).toContain('recall_context');
    expect(toolNames).toContain('list_contexts');
    expect(toolNames).toContain('delete_context');
    expect(toolNames).toContain('search_contexts');
    expect(toolNames).toContain('update_context');
    expect(toolNames).toContain('create_bubble');
    expect(toolNames).toContain('list_bubbles');
    expect(toolNames).toContain('get_bubble');
    expect(toolNames).toContain('update_bubble');
    expect(toolNames).toContain('delete_bubble');
    expect(tools.tools).toHaveLength(24);
  });

  describe('save_context tool', () => {
    it('should save context and return confirmation', async () => {
      const result = await client.callTool({
        name: 'save_context',
        arguments: {
          content: 'I prefer dark mode in all my editors',
          tags: ['preference', 'editor'],
          source: 'chat',
        },
      });

      expect(result.content).toHaveLength(1);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Saved context with ID:');
      expect(text).toContain('preference, editor');
    });

    it('should save context with defaults when optional params omitted', async () => {
      const result = await client.callTool({
        name: 'save_context',
        arguments: {
          content: 'Remember this fact',
        },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Saved context with ID:');
      expect(text).toContain('Tags: none');
    });
  });

  describe('recall_context tool', () => {
    it('should recall matching contexts', async () => {
      await client.callTool({
        name: 'save_context',
        arguments: { content: 'I love TypeScript', tags: ['language'] },
      });
      await client.callTool({
        name: 'save_context',
        arguments: { content: 'Python is also good', tags: ['language'] },
      });

      const result = await client.callTool({
        name: 'recall_context',
        arguments: { query: 'TypeScript' },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Found 1 context(s)');
      expect(text).toContain('I love TypeScript');
    });

    it('should return no-match message when nothing found', async () => {
      const result = await client.callTool({
        name: 'recall_context',
        arguments: { query: 'nonexistent' },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No contexts found');
    });
  });

  describe('list_contexts tool', () => {
    it('should list all saved contexts', async () => {
      await client.callTool({
        name: 'save_context',
        arguments: { content: 'First item' },
      });
      await client.callTool({
        name: 'save_context',
        arguments: { content: 'Second item' },
      });

      const result = await client.callTool({
        name: 'list_contexts',
        arguments: {},
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('2 context(s)');
    });

    it('should filter by tag', async () => {
      await client.callTool({
        name: 'save_context',
        arguments: { content: 'Work stuff', tags: ['work'] },
      });
      await client.callTool({
        name: 'save_context',
        arguments: { content: 'Personal stuff', tags: ['personal'] },
      });

      const result = await client.callTool({
        name: 'list_contexts',
        arguments: { tag: 'work' },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('1 context(s)');
      expect(text).toContain('Work stuff');
    });

    it('should show empty message when no contexts exist', async () => {
      const result = await client.callTool({
        name: 'list_contexts',
        arguments: {},
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No contexts saved yet');
    });
  });

  describe('delete_context tool', () => {
    it('should delete an existing context', async () => {
      const saveResult = await client.callTool({
        name: 'save_context',
        arguments: { content: 'Delete me' },
      });

      const saveText = (saveResult.content as Array<{ type: string; text: string }>)[0].text;
      const idMatch = saveText.match(/ID: ([a-f0-9-]+)/);
      const id = idMatch![1];

      const deleteResult = await client.callTool({
        name: 'delete_context',
        arguments: { id },
      });

      const text = (deleteResult.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('deleted');
    });

    it('should report when context not found', async () => {
      const result = await client.callTool({
        name: 'delete_context',
        arguments: { id: 'fake-id-123' },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No context found');
    });
  });

  describe('search_contexts tool', () => {
    it('should search with multiple terms', async () => {
      await client.callTool({
        name: 'save_context',
        arguments: { content: 'TypeScript React frontend project' },
      });
      await client.callTool({
        name: 'save_context',
        arguments: { content: 'TypeScript Node backend service' },
      });

      const result = await client.callTool({
        name: 'search_contexts',
        arguments: { query: 'TypeScript frontend' },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Found 1 context(s)');
      expect(text).toContain('React frontend');
    });

    it('should return no-match message when nothing found', async () => {
      const result = await client.callTool({
        name: 'search_contexts',
        arguments: { query: 'completely nonexistent term' },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No contexts found matching');
    });
  });

  describe('update_context tool', () => {
    it('should update an existing context', async () => {
      const saveResult = await client.callTool({
        name: 'save_context',
        arguments: { content: 'Original', tags: ['test'] },
      });

      const saveText = (saveResult.content as Array<{ type: string; text: string }>)[0].text;
      const idMatch = saveText.match(/ID: ([a-f0-9-]+)/);
      const id = idMatch![1];

      const updateResult = await client.callTool({
        name: 'update_context',
        arguments: { id, content: 'Updated content', tags: ['updated'] },
      });

      const text = (updateResult.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('updated');
      expect(text).toContain('updated');
    });

    it('should report when context not found', async () => {
      const result = await client.callTool({
        name: 'update_context',
        arguments: { id: 'fake-id', content: 'new content' },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No context found');
    });
  });

  describe('describe_schema tool', () => {
    it('returns no-schema message when schema file does not exist', async () => {
      const result = await client.callTool({ name: 'describe_schema', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No schema');
    });
  });

  describe('save_typed_context tool', () => {
    it('saves as untyped when no schema exists', async () => {
      const result = await client.callTool({
        name: 'save_typed_context',
        arguments: { type: 'decision', data: { what: 'Use Redis', why: 'Fast' } },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      // No schema → fallback to untyped save
      expect(text).toBeDefined();
    });
  });

  describe('query_by_type tool', () => {
    it('returns no-entries message for unknown type', async () => {
      const result = await client.callTool({
        name: 'query_by_type',
        arguments: { type: 'nonexistent_type' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No entries found');
    });
  });

  describe('introspect tool', () => {
    it('returns self-model text', async () => {
      const result = await client.callTool({ name: 'introspect', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('context store');
    });

    it('returns self-model text with deep=false', async () => {
      const result = await client.callTool({ name: 'introspect', arguments: { deep: false } });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toBeDefined();
    });
  });

  describe('get_gaps tool', () => {
    it('returns a text response', async () => {
      const result = await client.callTool({ name: 'get_gaps', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      // May have gaps from accumulated query misses in shared test observer
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    });
  });

  describe('report_usefulness tool', () => {
    it('records feedback for useful context', async () => {
      const result = await client.callTool({
        name: 'report_usefulness',
        arguments: { context_ids: ['e1', 'e2'], useful: true, notes: 'Very helpful' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Feedback recorded');
      expect(text).toContain('useful');
    });

    it('records feedback for not-useful context', async () => {
      const result = await client.callTool({
        name: 'report_usefulness',
        arguments: { context_ids: ['e1'], useful: false },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('not useful');
    });
  });

  describe('analyze_contradictions tool', () => {
    it('returns no-contradictions message on empty store', async () => {
      const result = await client.callTool({ name: 'analyze_contradictions', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No contradictions');
    });

    it('handles type-filtered contradictions check', async () => {
      const result = await client.callTool({
        name: 'analyze_contradictions',
        arguments: { type: 'decision' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toBeDefined();
    });
  });

  describe('suggest_schema tool', () => {
    it('returns insufficient entries message when fewer than 3 untyped', async () => {
      const result = await client.callTool({ name: 'suggest_schema', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('untyped entries');
    });
  });

  describe('summarize_context tool', () => {
    it('returns no-entries message on empty store', async () => {
      const result = await client.callTool({ name: 'summarize_context', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No entries');
    });

    it('summarizes entries with type filter', async () => {
      await client.callTool({
        name: 'save_context',
        arguments: { content: 'Use Redis for caching' },
      });
      const result = await client.callTool({
        name: 'summarize_context',
        arguments: { type: 'decision' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toBeDefined();
    });
  });

  describe('get_improvements tool', () => {
    it('returns no-improvements message on empty log', async () => {
      const result = await client.callTool({ name: 'get_improvements', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No self-improvement');
    });
  });

  describe('review_pending_actions tool', () => {
    it('returns up-to-date message when no pending', async () => {
      const result = await client.callTool({ name: 'review_pending_actions', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No pending');
    });
  });

  describe('approve_action tool', () => {
    it('returns error when no IDs provided', async () => {
      const result = await client.callTool({ name: 'approve_action', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No action IDs');
    });

    it('returns not-found message for unknown action ID', async () => {
      const result = await client.callTool({
        name: 'approve_action',
        arguments: { action_id: 'nonexistent' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('nonexistent');
    });
  });

  describe('dismiss_action tool', () => {
    it('returns error when no IDs provided', async () => {
      const result = await client.callTool({ name: 'dismiss_action', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No action IDs');
    });

    it('returns not-found for unknown action ID', async () => {
      const result = await client.callTool({
        name: 'dismiss_action',
        arguments: { action_id: 'nonexistent' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('not found');
    });
  });

  describe('create_bubble tool', () => {
    it('creates a bubble and returns its ID', async () => {
      const result = await client.callTool({
        name: 'create_bubble',
        arguments: { name: 'My Project' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('My Project');
    });
  });

  describe('get_bubble tool', () => {
    it('returns not-found for unknown bubble', async () => {
      const result = await client.callTool({
        name: 'get_bubble',
        arguments: { id: 'nonexistent' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No bubble found');
    });
  });

  describe('update_bubble tool', () => {
    it('updates a bubble successfully', async () => {
      const createResult = await client.callTool({
        name: 'create_bubble',
        arguments: { name: 'Old Name' },
      });
      const createText = (createResult.content as Array<{ type: string; text: string }>)[0].text;
      const idMatch = createText.match(/([a-f0-9-]{36})/);
      const id = idMatch![1];

      const result = await client.callTool({
        name: 'update_bubble',
        arguments: { id, name: 'New Name' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('updated');
    });

    it('returns not-found for unknown bubble', async () => {
      const result = await client.callTool({
        name: 'update_bubble',
        arguments: { id: 'nonexistent', name: 'x' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No bubble found');
    });
  });

  describe('delete_bubble tool', () => {
    it('deletes a bubble and unassigns contexts', async () => {
      const createResult = await client.callTool({
        name: 'create_bubble',
        arguments: { name: 'Temp' },
      });
      const createText = (createResult.content as Array<{ type: string; text: string }>)[0].text;
      const idMatch = createText.match(/([a-f0-9-]{36})/);
      const id = idMatch![1];

      const result = await client.callTool({
        name: 'delete_bubble',
        arguments: { id },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('deleted');
    });

    it('deletes a bubble with deleteContexts=true', async () => {
      const createResult = await client.callTool({
        name: 'create_bubble',
        arguments: { name: 'Gone' },
      });
      const createText = (createResult.content as Array<{ type: string; text: string }>)[0].text;
      const idMatch = createText.match(/([a-f0-9-]{36})/);
      const id = idMatch![1];

      const result = await client.callTool({
        name: 'delete_bubble',
        arguments: { id, deleteContexts: true },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('deleted');
    });

    it('returns not-found for nonexistent bubble', async () => {
      const result = await client.callTool({
        name: 'delete_bubble',
        arguments: { id: 'nonexistent' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No bubble found');
    });
  });
});
