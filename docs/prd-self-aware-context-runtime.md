# PRD: Self-Aware Context Runtime

> **Status**: Draft
> **Author**: OpenContext Team
> **Date**: 2026-02-17
> **Target**: opencontext v0.1.0

---

## 1. Problem Statement

Today, every agentic application (Claude Code, Cursor, Devin, custom Agent SDK apps) starts **cold**. Agents don't know who the user is, what was tried before, what decisions were made, or what the user's preferences are — unless the user manually writes and maintains static instruction files (CLAUDE.md, .cursorrules).

OpenContext already solves part of this: it imports chat history and exposes a context store via MCP. But the store is **passive and dumb** — it saves what agents tell it and returns what agents ask for. It has no understanding of its own contents, no awareness of what's missing, no ability to improve over time.

### What We're Building

A **Self-Aware Context Runtime** — an evolution of the existing OpenContext MCP server and store that:

1. **Lets users define their own context schemas** instead of forcing predefined structures
2. **Maintains a model of itself** — what it knows, what's missing, what's stale, what's contradictory
3. **Observes how agents use it** — tracking reads, writes, misses, and usefulness
4. **Improves autonomously** — suggests schema changes, flags gaps, resolves staleness
5. **Deepens understanding with Ollama** — uses local LLM analysis for semantic contradiction detection, intelligent schema suggestions, context summarization, and smart retrieval — gracefully degrading to deterministic heuristics when Ollama is unavailable

The goal: any agent that connects to OpenContext gets smarter because the context layer itself is smart.

---

## 2. Design Principles

1. **Minimal blast radius** — layer new capabilities onto the existing store, server, and types. Don't rewrite what works.
2. **User-defined over prescriptive** — no hardcoded context types. Users define what matters to them.
3. **Schema-as-instruction** — defining a context type implicitly tells agents what the user cares about tracking.
4. **Self-awareness is queryable** — agents access the system's self-knowledge through the same MCP tool interface they already use.
5. **Additive, not breaking** — existing `save_context`, `recall_context`, etc. keep working unchanged. New capabilities are new tools.
6. **Local-first** — all self-awareness data stays in the local JSON store. No cloud, no network calls.
7. **Graceful degradation** — every Ollama-enhanced feature has a deterministic fallback. The system is fully functional without Ollama; LLM analysis makes it smarter, not operational. This follows the exact pattern already used in `OllamaPreferenceAnalyzer` (`try ollama → catch → generateBasic*`).

---

## 3. Architecture Overview

### Current Architecture (unchanged)

```
Claude / Agent  ←→  MCP (stdio)  ←→  server.ts  ←→  store.ts  ←→  contexts.json
                    REST API      ←→  server.ts  ←→  store.ts  ←→  contexts.json
```

### New Architecture (additive)

```
Claude / Agent  ←→  MCP (stdio)  ←→  server.ts  ←→  store.ts  ←→  contexts.json
                                          │
                                   ┌──────┴──────┐
                                   │  New layers  │
                                   ├──────────────┤
                                   │ schema.ts    │  ← user-defined types
                                   │ awareness.ts │  ← self-model + introspection
                                   │ observer.ts  │  ← usage tracking
                                   │ analyzer.ts  │  ← Ollama-powered deep analysis
                                   └──────────────┘
                                          │
                                   ┌──────┴──────┐
                                   ▼              ▼
                            ~/.opencontext/    Ollama (optional)
                            ├── contexts.json  http://localhost:11434
                            ├── schema.yaml        │
                            └── awareness.json     │ used by analyzer.ts for:
                                                   │ - semantic contradiction detection
                                                   │ - schema suggestions from untyped entries
                                                   │ - context summarization
                                                   │ - smart relevance-ranked retrieval
                                                   │ - stale entry re-evaluation
```

### Files Changed vs Added

| File | Status | What Changes |
|------|--------|-------------|
| `src/mcp/types.ts` | **Modified** | Add `SchemaType`, `SelfModel`, `ObservationEvent`, `AnalysisResult` interfaces |
| `src/mcp/store.ts` | **Modified** | Add schema-aware save/query methods, wrap existing methods with observation hooks |
| `src/mcp/server.ts` | **Modified** | Register 8 new MCP tools alongside existing 11 |
| `src/mcp/schema.ts` | **New** | Schema loader, validator, discovery (~150 lines) |
| `src/mcp/awareness.ts` | **New** | Self-model builder, introspection engine, gap detection (~200 lines) |
| `src/mcp/observer.ts` | **New** | Usage tracking, read/write/miss logging (~100 lines) |
| `src/mcp/analyzer.ts` | **New** | Ollama-powered analysis: contradictions, schema suggestions, summarization, smart retrieval (~250 lines) |
| `src/mcp/improver.ts` | **New** | Self-improvement actions: auto-tag, merge, archive, gap stubs, promote, resolve (~200 lines) |
| `src/server.ts` | **Modified** | Add 4 new REST endpoints + self-improvement tick loop + graceful shutdown |
| `ui/src/components/SchemaEditor.tsx` | **New** | UI for defining/editing context types |
| `ui/src/components/AwarenessPanel.tsx` | **New** | UI for viewing self-model, gaps, health, analysis results |
| `ui/src/App.tsx` | **Modified** | Add 2 new routes |

**Estimated total new code**: ~1050 lines across 5 new files + ~250 lines of modifications to existing files.

---

## 4. Feature 1: User-Defined Context Schemas

### 4.1 Schema Definition File

Users create `~/.opencontext/schema.yaml` (or define schemas through the UI/API). This file declares custom context types with fields, descriptions, and optional constraints.

```yaml
# ~/.opencontext/schema.yaml
version: 1
types:
  decision:
    description: "Architectural or technical decisions with rationale"
    fields:
      what:
        type: string
        required: true
        description: "What was decided"
      why:
        type: string
        required: true
        description: "Reasoning behind the decision"
      alternatives:
        type: string[]
        description: "Options that were considered and rejected"
      project:
        type: string
        description: "Which project this applies to"

  preference:
    description: "User preferences that agents should respect"
    fields:
      domain:
        type: string
        required: true
        description: "Category (code-style, tooling, communication, etc.)"
      rule:
        type: string
        required: true
        description: "The actual preference"
      strength:
        type: enum
        values: [strong, mild, flexible]
        default: mild

  bug_pattern:
    description: "Recurring bugs and their solutions"
    fields:
      symptom:
        type: string
        required: true
      root_cause:
        type: string
      fix:
        type: string
      occurrences:
        type: number
        default: 1
```

- Types are completely freeform — users define what makes sense for them.
- If no `schema.yaml` exists, the system works exactly like today (untyped `ContextEntry` with `content` + `tags`).
- Schemas are optional and additive. Existing entries without a type remain valid.

### 4.2 Implementation: `src/mcp/schema.ts` (new file)

```typescript
// Responsibilities:
// 1. Load and parse schema.yaml from ~/.opencontext/schema.yaml
// 2. Validate entries against their declared type
// 3. Provide schema discovery for agents (list types, describe fields)
// 4. Handle missing/malformed schema gracefully (fall back to untyped)

export interface SchemaField {
  type: 'string' | 'string[]' | 'number' | 'boolean' | 'enum'
  required?: boolean
  description?: string
  values?: string[]     // for enum type
  default?: unknown
}

export interface SchemaType {
  name: string
  description: string
  fields: Record<string, SchemaField>
}

export interface Schema {
  version: number
  types: SchemaType[]
}

export function loadSchema(schemaPath?: string): Schema | null
export function validateEntry(schema: Schema, typeName: string, data: Record<string, unknown>): { valid: boolean; errors: string[] }
export function describeSchema(schema: Schema): string  // human-readable summary for agents
```

### 4.3 Changes to `src/mcp/types.ts`

Add a `contextType` and `structuredData` field to `ContextEntry`:

```typescript
export interface ContextEntry {
  id: string
  content: string                          // existing — stays as the human-readable content
  tags: string[]                           // existing
  source: string                           // existing
  bubbleId?: string                        // existing
  contextType?: string                     // NEW — references a schema type name (e.g. "decision")
  structuredData?: Record<string, unknown> // NEW — typed fields matching the schema
  createdAt: string                        // existing
  updatedAt: string                        // existing
}
```

**Backward compatible**: existing entries without `contextType` or `structuredData` continue to work. The new fields are optional.

### 4.4 Changes to `src/mcp/store.ts`

Add two new methods to the store:

```typescript
// Save a typed context entry — validates against schema if available
saveTypedContext(
  typeName: string,
  data: Record<string, unknown>,
  tags?: string[],
  source?: string,
  bubbleId?: string
): ContextEntry

// Query by type — returns all entries of a given context type
queryByType(
  typeName: string,
  filter?: Record<string, unknown>
): ContextEntry[]
```

The existing `saveContext` method is **unchanged** — it continues to work for untyped entries. `saveTypedContext` is a new method that wraps `saveContext` with schema validation and structured data storage.

### 4.5 New MCP Tools (added to `src/mcp/server.ts`)

| Tool | Arguments | Description |
|------|-----------|-------------|
| `describe_schema` | (none) | Returns all user-defined context types with their fields and descriptions. Agents call this first to understand what context types the user cares about. |
| `save_typed_context` | `type`, `data`, `tags?`, `source?`, `bubbleId?` | Save a context entry with structured data matching a schema type. Falls back to untyped save if type doesn't exist. |
| `query_by_type` | `type`, `filter?` | Query all entries of a given type, optionally filtering by field values. |

### 4.6 New REST Endpoints (added to `src/server.ts`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/schema` | `GET` | Returns current schema (parsed from schema.yaml) |
| `/api/schema` | `PUT` | Updates schema.yaml (used by UI schema editor) |

### 4.7 UI: Schema Editor Page

New component `ui/src/components/SchemaEditor.tsx` — a form-based editor for adding/editing/removing context types.

- Visual field builder: add fields with name, type, required flag, description
- Live preview of the schema.yaml output
- Template starter schemas (solo-dev, team, open-source-maintainer) available as one-click imports

New route: `/schema` → `SchemaEditor` component (added to `ui/src/App.tsx`).

---

## 5. Feature 2: Self-Awareness (Introspection)

### 5.1 The Self-Model

OpenContext maintains a computed self-model — a compact representation of what it knows about its own state. This is **derived from the store contents**, not separately maintained. It's computed on demand when agents or the UI request it.

