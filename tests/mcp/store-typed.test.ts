import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createStore } from '../../src/mcp/store.js';
import { createObserver } from '../../src/mcp/observer.js';
import type { Schema } from '../../src/mcp/schema.js';

const TEST_DIR = join(tmpdir(), `store-typed-test-${Date.now()}`);
const STORE_PATH = join(TEST_DIR, 'contexts.json');
const OBS_PATH = join(TEST_DIR, 'awareness.json');

const SAMPLE_SCHEMA: Schema = {
  version: 1,
  types: [
    {
      name: 'decision',
      description: 'Decisions',
      fields: {
        what: { type: 'string', required: true },
        why: { type: 'string', required: true },
        project: { type: 'string' },
      },
    },
    {
      name: 'preference',
      description: 'Preferences',
      fields: { rule: { type: 'string', required: true } },
    },
  ],
};

describe('store.ts — typed context', () => {
  let store: ReturnType<typeof createStore>;
  let observer: ReturnType<typeof createObserver>;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    observer = createObserver(OBS_PATH);
    store = createStore(STORE_PATH, observer);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('saveTypedContext', () => {
    it('saves a typed entry and sets contextType', () => {
      const { entry, errors } = store.saveTypedContext(
        SAMPLE_SCHEMA,
        'decision',
        { what: 'Use Redis', why: 'Performance' },
        ['cache'],
        'test',
      );
      expect(errors).toHaveLength(0);
      expect(entry.contextType).toBe('decision');
      expect(entry.structuredData).toEqual({ what: 'Use Redis', why: 'Performance' });
      expect(entry.tags).toContain('cache');
    });

    it('returns validation errors for missing required fields', () => {
      const { errors } = store.saveTypedContext(
        SAMPLE_SCHEMA,
        'decision',
        { what: 'Incomplete' }, // missing 'why'
        [],
        'test',
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('"why"'))).toBe(true);
    });

    it('still saves the entry even with validation errors', () => {
      const { entry } = store.saveTypedContext(
        SAMPLE_SCHEMA,
        'decision',
        { what: 'Only this' },
        [],
        'test',
      );
      expect(entry.id).toBeDefined();
    });

    it('entry content includes type and data fields', () => {
      const { entry } = store.saveTypedContext(
        SAMPLE_SCHEMA,
        'decision',
        { what: 'PostgreSQL', why: 'JSON support' },
        [],
        'test',
      );
      expect(entry.content).toContain('[decision]');
      expect(entry.content).toContain('PostgreSQL');
    });

    it('logs write event to observer', () => {
      store.saveTypedContext(SAMPLE_SCHEMA, 'preference', { rule: 'Use TypeScript' }, [], 'test');
      const summary = observer.getSummary();
      // At least 2 writes: one from saveContext, one from saveTypedContext observer.log
      expect(summary.totalWrites).toBeGreaterThan(0);
    });

    it('handles bubbleId parameter', () => {
      const { entry } = store.saveTypedContext(
        SAMPLE_SCHEMA,
        'decision',
        { what: 'x', why: 'y' },
        [],
        'test',
        'bubble-123',
      );
      expect(entry.bubbleId).toBe('bubble-123');
    });
  });

  describe('queryByType', () => {
    beforeEach(() => {
      store.saveTypedContext(SAMPLE_SCHEMA, 'decision', { what: 'Redis', why: 'Fast', project: 'api' }, [], 'test');
      store.saveTypedContext(SAMPLE_SCHEMA, 'decision', { what: 'Postgres', why: 'Reliable', project: 'web' }, [], 'test');
      store.saveTypedContext(SAMPLE_SCHEMA, 'preference', { rule: 'Use TypeScript' }, [], 'test');
    });

    it('returns all entries of a given type', () => {
      const results = store.queryByType('decision');
      expect(results).toHaveLength(2);
      results.forEach((e) => expect(e.contextType).toBe('decision'));
    });

    it('returns empty array for unknown type', () => {
      expect(store.queryByType('bug_pattern')).toHaveLength(0);
    });

    it('filters by structured data field', () => {
      const results = store.queryByType('decision', { project: 'api' });
      expect(results).toHaveLength(1);
      expect(results[0]!.structuredData!['project']).toBe('api');
    });

    it('returns empty array when filter matches nothing', () => {
      const results = store.queryByType('decision', { project: 'mobile' });
      expect(results).toHaveLength(0);
    });

    it('excludes archived entries', () => {
      const [entry] = store.queryByType('decision');
      store.updateContext(entry!.id, entry!.content, entry!.tags, null, true);
      const results = store.queryByType('decision');
      expect(results).toHaveLength(1);
    });

    it('filter returns false for entries without structuredData', () => {
      // Manually add a context with contextType=decision but no structuredData
      const entry = store.saveContext('[decision] manual', [], 'test');
      store.updateContextType(entry.id, 'decision');
      // Now filter by a field — this entry has no structuredData → should be excluded
      const results = store.queryByType('decision', { project: 'api' });
      // The manual entry has no structuredData, so it's excluded
      const hasManualEntry = results.some((r) => r.id === entry.id);
      expect(hasManualEntry).toBe(false);
    });

    it('logs read event to observer', () => {
      store.queryByType('decision');
      const summary = observer.getSummary();
      expect(summary.totalReads).toBeGreaterThan(0);
    });
  });

  describe('updateContext with archived flag', () => {
    it('sets archived = true', () => {
      const entry = store.saveContext('to be archived', [], 'test');
      store.updateContext(entry.id, entry.content, entry.tags, null, true);
      const fetched = store.getContext(entry.id);
      expect(fetched!.archived).toBe(true);
    });

    it('archived entries are excluded from recallContext', () => {
      const entry = store.saveContext('secret archived content', ['test'], 'test');
      store.updateContext(entry.id, entry.content, entry.tags, null, true);
      const results = store.recallContext('secret archived');
      expect(results.find((e) => e.id === entry.id)).toBeUndefined();
    });
  });

  describe('updateContextType', () => {
    it('sets contextType on an existing entry', () => {
      const entry = store.saveContext('untyped content', [], 'test');
      expect(entry.contextType).toBeUndefined();
      const updated = store.updateContextType(entry.id, 'decision');
      expect(updated).not.toBeUndefined();
      expect(updated!.contextType).toBe('decision');
    });

    it('returns undefined for unknown ID', () => {
      expect(store.updateContextType('nonexistent', 'decision')).toBeUndefined();
    });

    it('change persists across store instances', () => {
      const entry = store.saveContext('content', [], 'test');
      store.updateContextType(entry.id, 'preference');
      const store2 = createStore(STORE_PATH);
      const fetched = store2.getContext(entry.id);
      expect(fetched!.contextType).toBe('preference');
    });
  });
});

