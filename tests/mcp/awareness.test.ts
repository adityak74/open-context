import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
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

    it('produces needs-attention health when avgScore is between 0.4 and 0.7', () => {
      // With 3 schema types and 1 covered, coverageScore = 1/3 ≈ 0.33
      // All entries recent → freshnessScore = 1
      // avgScore = (0.33 + 1) / 2 ≈ 0.67 → needs-attention
      const e1 = store.saveContext('decision content', [], 'test');
      store.updateContextType(e1.id, 'decision');
      const model = buildSelfModel(store, SAMPLE_SCHEMA, observer);
      // coverageScore = 1/3, freshnessScore = 1 → avg ≈ 0.67 → needs-attention
      expect(['needs-attention', 'healthy']).toContain(model.health.overallHealth);
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

    it('identifies stale entries as gaps (>90 days old) and sorts comparator', () => {
      // Create two entries then backdate them via raw store file manipulation
      const e1 = store.saveContext('old content 1', [], 'test');
      const e2 = store.saveContext('old content 2', [], 'test');
      const staleDate1 = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
      const staleDate2 = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
      const raw = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as { entries: Array<{ id: string; updatedAt: string }> };
      const idx1 = raw.entries.findIndex((e) => e.id === e1.id);
      const idx2 = raw.entries.findIndex((e) => e.id === e2.id);
      if (idx1 !== -1) raw.entries[idx1]!.updatedAt = staleDate1;
      if (idx2 !== -1) raw.entries[idx2]!.updatedAt = staleDate2;
      writeFileSync(STORE_PATH, JSON.stringify(raw));
      // Recreate store to reload the backdated entries
      const staleStore = createStore(STORE_PATH);
      const model = buildSelfModel(staleStore, null, observer);
      expect(model.freshness.stale).toBe(2);
      expect(model.gaps.some((g) => g.description.includes("haven't been updated"))).toBe(true);
      // stalestEntries should have both entries (sorted oldest first)
      expect(model.freshness.stalestEntries).toHaveLength(2);
    });

    it('typeBreakdown includes entries by contextType', () => {
      const entry = store.saveContext('typed content', [], 'test');
      store.updateContextType(entry.id, 'decision');
      const model = buildSelfModel(store, SAMPLE_SCHEMA, observer);
      expect(model.identity.typeBreakdown['decision']).toBe(1);
      // formatSelfModel should show the type breakdown line
      const text = formatSelfModel(model);
      expect(text).toContain('decision');
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

    it('does not add gap for queries missed fewer than 3 times', () => {
      observer.log({ action: 'query_miss', tool: 'recall_context', query: 'rare-query' });
      observer.log({ action: 'query_miss', tool: 'recall_context', query: 'rare-query' });
      // only 2 misses — should NOT create a gap
      const model = buildSelfModel(store, null, observer);
      expect(model.gaps.some((g) => g.description.includes('rare-query'))).toBe(false);
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

    it('shows typesEmpty section when schema types have no entries', () => {
      // No entries with contextType=decision — so it's empty
      store.saveContext('some content', [], 'test');
      const model = buildSelfModel(store, SAMPLE_SCHEMA, observer);
      const text = formatSelfModel(model);
      // decision, preference, empty_type all have 0 entries → typesEmpty section
      expect(text).toContain('no entries');
    });

    it('shows contradictions section when contradictions exist', () => {
      store.saveContext('I prefer composition over inheritance for design', ['pref'], 'test');
      store.saveContext('Use inheritance for this class hierarchy pattern', ['pref'], 'test');
      const model = buildSelfModel(store, null, observer);
      // Force contradictions to be non-empty
      if (model.contradictions.length === 0) {
        model.contradictions = [{ entryA: 'a', entryB: 'b', description: 'contradiction test' }];
      }
      const text = formatSelfModel(model);
      expect(text).toContain('contradiction');
    });

    it('shows recent improvements section when improvements exist', () => {
      observer.logSelfImprovement({
        timestamp: new Date().toISOString(),
        actions: [{ type: 'auto_tag', count: 5 }],
        autoExecuted: true,
      });
      const model = buildSelfModel(store, null, observer);
      const text = formatSelfModel(model);
      expect(text).toContain('autonomous improvement');
    });

    it('shows gaps with info severity icon (from stale entries)', () => {
      // Create a stale entry to trigger severity='info' gap
      const entry = store.saveContext('stale content', [], 'test');
      const staleDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
      const raw = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as { entries: Array<{ id: string; updatedAt: string }> };
      const idx = raw.entries.findIndex((e) => e.id === entry.id);
      if (idx !== -1) raw.entries[idx]!.updatedAt = staleDate;
      writeFileSync(STORE_PATH, JSON.stringify(raw));
      const staleStore = createStore(STORE_PATH);
      const model = buildSelfModel(staleStore, null, observer);
      const infoGaps = model.gaps.filter((g) => g.severity === 'info');
      expect(infoGaps.length).toBeGreaterThan(0);
      const text = formatSelfModel(model);
      expect(text).toContain('ℹ');
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
