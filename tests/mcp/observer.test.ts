import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdirSync } from 'fs';
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
});
