import { randomUUID } from 'crypto';
import { createStore } from './store.js';
import { Schema } from './schema.js';
import { createObserver } from './observer.js';
import { ContextAnalyzer } from './analyzer.js';
import { buildSelfModel, refreshCache } from './awareness.js';
import { createControlPlane, ImprovementAction, PendingAction } from './control-plane.js';
import { ContextEntry } from './types.js';

const TICK_TIMEOUT_MS = parseInt(process.env.OPENCONTEXT_TICK_TIMEOUT ?? '30000', 10);

function daysBetween(isoA: string, isoB: string): number {
  return Math.abs(new Date(isoB).getTime() - new Date(isoA).getTime()) / (1000 * 60 * 60 * 24);
}

function contentSimilarity(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\s+/));
  const bWords = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...aWords].filter((w) => bWords.has(w)).length;
  const union = new Set([...aWords, ...bWords]).size;
  return union === 0 ? 0 : intersection / union;
}

// Limit the candidate set to avoid O(n²) blowup at scale.
// With MAX_DUPLICATE_CANDIDATES=100 the inner loop is at most 4,950 iterations.
const MAX_DUPLICATE_CANDIDATES = 100;

function detectNearDuplicates(entries: ContextEntry[]): Array<[string, string]> {
  // Take the most-recently-updated entries so we compare the most relevant slice
  const active = entries
    .filter((e) => !e.archived)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_DUPLICATE_CANDIDATES);
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!;
      const b = active[j]!;
      if (a.contextType !== b.contextType) continue;
      if (contentSimilarity(a.content, b.content) > 0.8) {
        pairs.push([a.id, b.id]);
      }
    }
  }
  return pairs.slice(0, 10);
}

function findPromotableEntries(entries: ContextEntry[], schema: Schema): ContextEntry[] {
  const untyped = entries.filter((e) => !e.contextType && !e.archived);
  const promotable: ContextEntry[] = [];
  for (const entry of untyped) {
    const text = entry.content.toLowerCase();
    for (const schemaType of schema.types) {
      const desc = schemaType.description.toLowerCase();
      const descWords = desc.split(/\s+/).filter((w) => w.length > 4);
      const matchCount = descWords.filter((w) => text.includes(w)).length;
      if (descWords.length > 0 && matchCount / descWords.length >= 0.4) {
        promotable.push(entry);
        break;
      }
    }
  }
  return promotable.slice(0, 20);
}

function extractKeywords(content: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'this', 'that', 'it', 'its',
  ]);
  return content
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 5);
}

function describeAction(action: ImprovementAction): string {
  switch (action.type) {
    case 'auto_tag':
      return `Auto-tag ${action.entries?.length ?? 0} untagged entries using keyword extraction`;
    case 'merge_duplicates':
      return `Merge ${action.pairs?.length ?? 0} near-duplicate entry pair(s) (>80% content overlap)`;
    case 'promote_to_type':
      return `Promote ${action.entries?.length ?? 0} untyped entries to matching schema types`;
    case 'archive_stale':
      return `Archive ${action.entries?.length ?? 0} entries older than 180 days with zero reads`;
    case 'create_gap_stubs':
      return `Create ${action.queries?.length ?? 0} stub entry(ies) for repeatedly-missed queries`;
    case 'resolve_contradictions':
      return `Archive older entry in ${action.contradictions?.length ?? 0} contradiction pair(s)`;
    case 'suggest_schema':
      return `Propose ${action.suggestions?.length ?? 0} new schema type(s) from untyped entry clusters`;
    default:
      return `Unknown action type`;
  }
}

function generatePreview(action: ImprovementAction, store: ReturnType<typeof createStore>): Record<string, unknown> {
  switch (action.type) {
    case 'archive_stale':
      return {
        entries: action.entries?.map((e) => ({ id: e.id, updatedAt: e.updatedAt })) ?? [],
        reversible: true,
      };
    case 'merge_duplicates':
      return {
        pairs: action.pairs ?? [],
        note: 'Content of both entries will be merged; one soft-deleted',
      };
    case 'promote_to_type':
      return {
        entries: action.entries?.map((e) => ({ id: e.id, suggestedType: e.suggestedType })) ?? [],
      };
    case 'suggest_schema':
      return { suggestions: action.suggestions ?? [] };
    default:
      return {};
  }
}

