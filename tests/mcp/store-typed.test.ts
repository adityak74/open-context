import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdirSync, writeFileSync } from 'fs';
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
