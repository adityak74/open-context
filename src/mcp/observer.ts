import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface ObservationEvent {
  timestamp: string;
  action: 'read' | 'write' | 'update' | 'delete' | 'query_miss';
  tool: string;
  contextType?: string;
  entryIds?: string[];
  query?: string;
  agent?: string;
  useful?: boolean;
}

export interface SelfImprovementRecord {
  timestamp: string;
  actions: Array<{ type: string; count: number }>;
  autoExecuted?: boolean;
}

export interface ObservationLog {
  events: ObservationEvent[];
  summary: {
    totalReads: number;
    totalWrites: number;
    totalMisses: number;
    missedQueries: string[];
    missedQueryCount: Record<string, number>;
    typeReadFrequency: Record<string, number>;
    typeWriteFrequency: Record<string, number>;
    lastActivity: string;
  };
  improvements: SelfImprovementRecord[];
  pendingActions: import('./control-plane.js').PendingAction[];
  protections: import('./control-plane.js').Protection[];
  schemaCache?: {
    analysisResults?: Record<string, unknown>;
    lastAnalysis?: string;
  };
}

const MAX_EVENTS = 1000;
const TRIM_TO = 500;

function getDefaultObserverPath(): string {
  return join(homedir(), '.opencontext', 'awareness.json');
}

function emptySummary(): ObservationLog['summary'] {
  return {
    totalReads: 0,
    totalWrites: 0,
    totalMisses: 0,
    missedQueries: [],
    missedQueryCount: {},
    typeReadFrequency: {},
    typeWriteFrequency: {},
    lastActivity: new Date().toISOString(),
  };
}

const FLUSH_INTERVAL_MS = 500;
const FLUSH_BATCH_SIZE = 10;

