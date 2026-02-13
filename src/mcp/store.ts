import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { ContextEntry, ContextStore } from './types.js';

const STORE_VERSION = 1;

function getDefaultStorePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return join(home, '.opencontext', 'contexts.json');
}

export function createStore(storePath?: string) {
  const filePath = storePath || getDefaultStorePath();

  function load(): ContextStore {
    if (!existsSync(filePath)) {
      return { version: STORE_VERSION, entries: [] };
    }
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as ContextStore;
  }

  function save(store: ContextStore): void {
    const directory = dirname(filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  function saveContext(
    content: string,
    tags: string[] = [],
    source: string = 'chat',
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
    store.entries.push(entry);
    save(store);
    return entry;
  }

  function recallContext(query: string): ContextEntry[] {
    const store = load();
    const lowerQuery = query.toLowerCase();
    return store.entries.filter(
      (entry) =>
        entry.content.toLowerCase().includes(lowerQuery) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)),
    );
  }

  function listContexts(tag?: string): ContextEntry[] {
    const store = load();
    if (!tag) {
      return store.entries;
    }
    const lowerTag = tag.toLowerCase();
    return store.entries.filter((entry) =>
      entry.tags.some((t) => t.toLowerCase() === lowerTag),
    );
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
    entry.updatedAt = new Date().toISOString();
    save(store);
    return entry;
  }

  return {
    saveContext,
    recallContext,
    listContexts,
    deleteContext,
    searchContexts,
    getContext,
    updateContext,
    load,
    filePath,
  };
}
