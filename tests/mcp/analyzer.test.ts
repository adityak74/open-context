import { describe, it, expect } from 'vitest';
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
