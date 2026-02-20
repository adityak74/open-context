import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Module mocks
// vi.hoisted creates values before any module evaluation.
// Constructor mocks MUST use regular `function` (not arrow functions) so
// Vitest v4 / path-to-regexp can use them with `new`.
// ---------------------------------------------------------------------------

const mockStore = vi.hoisted(() => ({
  listContexts: vi.fn(),
  saveContext: vi.fn(),
  searchContexts: vi.fn(),
  getContext: vi.fn(),
  updateContext: vi.fn(),
  deleteContext: vi.fn(),
  listContextsByBubble: vi.fn(),
  listBubbles: vi.fn(),
  getBubble: vi.fn(),
  createBubble: vi.fn(),
  updateBubble: vi.fn(),
  deleteBubble: vi.fn(),
}));

vi.mock('../src/mcp/store.js', () => ({
  createStore: vi.fn(function () { return mockStore; }),
}));

const mockOllamaInstance = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('ollama', () => ({
  Ollama: vi.fn(function () { return mockOllamaInstance; }),
}));

const mockExtractorInstance = vi.hoisted(() => ({
  extractZip: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock('../src/extractor.js', () => ({
  ZipExtractor: vi.fn(function () { return mockExtractorInstance; }),
}));

const mockParserInstance = vi.hoisted(() => ({ parseConversations: vi.fn() }));
vi.mock('../src/parsers/chatgpt.js', () => ({
  ChatGPTParser: vi.fn(function () { return mockParserInstance; }),
}));

const mockNormalizerInstance = vi.hoisted(() => ({
  normalize: vi.fn(),
  isValidConversation: vi.fn(),
}));
vi.mock('../src/parsers/normalizer.js', () => ({
  ConversationNormalizer: vi.fn(function () { return mockNormalizerInstance; }),
}));

const mockAnalyzerInstance = vi.hoisted(() => ({
  analyzePreferences: vi.fn(),
  analyzeMemory: vi.fn(),
  generateBasicPreferences: vi.fn(),
  generateBasicMemory: vi.fn(),
}));
vi.mock('../src/analyzers/ollama-preferences.js', () => ({
  OllamaPreferenceAnalyzer: vi.fn(function () { return mockAnalyzerInstance; }),
}));

// Import app AFTER mocks are registered
import { app } from '../src/server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeEntry = {
  id: 'abc-123',
  content: 'Remember this',
  tags: ['test'],
  source: 'chat',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

describe('GET /api/health', () => {
  it('returns 200 with ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('ollamaHost');
    expect(res.body).toHaveProperty('store');
  });
});

// ---------------------------------------------------------------------------
// GET /api/ollama/models
// ---------------------------------------------------------------------------

describe('GET /api/ollama/models', () => {
  it('returns model list when Ollama is reachable', async () => {
    mockOllamaInstance.list.mockResolvedValueOnce({
      models: [
        { name: 'llama3:8b', size: 4_000_000_000, modified_at: '2024-01-01' },
        { name: 'gpt-oss:20b', size: 12_000_000_000, modified_at: '2024-02-01' },
      ],
    });

    const res = await request(app).get('/api/ollama/models');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('llama3:8b');
    expect(res.body[1].name).toBe('gpt-oss:20b');
  });

  it('returns 503 when Ollama is unreachable', async () => {
    mockOllamaInstance.list.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await request(app).get('/api/ollama/models');
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('Ollama unreachable');
  });
});

// ---------------------------------------------------------------------------
// POST /api/convert
// ---------------------------------------------------------------------------

describe('POST /api/convert', () => {
  // Set up default happy-path mocks before each test.
  // Use *Once variants in individual tests to override without leaking state.
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractorInstance.extractZip.mockResolvedValue({
      conversationsPath: '/tmp/test-conversations.json',
      tempDir: '/tmp/test-extract-dir',
    });
    mockParserInstance.parseConversations.mockReturnValue([]);
    mockNormalizerInstance.normalize.mockImplementation((c) => c);
    mockNormalizerInstance.isValidConversation.mockReturnValue(true);
    mockAnalyzerInstance.analyzePreferences.mockResolvedValue('AI preferences');
    mockAnalyzerInstance.analyzeMemory.mockResolvedValue('AI memory');
    mockAnalyzerInstance.generateBasicPreferences.mockReturnValue('Basic preferences');
    mockAnalyzerInstance.generateBasicMemory.mockReturnValue('Basic memory');
    mockExtractorInstance.cleanup.mockReset();
  });

  it('returns 400 when no file is provided', async () => {
    const res = await request(app).post('/api/convert');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file uploaded');
  });

  it('runs the full pipeline and returns conversations with AI preferences', async () => {
    const res = await request(app)
      .post('/api/convert')
      .attach('file', Buffer.from('PK fake zip'), 'export.zip');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.preferences).toBe('AI preferences');
    expect(res.body.memory).toBe('AI memory');
    expect(res.body.stats).toEqual({ total: 0, processed: 0 });
    expect(mockExtractorInstance.cleanup).toHaveBeenCalledWith('/tmp/test-extract-dir');
  });

  it('uses basic preferences when skipPreferences=true', async () => {
    const res = await request(app)
      .post('/api/convert')
      .field('skipPreferences', 'true')
      .attach('file', Buffer.from('PK fake zip'), 'export.zip');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.preferences).toBe('Basic preferences');
    expect(res.body.memory).toBe('Basic memory');
    expect(mockAnalyzerInstance.analyzePreferences).not.toHaveBeenCalled();
  });

  it('falls back to basic preferences when Ollama analysis throws', async () => {
    mockAnalyzerInstance.analyzePreferences.mockRejectedValueOnce(new Error('Ollama down'));

    const res = await request(app)
      .post('/api/convert')
      .attach('file', Buffer.from('PK fake zip'), 'export.zip');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.preferences).toBe('Basic preferences');
    expect(res.body.memory).toBe('Basic memory');
  });

  it('returns 500 when ZIP extraction fails', async () => {
    mockExtractorInstance.extractZip.mockRejectedValueOnce(new Error('Not a valid ZIP'));

    const res = await request(app)
      .post('/api/convert')
      .attach('file', Buffer.from('not a zip'), 'bad.zip');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Not a valid ZIP');
  });

  it('accepts a custom ollamaHost in the request body', async () => {
    const res = await request(app)
      .post('/api/convert')
      .field('ollamaHost', 'http://custom-host:11434')
      .attach('file', Buffer.from('PK fake zip'), 'export.zip');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('returns correct stats when parser returns multiple conversations', async () => {
    const fakeConv = {
      id: '1',
      title: 'Test',
      created: new Date(),
      updated: new Date(),
      messages: [],
    };
    mockParserInstance.parseConversations.mockReturnValueOnce([{}, {}, {}]);
    mockNormalizerInstance.normalize.mockReturnValue(fakeConv);
    mockNormalizerInstance.isValidConversation.mockReturnValue(true);

    const res = await request(app)
      .post('/api/convert')
      .attach('file', Buffer.from('PK fake zip'), 'export.zip');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.stats.total).toBe(3);
    expect(res.body.stats.processed).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// GET /api/contexts
// ---------------------------------------------------------------------------

describe('GET /api/contexts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all contexts', async () => {
    mockStore.listContexts.mockReturnValueOnce([fakeEntry]);

    const res = await request(app).get('/api/contexts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('abc-123');
    expect(mockStore.listContexts).toHaveBeenCalledWith(undefined);
  });

  it('filters by tag when ?tag= is provided', async () => {
    mockStore.listContexts.mockReturnValueOnce([fakeEntry]);

    const res = await request(app).get('/api/contexts?tag=test');
    expect(res.status).toBe(200);
    expect(mockStore.listContexts).toHaveBeenCalledWith('test');
  });
});

// ---------------------------------------------------------------------------
// POST /api/contexts
// ---------------------------------------------------------------------------

describe('POST /api/contexts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a context and returns 201', async () => {
    mockStore.saveContext.mockReturnValueOnce(fakeEntry);

    const res = await request(app)
      .post('/api/contexts')
      .send({ content: 'Remember this', tags: ['test'], source: 'chat' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('abc-123');
    expect(mockStore.saveContext).toHaveBeenCalledWith('Remember this', ['test'], 'chat', undefined);
  });

  it('returns 400 when content is missing', async () => {
    const res = await request(app)
      .post('/api/contexts')
      .send({ tags: ['test'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('content is required');
    expect(mockStore.saveContext).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /api/contexts/search
// ---------------------------------------------------------------------------

describe('GET /api/contexts/search', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns matching contexts', async () => {
    mockStore.searchContexts.mockReturnValueOnce([fakeEntry]);

    const res = await request(app).get('/api/contexts/search?q=Remember');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(mockStore.searchContexts).toHaveBeenCalledWith('Remember');
  });

  it('returns 400 when q param is missing', async () => {
    const res = await request(app).get('/api/contexts/search');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('q query param required');
  });
});

// ---------------------------------------------------------------------------
// GET /api/contexts/:id
// ---------------------------------------------------------------------------

describe('GET /api/contexts/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with entry when found', async () => {
    mockStore.getContext.mockReturnValueOnce(fakeEntry);

    const res = await request(app).get('/api/contexts/abc-123');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('abc-123');
    expect(mockStore.getContext).toHaveBeenCalledWith('abc-123');
  });

  it('returns 404 when not found', async () => {
    mockStore.getContext.mockReturnValueOnce(undefined);

    const res = await request(app).get('/api/contexts/missing-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/contexts/:id
// ---------------------------------------------------------------------------

describe('PUT /api/contexts/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates and returns the context', async () => {
    const updated = { ...fakeEntry, content: 'Updated', updatedAt: '2024-06-01T00:00:00.000Z' };
    mockStore.updateContext.mockReturnValueOnce(updated);

    const res = await request(app)
      .put('/api/contexts/abc-123')
      .send({ content: 'Updated', tags: ['new-tag'] });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Updated');
    expect(mockStore.updateContext).toHaveBeenCalledWith('abc-123', 'Updated', ['new-tag'], undefined);
  });

  it('returns 400 when content is missing', async () => {
    const res = await request(app)
      .put('/api/contexts/abc-123')
      .send({ tags: ['tag'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('content is required');
  });

  it('returns 404 when context does not exist', async () => {
    mockStore.updateContext.mockReturnValueOnce(undefined);

    const res = await request(app)
      .put('/api/contexts/missing-id')
      .send({ content: 'Updated' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/contexts/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/contexts/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 204 when deleted', async () => {
    mockStore.deleteContext.mockReturnValueOnce(true);

    const res = await request(app).delete('/api/contexts/abc-123');
    expect(res.status).toBe(204);
    expect(mockStore.deleteContext).toHaveBeenCalledWith('abc-123');
  });

  it('returns 404 when context does not exist', async () => {
    mockStore.deleteContext.mockReturnValueOnce(false);

    const res = await request(app).delete('/api/contexts/missing-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// GET /api/preferences
// ---------------------------------------------------------------------------

describe('GET /api/preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns preferences when file exists', async () => {
    const mockPrefs = { workContext: { role: 'Developer' } };
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockPrefs));

    const res = await request(app).get('/api/preferences');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockPrefs);
  });

  it('returns null when file does not exist', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/preferences');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('returns 500 when read fails', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('Read error');
    });

    const res = await request(app).get('/api/preferences');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to read preferences');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/preferences
// ---------------------------------------------------------------------------

describe('PUT /api/preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves preferences and returns ok', async () => {
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

    const prefs = {
      workContext: { role: 'Developer', industry: 'Tech' },
      communicationStyle: { tone: 'casual', detailLevel: 'balanced', useCodeExamples: true },
      behaviorPreferences: { proactiveness: 'proactive', warnAboutRisks: true },
      customInstructions: 'Be helpful',
    };

    const res = await request(app).put('/api/preferences').send(prefs);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 500 when write fails', async () => {
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw new Error('Write error');
    });

    const res = await request(app).put('/api/preferences').send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to save preferences');
  });
});

// ---------------------------------------------------------------------------
// GET /api/bubbles
// ---------------------------------------------------------------------------

describe('GET /api/bubbles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all bubbles with context counts', async () => {
    const bubbles = [
      { id: 'bubble-1', name: 'Project A', description: 'Test project', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ];
    mockStore.listBubbles.mockReturnValueOnce(bubbles);
    mockStore.listContextsByBubble.mockReturnValueOnce([fakeEntry]);

    const res = await request(app).get('/api/bubbles');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('bubble-1');
    expect(res.body[0].contextCount).toBe(1);
  });

  it('returns empty array when no bubbles exist', async () => {
    mockStore.listBubbles.mockReturnValueOnce([]);

    const res = await request(app).get('/api/bubbles');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/bubbles
// ---------------------------------------------------------------------------

describe('POST /api/bubbles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a bubble and returns 201', async () => {
    const bubble = { id: 'bubble-1', name: 'New Project', description: 'A test project', createdAt: '2024-01-01', updatedAt: '2024-01-01' };
    mockStore.createBubble.mockReturnValueOnce(bubble);

    const res = await request(app)
      .post('/api/bubbles')
      .send({ name: 'New Project', description: 'A test project' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('bubble-1');
    expect(mockStore.createBubble).toHaveBeenCalledWith('New Project', 'A test project');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/bubbles').send({ description: 'No name' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name is required');
  });
});

// ---------------------------------------------------------------------------
// GET /api/bubbles/:id
// ---------------------------------------------------------------------------

describe('GET /api/bubbles/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns bubble with context count when found', async () => {
    const bubble = { id: 'bubble-1', name: 'Project A', description: 'Test', createdAt: '2024-01-01', updatedAt: '2024-01-01' };
    mockStore.getBubble.mockReturnValueOnce(bubble);
    mockStore.listContextsByBubble.mockReturnValueOnce([fakeEntry, fakeEntry]);

    const res = await request(app).get('/api/bubbles/bubble-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('bubble-1');
    expect(res.body.contextCount).toBe(2);
  });

  it('returns 404 when bubble not found', async () => {
    mockStore.getBubble.mockReturnValueOnce(undefined);

    const res = await request(app).get('/api/bubbles/missing-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// GET /api/bubbles/:id/contexts
// ---------------------------------------------------------------------------

describe('GET /api/bubbles/:id/contexts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns contexts for a bubble', async () => {
    const bubble = { id: 'bubble-1', name: 'Project A', createdAt: '2024-01-01', updatedAt: '2024-01-01' };
    mockStore.getBubble.mockReturnValueOnce(bubble);
    mockStore.listContextsByBubble.mockReturnValueOnce([fakeEntry]);

    const res = await request(app).get('/api/bubbles/bubble-1/contexts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns 404 when bubble not found', async () => {
    mockStore.getBubble.mockReturnValueOnce(undefined);

    const res = await request(app).get('/api/bubbles/missing-id/contexts');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/bubbles/:id
// ---------------------------------------------------------------------------

describe('PUT /api/bubbles/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates bubble and returns updated bubble', async () => {
    const updated = { id: 'bubble-1', name: 'Updated Project', description: 'Updated desc', createdAt: '2024-01-01', updatedAt: '2024-06-01' };
    mockStore.updateBubble.mockReturnValueOnce(updated);

    const res = await request(app)
      .put('/api/bubbles/bubble-1')
      .send({ name: 'Updated Project', description: 'Updated desc' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Project');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).put('/api/bubbles/bubble-1').send({ description: 'No name' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name is required');
  });

  it('returns 404 when bubble not found', async () => {
    mockStore.updateBubble.mockReturnValueOnce(undefined);

    const res = await request(app).put('/api/bubbles/missing-id').send({ name: 'Test' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/bubbles/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/bubbles/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes bubble and returns 204', async () => {
    mockStore.deleteBubble.mockReturnValueOnce(true);

    const res = await request(app).delete('/api/bubbles/bubble-1');
    expect(res.status).toBe(204);
    expect(mockStore.deleteBubble).toHaveBeenCalledWith('bubble-1', false);
  });

  it('deletes bubble with contexts when deleteContexts=true', async () => {
    mockStore.deleteBubble.mockReturnValueOnce(true);

    const res = await request(app).delete('/api/bubbles/bubble-1?deleteContexts=true');
    expect(res.status).toBe(204);
    expect(mockStore.deleteBubble).toHaveBeenCalledWith('bubble-1', true);
  });

  it('returns 404 when bubble not found', async () => {
    mockStore.deleteBubble.mockReturnValueOnce(false);

    const res = await request(app).delete('/api/bubbles/missing-id');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// SPA fallback
// ---------------------------------------------------------------------------

describe('GET /* (SPA fallback)', () => {
  it('returns 404 when public dir is absent (test environment)', async () => {
    const res = await request(app).get('/some-unknown-route');
    expect(res.status).toBe(404);
  });
});
