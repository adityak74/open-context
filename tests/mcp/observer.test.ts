import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createObserver } from '../../src/mcp/observer.js';

const TEST_DIR = join(tmpdir(), `observer-test-${Date.now()}`);
const OBS_PATH = join(TEST_DIR, 'awareness.json');

describe('observer.ts', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('starts with empty state', () => {
    const obs = createObserver(OBS_PATH);
    const summary = obs.getSummary();
    expect(summary.totalReads).toBe(0);
    expect(summary.totalWrites).toBe(0);
    expect(summary.totalMisses).toBe(0);
    expect(summary.missedQueries).toHaveLength(0);
  });

  it('tracks write events', () => {
    const obs = createObserver(OBS_PATH);
    obs.log({ action: 'write', tool: 'save_context', entryIds: ['e1'] });
    obs.log({ action: 'write', tool: 'save_context', entryIds: ['e2'] });
    const summary = obs.getSummary();
    expect(summary.totalWrites).toBe(2);
  });

  it('tracks read events', () => {
    const obs = createObserver(OBS_PATH);
    obs.log({ action: 'read', tool: 'recall_context', query: 'auth', entryIds: ['e1'] });
    const summary = obs.getSummary();
    expect(summary.totalReads).toBe(1);
  });

  it('tracks query misses', () => {
    const obs = createObserver(OBS_PATH);
    obs.log({ action: 'query_miss', tool: 'recall_context', query: 'deployment' });
    obs.log({ action: 'query_miss', tool: 'recall_context', query: 'deployment' });
    obs.log({ action: 'query_miss', tool: 'recall_context', query: 'testing' });
    const summary = obs.getSummary();
    expect(summary.totalMisses).toBe(3);
    expect(summary.missedQueryCount['deployment']).toBe(2);
    expect(summary.missedQueryCount['testing']).toBe(1);
    expect(summary.missedQueries).toContain('deployment');
    expect(summary.missedQueries).toContain('testing');
  });

  it('tracks type frequency', () => {
    const obs = createObserver(OBS_PATH);
    obs.log({ action: 'read', tool: 'query_by_type', contextType: 'decision', entryIds: [] });
    obs.log({ action: 'read', tool: 'query_by_type', contextType: 'decision', entryIds: [] });
    obs.log({ action: 'write', tool: 'save_typed_context', contextType: 'preference', entryIds: ['e1'] });
    const popularity = obs.getTypePopularity();
    expect(popularity['decision']?.reads).toBe(2);
    expect(popularity['preference']?.writes).toBe(1);
  });

  it('getMissedQueries returns unique queries', () => {
    const obs = createObserver(OBS_PATH);
    obs.log({ action: 'query_miss', tool: 'recall_context', query: 'auth' });
    obs.log({ action: 'query_miss', tool: 'recall_context', query: 'auth' });
    obs.log({ action: 'query_miss', tool: 'recall_context', query: 'deploy' });
    const missed = obs.getMissedQueries();
    expect(missed).toContain('auth');
    expect(missed).toContain('deploy');
    expect(missed.filter((q) => q === 'auth')).toHaveLength(1);
  });

  it('persists and reloads state across instances', () => {
    const obs1 = createObserver(OBS_PATH);
    obs1.log({ action: 'write', tool: 'save_context', entryIds: ['e1'] });
    obs1.log({ action: 'query_miss', tool: 'recall_context', query: 'test' });

    const obs2 = createObserver(OBS_PATH);
    const summary = obs2.getSummary();
    expect(summary.totalWrites).toBe(1);
    expect(summary.totalMisses).toBe(1);
  });

  it('logSelfImprovement records improvement records', () => {
    const obs = createObserver(OBS_PATH);
    obs.logSelfImprovement({
      timestamp: new Date().toISOString(),
      actions: [{ type: 'auto_tag', count: 3 }],
      autoExecuted: true,
    });
    const recent = obs.getRecentImprovements();
    expect(recent).toHaveLength(1);
    expect(recent[0]!.actions[0]!.type).toBe('auto_tag');
  });

  it('getRecentImprovements filters by since date', () => {
    const obs = createObserver(OBS_PATH);
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    obs.logSelfImprovement({ timestamp: old, actions: [{ type: 'auto_tag', count: 1 }] });
    obs.logSelfImprovement({
      timestamp: new Date().toISOString(),
      actions: [{ type: 'create_gap_stubs', count: 2 }],
    });
    const lastDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = obs.getRecentImprovements(lastDay);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.actions[0]!.type).toBe('create_gap_stubs');
  });

  it('loadRaw and persistRaw round-trip', () => {
    const obs = createObserver(OBS_PATH);
    const raw = obs.loadRaw();
    raw.pendingActions = [{ id: 'pa-1', status: 'pending' } as never];
    obs.persistRaw(raw);
    const reloaded = obs.loadRaw();
    expect(reloaded.pendingActions).toHaveLength(1);
    expect(reloaded.pendingActions[0]!.id).toBe('pa-1');
  });

  it('rotateIfNeeded does not throw on small logs', () => {
    const obs = createObserver(OBS_PATH);
    expect(() => obs.rotateIfNeeded()).not.toThrow();
  });

  it('filePath is accessible', () => {
    const obs = createObserver(OBS_PATH);
    expect(obs.filePath).toBe(OBS_PATH);
  });

  it('loadRaw returns empty state when file contains invalid JSON', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(OBS_PATH, 'this is not valid json!!!', 'utf-8');
    const obs = createObserver(OBS_PATH);
    const raw = obs.loadRaw();
    expect(raw.events).toEqual([]);
    expect(raw.improvements).toEqual([]);
  });

  it('loadRaw fills missing fields from partial JSON (null-coalescing branches)', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    // Write a partial file without events, improvements, etc.
    writeFileSync(OBS_PATH, JSON.stringify({ summary: null }), 'utf-8');
    const obs = createObserver(OBS_PATH);
    const raw = obs.loadRaw();
    expect(raw.events).toEqual([]);
    expect(raw.improvements).toEqual([]);
    expect(raw.pendingActions).toEqual([]);
    expect(raw.protections).toEqual([]);
  });

  it('query_miss without query field does not crash', () => {
    const obs = createObserver(OBS_PATH);
    // Log a query_miss without a query property
    obs.log({ action: 'query_miss', tool: 'test' } as never);
    const summary = obs.getSummary();
    expect(summary.totalMisses).toBe(1);
    // missedQueries should remain empty since no query was provided
    expect(summary.missedQueries).toHaveLength(0);
  });

  it('persistRaw creates parent directory if it does not exist', () => {
    const deepPath = join(TEST_DIR, 'nested', 'subdir', 'awareness.json');
    const obs = createObserver(deepPath);
    // This should create the nested directory
    expect(() => obs.persistRaw(obs.loadRaw())).not.toThrow();
  });

  it('trims events when they exceed MAX_EVENTS (1000)', () => {
    const obs = createObserver(OBS_PATH);
    // Manually inject >1000 events via persistRaw
    const raw = obs.loadRaw();
    raw.events = Array.from({ length: 1005 }, (_, i) => ({
      timestamp: new Date().toISOString(),
      action: 'read' as const,
      tool: 'test',
      contextType: `type-${i}`,
    }));
    obs.persistRaw(raw);
    // Logging one more event triggers the rotation check in log()
    obs.log({ action: 'write', tool: 'trigger', entryIds: [] });
    const reloaded = obs.loadRaw();
    // Should have been trimmed to TRIM_TO (500) + 1
    expect(reloaded.events.length).toBeLessThanOrEqual(502);
  });

  it('logSelfImprovement trims improvements when they exceed 200', () => {
    const obs = createObserver(OBS_PATH);
    // Inject 201 improvement records
    const raw = obs.loadRaw();
    raw.improvements = Array.from({ length: 201 }, (_, i) => ({
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      actions: [{ type: 'auto_tag', count: 1 }],
    }));
    obs.persistRaw(raw);
    // One more logSelfImprovement triggers the trim
    obs.logSelfImprovement({ timestamp: new Date().toISOString(), actions: [{ type: 'auto_tag', count: 1 }] });
    const after = obs.loadRaw();
    expect(after.improvements.length).toBeLessThanOrEqual(101);
  });

  it('rotateIfNeeded trims when events exceed MAX_EVENTS', () => {
    const obs = createObserver(OBS_PATH);
    const raw = obs.loadRaw();
    raw.events = Array.from({ length: 1001 }, () => ({
      timestamp: new Date().toISOString(),
      action: 'read' as const,
      tool: 'test',
    }));
    obs.persistRaw(raw);
    obs.rotateIfNeeded();
    const reloaded = obs.loadRaw();
    expect(reloaded.events.length).toBeLessThanOrEqual(500);
  });
});