```typescript
// src/mcp/awareness.ts

export interface SelfModel {
  identity: {
    owner: string               // from preferences if available
    contextCount: number
    typeBreakdown: Record<string, number>  // entries per type
    bubbleCount: number
    oldestEntry: string         // ISO date
    newestEntry: string         // ISO date
  }

  coverage: {
    typesWithEntries: string[]
    typesEmpty: string[]        // defined in schema but zero entries
    untyped: number             // entries without a contextType
  }

  freshness: {
    recentlyUpdated: number     // entries updated in last 7 days
    stale: number               // entries not updated in 90+ days
    stalestEntries: Array<{ id: string; type?: string; updatedAt: string }>
  }

  gaps: Array<{
    description: string
    severity: 'info' | 'warning'
    suggestion: string
  }>

  contradictions: Array<{
    entryA: string              // id
    entryB: string              // id
    description: string
  }>

  health: {
    coverageScore: number       // 0-1: what % of schema types have entries
    freshnessScore: number      // 0-1: how up-to-date the store is
    overallHealth: 'healthy' | 'needs-attention' | 'sparse'
  }
}
```

### 5.2 How the Self-Model Is Computed

`awareness.ts` exports a single function:

```typescript
export function buildSelfModel(
  store: ReturnType<typeof createStore>,
  schema: Schema | null
): SelfModel
```

It reads from the store and schema to compute:

1. **Identity** — counts, date ranges (direct from `store.listContexts()`)
2. **Coverage** — cross-reference schema types against entries with `contextType` field
3. **Freshness** — compare `updatedAt` timestamps against current date
4. **Gaps** — schema types with zero entries, high-demand types from observer (see Feature 3)
5. **Contradictions** — keyword heuristic as baseline (entries of the same type with opposing terms like "prefer X" vs "avoid X"). When `deep=true` and Ollama is available, upgraded to semantic contradiction detection (see Feature 4, section 7.6)
6. **Health** — computed scores from coverage and freshness metrics

**Default mode requires no LLM.** The baseline self-model is deterministic, fast (<100ms), and always available. The `deep=true` mode enriches it with Ollama-powered analysis when available (see section 7.7).

### 5.3 New MCP Tool: `introspect`

```
Tool: introspect
Arguments: (none)
Returns: Human-readable self-model summary

Example response:
"I am the context store for this workspace.

 I have 47 entries across 3 types:
   - decision: 23 entries (newest: 2 hours ago)
   - preference: 18 entries (newest: 3 days ago)
   - bug_pattern: 6 entries (newest: 2 weeks ago)

 Health: needs-attention
   Coverage: 75% (3 of 4 defined types have entries)
   Freshness: 82% (39 of 47 entries updated within 90 days)

 Gaps:
   ⚠ Type 'deployment_runbook' is defined in your schema but has 0 entries.
   ℹ 8 entries are older than 90 days and may be stale.

 Contradictions:
   ⚠ Entry dec-12 says 'prefer composition over inheritance'
     but entry dec-47 chose class-based inheritance.
     Consider resolving with update_context."
```

This is the **most important new tool**. When an agent calls `introspect` at the start of a session, it immediately understands:
- What context is available and how much to trust it
- Where gaps exist (so it can ask the user directly instead of assuming)
- What contradictions need resolution

### 5.4 New MCP Tool: `get_gaps`

```
Tool: get_gaps
Arguments: (none)
Returns: List of identified gaps with suggestions

Focused subset of introspect — for agents that just want to know
what's missing without the full self-model.
```

### 5.5 New REST Endpoint

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/awareness` | `GET` | Returns the full self-model as JSON (consumed by UI) |

### 5.6 UI: Awareness Panel

New component `ui/src/components/AwarenessPanel.tsx` — a dashboard panel showing the self-model visually.

- Health score with color coding (green/yellow/red)
- Type coverage chart (which types have entries, which are empty)
- Freshness timeline (when entries were last updated)
- Gap list with actionable suggestions
- Contradiction list with links to conflicting entries

New route: `/awareness` → `AwarenessPanel` component.

---

## 6. Feature 3: Usage Observation

### 6.1 What Gets Tracked

Every read and write to the context store is logged as an observation event. This is a **lightweight append-only log** stored in `~/.opencontext/awareness.json`.

```typescript
// src/mcp/observer.ts

export interface ObservationEvent {
  timestamp: string
  action: 'read' | 'write' | 'update' | 'delete' | 'query_miss'
  tool: string                    // which MCP tool or REST endpoint
  contextType?: string            // type queried/written
  entryIds?: string[]             // entries involved
  query?: string                  // what was searched for (on reads/misses)
  agent?: string                  // source identifier if available
}

export interface ObservationLog {
  events: ObservationEvent[]
  summary: {
    totalReads: number
    totalWrites: number
    totalMisses: number           // queries that returned 0 results
    missedQueries: string[]       // unique queries that returned nothing
    typeReadFrequency: Record<string, number>   // how often each type is read
    typeWriteFrequency: Record<string, number>  // how often each type is written
    lastActivity: string          // ISO timestamp
  }
}
```

### 6.2 How Observation Works

The observer wraps existing store methods with minimal instrumentation. In `store.ts`, after each operation, a one-line call logs the event:

```typescript
// In store.ts, existing recallContext method:
recallContext(query: string) {
  const store = load()
  const results = /* existing search logic */

  // NEW: single line addition
  observer.log({ action: results.length > 0 ? 'read' : 'query_miss', query, entryIds: results.map(r => r.id) })

  return results
}
```

This is ~1 line added per existing store method. No logic changes.

### 6.3 Observer Implementation: `src/mcp/observer.ts`

```typescript
// Responsibilities:
// 1. Append events to awareness.json
// 2. Maintain running summary (updated on each append)
// 3. Provide demand signal detection (what queries keep missing)

export function createObserver(observerPath?: string): {
  log(event: Omit<ObservationEvent, 'timestamp'>): void
  getSummary(): ObservationLog['summary']
  getMissedQueries(): string[]           // queries agents asked for but got 0 results
  getTypePopularity(): Record<string, { reads: number; writes: number }>
}
```

### 6.4 How Self-Awareness Uses Observations

The `buildSelfModel` function in `awareness.ts` consumes observer data to enhance gap detection:

```
Schema says type "deployment_runbook" exists but has 0 entries
  → Gap (from schema alone)

Observer says agents searched for "error handling" 5 times with 0 results
  → Gap (from usage observation, even without schema)

Observer says type "decision" is read by agents 10x more than "preference"
  → Insight: decisions are high-value, keep them fresh
```

Observation-powered gaps are **more valuable** than schema-only gaps because they represent **real agent demand**, not just declared structure.

### 6.5 New MCP Tool: `report_usefulness`

```
Tool: report_usefulness
Arguments:
  context_ids: string[]    — which entries were consumed
  useful: boolean          — did the context actually help
  notes?: string           — optional explanation

Returns: Acknowledgment
```

This closes the feedback loop. Agents report back whether the context they retrieved was actually useful. Over time, this builds a signal of which entries are high-value (frequently useful) vs noise (frequently ignored).

### 6.6 Log Rotation

`awareness.json` events are capped at 1000 entries (configurable). When the cap is reached, the oldest 500 events are dropped but their contribution to the running summary is preserved. This keeps the file small while retaining aggregate insights.

---

## 7. Feature 4: Ollama-Powered Deep Analysis

OpenContext already uses Ollama for preference and memory analysis during chat import (see `src/analyzers/ollama-preferences.ts`). This feature extends that same pattern — the `Ollama` SDK, the `try/catch → fallback` degradation, the model/host configuration — into the self-aware runtime.

### 7.1 Design: Always Works Without Ollama

Every Ollama-enhanced capability has a **deterministic baseline** and an **LLM-enhanced mode**:

| Capability | Without Ollama (deterministic) | With Ollama (enhanced) |
|---|---|---|
| Contradiction detection | Keyword heuristic: same-type entries with opposing terms ("prefer X" vs "avoid X") | Semantic analysis: understands that "use composition" and "chose class inheritance" are in tension |
| Schema suggestions | Pattern matching: detect repeated field patterns in untyped `note` entries | Semantic clustering: group untyped entries by meaning, propose named types with descriptions |
| Context summarization | Truncation: first N characters of each entry | Intelligent digest: multi-entry synthesis into a concise briefing |
| Smart retrieval | Substring/AND search (existing `recallContext`/`searchContexts`) | Relevance-ranked: re-rank results by semantic similarity to the query |
| Stale entry evaluation | Timestamp-based: >90 days = stale | Semantic check: "is this entry still relevant given recent entries?" |
| Gap descriptions | Template-based: "Type X has 0 entries" | Natural language: "You track decisions and preferences but have no context about deployment. Recent agent sessions touched deployment 3 times." |

### 7.2 Implementation: `src/mcp/analyzer.ts` (new file)

Reuses the existing Ollama integration patterns from `src/analyzers/ollama-preferences.ts`:

```typescript
import { Ollama } from 'ollama';

export class ContextAnalyzer {
  private ollama: Ollama;
  private model: string;
  private available: boolean | null = null;  // lazy-checked

  constructor(
    model: string = process.env.OLLAMA_MODEL ?? 'gpt-oss:20b',
    host: string = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
  ) {
    this.ollama = new Ollama({ host });
    this.model = model;
  }

  // Check Ollama availability once, cache result
  private async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      const { models } = await this.ollama.list();
      this.available = models.some(m => m.name === this.model);
    } catch {
      this.available = false;
    }
    return this.available;
  }

  // --- Core analysis methods (each with deterministic fallback) ---

  async detectContradictions(entries: ContextEntry[]): Promise<Contradiction[]>
  async suggestSchemaTypes(untypedEntries: ContextEntry[]): Promise<SuggestedType[]>
  async summarizeContext(entries: ContextEntry[], focus?: string): Promise<string>
  async rankByRelevance(entries: ContextEntry[], query: string): Promise<RankedEntry[]>
  async evaluateStaleness(entries: ContextEntry[], recentEntries: ContextEntry[]): Promise<StalenessResult[]>
  async describeGaps(gaps: Gap[], observerSummary: ObservationSummary): Promise<EnrichedGap[]>
}
```

**Key pattern**: every method calls `isAvailable()` first. If Ollama is down, it immediately falls back to the deterministic implementation — no timeout waiting, no retry. Matches existing behavior in `OllamaPreferenceAnalyzer`.

### 7.3 Ollama Prompt Design

Each analysis task uses a focused, structured prompt. Prompts are kept small to work with modest local models.

#### Contradiction Detection Prompt

```
You are analyzing a user's saved context entries for contradictions.

