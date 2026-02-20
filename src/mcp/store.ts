import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { ContextEntry, ContextStore, Bubble } from './types.js';
import { Schema, validateEntry, buildContentFromData } from './schema.js';
import { createObserver } from './observer.js';

const STORE_VERSION = 1;

function getDefaultStorePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return join(home, '.opencontext', 'contexts.json');
}

export function createStore(storePath?: string, observer?: ReturnType<typeof createObserver>) {
  const filePath = storePath || getDefaultStorePath();

  function load(): ContextStore {
    if (!existsSync(filePath)) {
      return { version: STORE_VERSION, entries: [], bubbles: [] };
    }
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as ContextStore;
    // Migrate stores that predate the bubbles field
    if (!parsed.bubbles) {
      parsed.bubbles = [];
    }
    return parsed;
  }

  function save(store: ContextStore): void {
    const directory = dirname(filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  // ---------------------------------------------------------------------------
  // Context CRUD
  // ---------------------------------------------------------------------------

  function saveContext(
    content: string,
    tags: string[] = [],
    source: string = 'chat',
    bubbleId?: string,
    contextType?: string,
    structuredData?: Record<string, unknown>,
  ): ContextEntry {
    const store = load();
    const now = new Date().toISOString();
    const entry: ContextEntry = {
      id: randomUUID(),
      content,
      tags,
      source,
      createdAt: now,
      updatedAt: now,
    };
    if (bubbleId !== undefined) {
      entry.bubbleId = bubbleId;
    }
    if (contextType !== undefined) {
      entry.contextType = contextType;
    }
    if (structuredData !== undefined) {
      entry.structuredData = structuredData;
    }
    store.entries.push(entry);
    save(store);
    observer?.log({ action: 'write', tool: 'save_context', entryIds: [entry.id] });
    // Write-triggered cache refresh every 10 writes.
    // Uses getWriteCount() (no disk flush) instead of getSummary().totalWrites
    // to avoid negating the observer's write buffer.
    if (observer) {
      const total = observer.getWriteCount();
      if (total % 10 === 0) {
        import('./awareness.js').then(({ refreshCache }) => {
          import('./schema.js').then(({ loadSchema }) => {
            const schema = loadSchema();
            refreshCache({ listContexts, listBubbles } as ReturnType<typeof createStore>, schema, observer!);
          }).catch(() => {});
        }).catch(() => {});
      }
    }
    return entry;
  }

  function saveTypedContext(
    schema: Schema,
    typeName: string,
    data: Record<string, unknown>,
    tags: string[] = [],
    source: string = 'chat',
    bubbleId?: string,
  ): { entry: ContextEntry; errors: string[] } {
    const validation = validateEntry(schema, typeName, data);
    const content = buildContentFromData(typeName, data);
    // Pass contextType and structuredData into saveContext so only one write happens
    const entry = saveContext(content, tags, source, bubbleId, typeName, data);
    observer?.log({ action: 'write', tool: 'save_typed_context', contextType: typeName, entryIds: [entry.id] });
    return { entry, errors: validation.errors };
  }

  function queryByType(
    typeName: string,
    filter?: Record<string, unknown>,
  ): ContextEntry[] {
    const storeData = load();
    let results = storeData.entries.filter(
      (e) => !e.archived && e.contextType === typeName,
    );
    if (filter) {
      results = results.filter((e) => {
        if (!e.structuredData) return false;
        return Object.entries(filter).every(
          ([key, val]) => e.structuredData![key] === val,
        );
      });
    }
    observer?.log({ action: 'read', tool: 'query_by_type', contextType: typeName, entryIds: results.map((e) => e.id) });
    return results;
  }

  function recallContext(query: string): ContextEntry[] {
    const storeData = load();
    const lowerQuery = query.toLowerCase();
    const results = storeData.entries.filter(
      (entry) =>
        !entry.archived &&
        (entry.content.toLowerCase().includes(lowerQuery) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))),
    );
    if (observer) {
      if (results.length === 0) {
        observer.log({ action: 'query_miss', tool: 'recall_context', query });
      } else {
        observer.log({ action: 'read', tool: 'recall_context', query, entryIds: results.map((e) => e.id) });
      }
    }
    return results;
  }

  function listContexts(tag?: string): ContextEntry[] {
    const store = load();
    const active = store.entries.filter((entry) => !entry.archived);
    if (!tag) {
      return active;
    }
    const lowerTag = tag.toLowerCase();
    return active.filter((entry) =>
      entry.tags.some((t) => t.toLowerCase() === lowerTag),
    );
  }

  function listContextsByBubble(bubbleId: string): ContextEntry[] {
    const store = load();
    return store.entries.filter((entry) => entry.bubbleId === bubbleId && !entry.archived);
  }

  function deleteContext(id: string): boolean {
    const store = load();
    const initialLength = store.entries.length;
    store.entries = store.entries.filter((entry) => entry.id !== id);
    if (store.entries.length < initialLength) {
      save(store);
      return true;
    }
    return false;
  }

  function searchContexts(query: string): ContextEntry[] {
    const store = load();
    const lowerQuery = query.toLowerCase();
    const terms = lowerQuery.split(/\s+/).filter(Boolean);
    return store.entries.filter((entry) => {
      if (entry.archived) return false;
      const text = `${entry.content} ${entry.tags.join(' ')} ${entry.source}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }

  function getContext(id: string): ContextEntry | undefined {
    const store = load();
    return store.entries.find((entry) => entry.id === id);
  }

  function updateContext(
    id: string,
    content: string,
    tags?: string[],
    bubbleId?: string | null,
    archived?: boolean,
  ): ContextEntry | undefined {
    const store = load();
    const entry = store.entries.find((e) => e.id === id);
    if (!entry) {
      return undefined;
    }
    entry.content = content;
    if (tags !== undefined) {
      entry.tags = tags;
    }
    if (bubbleId !== undefined) {
      if (bubbleId === null) {
        delete entry.bubbleId;
      } else {
        entry.bubbleId = bubbleId;
      }
    }
    if (archived !== undefined) {
      entry.archived = archived;
    }
    entry.updatedAt = new Date().toISOString();
    save(store);
    observer?.log({ action: 'update', tool: 'update_context', entryIds: [id] });
    return entry;
  }

  function updateContextType(id: string, contextType: string): ContextEntry | undefined {
    const store = load();
    const entry = store.entries.find((e) => e.id === id);
    if (!entry) return undefined;
    entry.contextType = contextType;
    entry.updatedAt = new Date().toISOString();
    save(store);
    return entry;
  }

  // ---------------------------------------------------------------------------
  // Bubble CRUD
  // ---------------------------------------------------------------------------

  function createBubble(name: string, description?: string): Bubble {
    const store = load();
    const now = new Date().toISOString();
    const bubble: Bubble = {
      id: randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
    };
    if (description !== undefined) {
      bubble.description = description;
    }
    store.bubbles.push(bubble);
    save(store);
    return bubble;
  }

  function listBubbles(): Bubble[] {
    return load().bubbles;
  }

  function getBubble(id: string): Bubble | undefined {
    return load().bubbles.find((b) => b.id === id);
  }

  function updateBubble(id: string, name: string, description?: string): Bubble | undefined {
    const store = load();
    const bubble = store.bubbles.find((b) => b.id === id);
    if (!bubble) {
      return undefined;
    }
    bubble.name = name;
    if (description !== undefined) {
      bubble.description = description;
    }
    bubble.updatedAt = new Date().toISOString();
    save(store);
    return bubble;
  }

  function deleteBubble(id: string, deleteContexts = false): boolean {
    const store = load();
    const initialLength = store.bubbles.length;
    store.bubbles = store.bubbles.filter((b) => b.id !== id);
    if (store.bubbles.length === initialLength) {
      return false;
    }
    if (deleteContexts) {
      store.entries = store.entries.filter((e) => e.bubbleId !== id);
    } else {
      // Unassign contexts from the deleted bubble
      store.entries.forEach((e) => {
        if (e.bubbleId === id) {
          delete e.bubbleId;
        }
      });
    }
    save(store);
    return true;
  }

  return {
    // contexts
    saveContext,
    saveTypedContext,
    queryByType,
    recallContext,
    listContexts,
    listContextsByBubble,
    deleteContext,
    searchContexts,
    getContext,
    updateContext,
    updateContextType,
    // bubbles
    createBubble,
    listBubbles,
    getBubble,
    updateBubble,
    deleteBubble,
    // internals
    load,
    filePath,
  };
}
