import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createObserver } from '../../src/mcp/observer.js';
import { createControlPlane } from '../../src/mcp/control-plane.js';
import type { ImprovementAction } from '../../src/mcp/control-plane.js';

const TEST_DIR = join(tmpdir(), `control-plane-test-${Date.now()}`);
const OBS_PATH = join(TEST_DIR, 'awareness.json');

function makePendingArgs(actionType: ImprovementAction['type'], risk: 'low' | 'medium' | 'high') {
  return {
    action: { type: actionType } as ImprovementAction,
    risk,
    description: `Test ${actionType}`,
    reasoning: 'test reasoning',
    preview: {},
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

describe('control-plane.ts', () => {
  let observer: ReturnType<typeof createObserver>;
  let cp: ReturnType<typeof createControlPlane>;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    observer = createObserver(OBS_PATH);
    cp = createControlPlane(observer);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('classifyRisk', () => {
    it('classifies low-risk actions', () => {
      expect(cp.classifyRisk({ type: 'auto_tag' })).toBe('low');
      expect(cp.classifyRisk({ type: 'create_gap_stubs' })).toBe('low');
      expect(cp.classifyRisk({ type: 'suggest_schema' })).toBe('low');
    });

    it('classifies medium-risk actions', () => {
      expect(cp.classifyRisk({ type: 'promote_to_type' })).toBe('medium');
      expect(cp.classifyRisk({ type: 'merge_duplicates' })).toBe('medium');
    });

    it('classifies high-risk actions', () => {
      expect(cp.classifyRisk({ type: 'archive_stale' })).toBe('high');
      expect(cp.classifyRisk({ type: 'resolve_contradictions' })).toBe('high');
    });
  });

  describe('shouldAutoExecute', () => {
    it('auto-executes low-risk by default', () => {
      expect(cp.shouldAutoExecute({ type: 'auto_tag' })).toBe(true);
    });

    it('does not auto-execute medium-risk by default', () => {
      expect(cp.shouldAutoExecute({ type: 'merge_duplicates' })).toBe(false);
    });

    it('does not auto-execute high-risk by default', () => {
      expect(cp.shouldAutoExecute({ type: 'archive_stale' })).toBe(false);
    });
  });

  describe('enqueue and listPending', () => {
    it('enqueues a pending action', () => {
      cp.enqueue(makePendingArgs('merge_duplicates', 'medium'));
      const pending = cp.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.action.type).toBe('merge_duplicates');
      expect(pending[0]!.status).toBe('pending');
    });

    it('generates unique IDs for each action', () => {
      cp.enqueue(makePendingArgs('archive_stale', 'high'));
      cp.enqueue(makePendingArgs('archive_stale', 'high'));
      const pending = cp.listPending();
      expect(pending[0]!.id).not.toBe(pending[1]!.id);
    });

    it('listPending excludes non-pending actions', () => {
      const a1 = cp.enqueue(makePendingArgs('archive_stale', 'high'));
      cp.enqueue(makePendingArgs('merge_duplicates', 'medium'));
      cp.approve(a1.id);
      const pending = cp.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.action.type).toBe('merge_duplicates');
    });
  });

  describe('approve', () => {
    it('approves a pending action', () => {
      const action = cp.enqueue(makePendingArgs('merge_duplicates', 'medium'));
      const { executed, result } = cp.approve(action.id);
      expect(executed).toBe(true);
      expect(result).toContain('approved');
    });

    it('returns failure for unknown ID', () => {
      const { executed, result } = cp.approve('nonexistent-id');
      expect(executed).toBe(false);
      expect(result).toContain('No pending action');
    });

    it('cannot approve already-approved action', () => {
      const action = cp.enqueue(makePendingArgs('archive_stale', 'high'));
      cp.approve(action.id);
      const { executed, result } = cp.approve(action.id);
      expect(executed).toBe(false);
      expect(result).toContain('already');
    });
  });

  describe('dismiss', () => {
    it('dismisses a pending action', () => {
      const action = cp.enqueue(makePendingArgs('archive_stale', 'high'));
      const dismissed = cp.dismiss(action.id, 'Not needed');
      expect(dismissed).toBe(true);
      expect(cp.listPending()).toHaveLength(0);
    });

    it('returns false for nonexistent ID', () => {
      expect(cp.dismiss('nonexistent')).toBe(false);
    });

    it('adds entry to protection list when reason provided with entries', () => {
      const action = cp.enqueue({
        ...makePendingArgs('archive_stale', 'high'),
        action: { type: 'archive_stale', entries: [{ id: 'entry-1' }] } as ImprovementAction,
      });
      cp.dismiss(action.id, 'I still need this');
      const protections = cp.listProtections();
      expect(protections.some((p) => p.entryId === 'entry-1')).toBe(true);
    });
  });

  describe('bulkApprove and bulkDismiss', () => {
    it('bulk approves multiple actions', () => {
      const a1 = cp.enqueue(makePendingArgs('merge_duplicates', 'medium'));
      const a2 = cp.enqueue(makePendingArgs('promote_to_type', 'medium'));
      const results = cp.bulkApprove([a1.id, a2.id]);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.executed)).toBe(true);
    });

    it('bulk dismisses multiple actions', () => {
      const a1 = cp.enqueue(makePendingArgs('archive_stale', 'high'));
      const a2 = cp.enqueue(makePendingArgs('resolve_contradictions', 'high'));
      cp.bulkDismiss([a1.id, a2.id]);
      expect(cp.listPending()).toHaveLength(0);
    });
  });

  describe('expireStale', () => {
    it('expires actions past their expiry date', () => {
      const expiredArgs = {
        ...makePendingArgs('archive_stale', 'high'),
        expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
      };
      cp.enqueue(expiredArgs);
      cp.enqueue(makePendingArgs('merge_duplicates', 'medium')); // not expired
      const count = cp.expireStale();
      expect(count).toBe(1);
      expect(cp.listPending()).toHaveLength(1); // only the valid one remains
    });

    it('returns 0 when nothing to expire', () => {
      cp.enqueue(makePendingArgs('auto_tag', 'low'));
      expect(cp.expireStale()).toBe(0);
    });
  });

  describe('isProtected', () => {
    it('returns false when not protected', () => {
      expect(cp.isProtected('some-entry', 'archive_stale')).toBe(false);
    });

    it('returns true for protected entry', () => {
      cp.addProtection({
        entryId: 'my-entry',
        protectedFrom: ['archive_stale'],
        reason: 'Important',
      });
      expect(cp.isProtected('my-entry', 'archive_stale')).toBe(true);
      expect(cp.isProtected('my-entry', 'auto_tag')).toBe(false);
    });
  });

  describe('addProtection and listProtections', () => {
    it('adds and lists protections', () => {
      cp.addProtection({ entryId: 'e1', protectedFrom: ['archive_stale'], reason: 'test' });
      cp.addProtection({ pattern: 'merge_duplicates', protectedFrom: ['merge_duplicates'], reason: 'pattern test' });
      const protections = cp.listProtections();
      expect(protections).toHaveLength(2);
    });
  });

  describe('removeProtection', () => {
    it('removes a specific protection', () => {
      cp.addProtection({ entryId: 'e1', protectedFrom: ['archive_stale'], reason: 'test' });
      cp.removeProtection('e1', 'archive_stale');
      expect(cp.isProtected('e1', 'archive_stale')).toBe(false);
    });
  });
});