Entries (same type: "preference"):
1. [id: pref-12] "Prefer composition over inheritance in all code"
2. [id: pref-47] "Use class-based repository pattern with inheritance for data layer"

Are these contradictory? If yes, explain the tension in one sentence.
Respond as JSON: { "contradictory": bool, "explanation": string }
```

**Why this works with small models**: binary yes/no question, structured JSON output, minimal context window needed. Each call analyzes a small batch of entries (pairwise comparison within a type), not the entire store.

#### Schema Suggestion Prompt

```
You are analyzing untyped context entries to suggest schema types.

Entries without a type:
1. "Use Redis for caching because Memcached doesn't support data structures"
2. "Chose PostgreSQL over MySQL for JSON column support"
3. "Switched from REST to GraphQL for the mobile API"

These entries seem to follow a pattern. Suggest a schema type name and fields.
Respond as JSON: { "typeName": string, "description": string, "fields": [{ "name": string, "type": "string"|"string[]"|"number", "description": string }] }
```

#### Context Summarization Prompt

```
You are summarizing saved context for an AI agent that is about to start working.

Context entries (type: "decision", project: "my-app"):
1. "Use Drizzle ORM — better SQL control than Prisma"
2. "JWT auth with refresh tokens — stateless for microservices"
3. "Redis pub/sub for real-time features — simpler than WebSockets"

Write a 2-3 sentence briefing an agent can use to understand this project's architecture.
Do not use bullet points. Write in present tense.
```

#### Relevance Ranking Prompt

```
You are ranking context entries by relevance to a query.

Query: "how should I handle authentication?"

Entries:
1. [id: dec-23] "JWT auth with refresh tokens for the API"
2. [id: dec-12] "Use Drizzle ORM for database access"
3. [id: pref-5] "Always prefer stateless approaches"
4. [id: dec-45] "Redis for session caching"

Rank these by relevance (most relevant first).
Respond as JSON: { "ranked": ["dec-23", "pref-5", "dec-45", "dec-12"] }
```

### 7.4 Deterministic Fallbacks (no Ollama)

Each analysis method has an inline fallback:

**Contradiction detection fallback**:
```typescript
// Keyword-based opposition detection
const opposites = [
  ['prefer', 'avoid'], ['use', 'don\'t use'], ['always', 'never'],
  ['composition', 'inheritance'], ['class', 'functional'],
  ['stateful', 'stateless'], ['monolith', 'microservice']
];
// Compare entries of the same type — if entry A contains word X
// and entry B contains its opposite Y, flag as potential contradiction
```

**Schema suggestion fallback**:
```typescript
// Pattern matching on untyped entries
// 1. Group entries by tag overlap
// 2. For each group with 3+ entries, extract common word patterns
// 3. Suggest a type name from the most frequent tag
// 4. Suggest fields from recurring structural patterns
//    (e.g., entries that contain "because" → suggest "reasoning" field)
```

**Summarization fallback**:
```typescript
// Concatenate first 100 chars of each entry, grouped by type
// Return: "N decisions, M preferences, K bug patterns. Most recent: [title]"
```

**Relevance ranking fallback**:
```typescript
// Score by term overlap between query and entry content
// Boost entries whose contextType matches query keywords
// Return sorted by score
```

### 7.5 New MCP Tools (Ollama-enhanced)

| Tool | Arguments | With Ollama | Without Ollama |
|------|-----------|-------------|----------------|
| `analyze_contradictions` | `type?` | Semantic pairwise comparison via LLM | Keyword-opposition heuristic |
| `suggest_schema` | (none) | LLM clusters untyped entries and proposes types | Tag-grouping + pattern matching |
| `summarize_context` | `type?`, `bubbleId?`, `focus?` | LLM-generated briefing paragraph | Truncated concatenation |

These three tools are **in addition to** the 5 tools from Features 1-3, bringing the total new tools to 8.

### 7.6 Integration with Self-Model (`awareness.ts`)

The `buildSelfModel()` function gains an optional `analyzer` parameter:

```typescript
export async function buildSelfModel(
  store: ReturnType<typeof createStore>,
  schema: Schema | null,
  observer?: ReturnType<typeof createObserver>,
  analyzer?: ContextAnalyzer               // NEW — optional
): Promise<SelfModel>
```

When `analyzer` is provided, the self-model is **enriched**:

- **`gaps`** array gets natural-language descriptions instead of template strings
- **`contradictions`** array is populated by semantic analysis instead of (or in addition to) keyword heuristics
- **`health.details`** field gets a human-readable paragraph summarizing the overall state

When `analyzer` is absent or Ollama is down, the self-model is computed deterministically as described in section 5.2. The structure is identical — only the quality of descriptions changes.

### 7.7 Integration with `introspect` Tool

The `introspect` MCP tool gains an optional `deep` argument:

```
Tool: introspect
Arguments:
  deep?: boolean (default: false)

deep=false (default): Deterministic self-model. Fast (<100ms). Always works.
deep=true: Ollama-enhanced self-model. Richer descriptions, semantic
           contradictions, natural-language gap analysis. Slower (2-10s).
           Falls back to deep=false if Ollama unavailable.
```

This lets agents choose: quick introspection at session start (`deep=false`), or thorough analysis when specifically investigating context health (`deep=true`).

### 7.8 Integration with Smart Retrieval

Existing search tools (`recall_context`, `search_contexts`) are **unchanged**. Smart retrieval is exposed as a new behavior on `query_by_type`:

```
Tool: query_by_type
Arguments:
  type: string
  filter?: Record<string, unknown>
  ranked?: boolean (default: false)     // NEW

ranked=false: Returns entries filtered by type/fields (deterministic, fast)
ranked=true: Passes results through Ollama relevance ranking.
             Falls back to ranked=false if Ollama unavailable.
```

This avoids modifying existing tools while making LLM-ranked retrieval opt-in.

### 7.9 New REST Endpoint

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze` | `POST` | Run a specific analysis: `{ action: "contradictions" | "suggest_schema" | "summarize", params: {...} }`. Returns results with `source: "ollama" | "deterministic"` so the UI can indicate which mode was used. |

### 7.10 UI Integration

The `AwarenessPanel.tsx` component (from Feature 2) gains:

- **"Deep Analysis" button** — triggers Ollama-powered introspection, shows richer results when available
- **Ollama status indicator** — green dot when Ollama is reachable and model is loaded, gray when unavailable
- **Analysis source badge** — each insight shows whether it came from deterministic heuristics or LLM analysis
- **Schema suggestion cards** — when `suggest_schema` finds patterns in untyped entries, display proposed types with a one-click "Add to schema" action
- **Contradiction resolution UI** — show conflicting entries side-by-side with the LLM's explanation, let user resolve by editing or deleting

### 7.11 Configuration

Follows the exact same pattern as existing Ollama configuration:

| Setting | Source | Default |
|---------|--------|---------|
| Model | `OLLAMA_MODEL` env var, or `req.body.model`, or UI settings | `gpt-oss:20b` |
| Host | `OLLAMA_HOST` env var, or `req.body.ollamaHost`, or UI settings | `http://localhost:11434` (local), `http://host.docker.internal:11434` (Docker) |
| Enable/disable | `OPENCONTEXT_OLLAMA_ENABLED` env var, or UI toggle | `true` (but gracefully no-ops if unavailable) |

No new configuration surfaces — reuses the existing environment variables and patterns.

### 7.12 Cost and Performance

- **No external API costs** — Ollama runs locally, all inference is free
- **Prompt sizes are small** — each analysis call sends 5-20 entries, not the whole store. Typical prompt is <2000 tokens
- **Pairwise contradiction checks are bounded** — within a type, compare at most `C(n, 2)` pairs. For types with >50 entries, sample the most recent 50
- **Caching** — analysis results for contradiction detection and schema suggestions are cached in `awareness.json` with a TTL (default: 1 hour). Repeated calls within the TTL return cached results
- **Non-blocking** — all Ollama calls are async. The MCP tool returns the deterministic result immediately and can optionally include a `pendingAnalysis: true` flag if the LLM result is still computing (future enhancement)

---

## 8. Process Model: How Continuous Analysis Runs

### 8.1 The Problem

Today, both the HTTP server and MCP server are purely request-response — zero background work, zero `setInterval`, zero scheduled tasks. But the self-aware runtime needs continuous behavior:

- **Observation summaries** need to be periodically rolled up
- **Ollama analysis** (contradictions, schema suggestions) shouldn't block agent requests
- **Stale entry detection** should happen proactively, not only when someone asks
- **Cache invalidation** needs to happen on a schedule

Where does this work live?

### 8.2 Design Decision: No New Daemon

We are **not** introducing a third long-running process. Reasons:

1. **Operational complexity** — users already manage HTTP server + MCP server. A third daemon adds config, monitoring, and failure modes.
2. **Docker complexity** — the single-image model (one CMD) is clean. A background daemon means process supervision (supervisord, tini, etc.).
3. **Overkill for v1** — the volume of background work is small. We don't need a job queue or worker pool.

### 8.3 Approach: Three-Layer Strategy

```
Layer 1: On-demand (immediate, request-driven)
  ↓ most work happens here
Layer 2: Write-triggered (piggyback on mutations)
  ↓ lightweight, automatic
Layer 3: Tick-based (periodic, on the HTTP server)
  ↓ optional, for proactive analysis
```

#### Layer 1: On-Demand Computation (default)

Most analysis is **computed when requested**, not continuously:

```
Agent calls introspect()
  → buildSelfModel() runs synchronously
  → Returns in <100ms (deterministic mode)
  → Cached for 60s (repeated calls within window return cached result)

Agent calls introspect(deep=true)
  → Check cache (TTL: 1 hour for deep analysis)
  → Cache hit: return cached result instantly
  → Cache miss: run Ollama analysis, cache result, return
  → Ollama unavailable: fall back to deterministic, return that
```

This covers the primary use case — agents call `introspect` at session start and get a result. No daemon needed.

**For the MCP server**: this is the **only** layer. The MCP server stays purely request-response. It never does background work. All self-awareness is computed on-demand when agents call tools.

#### Layer 2: Write-Triggered Analysis (piggyback on mutations)

