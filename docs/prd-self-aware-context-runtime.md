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

The goal: any agent that connects to OpenContext gets smarter because the context layer itself is smart.

---

## 2. Design Principles

1. **Minimal blast radius** — layer new capabilities onto the existing store, server, and types. Don't rewrite what works.
2. **User-defined over prescriptive** — no hardcoded context types. Users define what matters to them.
3. **Schema-as-instruction** — defining a context type implicitly tells agents what the user cares about tracking.
4. **Self-awareness is queryable** — agents access the system's self-knowledge through the same MCP tool interface they already use.
5. **Additive, not breaking** — existing `save_context`, `recall_context`, etc. keep working unchanged. New capabilities are new tools.
6. **Local-first** — all self-awareness data stays in the local JSON store. No cloud, no network calls.

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
                                   └──────────────┘
                                          │
                                          ▼
                                   ~/.opencontext/
                                   ├── contexts.json    (existing — add schema + meta sections)
                                   ├── schema.yaml      (new — user-defined types)
                                   └── awareness.json   (new — usage log + self-model)
```

### Files Changed vs Added

| File | Status | What Changes |
|------|--------|-------------|
| `src/mcp/types.ts` | **Modified** | Add `SchemaType`, `SelfModel`, `ObservationEvent` interfaces |
| `src/mcp/store.ts` | **Modified** | Add schema-aware save/query methods, wrap existing methods with observation hooks |
| `src/mcp/server.ts` | **Modified** | Register 5 new MCP tools alongside existing 11 |
| `src/mcp/schema.ts` | **New** | Schema loader, validator, discovery (small, ~150 lines) |
| `src/mcp/awareness.ts` | **New** | Self-model builder, introspection engine, gap detection (~200 lines) |
| `src/mcp/observer.ts` | **New** | Usage tracking, read/write/miss logging (~100 lines) |
| `src/server.ts` | **Modified** | Add 3 new REST endpoints for schema + awareness |
| `ui/src/components/SchemaEditor.tsx` | **New** | UI for defining/editing context types |
| `ui/src/components/AwarenessPanel.tsx` | **New** | UI for viewing self-model, gaps, health |
| `ui/src/App.tsx` | **Modified** | Add 2 new routes |

**Estimated total new code**: ~600 lines across 3 new files + ~150 lines of modifications to 4 existing files.

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
5. **Contradictions** — simple heuristic: entries of the same type with semantically opposing content (keyword-based, not LLM-powered — e.g. one entry says "prefer X" another says "avoid X")
6. **Health** — computed scores from coverage and freshness metrics

**No LLM required.** All computation is deterministic, fast, and local. An LLM-powered deep analysis mode can be added later as an optional enhancement using Ollama.

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

## 7. Putting It Together: Agent Interaction Flow

### Session Start (Agent calls introspect)

```
Agent                          OpenContext
  │                                │
  │  describe_schema()             │
  │  ─────────────────────────►    │
  │                                │  Load schema.yaml
  │  ◄─────────────────────────    │  Return: 3 types defined (decision, preference, bug_pattern)
  │                                │
  │  introspect()                  │
  │  ─────────────────────────►    │
  │                                │  buildSelfModel() from store + schema + observer
  │  ◄─────────────────────────    │  Return: health=good, 2 gaps, 1 contradiction
  │                                │
  │  (Agent now knows what          │
  │   context exists, what to       │
  │   trust, and where gaps are)    │
```

### During Session (Agent reads and writes)

```
Agent                          OpenContext
  │                                │
  │  query_by_type("decision",     │
  │    { project: "my-app" })      │
  │  ─────────────────────────►    │
  │                                │  Query store, log read event
  │  ◄─────────────────────────    │  Return: 5 decisions for my-app
  │                                │
  │  (Agent uses decisions to       │
  │   inform its work)              │
  │                                │
  │  save_typed_context("decision", │
  │    { what: "Use Redis",         │
  │      why: "Need pub/sub...",    │
  │      alternatives: ["RabbitMQ"] │
  │    })                           │
  │  ─────────────────────────►    │
  │                                │  Validate against schema, save, log write event
  │  ◄─────────────────────────    │  Return: saved with ID dec-48
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

---

## 8. Storage Schema Evolution

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

## 9. Implementation Plan

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

### Phase Summary

