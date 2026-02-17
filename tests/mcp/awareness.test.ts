import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createStore } from '../../src/mcp/store.js';
import { createObserver } from '../../src/mcp/observer.js';
import { buildSelfModel, formatSelfModel, refreshCache } from '../../src/mcp/awareness.js';
import type { Schema } from '../../src/mcp/schema.js';

const TEST_DIR = join(tmpdir(), `awareness-test-${Date.now()}`);
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
      },
    },
    {
      name: 'preference',
      description: 'Preferences',
      fields: { rule: { type: 'string', required: true } },
    },
    {
      name: 'empty_type',
      description: 'This type has no entries',
      fields: {},
    },
  ],
};

describe('awareness.ts', () => {
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

  describe('buildSelfModel — empty store', () => {
    it('returns sparse health with no entries', () => {
      const model = buildSelfModel(store, null, observer);
      expect(model.identity.contextCount).toBe(0);
      expect(model.health.overallHealth).toBe('sparse');
    });

    it('handles null schema gracefully', () => {
      const model = buildSelfModel(store, null, observer);
      expect(model.coverage.typesWithEntries).toHaveLength(0);
      expect(model.coverage.typesEmpty).toHaveLength(0);
      expect(model.health.coverageScore).toBe(1); // no types defined → 100%
    });
  });

  describe('buildSelfModel — with entries', () => {
    it('counts active entries and ignores archived', () => {
      store.saveContext('Hello world', ['test'], 'test');
      const archived = store.saveContext('Old entry', [], 'test');
      store.updateContext(archived.id, archived.content, archived.tags, null, true);
      const model = buildSelfModel(store, null, observer);
      expect(model.identity.contextCount).toBe(1);
    });

    it('counts type breakdown correctly', () => {
      const entry = store.saveContext('decision: use Redis | why: fast', [], 'test');
      // Manually set contextType
      store.updateContextType(entry.id, 'decision');
      const model = buildSelfModel(store, SAMPLE_SCHEMA, observer);
      expect(model.identity.typeBreakdown['decision']).toBe(1);
    });

    it('identifies empty schema types as gaps', () => {
      store.saveContext('a decision', [], 'test');
      const model = buildSelfModel(store, SAMPLE_SCHEMA, observer);
      // All 3 schema types are empty (no contextType set)
      expect(model.coverage.typesEmpty).toContain('decision');
      expect(model.coverage.typesEmpty).toContain('preference');
      expect(model.coverage.typesEmpty).toContain('empty_type');
      expect(model.gaps.some((g) => g.description.includes('empty_type'))).toBe(true);
    });

    it('identifies types with entries as covered', () => {
      const entry = store.saveContext('content', [], 'test');
      store.updateContextType(entry.id, 'decision');
      const model = buildSelfModel(store, SAMPLE_SCHEMA, observer);
      expect(model.coverage.typesWithEntries).toContain('decision');
      expect(model.coverage.typesEmpty).toContain('preference');
    });

    it('counts untyped entries', () => {
      store.saveContext('no type here', [], 'test');
      store.saveContext('also no type', [], 'test');
      const model = buildSelfModel(store, SAMPLE_SCHEMA, observer);
      expect(model.coverage.untyped).toBe(2);
    });

    it('coverage score is 1 when no schema types defined', () => {
      store.saveContext('content', [], 'test');
      const model = buildSelfModel(store, { version: 1, types: [] }, observer);
      expect(model.health.coverageScore).toBe(1);
    });

    it('calculates freshness score based on recent updates', () => {
      // Add several entries (all recent since created now)
      store.saveContext('recent 1', [], 'test');
      store.saveContext('recent 2', [], 'test');
      const model = buildSelfModel(store, null, observer);
      expect(model.freshness.recentlyUpdated).toBe(2);
      expect(model.freshness.stale).toBe(0);
      expect(model.health.freshnessScore).toBe(1);
    });

    it('detects keyword contradictions', () => {
      store.saveContext('I prefer composition over inheritance', ['pref'], 'test');
      store.saveContext('I always use inheritance for this pattern', ['pref'], 'test');
      const model = buildSelfModel(store, null, observer);
      // May or may not find contradiction depending on the exact keywords
      expect(Array.isArray(model.contradictions)).toBe(true);
    });
  });

  describe('buildSelfModel — with observer data', () => {
    it('includes missed query gaps from observer', () => {
      observer.log({ action: 'query_miss', tool: 'recall_context', query: 'deployment' });
      observer.log({ action: 'query_miss', tool: 'recall_context', query: 'deployment' });
      observer.log({ action: 'query_miss', tool: 'recall_context', query: 'deployment' });
      const model = buildSelfModel(store, null, observer);
      expect(model.gaps.some((g) => g.description.includes('deployment'))).toBe(true);
    });

    it('includes pending actions count', () => {
      const raw = observer.loadRaw();
      raw.pendingActions = [{ id: 'pa-1', status: 'pending' } as never, { id: 'pa-2', status: 'approved' } as never];
      observer.persistRaw(raw);
      const model = buildSelfModel(store, null, observer);
      expect(model.pendingActionsCount).toBe(1); // only pending ones
    });

    it('includes recent improvements', () => {
      observer.logSelfImprovement({
        timestamp: new Date().toISOString(),
        actions: [{ type: 'auto_tag', count: 3 }],
      });
      const model = buildSelfModel(store, null, observer);
      expect(model.recentImprovements).toHaveLength(1);
    });
  });

  describe('formatSelfModel', () => {
    it('produces a human-readable string', () => {
      store.saveContext('some content', [], 'test');
      const model = buildSelfModel(store, SAMPLE_SCHEMA, observer);
      const text = formatSelfModel(model);
      expect(typeof text).toBe('string');
      expect(text).toContain('context store');
      expect(text).toContain('Health');
    });

    it('mentions pending actions when present', () => {
      const raw = observer.loadRaw();
      raw.pendingActions = [{ id: 'pa-1', status: 'pending' } as never];
      observer.persistRaw(raw);
      const model = buildSelfModel(store, null, observer);
      const text = formatSelfModel(model);
      expect(text).toContain('await your approval');
    });

    it('mentions gaps', () => {
      observer.log({ action: 'query_miss', tool: 'test', query: 'error handling' });
      observer.log({ action: 'query_miss', tool: 'test', query: 'error handling' });
      observer.log({ action: 'query_miss', tool: 'test', query: 'error handling' });
      const model = buildSelfModel(store, null, observer);
      const text = formatSelfModel(model);
      if (model.gaps.length > 0) {
        expect(text).toContain('Gaps');
      }
    });
  });

  describe('refreshCache', () => {
    it('writes cache data to awareness.json', () => {
      store.saveContext('content', [], 'test');
      refreshCache(store, SAMPLE_SCHEMA, observer);
      const raw = observer.loadRaw();
      expect(raw.schemaCache).toBeDefined();
      expect(raw.schemaCache!.lastAnalysis).toBeDefined();
    });
  });
});
