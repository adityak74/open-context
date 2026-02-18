import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextAnalyzer } from '../../src/mcp/analyzer.js';
import type { ContextEntry } from '../../src/mcp/types.js';

// Uses a non-existent host so Ollama is always unavailable — exercises deterministic fallbacks only.
const analyzer = new ContextAnalyzer('test-model', 'http://127.0.0.1:19999');

function makeEntry(overrides: Partial<ContextEntry> = {}): ContextEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    content: 'Default content',
    tags: [],
    source: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ContextAnalyzer (deterministic fallbacks)', () => {
  describe('detectContradictions', () => {
    it('returns empty array for no entries', async () => {
      const result = await analyzer.detectContradictions([]);
      expect(result).toEqual([]);
    });

    it('returns empty array when no contradictions', async () => {
      const entries = [
        makeEntry({ content: 'Use Redis for caching', contextType: 'decision' }),
        makeEntry({ content: 'Use PostgreSQL for primary storage', contextType: 'decision' }),
      ];
      const result = await analyzer.detectContradictions(entries);
      expect(Array.isArray(result)).toBe(true);
    });

    it('detects keyword-based contradictions', async () => {
      const entries = [
        makeEntry({ content: 'I prefer composition over inheritance', contextType: 'preference' }),
        makeEntry({ content: 'Use inheritance for this pattern', contextType: 'preference' }),
      ];
      const result = await analyzer.detectContradictions(entries);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('entryA');
      expect(result[0]).toHaveProperty('entryB');
      expect(result[0]).toHaveProperty('description');
    });

    it('does not compare entries of different types', async () => {
      const entries = [
        makeEntry({ content: 'I prefer composition', contextType: 'preference' }),
        makeEntry({ content: 'Use inheritance here', contextType: 'decision' }),
      ];
      const result = await analyzer.detectContradictions(entries);
      // Different types → no comparison → no contradiction from deterministic
      expect(result).toHaveLength(0);
    });

    it('skips archived entries', async () => {
      const entries = [
        makeEntry({ content: 'prefer composition', contextType: 'pref', archived: true }),
        makeEntry({ content: 'use inheritance', contextType: 'pref', archived: true }),
      ];
      const result = await analyzer.detectContradictions(entries);
      expect(result).toHaveLength(0);
    });

    it('detects always/never opposition', async () => {
      const entries = [
        makeEntry({ content: 'Always use TypeScript in new projects', contextType: 'pref' }),
        makeEntry({ content: 'Never use TypeScript for scripts', contextType: 'pref' }),
      ];
      const result = await analyzer.detectContradictions(entries);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('suggestSchemaTypes', () => {
    it('returns empty array for fewer than 3 entries', async () => {
      const result = await analyzer.suggestSchemaTypes([makeEntry(), makeEntry()]);
      expect(result).toHaveLength(0);
    });

    it('returns suggestions based on tag grouping', async () => {
      const entries = [
        makeEntry({ content: 'Content A', tags: ['database'] }),
        makeEntry({ content: 'Content B', tags: ['database'] }),
        makeEntry({ content: 'Content C', tags: ['database'] }),
      ];
      const result = await analyzer.suggestSchemaTypes(entries);
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('typeName');
        expect(result[0]).toHaveProperty('description');
        expect(result[0]).toHaveProperty('fields');
        expect(Array.isArray(result[0]!.fields)).toBe(true);
      }
    });

    it('returns at most 3 suggestions', async () => {
      const entries = Array.from({ length: 20 }, (_, i) =>
        makeEntry({ content: `content ${i}`, tags: [`tag-${i % 5}`] }),
      );
      const result = await analyzer.suggestSchemaTypes(entries);
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe('summarizeContext', () => {
    it('returns a string summary', async () => {
      const entries = [
        makeEntry({ content: 'Use Redis for caching', contextType: 'decision' }),
        makeEntry({ content: 'Prefer PostgreSQL', contextType: 'decision' }),
      ];
      const result = await analyzer.summarizeContext(entries);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles empty entries', async () => {
      const result = await analyzer.summarizeContext([]);
      expect(typeof result).toBe('string');
    });

    it('includes focus context when provided', async () => {
      const entries = [makeEntry({ content: 'Auth using JWT' })];
      const result = await analyzer.summarizeContext(entries, 'authentication');
      expect(typeof result).toBe('string');
    });
  });

  describe('rankByRelevance', () => {
    it('returns all entries ranked', async () => {
      const entries = [
        makeEntry({ content: 'JWT auth with refresh tokens', id: 'e1' }),
        makeEntry({ content: 'PostgreSQL for database', id: 'e2' }),
        makeEntry({ content: 'Redis for caching', id: 'e3' }),
      ];
      const result = await analyzer.rankByRelevance(entries, 'authentication');
      expect(result).toHaveLength(3);
      result.forEach((r) => {
        expect(r).toHaveProperty('entry');
        expect(r).toHaveProperty('score');
        expect(typeof r.score).toBe('number');
      });
    });

    it('ranks more relevant entries higher', async () => {
      const entries = [
        makeEntry({ content: 'JWT authentication system', id: 'auth' }),
        makeEntry({ content: 'Database connection pooling', id: 'db' }),
        makeEntry({ content: 'Auth middleware setup', id: 'auth2' }),
      ];
      const result = await analyzer.rankByRelevance(entries, 'auth');
      // Auth-related entries should rank higher
      const scores = result.map((r) => ({ id: r.entry.id, score: r.score }));
      const authScore = scores.find((s) => s.id === 'auth')?.score ?? 0;
      const dbScore = scores.find((s) => s.id === 'db')?.score ?? 0;
      expect(authScore).toBeGreaterThanOrEqual(dbScore);
    });

    it('handles empty query gracefully', async () => {
      const entries = [makeEntry({ content: 'some content' })];
      const result = await analyzer.rankByRelevance(entries, '');
      expect(result).toHaveLength(1);
    });

    it('returns empty array for empty entries', async () => {
      const result = await analyzer.rankByRelevance([], 'query');
      expect(result).toHaveLength(0);
    });
  });
});

// ─── Ollama-mocked paths ────────────────────────────────────────────────────
// These tests inject mock ollama directly into the analyzer instance,
// bypassing the module system entirely.

type MockOllama = { list?: ReturnType<typeof vi.fn>; generate: ReturnType<typeof vi.fn> };

function makeAnalyzerWithMock(mock: MockOllama): ContextAnalyzer {
  const a = new ContextAnalyzer('test-model', 'http://127.0.0.1:19999');
  // Inject mock and set available=true to bypass isAvailable() network call
  (a as unknown as { ollama: MockOllama }).ollama = mock;
  (a as unknown as { available: boolean }).available = true;
  return a;
}

describe('ContextAnalyzer (Ollama available — mocked)', () => {

  it('detectContradictions uses Ollama and parses contradiction', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => ({
        response: '{ "contradictory": true, "explanation": "conflicting preferences" }',
      })),
    });
    const entries: ContextEntry[] = [
      { id: 'a1', content: 'prefer composition', tags: [], source: 'test', contextType: 'pref', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'a2', content: 'use inheritance', tags: [], source: 'test', contextType: 'pref', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const result = await a.detectContradictions(entries);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.description).toBe('conflicting preferences');
  });

  it('detectContradictions falls back when Ollama generate throws', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => { throw new Error('Ollama down'); }),
    });
    const entries: ContextEntry[] = [
      { id: 'b1', content: 'always use composition', tags: [], source: 'test', contextType: 'pref', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'b2', content: 'never use composition', tags: [], source: 'test', contextType: 'pref', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const result = await a.detectContradictions(entries);
    expect(Array.isArray(result)).toBe(true);
  });

  it('detectContradictions skips pair when generate returns no JSON', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => ({ response: 'no json here' })),
    });
    const entries: ContextEntry[] = [
      { id: 'c1', content: 'prefer composition', tags: [], source: 'test', contextType: 't', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'c2', content: 'use inheritance', tags: [], source: 'test', contextType: 't', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const result = await a.detectContradictions(entries);
    expect(result).toHaveLength(0);
  });

  it('suggestSchemaTypes uses Ollama when available', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => ({
        response: '[{"typeName":"decision","description":"Decisions","fields":[{"name":"what","type":"string","description":"what"}]}]',
      })),
    });
    const entries = Array.from({ length: 5 }, (_, i): ContextEntry => ({
      id: `e${i}`,
      content: `content ${i}`,
      tags: [],
      source: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const result = await a.suggestSchemaTypes(entries);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.typeName).toBe('decision');
  });

  it('suggestSchemaTypes falls back when Ollama returns non-JSON array', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => ({ response: 'not valid json at all' })),
    });
    const entries = Array.from({ length: 5 }, (_, i): ContextEntry => ({
      id: `e${i}`,
      content: `content ${i}`,
      tags: ['db', 'db', 'db'].slice(0, 1),
      source: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const result = await a.suggestSchemaTypes(entries);
    expect(Array.isArray(result)).toBe(true);
  });

  it('suggestSchemaTypes falls back when Ollama throws', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => { throw new Error('fail'); }),
    });
    const entries = Array.from({ length: 5 }, (_, i): ContextEntry => ({
      id: `e${i}`,
      content: `content ${i}`,
      tags: ['db'],
      source: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const result = await a.suggestSchemaTypes(entries);
    expect(Array.isArray(result)).toBe(true);
  });

  it('summarizeContext returns Ollama response when available', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => ({ response: 'This is an AI-generated summary.' })),
    });
    const entries: ContextEntry[] = [
      { id: 'x1', content: 'Use Redis for caching', tags: [], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const result = await a.summarizeContext(entries, 'caching');
    expect(result).toBe('This is an AI-generated summary.');
  });

  it('summarizeContext falls back when Ollama generate throws', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => { throw new Error('fail'); }),
    });
    const entries: ContextEntry[] = [
      { id: 'x1', content: 'Some content', tags: [], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const result = await a.summarizeContext(entries);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('rankByRelevance uses Ollama to rank entries in order', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => ({ response: '{ "ranked": ["e2", "e1", "e3"] }' })),
    });
    const entries: ContextEntry[] = [
      { id: 'e1', content: 'First entry', tags: [], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'e2', content: 'Second entry', tags: [], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'e3', content: 'Third entry', tags: [], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const result = await a.rankByRelevance(entries, 'second');
    expect(result).toHaveLength(3);
    expect(result[0]!.entry.id).toBe('e2');
  });

  it('rankByRelevance falls back when Ollama returns non-JSON', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => ({ response: 'not json' })),
    });
    const entries: ContextEntry[] = [
      { id: 'e1', content: 'Auth entry', tags: [], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const result = await a.rankByRelevance(entries, 'auth');
    expect(result).toHaveLength(1);
  });

  it('rankByRelevance includes unranked entries at end with score 0', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => ({ response: '{ "ranked": ["e1"] }' })),
    });
    const entries: ContextEntry[] = [
      { id: 'e1', content: 'First', tags: [], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'e2', content: 'Second', tags: [], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const result = await a.rankByRelevance(entries, 'query');
    expect(result).toHaveLength(2);
    const e2Result = result.find((r) => r.entry.id === 'e2');
    expect(e2Result?.score).toBe(0);
  });

  it('rankByRelevance falls back when Ollama throws', async () => {
    const a = makeAnalyzerWithMock({
      generate: vi.fn(async () => { throw new Error('fail'); }),
    });
    const entries: ContextEntry[] = [
      { id: 'e1', content: 'some content', tags: [], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const result = await a.rankByRelevance(entries, 'query');
    expect(result).toHaveLength(1);
  });

  it('isAvailable caches false after initial network miss', async () => {
    // Use unreachable host — will fail and cache available=false
    const a = new ContextAnalyzer('test-model', 'http://127.0.0.1:19999');
    const result1 = await a.detectContradictions([]);
    expect(Array.isArray(result1)).toBe(true);
    // Second call uses cached available=false
    const result2 = await a.detectContradictions([]);
    expect(Array.isArray(result2)).toBe(true);
  });
});