export function createObserver(observerPath?: string) {
  const filePath = observerPath ?? getDefaultObserverPath();

  // In-memory write buffer — flushed to disk periodically or when full
  let pendingEvents: ObservationEvent[] = [];
  let pendingSummaryDeltas: Array<(s: ObservationLog['summary']) => void> = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  // Lightweight in-memory write counter — incremented in log() without flushing.
  // Callers that only need a write count (e.g. periodic cache refresh in store.ts)
  // should use getWriteCount() instead of getSummary().totalWrites to avoid
  // triggering a disk flush on every write.
  let inMemoryWriteCount = 0;

  function loadLog(): ObservationLog {
    if (!existsSync(filePath)) {
      return {
        events: [],
        summary: emptySummary(),
        improvements: [],
        pendingActions: [],
        protections: [],
      };
    }
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ObservationLog>;
      return {
        events: parsed.events ?? [],
        summary: parsed.summary ?? emptySummary(),
        improvements: parsed.improvements ?? [],
        pendingActions: parsed.pendingActions ?? [],
        protections: parsed.protections ?? [],
        schemaCache: parsed.schemaCache,
      };
    } catch {
      return {
        events: [],
        summary: emptySummary(),
        improvements: [],
        pendingActions: [],
        protections: [],
      };
    }
  }

  function persistLog(log: ObservationLog): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(log, null, 2), 'utf-8');
  }

  function flushBuffer(): void {
    if (pendingEvents.length === 0 && pendingSummaryDeltas.length === 0) return;
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const events = pendingEvents.splice(0);
    const deltas = pendingSummaryDeltas.splice(0);
    if (events.length === 0 && deltas.length === 0) return;

    const obsLog = loadLog();
    for (const event of events) {
      obsLog.events.push(event);
    }
    for (const applyDelta of deltas) {
      applyDelta(obsLog.summary);
    }
    if (obsLog.events.length > MAX_EVENTS) {
      obsLog.events = obsLog.events.slice(obsLog.events.length - TRIM_TO);
    }
    persistLog(obsLog);
  }

  function scheduleFlush(): void {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushBuffer();
    }, FLUSH_INTERVAL_MS);
  }

  function log(event: Omit<ObservationEvent, 'timestamp'>): void {
    const fullEvent: ObservationEvent = {
      timestamp: new Date().toISOString(),
      ...event,
    };

    if (event.action === 'write') {
      inMemoryWriteCount++;
    }

    pendingEvents.push(fullEvent);

    // Capture summary delta in a closure so we don't read disk on every log() call
    const ts = fullEvent.timestamp;
    pendingSummaryDeltas.push((s) => {
      s.lastActivity = ts;
      if (event.action === 'read') {
        s.totalReads++;
        if (event.contextType) {
          s.typeReadFrequency[event.contextType] = (s.typeReadFrequency[event.contextType] ?? 0) + 1;
        }
      } else if (event.action === 'write') {
        s.totalWrites++;
        if (event.contextType) {
          s.typeWriteFrequency[event.contextType] = (s.typeWriteFrequency[event.contextType] ?? 0) + 1;
        }
      } else if (event.action === 'query_miss') {
        s.totalMisses++;
        if (event.query) {
          const q = event.query;
          s.missedQueryCount[q] = (s.missedQueryCount[q] ?? 0) + 1;
          if (!s.missedQueries.includes(q)) {
            s.missedQueries.push(q);
          }
        }
      }
    });

    // Flush immediately when batch size is reached; otherwise schedule
    if (pendingEvents.length >= FLUSH_BATCH_SIZE) {
      flushBuffer();
    } else {
      scheduleFlush();
    }
  }

  function logSelfImprovement(record: SelfImprovementRecord): void {
    // Flush pending events first so they are included in the file we are about to write
    flushBuffer();
    const obsLog = loadLog();
    obsLog.improvements.push(record);
    // Keep at most 200 improvement records
    if (obsLog.improvements.length > 200) {
      obsLog.improvements = obsLog.improvements.slice(-100);
    }
    persistLog(obsLog);
  }

  function getSummary(): ObservationLog['summary'] {
    // Flush pending deltas so the returned summary is up to date
    flushBuffer();
    return loadLog().summary;
  }

  function getMissedQueries(): string[] {
    flushBuffer();
    const s = loadLog().summary;
    return s.missedQueries;
  }

  function getTypePopularity(): Record<string, { reads: number; writes: number }> {
    flushBuffer();
    const s = loadLog().summary;
    const allTypes = new Set([
      ...Object.keys(s.typeReadFrequency),
      ...Object.keys(s.typeWriteFrequency),
    ]);
    const result: Record<string, { reads: number; writes: number }> = {};
    for (const t of allTypes) {
      result[t] = {
        reads: s.typeReadFrequency[t] ?? 0,
        writes: s.typeWriteFrequency[t] ?? 0,
      };
    }
    return result;
  }

  function rotateIfNeeded(): void {
    flushBuffer();
    const obsLog = loadLog();
    if (obsLog.events.length > MAX_EVENTS) {
      obsLog.events = obsLog.events.slice(obsLog.events.length - TRIM_TO);
      persistLog(obsLog);
    }
  }

  function getRecentImprovements(since?: string): SelfImprovementRecord[] {
    flushBuffer();
    const obsLog = loadLog();
    if (!since) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      return obsLog.improvements.filter((r) => r.timestamp >= yesterday);
    }
    return obsLog.improvements.filter((r) => r.timestamp >= since);
  }

  function loadRaw(): ObservationLog {
    flushBuffer();
    return loadLog();
  }

  function persistRaw(log: ObservationLog): void {
    // Discard any pending buffer — caller is overwriting the whole log
    pendingEvents.length = 0;
    pendingSummaryDeltas.length = 0;
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    persistLog(log);
  }

  /**
   * Returns the number of 'write' events logged since this observer was created,
   * without flushing the buffer to disk. Use this instead of getSummary().totalWrites
   * when you only need a relative count and do not want to trigger a disk flush.
   */
  function getWriteCount(): number {
    return inMemoryWriteCount;
  }

  return {
    log,
    logSelfImprovement,
    getSummary,
    getWriteCount,
    getMissedQueries,
    getTypePopularity,
    rotateIfNeeded,
    getRecentImprovements,
    loadRaw,
    persistRaw,
    flushBuffer,
    filePath,
  };
}