When the store is mutated (save, update, delete), the observer logs the event. On certain mutations, we **piggyback lightweight analysis**:

```typescript
// In store.ts, after saveContext or saveTypedContext:
observer.log({ action: 'write', ... })

// Every N writes (configurable, default: 10), trigger a lightweight re-evaluation:
if (observer.getSummary().totalWrites % 10 === 0) {
  // Async, non-blocking — fire and forget
  awareness.refreshCache(store, schema, observer).catch(() => {})
}
```

`refreshCache` recomputes the deterministic self-model and writes it to `awareness.json`. This means the cached self-model stays reasonably fresh without any background loop — it's refreshed as a side-effect of normal write activity.

**Cost**: ~50ms of extra computation on every 10th write. Imperceptible.

**For Ollama analysis**: write-triggered work does **not** call Ollama. Ollama analysis is only triggered by explicit requests (`deep=true`, `analyze_contradictions`, etc.) or by the optional tick loop (Layer 3). This keeps mutation paths fast.

#### Layer 3: Self-Improvement Loop (HTTP server only, optional)

The HTTP server gains a **single `setInterval` loop** that doesn't just cache-warm — it **actively improves the context store**. This is where self-awareness becomes real: the system observes its own state, decides what needs fixing, and takes action.

```typescript
// In src/server.ts, after app.listen():

const TICK_INTERVAL = parseInt(process.env.OPENCONTEXT_TICK_INTERVAL ?? '300000', 10) // 5 minutes default
const ENABLE_BACKGROUND = process.env.OPENCONTEXT_BACKGROUND !== 'false' // opt-out

if (ENABLE_BACKGROUND) {
  setInterval(async () => {
    try {
      await selfImprovementTick(store, schema, observer, analyzer)
    } catch (error) {
      // Log and continue — self-improvement failures are non-fatal
      console.error('[opencontext] self-improvement tick failed:', error)
    }
  }, TICK_INTERVAL)
}
```

**What `selfImprovementTick` does** — observe, decide, act, record:

```typescript
async function selfImprovementTick(store, schema, observer, analyzer) {
  // ── Phase A: Observe (gather current state) ──

  observer.rotateIfNeeded()
  const selfModel = await buildSelfModel(store, schema, observer)
  const summary = observer.getSummary()
  const actions: ImprovementAction[] = []

  // ── Phase B: Decide (identify what needs improvement) ──

  // 1. Auto-tag entries that have zero tags
  const untagged = store.listContexts().filter(e => e.tags.length === 0)
  if (untagged.length >= 3) {
    actions.push({ type: 'auto_tag', entries: untagged })
  }

  // 2. Merge near-duplicate entries (>80% content overlap, same type)
  const duplicates = detectNearDuplicates(store.listContexts())
  if (duplicates.length > 0) {
    actions.push({ type: 'merge_duplicates', pairs: duplicates })
  }

  // 3. Promote untyped entries to matching schema types
  if (schema) {
    const promotable = findPromotableEntries(store.listContexts(), schema)
    if (promotable.length > 0) {
      actions.push({ type: 'promote_to_type', entries: promotable })
    }
  }

  // 4. Archive truly stale entries (>180 days, never read by any agent)
  const archivable = selfModel.freshness.stalestEntries.filter(e => {
    const reads = summary.typeReadFrequency[e.type ?? 'untyped'] ?? 0
    return daysBetween(e.updatedAt, now()) > 180 && reads === 0
  })
  if (archivable.length > 0) {
    actions.push({ type: 'archive_stale', entries: archivable })
  }

  // 5. Create gap stubs for repeatedly missed queries
  const demandGaps = summary.missedQueries.filter(q =>
    summary.missedQueryCount[q] >= 3  // asked 3+ times, never found
  )
  if (demandGaps.length > 0) {
    actions.push({ type: 'create_gap_stubs', queries: demandGaps })
  }

  // 6. [Ollama] Auto-resolve old contradictions (newer entry wins)
  if (analyzer) {
    const contradictions = await analyzer.detectContradictions(
      store.listContexts().slice(-50)
    )
    const autoResolvable = contradictions.filter(c =>
      daysBetween(c.entryA.updatedAt, c.entryB.updatedAt) > 180
    )
    if (autoResolvable.length > 0) {
      actions.push({ type: 'resolve_contradictions', contradictions: autoResolvable })
    }
  }

  // 7. [Ollama] Suggest new schema types from untyped clusters
  if (analyzer) {
    const untyped = store.listContexts().filter(e => !e.contextType)
    if (untyped.length >= 5) {
      const suggestions = await analyzer.suggestSchemaTypes(untyped)
      if (suggestions.length > 0) {
        actions.push({ type: 'suggest_schema', suggestions })
      }
    }
  }

  // ── Phase C: Act (execute improvements) ──

  for (const action of actions) {
    await executeImprovement(action, store, schema, observer)
  }

  // ── Phase D: Record (audit log + refresh cache) ──

  if (actions.length > 0) {
    observer.logSelfImprovement({
      timestamp: new Date().toISOString(),
      actions: actions.map(a => ({ type: a.type, count: a.entries?.length ?? 1 })),
    })
  }

  const updatedModel = await buildSelfModel(store, schema, observer, analyzer ?? undefined)
  cache.set('self-model', updatedModel, TTL_1_HOUR)
}
```

### 8.4 Self-Improvement Actions (What the System Actually Does)

These are the concrete, autonomous actions the system takes. Each has guardrails to prevent destructive behavior.

| Action | What It Does | Guardrails |
|---|---|---|
| **Auto-tag** | Assigns tags to entries with zero tags, using content keyword extraction (deterministic) or Ollama classification | Only adds tags, never removes. Tags are non-destructive metadata. |
| **Merge duplicates** | Detects entries with >80% content overlap (same type, same tags). Merges into one, keeps newest `updatedAt`, combines source fields. | Only merges entries with same `contextType`. Original content preserved in merged entry. Logged for audit. |
| **Promote to type** | Untyped entries whose content matches an existing schema type's description get `contextType` assigned. E.g., "chose PostgreSQL because..." gets type `decision`. | Requires Ollama for semantic matching (fallback: keyword overlap with type description). Only sets `contextType`, never modifies `content`. |
| **Archive stale** | Entries >180 days old that were never read by any agent get `archived: true` (soft delete). | Does NOT delete. Archived entries are excluded from search by default but recoverable via UI or API. Never archives entries that any agent ever read. |
| **Create gap stubs** | When agents search for something 3+ times and find nothing, creates a stub: `"[GAP] Agents have asked about '{query}' 3 times but no context exists."` with tags `["gap", "needs-input"]` and source `"self-improvement"`. | Stubs are clearly marked. They show up in agent searches, prompting the agent or user to fill them. Auto-deleted once a real entry for that topic is saved. |
| **Resolve contradictions** | When two entries contradict and one is >6 months newer, archive the older one. The newer entry represents evolved thinking. | Only auto-resolves with >180 day age difference. Close-in-time contradictions are flagged but NOT auto-resolved — those require user input. |
| **Suggest schema** | When 5+ untyped entries cluster around a theme, propose a new schema type. Written to `awareness.json` as a pending suggestion. | **Never modifies `schema.yaml` autonomously.** Suggestions are surfaced to users via UI and to agents via `introspect`. User explicitly accepts or dismisses. |

### 8.5 The Self-Improvement Audit Log

Every autonomous action is logged to `awareness.json` so users and agents can see exactly what the system did:

```json
{
  "improvements": [
    {
      "timestamp": "2026-02-17T15:30:00Z",
      "action": "auto_tag",
      "details": "Tagged 4 entries: added 'database' to dec-12, dec-15; added 'auth' to dec-23, dec-24",
      "entriesAffected": ["dec-12", "dec-15", "dec-23", "dec-24"],
      "reversible": true
    },
    {
      "timestamp": "2026-02-17T15:30:01Z",
      "action": "archive_stale",
      "details": "Archived 2 entries older than 180 days with zero reads: note-3, note-7",
      "entriesAffected": ["note-3", "note-7"],
      "reversible": true
    },
    {
      "timestamp": "2026-02-17T15:30:03Z",
      "action": "create_gap_stubs",
      "details": "Created stub for 'error handling preferences' (searched 5 times, never found)",
      "entriesAffected": ["stub-1"],
      "reversible": true
    },
    {
      "timestamp": "2026-02-17T15:30:05Z",
      "action": "suggest_schema",
      "details": "Proposed new type 'api_decision' from 7 untyped entries about API design choices",
      "suggestion": { "typeName": "api_decision", "fields": ["endpoint", "method", "reasoning"] },
      "status": "pending_user_approval"
    }
  ]
}
```

All actions are **auditable and reversible**. The user can see what the system did, when, and undo any action via UI or by calling `update_context`/`delete_context`.

### 8.6 New MCP Tool: `get_improvements`

Agents can ask what the system has done autonomously:

```
Tool: get_improvements
Arguments:
  since?: string (ISO date, default: last 24 hours)

Returns: List of self-improvement actions taken

Example response:
"In the last 24 hours, I performed 3 self-improvement actions:

 1. Auto-tagged 4 entries that had no tags (added 'database', 'auth')
 2. Created a gap stub for 'error handling preferences' — agents asked
    about this 5 times but no context exists. Consider filling this in.
 3. Suggested a new schema type 'api_decision' based on 7 untyped entries
    about API design. Accept this in the UI or via update_schema.

 0 entries archived. 0 contradictions auto-resolved."
```

When an agent calls `introspect`, the response includes a summary of recent improvements so the agent knows the store has been autonomously modified.

### 8.7 Key Constraints on the Self-Improvement Loop

| Constraint | Value | Rationale |
|---|---|---|
| Tick interval | 5 minutes (configurable) | Frequent enough for freshness, infrequent enough to not load the system |
| Max Ollama calls per tick | 3 | Bounded: contradiction detection, schema suggestion, type promotion |
| Max entries per Ollama call | 50 | Sample recent entries, not full store |
| Total tick duration cap | 30 seconds | If tick exceeds this, skip remaining Ollama work |
| Failure behavior | Log and continue | Self-improvement failures never crash the server |
| Disable flag | `OPENCONTEXT_BACKGROUND=false` | Users can opt out entirely |
| No destructive deletes | Ever | Archive only (soft delete), never permanent removal |
| No schema modification | Ever | Only suggests, never writes to `schema.yaml` |

### 8.8 How the Three Layers Interact