describe('store.ts — migration and edge cases', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('migrates old store files that lack the bubbles field', () => {
    // Write a store file without the bubbles field (pre-migration format)
    const oldFormat = JSON.stringify({ version: 1, entries: [] });
    writeFileSync(STORE_PATH, oldFormat, 'utf-8');
    const store = createStore(STORE_PATH);
    // Should be loadable without error, bubbles defaults to []
    expect(store.listBubbles()).toEqual([]);
  });

  it('updateContext with bubbleId=null removes the bubbleId', () => {
    const store = createStore(STORE_PATH);
    const bubble = store.createBubble('Temp');
    const entry = store.saveContext('content', [], 'test', bubble.id);
    expect(entry.bubbleId).toBe(bubble.id);
    // Pass null to remove the bubbleId
    store.updateContext(entry.id, entry.content, entry.tags, null);
    const updated = store.getContext(entry.id);
    expect(updated!.bubbleId).toBeUndefined();
  });

  it('updateContext with a non-null bubbleId sets the bubbleId', () => {
    const store = createStore(STORE_PATH);
    const b1 = store.createBubble('Project A');
    const b2 = store.createBubble('Project B');
    const entry = store.saveContext('content', [], 'test', b1.id);
    // Update to a different bubble
    store.updateContext(entry.id, entry.content, entry.tags, b2.id);
    const updated = store.getContext(entry.id);
    expect(updated!.bubbleId).toBe(b2.id);
  });

  it('listContextsByBubble returns only entries in that bubble', () => {
    const store = createStore(STORE_PATH);
    const b = store.createBubble('Project');
    store.saveContext('in bubble', [], 'test', b.id);
    store.saveContext('not in bubble', [], 'test');
    const results = store.listContextsByBubble(b.id);
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe('in bubble');
  });
});

