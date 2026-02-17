import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadSchema,
  saveSchema,
  validateEntry,
  describeSchema,
  buildContentFromData,
  getSchemaType,
} from '../../src/mcp/schema.js';
import type { Schema } from '../../src/mcp/schema.js';

const TEST_DIR = join(tmpdir(), `schema-test-${Date.now()}`);
const SCHEMA_PATH = join(TEST_DIR, 'schema.json');

const SAMPLE_SCHEMA: Schema = {
  version: 1,
  types: [
    {
      name: 'decision',
      description: 'Architectural decisions',
      fields: {
        what: { type: 'string', required: true, description: 'What was decided' },
        why: { type: 'string', required: true, description: 'Why' },
        project: { type: 'string', description: 'Project name' },
        tags: { type: 'string[]', description: 'Related tags' },
        priority: { type: 'enum', values: ['high', 'medium', 'low'], default: 'medium' },
        count: { type: 'number', description: 'Times applied' },
        active: { type: 'boolean', description: 'Still active' },
      },
    },
    {
      name: 'preference',
      description: 'User preferences',
      fields: {
        domain: { type: 'string', required: true },
        rule: { type: 'string', required: true },
      },
    },
  ],
};

describe('schema.ts', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('loadSchema', () => {
    it('returns null when file does not exist', () => {
      expect(loadSchema(SCHEMA_PATH)).toBeNull();
    });

    it('returns null on malformed JSON', () => {
      writeFileSync(SCHEMA_PATH, 'not json', 'utf-8');
      expect(loadSchema(SCHEMA_PATH)).toBeNull();
    });

    it('loads and parses valid schema', () => {
      writeFileSync(SCHEMA_PATH, JSON.stringify(SAMPLE_SCHEMA), 'utf-8');
      const schema = loadSchema(SCHEMA_PATH);
      expect(schema).not.toBeNull();
      expect(schema!.version).toBe(1);
      expect(schema!.types).toHaveLength(2);
    });
  });

  describe('saveSchema', () => {
    it('saves schema to disk and creates directory', () => {
      const path = join(TEST_DIR, 'nested', 'schema.json');
      saveSchema(SAMPLE_SCHEMA, path);
      const loaded = loadSchema(path);
      expect(loaded).not.toBeNull();
      expect(loaded!.types).toHaveLength(2);
    });

    it('overwrites existing schema', () => {
      saveSchema(SAMPLE_SCHEMA, SCHEMA_PATH);
      const modified = { ...SAMPLE_SCHEMA, version: 2 };
      saveSchema(modified, SCHEMA_PATH);
      const loaded = loadSchema(SCHEMA_PATH);
      expect(loaded!.version).toBe(2);
    });
  });

  describe('getSchemaType', () => {
    it('returns the matching type', () => {
      const type = getSchemaType(SAMPLE_SCHEMA, 'decision');
      expect(type).not.toBeUndefined();
      expect(type!.name).toBe('decision');
    });

    it('returns undefined for unknown type', () => {
      expect(getSchemaType(SAMPLE_SCHEMA, 'unknown')).toBeUndefined();
    });
  });

  describe('validateEntry', () => {
    it('passes valid entry with all required fields', () => {
      const result = validateEntry(SAMPLE_SCHEMA, 'decision', { what: 'Use Redis', why: 'Performance' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when required field is missing', () => {
      const result = validateEntry(SAMPLE_SCHEMA, 'decision', { what: 'Use Redis' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('"why"'))).toBe(true);
    });

    it('fails when required field is empty string', () => {
      const result = validateEntry(SAMPLE_SCHEMA, 'decision', { what: '', why: 'reason' });
      expect(result.valid).toBe(false);
    });

    it('fails for unknown type', () => {
      const result = validateEntry(SAMPLE_SCHEMA, 'unknown_type', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Unknown context type');
    });

    it('validates enum values', () => {
      const valid = validateEntry(SAMPLE_SCHEMA, 'decision', { what: 'x', why: 'y', priority: 'high' });
      expect(valid.valid).toBe(true);

      const invalid = validateEntry(SAMPLE_SCHEMA, 'decision', { what: 'x', why: 'y', priority: 'urgent' });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.some((e) => e.includes('priority'))).toBe(true);
    });

    it('validates string[] type', () => {
      const valid = validateEntry(SAMPLE_SCHEMA, 'decision', { what: 'x', why: 'y', tags: ['a', 'b'] });
      expect(valid.valid).toBe(true);

      const invalid = validateEntry(SAMPLE_SCHEMA, 'decision', { what: 'x', why: 'y', tags: 'not-array' });
      expect(invalid.valid).toBe(false);
    });

    it('validates number type', () => {
      const valid = validateEntry(SAMPLE_SCHEMA, 'decision', { what: 'x', why: 'y', count: 3 });
      expect(valid.valid).toBe(true);

      const invalid = validateEntry(SAMPLE_SCHEMA, 'decision', { what: 'x', why: 'y', count: 'three' });
      expect(invalid.valid).toBe(false);
    });

    it('validates boolean type', () => {
      const valid = validateEntry(SAMPLE_SCHEMA, 'decision', { what: 'x', why: 'y', active: true });
      expect(valid.valid).toBe(true);

      const invalid = validateEntry(SAMPLE_SCHEMA, 'decision', { what: 'x', why: 'y', active: 'yes' });
      expect(invalid.valid).toBe(false);
    });

    it('allows optional fields to be omitted', () => {
      const result = validateEntry(SAMPLE_SCHEMA, 'decision', { what: 'x', why: 'y' });
      expect(result.valid).toBe(true);
    });
  });

  describe('describeSchema', () => {
    it('returns a string describing the schema', () => {
      const desc = describeSchema(SAMPLE_SCHEMA);
      expect(desc).toContain('decision');
      expect(desc).toContain('preference');
      expect(desc).toContain('what');
      expect(desc).toContain('required');
    });

    it('handles empty schema', () => {
      const desc = describeSchema({ version: 1, types: [] });
      expect(desc).toContain('No context types');
    });

    it('includes enum values in description', () => {
      const desc = describeSchema(SAMPLE_SCHEMA);
      expect(desc).toContain('high|medium|low');
    });
  });

  describe('buildContentFromData', () => {
    it('builds readable content from type and data', () => {
      const content = buildContentFromData('decision', { what: 'Use Redis', why: 'Performance' });
      expect(content).toContain('[decision]');
      expect(content).toContain('what: Use Redis');
      expect(content).toContain('why: Performance');
    });

    it('handles array values', () => {
      const content = buildContentFromData('note', { tags: ['a', 'b', 'c'] });
      expect(content).toContain('a, b, c');
    });

    it('skips null/undefined values', () => {
      const content = buildContentFromData('note', { a: 'hello', b: null, c: undefined });
      expect(content).toContain('a: hello');
      expect(content).not.toContain('null');
    });
  });
});
