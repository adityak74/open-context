import { randomUUID } from 'crypto';
import { createObserver } from './observer.js';

export type RiskLevel = 'low' | 'medium' | 'high';
export type ActionStatus = 'pending' | 'approved' | 'dismissed' | 'expired';

export interface ImprovementAction {
  type:
    | 'auto_tag'
    | 'merge_duplicates'
    | 'promote_to_type'
    | 'archive_stale'
    | 'create_gap_stubs'
    | 'resolve_contradictions'
    | 'suggest_schema';
  entries?: Array<{ id: string; [key: string]: unknown }>;
  pairs?: Array<[string, string]>;
  queries?: string[];
  suggestions?: unknown[];
  contradictions?: unknown[];
}

export interface PendingAction {
  id: string;
  createdAt: string;
  expiresAt: string;
  action: ImprovementAction;
  risk: RiskLevel;
  description: string;
  reasoning: string;
  preview: Record<string, unknown>;
  status: ActionStatus;
  dismissReason?: string;
}

export interface Protection {
  entryId?: string;
  pattern?: string;
  scope?: Record<string, string>;
  protectedFrom: string[];
  reason: string;
  createdAt: string;
}

const RISK_MAP: Record<ImprovementAction['type'], RiskLevel> = {
  auto_tag: 'low',
  create_gap_stubs: 'low',
  suggest_schema: 'low',
  promote_to_type: 'medium',
  merge_duplicates: 'medium',
  archive_stale: 'high',
  resolve_contradictions: 'high',
};

const AUTO_EXECUTE_DEFAULTS: Record<RiskLevel, boolean> = {
  low: true,
  medium: false,
  high: false,
};