describe('store.ts — bubble CRUD', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    store = createStore(STORE_PATH);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('createBubble', () => {
    it('creates a bubble without description', () => {
      const bubble = store.createBubble('My Project');
      expect(bubble.id).toBeDefined();
      expect(bubble.name).toBe('My Project');
      expect(bubble.description).toBeUndefined();
    });

    it('creates a bubble with description', () => {
      const bubble = store.createBubble('API Project', 'REST API for the app');
      expect(bubble.description).toBe('REST API for the app');
    });

    it('lists created bubbles', () => {
      store.createBubble('Bubble A');
      store.createBubble('Bubble B');
      expect(store.listBubbles()).toHaveLength(2);
    });

    it('getBubble returns the correct bubble', () => {
      const b = store.createBubble('Find Me');
      const found = store.getBubble(b.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Find Me');
    });

    it('getBubble returns undefined for unknown ID', () => {
      expect(store.getBubble('nonexistent')).toBeUndefined();
    });
  });

  describe('updateBubble', () => {
    it('updates bubble name', () => {
      const b = store.createBubble('Old Name');
      const updated = store.updateBubble(b.id, 'New Name');
      expect(updated!.name).toBe('New Name');
    });

    it('updates bubble description', () => {
      const b = store.createBubble('Proj', 'Old desc');
      const updated = store.updateBubble(b.id, 'Proj', 'New desc');
      expect(updated!.description).toBe('New desc');
    });

    it('returns undefined for nonexistent bubble', () => {
      expect(store.updateBubble('nonexistent', 'name')).toBeUndefined();
    });
  });

  describe('deleteBubble', () => {
    it('returns false when bubble not found', () => {
      expect(store.deleteBubble('nonexistent')).toBe(false);
    });

    it('deletes bubble and unassigns its contexts', () => {
      const b = store.createBubble('Project X');
      store.saveContext('Entry in bubble', [], 'test', b.id);
      const deleted = store.deleteBubble(b.id, false);
      expect(deleted).toBe(true);
      expect(store.listBubbles()).toHaveLength(0);
      // Context should be unassigned (not deleted)
      const entries = store.listContexts();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.bubbleId).toBeUndefined();
    });

    it('deletes bubble and also deletes its contexts when deleteContexts=true', () => {
      const b = store.createBubble('Temp Project');
      store.saveContext('First entry', [], 'test', b.id);
      store.saveContext('Second entry', [], 'test', b.id);
      store.saveContext('Unrelated entry', [], 'test');
      store.deleteBubble(b.id, true);
      // Only the unrelated entry should remain
      expect(store.listContexts()).toHaveLength(1);
    });

    it('unassign loop visits entries from other bubbles (false branch)', () => {
      const b1 = store.createBubble('Bubble 1');
      const b2 = store.createBubble('Bubble 2');
      store.saveContext('In B1', [], 'test', b1.id);
      store.saveContext('In B2', [], 'test', b2.id);
      store.saveContext('No bubble', [], 'test');
      // Delete b1 without deleteContexts — the forEach visits b2 entry (false branch) and no-bubble entry
      store.deleteBubble(b1.id, false);
      // b2 entry should still have its bubbleId
      const b2entries = store.listContextsByBubble(b2.id);
      expect(b2entries).toHaveLength(1);
      // b1 entry should be unassigned
      const all = store.listContexts();
      expect(all.find((e) => e.content === 'In B1')?.bubbleId).toBeUndefined();
    });
  });
});