```
Agent calls introspect()
  → Check Layer 3 cache (warm from self-improvement tick?)
  → Cache hit: return instantly (<1ms), includes recent improvement summary
  → Cache miss: compute Layer 1 (on-demand, <100ms)
  → Return result

Agent calls introspect(deep=true)
  → Check Layer 3 cache (deep analysis from self-improvement tick?)
  → Cache hit: return instantly
  → Cache miss: run Ollama now (Layer 1, 2-10s)
  → Return result

Store mutation (save_typed_context, etc.)
  → Layer 2: log observation, maybe refresh self-model cache
  → Layer 3: next tick picks up new data AND may act on it

No agents connected, server idle
  → Layer 3 tick still runs every 5 minutes
  → Auto-tags, archives stale entries, creates gap stubs
  → When the NEXT agent connects, the store is cleaner and richer
  → Agent sees: "Since your last session, I auto-tagged 3 entries
    and created a gap stub for 'testing preferences'"
```

### 8.9 MCP Server vs HTTP Server Responsibilities

| Behavior | MCP Server | HTTP Server |
|---|---|---|
| On-demand computation (Layer 1) | Yes | Yes (via REST API) |
| Write-triggered refresh (Layer 2) | Yes | Yes |
| Self-improvement loop (Layer 3) | **No** | **Yes** |
| Ollama analysis | On explicit request only | Background + on request |
| Self-improvement actions | **No** (reads results) | **Yes** (executes actions) |
| Cache reads | Reads from `awareness.json` | Reads from in-memory + `awareness.json` |
| Cache writes | Writes to `awareness.json` | Writes to in-memory + `awareness.json` |

The MCP server stays simple and stateless. The HTTP server is the **brain** — it runs the self-improvement loop, executes autonomous actions, and writes results to `awareness.json`. The MCP server reads those results and surfaces them to agents.

**File-based coordination**: when the self-improvement tick auto-tags entries or creates gap stubs, those changes go into `contexts.json`. When an agent calls `recall_context` via MCP, it sees the improved entries immediately — the same file-sharing pattern already used today.

### 8.10 Docker Implications

No changes to the Docker model:

```dockerfile
# HTTP server (default CMD) — gets background tick
CMD ["node", "dist/server.js"]

# MCP server (override CMD) — no background tick, reads cached results
# docker run -i ... node dist/mcp/index.js
```

Single image, single process per container, no supervisor needed. The background tick is just a `setInterval` inside the existing HTTP server process.

If running both services (`docker compose up app mcp`), the HTTP server's background tick keeps `awareness.json` fresh, and the MCP server reads it. Coordination is through the filesystem — same pattern as today with `contexts.json`.

### 8.11 Graceful Shutdown

The HTTP server needs to clean up the tick interval on shutdown:

```typescript
let tickInterval: NodeJS.Timeout | null = null

// On startup:
tickInterval = setInterval(backgroundTick, TICK_INTERVAL)

// On shutdown:
process.on('SIGTERM', () => {
  if (tickInterval) clearInterval(tickInterval)
  // Allow in-flight Ollama calls to complete (up to 5s timeout)
  server.close()
})
```

### 8.12 What This Means for Implementation

**Changes to existing files**:

| File | Change |
|---|---|
| `src/server.ts` | Add `setInterval` after `app.listen()`, add `SIGTERM` handler. ~30 lines. |

**New code**:

| Location | What |
|---|---|
| `src/mcp/awareness.ts` | Add `refreshCache()` function and file-based caching logic. ~40 lines. |
| `src/mcp/observer.ts` | Add `rotateIfNeeded()` method. ~10 lines. |

**No new files**. No new processes. No new npm dependencies.

### 8.13 Configuration Summary

| Setting | Default | Description |
|---------|---------|-------------|
| `OPENCONTEXT_BACKGROUND` | `true` | Enable/disable background tick on HTTP server |
| `OPENCONTEXT_TICK_INTERVAL` | `300000` (5 min) | Milliseconds between background ticks |
| `OPENCONTEXT_TICK_TIMEOUT` | `30000` (30s) | Max duration per tick before skipping remaining work |
| `OPENCONTEXT_CACHE_TTL` | `3600000` (1 hr) | How long Ollama analysis results stay cached |

All optional. Zero config needed for the default behavior.

---

## 9. Control Plane: Human-in-the-Loop Governance

### 9.1 The Problem

The self-improvement loop (section 8) proposes and executes actions autonomously. But some of those actions mutate user data — archiving entries, merging duplicates, resolving contradictions. An autonomous system that modifies a user's context store without consent is a trust violation, even if every action is "reversible."

The system needs a **control plane** — a governance layer that sits between "decide" and "execute," routing actions through human approval when the risk warrants it.

### 9.2 Design: Risk-Based Action Classification

Every self-improvement action is classified by risk level. The risk level determines whether the action auto-executes or enters a pending approval queue.

```
Self-improvement loop proposes action
  │
  ▼
┌─────────────────────────────────┐
│         Control Plane           │
│                                 │
│  ┌───────────┐  ┌───────────┐  │
│  │ Classify  │→ │ Route     │  │
│  │ risk      │  │           │  │
│  └───────────┘  └─────┬─────┘  │
│                   ┌───┴────┐   │
│                   │        │   │
│                ┌──▼──┐ ┌──▼──┐ │
│                │Auto │ │Pend │ │
│                │exec │ │queue│ │
│                └──┬──┘ └──┬──┘ │
│                   │       │    │
└───────────────────┼───────┼────┘
                    │       │
                    ▼       ▼
              Executed   Awaiting
              (logged)   approval
                         (UI / MCP / REST)
```

### 9.3 Risk Levels

| Risk Level | What It Means | Auto-Execute? | Examples |
|---|---|---|---|
| **low** | Additive only. No data modified or removed. Fully non-destructive. | **Yes** — executes immediately, logged in audit. | Auto-tag, create gap stubs, suggest schema (write to pending suggestions) |
| **medium** | Modifies existing data but is reversible. Changes entry metadata or merges content. | **No** — enters pending queue. User must approve. | Promote to type (sets `contextType`), merge duplicates (combines entries) |
| **high** | Removes data from active view or resolves conflicts by choosing one entry over another. | **No** — enters pending queue with prominent UI warning. | Archive stale entries, resolve contradictions (archive losing entry) |

### 9.4 Action-to-Risk Mapping

| Action | Risk | Reason | Auto-Execute? |
|---|---|---|---|
| **Auto-tag** | Low | Only adds tags, never removes. Non-destructive metadata. | Yes |
| **Create gap stubs** | Low | Adds new entries, doesn't touch existing ones. | Yes |
| **Suggest schema** | Low | Writes suggestion to `awareness.json`, never touches `schema.yaml`. | Yes |
| **Promote to type** | Medium | Sets `contextType` field on existing entries. Reversible but changes how entries appear in queries. | No — pending |
| **Merge duplicates** | Medium | Combines two entries into one, soft-deletes the other. Content preserved but structure changes. | No — pending |
| **Archive stale** | High | Removes entries from active search results. Recoverable but user may not notice missing data. | No — pending |
| **Resolve contradictions** | High | Archives one entry in favor of another. Involves a judgment call about which entry is "correct." | No — pending |

### 9.5 The Pending Actions Queue

Non-auto-executed actions are written to `awareness.json` under a `pendingActions` key:

```json
{
  "pendingActions": [
    {
      "id": "pa-1",
      "createdAt": "2026-02-17T15:30:00Z",
      "action": "archive_stale",
      "risk": "high",
      "description": "Archive 2 entries older than 180 days with zero reads: note-3, note-7",
      "entriesAffected": ["note-3", "note-7"],
      "reasoning": "These entries haven't been read by any agent in 6 months and are >180 days old.",
      "status": "pending",
      "expiresAt": "2026-02-24T15:30:00Z"
    },
    {
      "id": "pa-2",
      "createdAt": "2026-02-17T15:30:02Z",
      "action": "merge_duplicates",
      "risk": "medium",
      "description": "Merge entries dec-12 and dec-15 (87% content overlap, both type 'decision')",
      "entriesAffected": ["dec-12", "dec-15"],
      "preview": {
        "merged_content": "Use PostgreSQL for JSON column support and complex queries",
        "kept_entry": "dec-15",
        "archived_entry": "dec-12"
      },
      "reasoning": "Both entries describe the same PostgreSQL decision with near-identical wording.",
      "status": "pending",
      "expiresAt": "2026-02-24T15:30:02Z"
    },
    {
      "id": "pa-3",
      "createdAt": "2026-02-17T15:30:05Z",
      "action": "resolve_contradictions",
      "risk": "high",
      "description": "Entry pref-12 ('prefer composition') contradicts dec-47 ('class inheritance for repos'). dec-47 is 8 months newer.",
      "entriesAffected": ["pref-12", "dec-47"],
      "preview": {
        "keep": "dec-47",
        "archive": "pref-12",
        "explanation": "dec-47 is a specific architectural decision made 8 months after the general preference in pref-12. The newer, specific decision likely reflects evolved thinking."
      },
      "reasoning": "Age difference >180 days. Newer entry is a concrete decision; older is a general preference.",
      "status": "pending",
      "expiresAt": "2026-02-24T15:30:05Z"
    }
  ]
}
```

### 9.6 Approval Workflow

Pending actions can be approved or dismissed through three channels:

**1. UI (AwarenessPanel)**:
- Pending actions appear as cards with approve/dismiss buttons
- High-risk actions shown with a warning banner
- Each card shows: what will happen, which entries are affected, the reasoning, and a preview of the result
- Batch approve/dismiss for multiple actions of the same type
- "Approve all low-risk" and "Approve all medium-risk" bulk actions

**2. MCP Tool: `review_pending_actions`**:

```
Tool: review_pending_actions
Arguments: (none)
Returns: List of pending actions awaiting approval

Example response:
"There are 3 pending actions awaiting your approval:

 1. [HIGH] Archive 2 stale entries (note-3, note-7) — 180+ days old, never read
 2. [MEDIUM] Merge duplicate entries dec-12 and dec-15 (87% overlap)
 3. [HIGH] Resolve contradiction: archive pref-12 in favor of dec-47

 Use approve_action or dismiss_action with the action ID to proceed."
```

**3. MCP Tool: `approve_action` / `dismiss_action`**:

```
Tool: approve_action
Arguments:
  action_id: string       — ID of the pending action (e.g. "pa-1")
  action_ids?: string[]   — batch approve multiple actions
Returns: Confirmation of executed action

Tool: dismiss_action
Arguments:
  action_id: string       — ID to dismiss
  action_ids?: string[]   — batch dismiss
  reason?: string         — optional: why the user rejected this
Returns: Confirmation, action removed from queue
```

When a user dismisses an action with a reason, the system learns: it records the dismissal and avoids proposing similar actions in the future. For example, if the user dismisses "archive entry note-3" with reason "I still need this," the system adds note-3 to a protection list and won't propose archiving it again.

**4. REST API**:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pending-actions` | `GET` | List all pending actions |
| `/api/pending-actions/:id/approve` | `POST` | Approve and execute a pending action |
| `/api/pending-actions/:id/dismiss` | `POST` | Dismiss a pending action, optionally with reason |
| `/api/pending-actions/bulk` | `POST` | Batch approve/dismiss: `{ action_ids: [...], decision: "approve" | "dismiss" }` |

### 9.7 Expiration

Pending actions expire after 7 days (configurable via `OPENCONTEXT_PENDING_TTL`). Expired actions are auto-dismissed and logged as expired — not auto-approved. The system can re-propose the same action in a future tick if conditions still warrant it.

### 9.8 How This Changes the Self-Improvement Loop

The `selfImprovementTick` from section 8.3 now routes through the control plane:

```typescript
// Phase C changes from direct execution to routing:

// ── Phase C: Route through control plane ──

for (const action of actions) {
  const risk = classifyRisk(action)

  if (risk === 'low') {
    // Auto-execute, log to audit
    await executeImprovement(action, store, schema, observer)
    observer.logSelfImprovement({ ...action, autoExecuted: true })
  } else {
    // Queue for human approval
    await controlPlane.enqueue({
      action,
      risk,
      description: describeAction(action),
      reasoning: explainReasoning(action, selfModel, summary),
      preview: generatePreview(action, store),
      expiresAt: addDays(now(), 7),
    })
  }
}
```

The observe-decide phases remain identical. Only the act phase changes — instead of `executeImprovement` for everything, low-risk actions execute immediately while medium/high-risk actions enter the pending queue.

### 9.9 Protection Lists

When users dismiss actions, the system builds a **protection list** — entries and patterns that should not be targeted by self-improvement:

```json
{
  "protections": [
    {
      "entryId": "note-3",
      "protectedFrom": ["archive_stale"],
      "reason": "User dismissed: 'I still need this'",
      "createdAt": "2026-02-17T16:00:00Z"
    },
    {
      "pattern": "merge_duplicates",
      "scope": { "contextType": "preference" },
      "reason": "User dismissed 3 preference merges — may want similar-but-distinct preferences",
      "createdAt": "2026-02-18T10:00:00Z"
    }
  ]
}
```

The self-improvement loop checks the protection list before proposing actions. If an entry is protected from a specific action type, that action is skipped entirely — no re-proposal, no pending queue entry.

**Auto-learned protections**: if a user dismisses 3+ actions of the same type for the same `contextType`, the system infers a pattern and creates a scope-based protection. E.g., dismissing 3 preference merges → system learns "user wants similar preferences kept separate" and stops proposing preference merges.

### 9.10 Configuration and Overrides

| Setting | Default | Description |
|---------|---------|-------------|
| `OPENCONTEXT_PENDING_TTL` | `604800000` (7 days) | How long pending actions wait before auto-expiring |
| `OPENCONTEXT_AUTO_APPROVE_LOW` | `true` | Auto-execute low-risk actions. Set to `false` to require approval for everything. |
| `OPENCONTEXT_AUTO_APPROVE_MEDIUM` | `false` | Auto-execute medium-risk actions. Default off — requires approval. |
| `OPENCONTEXT_AUTO_APPROVE_HIGH` | `false` | Auto-execute high-risk actions. **Strongly discouraged.** Default off. |

A paranoid user can set `OPENCONTEXT_AUTO_APPROVE_LOW=false` to require approval for every single action, including auto-tagging. The system still proposes improvements but never touches anything without consent.

Conversely, a power user who trusts the system can set `OPENCONTEXT_AUTO_APPROVE_MEDIUM=true` to auto-approve merges and promotions, only stopping for high-risk archives and contradiction resolution.

### 9.11 Implementation: `src/mcp/control-plane.ts` (new file)

```typescript
export interface PendingAction {
  id: string
  createdAt: string
  expiresAt: string
  action: ImprovementAction
  risk: 'low' | 'medium' | 'high'
  description: string
  reasoning: string
  preview: Record<string, unknown>
  status: 'pending' | 'approved' | 'dismissed' | 'expired'
  dismissReason?: string
}

export interface Protection {
  entryId?: string
  pattern?: string
  scope?: Record<string, string>
  protectedFrom: string[]
  reason: string
  createdAt: string
}