| Phase | New Files | Modified Files | Estimated New Lines | Dependencies |
|-------|-----------|----------------|-------------------|--------------|
| 1 | 2 (`schema.ts`, `SchemaEditor.tsx`) | 4 (`types.ts`, `store.ts`, `server.ts`, `App.tsx`) + `server.ts` (REST) | ~400 | None (uses existing `js-yaml` or raw YAML parsing) |
| 2 | 2 (`awareness.ts`, `AwarenessPanel.tsx`) | 2 (`server.ts` MCP, `server.ts` REST, `App.tsx`) | ~350 | Phase 1 (schema needed for coverage analysis) |
| 3 | 1 (`observer.ts`) | 3 (`store.ts`, `server.ts`, `awareness.ts`) | ~200 | Phase 2 (awareness consumes observer data) |
| **Total** | **5 new files** | **~6 existing files modified** | **~950 lines** | **0 new npm dependencies** |

---

## 10. New MCP Tool Summary

After implementation, the MCP server exposes **16 tools** (11 existing + 5 new):

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

### New

| Tool | Category | Description |
|------|----------|-------------|
| `describe_schema` | Schema | Returns user-defined context types and fields. Agents call this to understand what context the user cares about. |
| `save_typed_context` | Schema | Save a structured entry matching a user-defined type. |
| `query_by_type` | Schema | Query entries by type with optional field-level filtering. |
| `introspect` | Awareness | Full self-model: health, coverage, freshness, gaps, contradictions. |
| `report_usefulness` | Observation | Agent reports whether retrieved context was helpful. |

---

## 11. New REST API Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/schema` | `GET` | Returns current schema types |
| `/api/schema` | `PUT` | Updates schema definition |
| `/api/awareness` | `GET` | Returns computed self-model |

---

## 12. New UI Routes Summary

| Path | Component | Description |
|------|-----------|-------------|
| `/schema` | SchemaEditor | Define and edit custom context types |
| `/awareness` | AwarenessPanel | View system health, gaps, contradictions |

---

## 13. What We're NOT Building (Scope Boundaries)

| Out of Scope | Reason |
|---|---|
| LLM-powered contradiction detection | Keep v1 deterministic. Keyword heuristics first. Ollama-powered analysis is a future enhancement. |
| Auto-generated CLAUDE.md / .cursorrules | Strong feature, but separate PRD. This PRD focuses on the runtime, not the output. |
| Cross-device sync | Requires cloud infrastructure. Keep local-first for v1. |
| SDK npm package (`@opencontext/sdk`) | Separate distribution concern. MCP + REST API is sufficient for v1. |
| Browser extension | Separate product surface. Not needed for the runtime. |
| Team/shared schemas | Multi-user adds auth complexity. Single-user first. |
| Schema marketplace / templates | Community feature. Ship the runtime, templates come later. |
| Autonomous self-improvement actions | v1 surfaces gaps and suggestions. It doesn't auto-act on them. The agent (or user) decides. |

---

## 14. Success Criteria

### Functional

- [ ] User can define custom context types in `schema.yaml` and agents discover them via `describe_schema`
- [ ] Agents can save and query typed context entries with field-level filtering
- [ ] `introspect` tool returns accurate health, coverage, freshness, and gap information
- [ ] Existing 11 MCP tools continue to work unchanged (backward compatibility)
- [ ] Store migration from v1 → v2 is automatic and lossless
- [ ] UI allows editing schemas and viewing system awareness

### Non-Functional

- [ ] `introspect` computes in <100ms for stores with up to 1000 entries
- [ ] Observer adds <1ms overhead to existing store operations
- [ ] `awareness.json` stays under 200KB with log rotation
- [ ] Zero new npm dependencies required

---

## 15. Future Directions (Post-v1)

These are explicitly out of scope for v1 but inform the architecture:

1. **Ollama-powered deep analysis** — use local LLM to detect semantic contradictions, generate richer gap descriptions, and auto-suggest schema improvements
2. **Auto-generated instruction files** — produce CLAUDE.md / .cursorrules from the context store + schema, kept in sync automatically
3. **`@opencontext/sdk`** — npm package for agent builders to integrate without MCP, with TypeScript types generated from the user's schema
4. **Schema templates and community packs** — curated starter schemas for common workflows
5. **Session lifecycle** — formal `start_session` / `end_session` tools that let agents declare what they're doing and enable richer handoff between sessions
6. **Relevance-ranked retrieval** — use usefulness scores and read frequency to rank context entries, returning the most valuable ones first
7. **Cross-agent session handoff** — agent A ends a session, agent B starts one and gets a briefing of what A did
8. **Self-improvement actions** — the system not only identifies gaps but proposes concrete prompts to agents: "Next time the user discusses testing, ask them about their E2E preferences and save the answer as a preference entry"
