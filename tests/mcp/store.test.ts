import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { createStore } from '../../src/mcp/store.js';

function createTempStorePath(): string {
  const dir = join(tmpdir(), `opencontext-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'contexts.json');
}

describe('Context Store', () => {
  let storePath: string;

  beforeEach(() => {
    storePath = createTempStorePath();
  });

  afterEach(() => {
    const dir = storePath.substring(0, storePath.lastIndexOf('/'));
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true });
    }
  });

  describe('saveContext', () => {
    it('should save a context entry and return it with an ID', () => {
      const store = createStore(storePath);
      const entry = store.saveContext('My favorite color is blue');

      expect(entry.id).toBeDefined();
      expect(entry.content).toBe('My favorite color is blue');
      expect(entry.tags).toEqual([]);
      expect(entry.source).toBe('chat');
      expect(entry.createdAt).toBeDefined();
    });

    it('should save with tags and source', () => {
      const store = createStore(storePath);
      const entry = store.saveContext(
        'Use TypeScript for all projects',
        ['preference', 'code'],
        'code-review',
      );

      expect(entry.tags).toEqual(['preference', 'code']);
      expect(entry.source).toBe('code-review');
    });

    it('should persist entries to disk', () => {
      const store1 = createStore(storePath);
      store1.saveContext('Entry one');
      store1.saveContext('Entry two');

      const store2 = createStore(storePath);
      const all = store2.listContexts();
      expect(all).toHaveLength(2);
    });

    it('should create the store file if it does not exist', () => {
      expect(existsSync(storePath)).toBe(false);
      const store = createStore(storePath);
      store.saveContext('Test');
      expect(existsSync(storePath)).toBe(true);
    });
  });

  describe('recallContext', () => {
    it('should find contexts matching content', () => {
      const store = createStore(storePath);
      store.saveContext('I prefer dark mode');
      store.saveContext('My cat is named Luna');
      store.saveContext('Dark themes are better for my eyes');

      const results = store.recallContext('dark');
      expect(results).toHaveLength(2);
      expect(results[0].content).toBe('I prefer dark mode');
      expect(results[1].content).toBe('Dark themes are better for my eyes');
    });

    it('should find contexts matching tags', () => {
      const store = createStore(storePath);
      store.saveContext('Use Prettier for formatting', ['tooling']);
      store.saveContext('TypeScript is preferred', ['language']);

      const results = store.recallContext('tooling');
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Use Prettier for formatting');
    });

    it('should return empty array when no match', () => {
      const store = createStore(storePath);
      store.saveContext('Something unrelated');

      const results = store.recallContext('xyz-not-found');
      expect(results).toHaveLength(0);
    });

    it('should be case-insensitive', () => {
      const store = createStore(storePath);
      store.saveContext('TypeScript is great');

      const results = store.recallContext('typescript');
      expect(results).toHaveLength(1);
    });
  });

  describe('listContexts', () => {
    it('should list all contexts when no tag specified', () => {
      const store = createStore(storePath);
      store.saveContext('One');
      store.saveContext('Two');
      store.saveContext('Three');

      const all = store.listContexts();
      expect(all).toHaveLength(3);
    });

    it('should filter by tag', () => {
      const store = createStore(storePath);
      store.saveContext('A', ['work']);
      store.saveContext('B', ['personal']);
      store.saveContext('C', ['work', 'important']);

      const workItems = store.listContexts('work');
      expect(workItems).toHaveLength(2);
    });

    it('should return empty array for empty store', () => {
      const store = createStore(storePath);
      const all = store.listContexts();
      expect(all).toHaveLength(0);
    });

    it('should be case-insensitive for tag filter', () => {
      const store = createStore(storePath);
      store.saveContext('A', ['Work']);

      const results = store.listContexts('work');
      expect(results).toHaveLength(1);
    });
  });

  describe('deleteContext', () => {
    it('should delete an existing context', () => {
      const store = createStore(storePath);
      const entry = store.saveContext('To be deleted');

      const deleted = store.deleteContext(entry.id);
      expect(deleted).toBe(true);

      const all = store.listContexts();
      expect(all).toHaveLength(0);
    });

    it('should return false for non-existent ID', () => {
      const store = createStore(storePath);
      const deleted = store.deleteContext('non-existent-id');
      expect(deleted).toBe(false);
    });

    it('should only delete the targeted context', () => {
      const store = createStore(storePath);
      const entry1 = store.saveContext('Keep me');
      const entry2 = store.saveContext('Delete me');

      store.deleteContext(entry2.id);
      const all = store.listContexts();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(entry1.id);
    });
  });

  describe('searchContexts', () => {
    it('should find contexts matching all search terms', () => {
      const store = createStore(storePath);
      store.saveContext('TypeScript React project');
      store.saveContext('TypeScript Node.js backend');
      store.saveContext('Python Flask API');

      const results = store.searchContexts('TypeScript project');
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('TypeScript React project');
    });

    it('should search across content, tags, and source', () => {
      const store = createStore(storePath);
      store.saveContext('Some content', ['react'], 'meeting');

      const results = store.searchContexts('react meeting');
      expect(results).toHaveLength(1);
    });

    it('should return empty when not all terms match', () => {
      const store = createStore(storePath);
      store.saveContext('TypeScript is great');

      const results = store.searchContexts('TypeScript Python');
      expect(results).toHaveLength(0);
    });
  });

  describe('getContext', () => {
    it('should get a specific context by ID', () => {
      const store = createStore(storePath);
      const entry = store.saveContext('Find me');

      const found = store.getContext(entry.id);
      expect(found).toBeDefined();
      expect(found!.content).toBe('Find me');
    });

    it('should return undefined for non-existent ID', () => {
      const store = createStore(storePath);
      const found = store.getContext('does-not-exist');
      expect(found).toBeUndefined();
    });
  });

  describe('updateContext', () => {
    it('should update content of an existing context', () => {
      const store = createStore(storePath);
      const entry = store.saveContext('Original content');

      const updated = store.updateContext(entry.id, 'Updated content');
      expect(updated).toBeDefined();
      expect(updated!.content).toBe('Updated content');
      expect(updated!.updatedAt).not.toBe(entry.createdAt);
    });

    it('should update tags when provided', () => {
      const store = createStore(storePath);
      const entry = store.saveContext('Content', ['old-tag']);

      const updated = store.updateContext(entry.id, 'Content', ['new-tag']);
      expect(updated!.tags).toEqual(['new-tag']);
    });

    it('should keep existing tags when tags not provided', () => {
      const store = createStore(storePath);
      const entry = store.saveContext('Content', ['keep-me']);

      const updated = store.updateContext(entry.id, 'New content');
      expect(updated!.tags).toEqual(['keep-me']);
    });

    it('should return undefined for non-existent ID', () => {
      const store = createStore(storePath);
      const result = store.updateContext('fake-id', 'content');
      expect(result).toBeUndefined();
    });

    it('should persist updates to disk', () => {
      const store1 = createStore(storePath);
      const entry = store1.saveContext('Original');
      store1.updateContext(entry.id, 'Updated');

      const store2 = createStore(storePath);
      const found = store2.getContext(entry.id);
      expect(found!.content).toBe('Updated');
    });
  });
});
