import { createStore } from './store.js';
import { Schema } from './schema.js';
import { createObserver } from './observer.js';
import { ContextEntry } from './types.js';

export interface Gap {
  description: string;
  severity: 'info' | 'warning';
  suggestion: string;
}

export interface Contradiction {
  entryA: string;
  entryB: string;
  description: string;
}

export interface SelfModel {
  identity: {
    contextCount: number;
    typeBreakdown: Record<string, number>;
    bubbleCount: number;
    oldestEntryDate: string;
    newestEntryDate: string;
  };
  coverage: {
    typesWithEntries: string[];
    typesEmpty: string[];
    untyped: number;
  };
  freshness: {
    recentlyUpdated: number;
    stale: number;
    stalestEntries: Array<{ id: string; type?: string; updatedAt: string }>;
  };
  gaps: Gap[];
  contradictions: Contradiction[];
  health: {
    coverageScore: number;
    freshnessScore: number;
    overallHealth: 'healthy' | 'needs-attention' | 'sparse';
  };
  pendingActionsCount: number;
  recentImprovements: Array<{ timestamp: string; actions: Array<{ type: string; count: number }> }>;
}

const STALE_DAYS = 90;
const RECENTLY_UPDATED_DAYS = 7;

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

export const OPPOSITION_PAIRS: ReadonlyArray<[string, string]> = [
  ['prefer', 'avoid'],
  ['use', "don't use"],
  ['always', 'never'],
  ['composition', 'inheritance'],
  ['functional', 'class'],
  ['stateless', 'stateful'],
  ['monolith', 'microservice'],
  ['sql', 'nosql'],
  ['sync', 'async'],
];

function detectKeywordContradictions(entries: ContextEntry[]): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const active = entries.filter((e) => !e.archived);

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (!a || !b) continue;
      if (a.contextType && b.contextType && a.contextType !== b.contextType) continue;
      const textA = a.content.toLowerCase();
      const textB = b.content.toLowerCase();
      for (const [word, opposite] of OPPOSITION_PAIRS) {
        if (
          (textA.includes(word) && textB.includes(opposite)) ||
          (textB.includes(word) && textA.includes(opposite))
        ) {
          contradictions.push({
            entryA: a.id,
            entryB: b.id,
            description: `Entry ${a.id.slice(0, 8)} contains "${word}" while entry ${b.id.slice(0, 8)} contains "${opposite}"`,
          });
          break;
        }
      }
    }
  }
  return contradictions.slice(0, 10);
}

export function buildSelfModel(
  store: ReturnType<typeof createStore>,
  schema: Schema | null,
  observer?: ReturnType<typeof createObserver>,
): SelfModel {
  // listContexts() already filters out archived entries.
  const activeEntries = store.listContexts();
  const bubbles = store.listBubbles();

  // Identity
  const typeBreakdown: Record<string, number> = {};
  let untypedCount = 0;
  for (const entry of activeEntries) {
    if (entry.contextType) {
      typeBreakdown[entry.contextType] = (typeBreakdown[entry.contextType] ?? 0) + 1;
    } else {
      untypedCount++;
    }
  }

  const dates = activeEntries.map((e) => e.createdAt).sort();
  const oldestEntryDate = dates[0] ?? new Date().toISOString();
  const newestEntryDate = dates[dates.length - 1] ?? new Date().toISOString();

  // Coverage
  const definedTypes = schema ? schema.types.map((t) => t.name) : [];
  const typesWithEntries = definedTypes.filter((t) => (typeBreakdown[t] ?? 0) > 0);
  const typesEmpty = definedTypes.filter((t) => (typeBreakdown[t] ?? 0) === 0);

  // Freshness
  const recentlyUpdated = activeEntries.filter((e) => daysSince(e.updatedAt) <= RECENTLY_UPDATED_DAYS).length;
  const staleEntries = activeEntries.filter((e) => daysSince(e.updatedAt) >= STALE_DAYS);

  const stalestEntries = staleEntries
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    .slice(0, 5)
    .map((e) => ({ id: e.id, type: e.contextType, updatedAt: e.updatedAt }));

  // Gaps
  const gaps: Gap[] = [];
  for (const emptyType of typesEmpty) {
    gaps.push({
      description: `Type "${emptyType}" is defined in your schema but has 0 entries.`,
      severity: 'warning',
      suggestion: `Use save_typed_context with type "${emptyType}" to start populating it.`,
    });
  }

  // Load observer data once (single flush + single disk read) to avoid the double
  // read that occurred when getSummary() and loadRaw() were called separately.
  let pendingActionsCount = 0;
  let recentImprovements: SelfModel['recentImprovements'] = [];
  if (observer) {
    const raw = observer.loadRaw();
    const summary = raw.summary;
    for (const [query, count] of Object.entries(summary.missedQueryCount)) {
      if (count >= 3) {
        gaps.push({
          description: `Agents searched for "${query}" ${count} times but found nothing.`,
          severity: 'warning',
          suggestion: `Save a context entry covering "${query}" to fill this gap.`,
        });
      }
    }
    pendingActionsCount = (raw.pendingActions ?? []).filter((a) => a.status === 'pending').length;
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    recentImprovements = (raw.improvements ?? [])
      .filter((r) => r.timestamp >= yesterday)
      .map((r) => ({ timestamp: r.timestamp, actions: r.actions }));
  }

  if (staleEntries.length > 0) {
    gaps.push({
      description: `${staleEntries.length} entries haven't been updated in ${STALE_DAYS}+ days.`,
      severity: 'info',
      suggestion: 'Review and update or archive stale entries.',
    });
  }

  // Contradictions (deterministic keyword heuristic)
  const contradictions = detectKeywordContradictions(activeEntries);

  // Health scores
  const coverageScore = definedTypes.length === 0
    ? 1
    : typesWithEntries.length / definedTypes.length;

  const freshnessScore = activeEntries.length === 0
    ? 1
    : recentlyUpdated / activeEntries.length;

  const avgScore = (coverageScore + freshnessScore) / 2;
  const overallHealth: SelfModel['health']['overallHealth'] =
    activeEntries.length === 0
      ? 'sparse'
      : avgScore >= 0.7
      ? 'healthy'
      : avgScore >= 0.4
      ? 'needs-attention'
      : 'sparse';

  return {
    identity: {
      contextCount: activeEntries.length,
      typeBreakdown,
      bubbleCount: bubbles.length,
      oldestEntryDate,
      newestEntryDate,
    },
    coverage: {
      typesWithEntries,
      typesEmpty,
      untyped: untypedCount,
    },
    freshness: {
      recentlyUpdated,
      stale: staleEntries.length,
      stalestEntries,
    },
    gaps,
    contradictions,
    health: {
      coverageScore: Math.round(coverageScore * 100) / 100,
      freshnessScore: Math.round(freshnessScore * 100) / 100,
      overallHealth,
    },
    pendingActionsCount,
    recentImprovements,
  };
}