export async function executeImprovement(
  action: ImprovementAction,
  store: ReturnType<typeof createStore>,
  schema: Schema | null,
  observer: ReturnType<typeof createObserver>,
): Promise<void> {
  switch (action.type) {
    case 'auto_tag': {
      for (const entry of action.entries ?? []) {
        const fullEntry = store.getContext(entry.id);
        if (!fullEntry || fullEntry.tags.length > 0) continue;
        const keywords = extractKeywords(fullEntry.content);
        if (keywords.length > 0) {
          store.updateContext(fullEntry.id, fullEntry.content, keywords, fullEntry.bubbleId ?? null);
        }
      }
      break;
    }
    case 'create_gap_stubs': {
      for (const query of action.queries ?? []) {
        const summary = observer.getSummary();
        const count = summary.missedQueryCount[query] ?? 0;
        store.saveContext(
          `[GAP] Agents have searched for "${query}" ${count} times but no context exists. Please add relevant information.`,
          ['gap', 'needs-input'],
          'self-improvement',
        );
      }
      break;
    }
    case 'archive_stale': {
      for (const entry of action.entries ?? []) {
        const fullEntry = store.getContext(entry.id);
        if (!fullEntry) continue;
        store.updateContext(
          fullEntry.id,
          fullEntry.content,
          fullEntry.tags,
          fullEntry.bubbleId ?? null,
          true, // archived
        );
      }
      break;
    }
    case 'merge_duplicates': {
      for (const [idA, idB] of action.pairs ?? []) {
        const a = store.getContext(idA);
        const b = store.getContext(idB);
        if (!a || !b) continue;
        // Keep newer entry, merge content, archive older
        const [keep, archive] = new Date(a.updatedAt) >= new Date(b.updatedAt) ? [a, b] : [b, a];
        const mergedContent = keep!.content.length >= archive!.content.length ? keep!.content : archive!.content;
        const mergedTags = [...new Set([...keep!.tags, ...archive!.tags])];
        store.updateContext(keep!.id, mergedContent, mergedTags, keep!.bubbleId ?? null);
        store.updateContext(archive!.id, archive!.content, archive!.tags, archive!.bubbleId ?? null, true);
      }
      break;
    }
    case 'promote_to_type': {
      for (const entry of action.entries ?? []) {
        const fullEntry = store.getContext(entry.id);
        if (!fullEntry) continue;
        store.updateContextType(fullEntry.id, entry.suggestedType as string);
      }
      break;
    }
    case 'suggest_schema': {
      // Suggestions are already written to pending actions / awareness.json.
      // No store mutation needed — user approves via UI.
      break;
    }
    case 'resolve_contradictions': {
      for (const contradiction of action.contradictions as Array<{ archiveId: string }> ?? []) {
        const entry = store.getContext(contradiction.archiveId);
        if (!entry) continue;
        store.updateContext(entry.id, entry.content, entry.tags, entry.bubbleId ?? null, true);
      }
      break;
    }
  }
}