export function createControlPlane(observer: ReturnType<typeof createObserver>) {
  function classifyRisk(action: ImprovementAction): RiskLevel {
    return RISK_MAP[action.type] ?? 'high';
  }

  function shouldAutoExecute(action: ImprovementAction): boolean {
    const risk = classifyRisk(action);
    const envKey = `OPENCONTEXT_AUTO_APPROVE_${risk.toUpperCase()}`;
    const envVal = process.env[envKey];
    if (envVal !== undefined) {
      return envVal !== 'false' && envVal !== '0';
    }
    return AUTO_EXECUTE_DEFAULTS[risk] ?? false;
  }

  /**
   * Returns true if the given entry or action type is protected from the given action.
   * Pass null for entryId to check only pattern-level (action-type-wide) protections.
   * Pass a real entry ID to check both per-entry and pattern-level protections.
   */
  function isProtected(entryId: string | null, actionType: string): boolean {
    const raw = observer.loadRaw();
    const protections = raw.protections ?? [];
    return protections.some(
      (p) =>
        ((entryId !== null && p.entryId === entryId) || (!p.entryId && p.pattern === actionType)) &&
        p.protectedFrom.includes(actionType),
    );
  }

  function enqueue(
    action: Omit<PendingAction, 'id' | 'status'>,
  ): PendingAction {
    const pending: PendingAction = {
      id: `pa-${randomUUID().slice(0, 8)}`,
      status: 'pending',
      ...action,
    };
    const raw = observer.loadRaw();
    raw.pendingActions = raw.pendingActions ?? [];
    raw.pendingActions.push(pending);
    observer.persistRaw(raw);
    return pending;
  }

  function listPending(): PendingAction[] {
    const raw = observer.loadRaw();
    return (raw.pendingActions ?? []).filter((a) => a.status === 'pending');
  }

  /**
   * Marks a pending action as approved and returns a description string.
   * NOTE: This does NOT execute the action. The caller (REST handler or server tick)
   * is responsible for calling `executeImprovement` from the improver to apply changes.
   */
  function markApproved(pending: PendingAction): string {
    return `Action ${pending.id} (${pending.action.type}) approved and ready for execution.`;
  }

  function approve(id: string): { approved: boolean; result: string; action?: PendingAction } {
    const raw = observer.loadRaw();
    raw.pendingActions = raw.pendingActions ?? [];
    const pending = raw.pendingActions.find((a) => a.id === id);
    if (!pending) {
      return { approved: false, result: `No pending action found with ID "${id}".` };
    }
    if (pending.status !== 'pending') {
      return { approved: false, result: `Action ${id} is already ${pending.status}.` };
    }
    pending.status = 'approved';
    observer.persistRaw(raw);
    const result = markApproved(pending);
    return { approved: true, result, action: pending };
  }

  function dismiss(id: string, reason?: string): boolean {
    const raw = observer.loadRaw();
    raw.pendingActions = raw.pendingActions ?? [];
    const pending = raw.pendingActions.find((a) => a.id === id);
    if (!pending || pending.status !== 'pending') return false;
    pending.status = 'dismissed';
    if (reason) pending.dismissReason = reason;
    // Add to protection list if dismissing a specific entry action
    if (reason && pending.action.entries && pending.action.entries.length > 0) {
      raw.protections = raw.protections ?? [];
      for (const entry of pending.action.entries) {
        if (entry.id) {
          raw.protections.push({
            entryId: entry.id as string,
            protectedFrom: [pending.action.type],
            reason: reason,
            createdAt: new Date().toISOString(),
          });
        }
      }
      // Auto-learn: if the user dismisses 3+ distinct entries for the same action type,
      // add a pattern protection to stop suggesting that action type globally.
      // We count dismissals that have per-entry protections (i.e. they had explicit entries)
      // to avoid counting unrelated action-type dismissals.
      const distinctEntryDismissals = raw.pendingActions.filter(
        (a) =>
          a.action.type === pending.action.type &&
          a.status === 'dismissed' &&
          a.action.entries &&
          a.action.entries.length > 0,
      );
      if (distinctEntryDismissals.length >= 3) {
        const alreadyHasPattern = raw.protections.some(
          (p) => p.pattern === pending.action.type && !p.entryId,
        );
        if (!alreadyHasPattern) {
          raw.protections.push({
            pattern: pending.action.type,
            protectedFrom: [pending.action.type],
            reason: `Auto-learned: user dismissed ${distinctEntryDismissals.length} distinct "${pending.action.type}" entry actions`,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
    observer.persistRaw(raw);
    return true;
  }

  function bulkApprove(ids: string[]): Array<{ id: string; approved: boolean; result: string }> {
    return ids.map((id) => {
      const { approved, result } = approve(id);
      return { id, approved, result };
    });
  }

  function bulkDismiss(ids: string[], reason?: string): void {
    for (const id of ids) {
      dismiss(id, reason);
    }
  }

  function expireStale(): number {
    const raw = observer.loadRaw();
    raw.pendingActions = raw.pendingActions ?? [];
    const now = new Date().toISOString();
    let count = 0;
    for (const action of raw.pendingActions) {
      if (action.status === 'pending' && action.expiresAt < now) {
        action.status = 'expired';
        count++;
      }
    }
    if (count > 0) observer.persistRaw(raw);
    return count;
  }

  function addProtection(protection: Omit<Protection, 'createdAt'>): void {
    const raw = observer.loadRaw();
    raw.protections = raw.protections ?? [];
    raw.protections.push({ ...protection, createdAt: new Date().toISOString() });
    observer.persistRaw(raw);
  }

  function listProtections(): Protection[] {
    return observer.loadRaw().protections ?? [];
  }

  function removeProtection(entryId: string, actionType: string): void {
    const raw = observer.loadRaw();
    raw.protections = (raw.protections ?? []).filter(
      (p) => !(p.entryId === entryId && p.protectedFrom.includes(actionType)),
    );
    observer.persistRaw(raw);
  }

  return {
    classifyRisk,
    shouldAutoExecute,
    isProtected,
    enqueue,
    listPending,
    approve,
    dismiss,
    bulkApprove,
    bulkDismiss,
    expireStale,
    addProtection,
    listProtections,
    removeProtection,
  };
}