export function formatSelfModel(model: SelfModel): string {
  const lines: string[] = [];

  lines.push('I am the context store for this workspace.\n');
  lines.push(`I have ${model.identity.contextCount} active entries:`);

  const typeEntries = Object.entries(model.identity.typeBreakdown);
  if (typeEntries.length > 0) {
    for (const [type, count] of typeEntries) {
      lines.push(`  - ${type}: ${count} entries`);
    }
  }
  if (model.coverage.untyped > 0) {
    lines.push(`  - (untyped): ${model.coverage.untyped} entries`);
  }

  lines.push('');
  lines.push(
    `Health: ${model.health.overallHealth} ` +
    `(coverage: ${Math.round(model.health.coverageScore * 100)}%, ` +
    `freshness: ${Math.round(model.health.freshnessScore * 100)}%)`
  );

  if (model.coverage.typesEmpty.length > 0) {
    lines.push('');
    lines.push('Schema types with no entries:');
    for (const t of model.coverage.typesEmpty) {
      lines.push(`  ⚠ "${t}" is defined but has 0 entries`);
    }
  }

  if (model.gaps.length > 0) {
    lines.push('');
    lines.push('Gaps:');
    for (const gap of model.gaps) {
      const icon = gap.severity === 'warning' ? '⚠' : 'ℹ';
      lines.push(`  ${icon} ${gap.description}`);
      lines.push(`    → ${gap.suggestion}`);
    }
  }

  if (model.contradictions.length > 0) {
    lines.push('');
    lines.push('Potential contradictions:');
    for (const c of model.contradictions) {
      lines.push(`  ⚠ ${c.description}`);
      lines.push(`    Entries: ${c.entryA} vs ${c.entryB} — consider resolving with update_context`);
    }
  }

  if (model.pendingActionsCount > 0) {
    lines.push('');
    lines.push(
      `${model.pendingActionsCount} self-improvement action(s) await your approval. ` +
      'Use review_pending_actions to see them.'
    );
  }

  if (model.recentImprovements.length > 0) {
    lines.push('');
    const totalActions = model.recentImprovements.reduce((n, r) => n + r.actions.length, 0);
    lines.push(`In the last 24 hours, ${totalActions} autonomous improvement(s) were applied.`);
  }

  return lines.join('\n');
}

export function refreshCache(
  store: ReturnType<typeof createStore>,
  schema: Schema | null,
  observer: ReturnType<typeof createObserver>,
): void {
  const model = buildSelfModel(store, schema, observer);
  const raw = observer.loadRaw();
  raw.schemaCache = {
    ...(raw.schemaCache ?? {}),
    analysisResults: { selfModel: model },
    lastAnalysis: new Date().toISOString(),
  };
  observer.persistRaw(raw);
}