export async function selfImprovementTick(
  store: ReturnType<typeof createStore>,
  schema: Schema | null,
  observer: ReturnType<typeof createObserver>,
  analyzer?: ContextAnalyzer,
): Promise<void> {
  const deadline = Date.now() + TICK_TIMEOUT_MS;

  // Phase A: Observe
  observer.rotateIfNeeded();
  const controlPlane = createControlPlane(observer);
  controlPlane.expireStale();
  const selfModel = buildSelfModel(store, schema, observer);
  const summary = observer.getSummary();
  const actions: ImprovementAction[] = [];

  // Phase B: Decide

  // 1. Auto-tag untagged entries
  const untagged = store.listContexts()
    .filter((e) => !e.archived && e.tags.length === 0);
  if (untagged.length >= 3) {
    actions.push({ type: 'auto_tag', entries: untagged.map((e) => ({ id: e.id })) });
  }

  // 2. Detect near-duplicates
  if (Date.now() < deadline) {
    const duplicatePairs = detectNearDuplicates(store.listContexts());
    if (duplicatePairs.length > 0) {
      actions.push({ type: 'merge_duplicates', pairs: duplicatePairs });
    }
  }

  // 3. Promote untyped entries to schema types
  if (schema && Date.now() < deadline) {
    const promotable = findPromotableEntries(store.listContexts(), schema);
    if (promotable.length > 0) {
      // Find the best matching schema type for each
      const enriched = promotable.map((e) => {
        const text = e.content.toLowerCase();
        let bestType = '';
        let bestScore = 0;
        for (const st of schema.types) {
          const desc = st.description.toLowerCase();
          const words = desc.split(/\s+/).filter((w) => w.length > 4);
          const score = words.length > 0
            ? words.filter((w) => text.includes(w)).length / words.length
            : 0;
          if (score > bestScore) { bestScore = score; bestType = st.name; }
        }
        return { id: e.id, suggestedType: bestType };
      }).filter((e) => e.suggestedType);
      if (enriched.length > 0) {
        actions.push({ type: 'promote_to_type', entries: enriched });
      }
    }
  }

  // 4. Archive truly stale entries (>180 days, never individually read)
  if (Date.now() < deadline) {
    // Build a set of entry IDs that have appeared in at least one read event
    const rawLog = observer.loadRaw();
    const readEntryIds = new Set(
      rawLog.events
        .filter((ev) => ev.action === 'read' && ev.entryIds)
        .flatMap((ev) => ev.entryIds ?? []),
    );
    const archivable = selfModel.freshness.stalestEntries.filter((e) => {
      return daysBetween(e.updatedAt, new Date().toISOString()) > 180 && !readEntryIds.has(e.id);
    });
    if (archivable.length > 0) {
      actions.push({
        type: 'archive_stale',
        entries: archivable.map((e) => ({ id: e.id, updatedAt: e.updatedAt })),
      });
    }
  }

  // 5. Create gap stubs for repeatedly missed queries
  if (Date.now() < deadline) {
    const demandGaps = Object.entries(summary.missedQueryCount)
      .filter(([, count]) => count >= 3)
      .map(([query]) => query);
    // Exclude queries that already have stub entries
    const existingStubs = store.listContexts().filter((e) => e.tags.includes('gap'));
    const stubQueries = new Set(existingStubs.map((e) => {
      const match = e.content.match(/searched for "([^"]+)"/);
      return match ? match[1] : '';
    }));
    const newGapQueries = demandGaps.filter((q) => !stubQueries.has(q));
    if (newGapQueries.length > 0) {
      actions.push({ type: 'create_gap_stubs', queries: newGapQueries });
    }
  }

  // 6. Ollama: suggest schema from untyped clusters
  if (analyzer && Date.now() < deadline) {
    const untyped = store.listContexts().filter((e) => !e.contextType && !e.archived);
    if (untyped.length >= 5) {
      try {
        const suggestions = await analyzer.suggestSchemaTypes(untyped);
        if (suggestions.length > 0) {
          actions.push({ type: 'suggest_schema', suggestions });
        }
      } catch {
        // Non-fatal
      }
    }
  }

  // Phase C: Route through control plane
  const executedActions: Array<{ type: string; count: number }> = [];

  for (let action of actions) {
    if (Date.now() >= deadline) break;

    // Skip the entire action type if a pattern-level protection exists.
    // Pass an empty string as entryId so only the pattern branch of isProtected fires.
    if (controlPlane.isProtected('', action.type)) continue;

    // For entry-based actions, filter out individually protected entries before executing.
    if (action.entries && action.entries.length > 0) {
      const unprotectedEntries = action.entries.filter(
        (e) => !controlPlane.isProtected(e.id as string, action.type),
      );
      if (unprotectedEntries.length === 0) continue;
      action = { ...action, entries: unprotectedEntries };
    }

    if (controlPlane.shouldAutoExecute(action)) {
      try {
        await executeImprovement(action, store, schema, observer);
        executedActions.push({ type: action.type, count: action.entries?.length ?? action.pairs?.length ?? action.queries?.length ?? 1 });
        observer.log({ action: 'write', tool: 'self-improvement', contextType: action.type });
      } catch {
        // Non-fatal
      }
    } else {
      // Only enqueue if not already pending the same action type
      const existing = controlPlane.listPending().some((p) => p.action.type === action.type);
      if (!existing) {
        controlPlane.enqueue({
          action,
          risk: controlPlane.classifyRisk(action),
          description: describeAction(action),
          reasoning: `Identified during self-improvement tick based on store analysis.`,
          preview: generatePreview(action, store),
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + parseInt(process.env.OPENCONTEXT_PENDING_TTL ?? '604800000', 10)).toISOString(),
        });
      }
    }
  }

  // Phase D: Record and refresh cache — only when something was actually executed
  // to avoid a redundant read+write of awareness.json on idle ticks.
  if (executedActions.length > 0) {
    observer.logSelfImprovement({
      timestamp: new Date().toISOString(),
      actions: executedActions,
      autoExecuted: true,
    });
    refreshCache(store, schema, observer);
  }
}