export function createControlPlane(storePath?: string): {
  // Queue management
  enqueue(action: Omit<PendingAction, 'id' | 'status'>): PendingAction
  listPending(): PendingAction[]
  approve(id: string): { executed: boolean; result: string }
  dismiss(id: string, reason?: string): void
  bulkApprove(ids: string[]): Array<{ id: string; executed: boolean }>
  bulkDismiss(ids: string[], reason?: string): void
  expireStale(): number  // returns count of expired actions

  // Protection list
  isProtected(entryId: string, actionType: string): boolean
  addProtection(protection: Omit<Protection, 'createdAt'>): void
  listProtections(): Protection[]
  removeProtection(entryId: string, actionType: string): void

  // Risk classification
  classifyRisk(action: ImprovementAction): 'low' | 'medium' | 'high'
  shouldAutoExecute(action: ImprovementAction): boolean
}
```

**Storage**: pending actions and protections are stored in `awareness.json` under `pendingActions` and `protections` keys. Same file, same read-modify-write pattern as the rest of the awareness data.

### 9.12 How Agents Experience the Control Plane

Agents interact with the control plane naturally through MCP tools:

```
Agent                          OpenContext
  │                                │
  │  introspect()                  │
  │  ─────────────────────────►    │
  │  ◄─────────────────────────    │  "...3 pending actions await
  │                                │   your approval. Use
  │                                │   review_pending_actions."
  │                                │
  │  review_pending_actions()      │
  │  ─────────────────────────►    │
  │  ◄─────────────────────────    │  Returns 3 actions with
  │                                │  descriptions and reasoning
  │                                │
  │  (Agent presents to user       │
  │   or makes a judgment call)    │
  │                                │
  │  approve_action("pa-2")        │
  │  ─────────────────────────►    │
  │                                │  Execute merge, log to audit
  │  ◄─────────────────────────    │  "Merged dec-12 into dec-15"
  │                                │
  │  dismiss_action("pa-3",        │
  │    reason: "Both are valid     │
  │    in different contexts")     │
  │  ─────────────────────────►    │
  │                                │  Remove from queue, add to
  │                                │  protection list
  │  ◄─────────────────────────    │  "Dismissed. Won't re-propose
  │                                │   this contradiction resolution."
```

This means Claude Code (or any agent) can act as the human's delegate for control plane decisions — the agent can review pending actions and make approval recommendations, but the user retains final authority through the MCP tool interface.

---

## 10. Putting It Together: Agent Interaction Flow

### Session Start (Agent calls introspect)

```
Agent                          OpenContext                    Ollama
  │                                │                            │
  │  describe_schema()             │                            │
  │  ─────────────────────────►    │                            │
  │                                │  Load schema.yaml          │
  │  ◄─────────────────────────    │  Return: 3 types           │
  │                                │                            │
  │  introspect()                  │                            │
  │  ─────────────────────────►    │                            │
  │                                │  buildSelfModel()          │
  │                                │  (deterministic: instant)  │
  │  ◄─────────────────────────    │  Return: health, 2 gaps,   │
  │                                │  1 keyword contradiction   │
  │                                │                            │
  │  introspect(deep=true)         │                            │
  │  ─────────────────────────►    │                            │
  │                                │  buildSelfModel() ────────►│
  │                                │                            │ semantic analysis
  │                                │                  ◄─────────│ richer descriptions
  │  ◄─────────────────────────    │  Return: enriched model,   │
  │                                │  semantic contradictions,  │
  │                                │  natural-language gaps     │
  │                                │                            │
  │  (If Ollama unavailable,       │                            │
  │   deep=true silently falls     │                            │
  │   back to deterministic)       │                            │
```

### During Session (Agent reads, writes, and uses smart retrieval)

```
Agent                          OpenContext                    Ollama
  │                                │                            │
  │  query_by_type("decision",     │                            │
  │    { project: "my-app" },      │                            │
  │    ranked: true)               │                            │
  │  ─────────────────────────►    │                            │
  │                                │  Filter by type ──────────►│
  │                                │                            │ rank by relevance
  │                                │                  ◄─────────│
  │  ◄─────────────────────────    │  Return: 5 decisions       │
  │                                │  (most relevant first)     │
  │                                │                            │
  │  save_typed_context("decision",│                            │
  │    { what: "Use Redis",        │                            │
  │      why: "Need pub/sub...",   │                            │
  │      alternatives: ["RabbitMQ"]│                            │
  │    })                          │                            │
  │  ─────────────────────────►    │                            │
  │                                │  Validate, save, log       │
  │  ◄─────────────────────────    │  Return: saved dec-48      │
  │                                │                            │
  │  summarize_context(            │                            │
  │    type: "decision",           │                            │
  │    focus: "infrastructure")    │                            │
  │  ─────────────────────────►    │                            │
  │                                │  Gather entries ──────────►│
  │                                │                            │ synthesize briefing
  │                                │                  ◄─────────│
  │  ◄─────────────────────────    │  "This project uses        │
  │                                │   Drizzle ORM, JWT auth,   │
  │                                │   and Redis pub/sub..."    │
```

### Session End (Agent reports back)

```
Agent                          OpenContext
  │                                │
  │  report_usefulness(            │
  │    ids: ["dec-12", "dec-23"],   │
  │    useful: true,               │
  │    notes: "ORM decision saved  │
  │     me from recommending       │
  │     Prisma again"              │
  │  )                             │
  │  ─────────────────────────►    │
  │                                │  Log usefulness, update summary
  │  ◄─────────────────────────    │  Return: acknowledged
```

### Periodic Maintenance (User or agent triggers analysis)

```
Agent / UI                     OpenContext                    Ollama
  │                                │                            │
  │  analyze_contradictions()      │                            │
  │  ─────────────────────────►    │                            │
  │                                │  Group entries by type     │
  │                                │  Pairwise compare ────────►│
  │                                │                            │ semantic check
  │                                │                  ◄─────────│
  │  ◄─────────────────────────    │  Return: 2 contradictions  │
  │                                │  with explanations         │
  │                                │                            │
  │  suggest_schema()              │                            │
  │  ─────────────────────────►    │                            │
  │                                │  Gather untyped entries    │
  │                                │  Cluster by meaning ──────►│
  │                                │                            │ propose types
  │                                │                  ◄─────────│
  │  ◄─────────────────────────    │  Return: suggested type    │
  │                                │  "api_decision" with       │
  │                                │  fields: endpoint, method, │
  │                                │  reasoning                 │
```

---

## 11. Storage Schema Evolution

### Current: `~/.opencontext/contexts.json`

```json
{
  "version": 1,
  "entries": [ /* ContextEntry[] */ ],
  "bubbles": [ /* Bubble[] */ ]
}
```

### After: `~/.opencontext/contexts.json` (version bump to 2)

```json
{
  "version": 2,
  "entries": [
    {
      "id": "abc-123",
      "content": "Use Drizzle ORM over Prisma for better SQL control",
      "tags": ["architecture", "database"],
      "source": "claude-code",
      "bubbleId": "bubble-1",
      "contextType": "decision",
      "structuredData": {
        "what": "Use Drizzle ORM over Prisma",
        "why": "Better SQL control, lighter bundle",
        "alternatives": ["Prisma", "Kysely"]
      },
      "createdAt": "2026-02-17T10:00:00Z",
      "updatedAt": "2026-02-17T10:00:00Z"
    },
    {
      "id": "def-456",
      "content": "Prefer functional components over class components",
      "tags": ["code-style"],
      "source": "manual",
      "createdAt": "2026-01-15T08:00:00Z",
      "updatedAt": "2026-01-15T08:00:00Z"
    }
  ],
  "bubbles": [ /* unchanged */ ]
}
```

**Migration**: `store.ts` already has a migration path in `load()` (adds `bubbles` if missing). Add a v1→v2 migration that simply bumps the version number — existing entries without `contextType`/`structuredData` are valid v2 entries (those fields are optional).

### New: `~/.opencontext/schema.yaml`

User-created. See section 4.1 for format.

### New: `~/.opencontext/awareness.json`

```json
{
  "events": [ /* ObservationEvent[] — capped at 1000 */ ],
  "summary": {
    "totalReads": 234,
    "totalWrites": 67,
    "totalMisses": 12,
    "missedQueries": ["error handling", "deployment", "CI config"],
    "typeReadFrequency": { "decision": 89, "preference": 45, "bug_pattern": 12 },
    "typeWriteFrequency": { "decision": 34, "preference": 20, "bug_pattern": 8 },
    "lastActivity": "2026-02-17T14:30:00Z"
  },
  "usefulness": {
    "helpful": { "dec-12": 5, "pref-3": 3 },
    "unhelpful": { "dec-7": 2 }
  }
}
```

---

## 12. Implementation Plan

### Phase 1: User-Defined Schemas (Foundation)

**Goal**: Users can define context types, agents can discover and use them.

| Step | File | Change | Effort |
|------|------|--------|--------|
| 1a | `src/mcp/schema.ts` | New file: schema loader, validator, describer | S |
| 1b | `src/mcp/types.ts` | Add `contextType`, `structuredData` to `ContextEntry` | XS |
| 1c | `src/mcp/store.ts` | Add `saveTypedContext()`, `queryByType()` methods | S |
| 1d | `src/mcp/server.ts` | Register `describe_schema`, `save_typed_context`, `query_by_type` tools | S |
| 1e | `src/server.ts` | Add `GET/PUT /api/schema` endpoints | XS |
| 1f | `ui/src/components/SchemaEditor.tsx` | Schema editor UI page | M |
| 1g | `ui/src/App.tsx` | Add `/schema` route | XS |

**Tests**: Schema loading, validation (valid + invalid entries), migration from v1→v2 store.

### Phase 2: Self-Awareness (Introspection)

**Goal**: OpenContext can describe itself — health, gaps, coverage, contradictions.

| Step | File | Change | Effort |
|------|------|--------|--------|
| 2a | `src/mcp/awareness.ts` | New file: `buildSelfModel()` function | M |
| 2b | `src/mcp/server.ts` | Register `introspect` and `get_gaps` tools | S |
| 2c | `src/server.ts` | Add `GET /api/awareness` endpoint | XS |
| 2d | `ui/src/components/AwarenessPanel.tsx` | Awareness dashboard UI | M |
| 2e | `ui/src/App.tsx` | Add `/awareness` route | XS |

**Tests**: Self-model computation with various store states (empty, sparse, healthy, contradictory).

### Phase 3: Usage Observation (Feedback Loop)

**Goal**: OpenContext tracks how agents use it and feeds insights back into self-awareness.

| Step | File | Change | Effort |
|------|------|--------|--------|
| 3a | `src/mcp/observer.ts` | New file: event logger, summary builder | S |
| 3b | `src/mcp/store.ts` | Add observer hooks to existing methods (~1 line each) | XS |
| 3c | `src/mcp/server.ts` | Register `report_usefulness` tool | XS |
| 3d | `src/mcp/awareness.ts` | Enhance `buildSelfModel()` with observer data | S |

**Tests**: Event logging, log rotation, missed query detection, usefulness tracking.

### Phase 4: Ollama-Powered Deep Analysis

**Goal**: Semantic contradiction detection, intelligent schema suggestions, context summarization, and relevance-ranked retrieval — all with graceful degradation.

| Step | File | Change | Effort |
|------|------|--------|--------|
| 4a | `src/mcp/analyzer.ts` | New file: `ContextAnalyzer` class with 6 analysis methods + deterministic fallbacks | M |
| 4b | `src/mcp/server.ts` | Register `analyze_contradictions`, `suggest_schema`, `summarize_context` tools | S |
| 4c | `src/mcp/server.ts` | Add `deep` arg to `introspect`, `ranked` arg to `query_by_type` | XS |
| 4d | `src/mcp/awareness.ts` | Wire optional `ContextAnalyzer` into `buildSelfModel()` for enriched gaps/contradictions | S |
| 4e | `src/server.ts` | Add `POST /api/analyze` endpoint | XS |
| 4f | `ui/src/components/AwarenessPanel.tsx` | Add deep analysis button, Ollama status indicator, schema suggestion cards, contradiction resolution UI | M |

**Tests**: Each analysis method tested in both modes (Ollama available vs unavailable). Mock Ollama responses for deterministic test behavior. Verify fallback produces valid output for all methods.

### Phase 5: Self-Improvement Loop (Autonomous Actions)

**Goal**: HTTP server actively improves the context store — auto-tagging, deduplication, stale archival, gap stub creation, type promotion, contradiction resolution, and schema suggestions. All actions auditable and reversible.

| Step | File | Change | Effort |
|------|------|--------|--------|
| 5a | `src/mcp/improver.ts` | New file: `ImprovementAction` types, `detectNearDuplicates()`, `findPromotableEntries()`, `executeImprovement()`, improvement audit logging | M |
| 5b | `src/mcp/awareness.ts` | Add `refreshCache()` function and file-based caching with TTL | S |
| 5c | `src/mcp/observer.ts` | Add `rotateIfNeeded()`, `logSelfImprovement()`, `missedQueryCount` tracking | S |
| 5d | `src/mcp/store.ts` | Add `archived` field support, `archiveContext()` method, gap stub auto-cleanup on matching save | S |
| 5e | `src/server.ts` | Add `setInterval` with `selfImprovementTick()`, `SIGTERM`/`SIGINT` graceful shutdown | S |
| 5f | `src/mcp/server.ts` | Register `get_improvements` tool, enhance `introspect` to include recent improvements | S |
| 5g | `ui/src/components/AwarenessPanel.tsx` | Add improvement audit log viewer, undo actions, schema suggestion accept/dismiss UI | M |

**Tests**: Each improvement action in isolation (auto-tag, merge, archive, gap stub, promote, resolve). Full tick with mocked store. Verify archived entries excluded from search. Verify gap stubs auto-cleanup. Verify audit log accuracy. Verify MCP server reads improvements via `awareness.json`.

### Phase 6: Control Plane (Human-in-the-Loop Governance)

**Goal**: All medium/high-risk self-improvement actions route through a pending approval queue instead of executing immediately. Users approve or dismiss via UI, MCP tools, or REST API. Dismissed actions feed a protection list that prevents re-proposal.

| Step | File | Change | Effort |
|------|------|--------|--------|
| 6a | `src/mcp/control-plane.ts` | New file: `createControlPlane()`, `PendingAction` and `Protection` types, risk classification, enqueue/approve/dismiss/expire logic, protection list management | M |
| 6b | `src/mcp/improver.ts` | Modify `selfImprovementTick()` Phase C to route through control plane instead of direct execution | S |
| 6c | `src/mcp/server.ts` | Register `review_pending_actions`, `approve_action`, `dismiss_action` tools | S |
| 6d | `src/server.ts` | Add `GET /api/pending-actions`, `POST .../approve`, `POST .../dismiss`, `POST .../bulk` endpoints. Add `expireStale()` call to background tick. | S |
| 6e | `ui/src/components/AwarenessPanel.tsx` | Add pending actions cards with approve/dismiss buttons, risk-level badges, batch actions, protection list viewer | M |

**Tests**: Risk classification for each action type. Enqueue/approve/dismiss lifecycle. Expiration after TTL. Protection list blocking re-proposals. Auto-learned pattern protections after 3+ dismissals. Batch operations. Config overrides (`AUTO_APPROVE_LOW=false` puts everything in queue).

### Phase Summary

| Phase | New Files | Modified Files | Estimated New Lines | Dependencies |
|-------|-----------|----------------|-------------------|--------------|
| 1 | 2 (`schema.ts`, `SchemaEditor.tsx`) | 4 (`types.ts`, `store.ts`, `server.ts`, `App.tsx`) + `server.ts` (REST) | ~400 | None (uses existing `js-yaml` or raw YAML parsing) |
| 2 | 2 (`awareness.ts`, `AwarenessPanel.tsx`) | 2 (`server.ts` MCP, `server.ts` REST, `App.tsx`) | ~350 | Phase 1 (schema needed for coverage analysis) |
| 3 | 1 (`observer.ts`) | 3 (`store.ts`, `server.ts`, `awareness.ts`) | ~200 | Phase 2 (awareness consumes observer data) |
| 4 | 1 (`analyzer.ts`) | 4 (`server.ts` MCP, `server.ts` REST, `awareness.ts`, `AwarenessPanel.tsx`) | ~350 | Phases 1-3 + existing `ollama` npm package (already a dependency) |
| 5 | 1 (`improver.ts`) | 5 (`server.ts`, `awareness.ts`, `observer.ts`, `store.ts`, `server.ts` MCP, `AwarenessPanel.tsx`) | ~400 | Phases 1-4 (orchestrates all prior components) |
| 6 | 1 (`control-plane.ts`) | 4 (`improver.ts`, `server.ts` MCP, `server.ts` REST, `AwarenessPanel.tsx`) | ~350 | Phase 5 (governs self-improvement actions) |
| **Total** | **8 new files** | **~8 existing files modified** | **~2050 lines** | **0 new npm dependencies** (reuses existing `ollama` package) |

---

## 13. New MCP Tool Summary

After implementation, the MCP server exposes **23 tools** (11 existing + 12 new):

### Existing (unchanged)

| Tool | Category |
|------|----------|
| `save_context` | Context CRUD |
| `recall_context` | Context CRUD |
| `list_contexts` | Context CRUD |
| `search_contexts` | Context CRUD |
| `update_context` | Context CRUD |
| `delete_context` | Context CRUD |
| `create_bubble` | Bubble CRUD |
| `list_bubbles` | Bubble CRUD |
| `get_bubble` | Bubble CRUD |
| `update_bubble` | Bubble CRUD |
| `delete_bubble` | Bubble CRUD |

### New (Phases 1-3: Schema, Awareness, Observation)

| Tool | Category | Description |
|------|----------|-------------|
| `describe_schema` | Schema | Returns user-defined context types and fields. Agents call this to understand what context the user cares about. |
| `save_typed_context` | Schema | Save a structured entry matching a user-defined type. |
| `query_by_type` | Schema | Query entries by type with optional field-level filtering. Supports `ranked: true` for Ollama relevance sorting. |
| `introspect` | Awareness | Full self-model: health, coverage, freshness, gaps, contradictions. Supports `deep: true` for Ollama-enhanced analysis. |
| `report_usefulness` | Observation | Agent reports whether retrieved context was helpful. |

### New (Phase 4: Ollama-Powered Analysis)

| Tool | Category | With Ollama | Without Ollama |
|------|----------|-------------|----------------|
| `analyze_contradictions` | Analysis | Semantic pairwise contradiction detection with natural-language explanations | Keyword-opposition heuristic with template explanations |
| `suggest_schema` | Analysis | LLM-powered clustering of untyped entries into proposed schema types with descriptions | Tag-grouping + structural pattern matching |
| `summarize_context` | Analysis | LLM-generated briefing paragraph synthesized from multiple entries | Truncated concatenation with entry counts |

### New (Phase 5: Self-Improvement)

| Tool | Category | Description |
|------|----------|-------------|
| `get_improvements` | Self-Improvement | Returns list of autonomous actions taken (auto-tags, archives, gap stubs, schema suggestions) since a given date. Agents call this to understand how the store has been autonomously modified. |

### New (Section 9: Control Plane)

| Tool | Category | Description |
|------|----------|-------------|
| `review_pending_actions` | Control Plane | List all pending actions awaiting human approval, with risk levels and reasoning. |
| `approve_action` | Control Plane | Approve and execute a pending action by ID. Supports batch via `action_ids`. |
| `dismiss_action` | Control Plane | Dismiss a pending action by ID with optional reason. Dismissed actions feed the protection list. |

---

## 14. New REST API Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/schema` | `GET` | Returns current schema types |
| `/api/schema` | `PUT` | Updates schema definition |
| `/api/awareness` | `GET` | Returns computed self-model |
| `/api/analyze` | `POST` | Run Ollama analysis: contradictions, schema suggestions, or summarization. Returns `source: "ollama" \| "deterministic"` to indicate which mode was used. |
| `/api/pending-actions` | `GET` | List all pending control plane actions |
| `/api/pending-actions/:id/approve` | `POST` | Approve and execute a pending action |
| `/api/pending-actions/:id/dismiss` | `POST` | Dismiss a pending action (optional `reason` in body) |
| `/api/pending-actions/bulk` | `POST` | Batch approve/dismiss: `{ action_ids, decision }` |

---

## 15. New UI Routes Summary

| Path | Component | Description |
|------|-----------|-------------|
| `/schema` | SchemaEditor | Define and edit custom context types |
| `/awareness` | AwarenessPanel | View system health, gaps, contradictions |

---

## 16. What We're Building (Full Scope)

Everything described in this PRD is in scope. For clarity, here's the complete feature set:

| Feature | Included | Section |
|---|---|---|
| User-defined context schemas (`schema.yaml`) | Yes | 4 |
| Schema editor UI | Yes | 4.7 |
| Self-model and introspection | Yes | 5 |
| Awareness panel UI | Yes | 5.6 |
| Usage observation and feedback loop | Yes | 6 |
| Ollama-powered deep analysis (contradictions, suggestions, summarization, ranking) | Yes | 7 |
| Deterministic fallbacks for all Ollama features | Yes | 7.4 |
| Self-improvement loop (auto-tag, merge, archive, gap stubs, promote, resolve) | Yes | 8.4 |
| Self-improvement audit log | Yes | 8.5 |
| `get_improvements` MCP tool | Yes | 8.6 |
| Background tick on HTTP server | Yes | 8.3 |
| File-based cache sharing between HTTP and MCP | Yes | 8.9 |

### Hard Boundaries (truly not building)

| Boundary | Reason |
|---|---|
| Cloud LLM APIs (OpenAI, Anthropic) for analysis | Ollama only. Local-first, no API keys, no costs, no data leaving the machine. |
| Streaming Ollama responses | All calls use `stream: false`. Complexity not justified for <2000 token prompts. |
| Fine-tuning or training on user data | Off-the-shelf Ollama models only. No custom training. |
| Permanent deletion of user data by self-improvement | Archive only (soft delete). The system never permanently destroys anything. |
| Autonomous `schema.yaml` modification | System suggests, user decides. Schema changes always require explicit approval. |

---

## 17. Success Criteria

### Functional

- [ ] User can define custom context types in `schema.yaml` and agents discover them via `describe_schema`
- [ ] Agents can save and query typed context entries with field-level filtering
- [ ] `introspect` tool returns accurate health, coverage, freshness, and gap information
- [ ] Existing 11 MCP tools continue to work unchanged (backward compatibility)
- [ ] Store migration from v1 → v2 is automatic and lossless
- [ ] UI allows editing schemas and viewing system awareness
- [ ] `analyze_contradictions` detects semantic tensions between entries when Ollama is available
- [ ] `suggest_schema` proposes meaningful types from untyped entry patterns
- [ ] `summarize_context` produces coherent briefing paragraphs from multiple entries
- [ ] All 3 Ollama-powered tools produce valid, useful output via deterministic fallback when Ollama is unavailable
- [ ] `introspect(deep=true)` enriches gaps and contradictions with natural-language descriptions via Ollama
- [ ] `query_by_type(ranked=true)` returns entries sorted by semantic relevance via Ollama
- [ ] Self-improvement loop auto-tags untagged entries with relevant keywords
- [ ] Self-improvement loop detects and merges near-duplicate entries (>80% overlap)
- [ ] Self-improvement loop archives entries >180 days old with zero agent reads (soft delete, recoverable)
- [ ] Self-improvement loop creates gap stubs for queries missed 3+ times
- [ ] Self-improvement loop promotes untyped entries to matching schema types when Ollama is available
- [ ] Self-improvement loop auto-resolves contradictions where one entry is >180 days newer
- [ ] Self-improvement loop suggests new schema types from untyped entry clusters (pending user approval, never auto-applied)
- [ ] `get_improvements` tool returns accurate audit log of all autonomous actions
- [ ] All self-improvement actions are logged in `awareness.json` with reversibility flag
- [ ] `introspect` response includes summary of recent self-improvement actions

### Non-Functional

- [ ] `introspect` (default, deterministic) computes in <100ms for stores with up to 1000 entries
- [ ] `introspect(deep=true)` completes in <10s with Ollama (local model)
- [ ] Observer adds <1ms overhead to existing store operations
- [ ] `awareness.json` stays under 200KB with log rotation
- [ ] Zero new npm dependencies required (reuses existing `ollama` package)
- [ ] Each Ollama prompt uses <2000 tokens input to work with modest local models
- [ ] Analysis results are cached in `awareness.json` with 1-hour TTL to avoid redundant Ollama calls
- [ ] Ollama availability check is lazy (first call only) and cached for the session lifetime

---

## 18. Future Directions (Post-v1)

These build on the v1 foundation and inform architectural decisions:

1. **Auto-generated instruction files** — produce CLAUDE.md / .cursorrules from the context store + schema, kept in sync automatically by the self-improvement loop
2. **`@opencontext/sdk`** — npm package for agent builders to integrate without MCP, with TypeScript types generated from the user's schema
3. **Schema templates and community packs** — curated starter schemas for common workflows
4. **Session lifecycle** — formal `start_session` / `end_session` tools that let agents declare what they're doing and enable richer handoff between sessions
5. **Hybrid retrieval** — combine Ollama relevance ranking with usefulness scores and read frequency for multi-signal ranking
6. **Cross-agent session handoff** — agent A ends a session, agent B starts one and gets a briefing of what A did (using `summarize_context` under the hood)
7. **Proactive agent prompting** — the system not only identifies gaps but proposes concrete prompts to agents: "Next time the user discusses testing, ask them about their E2E preferences and save the answer as a preference entry"
8. **Streaming analysis** — stream Ollama responses for long summarizations to reduce perceived latency
9. **Pluggable LLM backends** — support Ollama, llama.cpp, LM Studio, or cloud APIs through a unified analyzer interface
10. **Context embeddings** — generate and cache embeddings for entries using Ollama's embedding models, enabling true vector similarity search alongside keyword search
11. **Cross-device sync** — cloud relay for syncing `contexts.json` and `awareness.json` across machines
12. **Team/shared schemas** — multi-user context stores with role-based access and shared project intelligence
