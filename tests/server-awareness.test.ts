/**
 * Tests for the new awareness/schema/pending-actions REST endpoints.
 * Uses mocks for store, observer, schema, and awareness modules to avoid
 * file system access.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Hoisted mocks (must be before any import that triggers module evaluation) ──

const mockStore = vi.hoisted(() => ({
  listContexts: vi.fn(() => []),
  saveContext: vi.fn(() => ({ id: 'ctx-1', content: 'x', tags: [], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })),
  searchContexts: vi.fn(() => []),
  getContext: vi.fn(() => undefined),
  updateContext: vi.fn(() => undefined),
  deleteContext: vi.fn(() => false),
  listContextsByBubble: vi.fn(() => []),
  listBubbles: vi.fn(() => []),
  getBubble: vi.fn(() => undefined),
  createBubble: vi.fn(() => ({ id: 'b1', name: 'test', createdAt: '', updatedAt: '' })),
  updateBubble: vi.fn(() => undefined),
  deleteBubble: vi.fn(() => false),
}));

vi.mock('../src/mcp/store.js', () => ({ createStore: vi.fn(() => mockStore) }));

const mockObserver = vi.hoisted(() => ({
  log: vi.fn(),
  getSummary: vi.fn(() => ({ totalReads: 0, totalWrites: 0, totalMisses: 0, missedQueries: [], missedQueryCount: {}, typeReadFrequency: {}, typeWriteFrequency: {}, lastActivity: '' })),
  getMissedQueries: vi.fn(() => []),
  getTypePopularity: vi.fn(() => ({})),
  rotateIfNeeded: vi.fn(),
  getRecentImprovements: vi.fn(() => []),
  logSelfImprovement: vi.fn(),
  loadRaw: vi.fn(() => ({ events: [], summary: { totalReads: 0, totalWrites: 0, totalMisses: 0, missedQueries: [], missedQueryCount: {}, typeReadFrequency: {}, typeWriteFrequency: {}, lastActivity: '' }, improvements: [], pendingActions: [], protections: [] })),
  persistRaw: vi.fn(),
  filePath: '/tmp/awareness.json',
}));

vi.mock('../src/mcp/observer.js', () => ({ createObserver: vi.fn(() => mockObserver) }));

const mockSchema = vi.hoisted(() => ({ version: 1, types: [{ name: 'decision', description: 'test', fields: {} }] }));

vi.mock('../src/mcp/schema.js', () => ({
  loadSchema: vi.fn(() => mockSchema),
  saveSchema: vi.fn(),
}));

const mockSelfModel = vi.hoisted(() => ({
  identity: { contextCount: 5, typeBreakdown: { decision: 3 }, bubbleCount: 1, oldestEntry: '', newestEntry: '' },
  coverage: { typesWithEntries: ['decision'], typesEmpty: [], untyped: 2 },
  freshness: { recentlyUpdated: 5, stale: 0, stalestEntries: [] },
  gaps: [],
  contradictions: [],
  health: { coverageScore: 1, freshnessScore: 1, overallHealth: 'healthy' as const },
  pendingActionsCount: 0,
  recentImprovements: [],
}));

vi.mock('../src/mcp/awareness.js', () => ({
  buildSelfModel: vi.fn(() => mockSelfModel),
  refreshCache: vi.fn(),
}));

const mockAnalyzer = vi.hoisted(() => ({
  detectContradictions: vi.fn(async () => []),
  suggestSchemaTypes: vi.fn(async () => []),
  summarizeContext: vi.fn(async () => 'Summary text'),
  rankByRelevance: vi.fn(async () => []),
}));

vi.mock('../src/mcp/analyzer.js', () => ({
  ContextAnalyzer: vi.fn(function () { return mockAnalyzer; }),
}));

const mockControlPlane = vi.hoisted(() => ({
  listPending: vi.fn(() => []),
  approve: vi.fn(() => ({ executed: false, result: 'No pending action found with ID "nope".' })),
  dismiss: vi.fn(() => false),
  bulkApprove: vi.fn(() => []),
  bulkDismiss: vi.fn(),
  expireStale: vi.fn(() => 0),
  classifyRisk: vi.fn(() => 'medium'),
  shouldAutoExecute: vi.fn(() => false),
  isProtected: vi.fn(() => false),
  addProtection: vi.fn(),
  listProtections: vi.fn(() => []),
  removeProtection: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock('../src/mcp/control-plane.js', () => ({
  createControlPlane: vi.fn(() => mockControlPlane),
}));

vi.mock('../src/mcp/improver.js', () => ({
  selfImprovementTick: vi.fn(async () => {}),
  executeImprovement: vi.fn(async () => {}),
}));

// Ollama mock (needed by server.ts import)
vi.mock('ollama', () => ({
  Ollama: vi.fn(function () { return { list: vi.fn(async () => ({ models: [] })) }; }),
}));

// Now import the app under test
const { app } = await import('../src/server.js');

describe('server.ts — awareness endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set return values after clearAllMocks
    mockControlPlane.listPending.mockReturnValue([]);
    mockControlPlane.approve.mockReturnValue({ executed: false, result: 'No pending action found with ID "nope".' });
    mockControlPlane.dismiss.mockReturnValue(false);
    mockObserver.loadRaw.mockReturnValue({ events: [], summary: { totalReads: 0, totalWrites: 0, totalMisses: 0, missedQueries: [], missedQueryCount: {}, typeReadFrequency: {}, typeWriteFrequency: {}, lastActivity: '' }, improvements: [], pendingActions: [], protections: [] });
    mockStore.listContexts.mockReturnValue([]);
  });

  // ── /api/schema ──

  describe('GET /api/schema', () => {
    it('returns schema from loadSchema', async () => {
      const res = await request(app).get('/api/schema');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe(1);
      expect(Array.isArray(res.body.types)).toBe(true);
    });
  });

  describe('PUT /api/schema', () => {
    it('saves valid schema', async () => {
      const { saveSchema } = await import('../src/mcp/schema.js');
      const res = await request(app)
        .put('/api/schema')
        .send({ version: 1, types: [{ name: 'note', description: 'notes', fields: {} }] });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(saveSchema).toHaveBeenCalled();
    });

    it('rejects schema without types array', async () => {
      const res = await request(app)
        .put('/api/schema')
        .send({ version: 1 }); // missing types
      expect(res.status).toBe(400);
    });
  });

  // ── /api/awareness ──

  describe('GET /api/awareness', () => {
    it('returns self-model', async () => {
      const { buildSelfModel } = await import('../src/mcp/awareness.js');
      const res = await request(app).get('/api/awareness');
      expect(res.status).toBe(200);
      expect(res.body.health).toBeDefined();
      expect(res.body.identity).toBeDefined();
      expect(buildSelfModel).toHaveBeenCalled();
    });
  });

  // ── /api/analyze ──

  describe('POST /api/analyze', () => {
    it('handles contradictions action', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ action: 'contradictions' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('result');
      expect(res.body.source).toBe('ollama');
    });

    it('handles suggest_schema action', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ action: 'suggest_schema' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('result');
    });

    it('handles summarize action', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ action: 'summarize', params: { focus: 'auth' } });
      expect(res.status).toBe(200);
      expect(res.body.result).toBe('Summary text');
    });

    it('returns 400 for unknown action', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ action: 'unknown' });
      expect(res.status).toBe(400);
    });
  });

  // ── /api/pending-actions ──

  describe('GET /api/pending-actions', () => {
    it('returns empty list when no pending actions', async () => {
      const res = await request(app).get('/api/pending-actions');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns pending actions from control plane', async () => {
      const fakePending = [{ id: 'pa-1', risk: 'high', description: 'Archive 2 entries', status: 'pending' }];
      mockControlPlane.listPending.mockReturnValue(fakePending);
      const res = await request(app).get('/api/pending-actions');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('pa-1');
    });
  });

  describe('POST /api/pending-actions/:id/approve', () => {
    it('returns 404 when action not found', async () => {
      const res = await request(app).post('/api/pending-actions/nope/approve');
      expect(res.status).toBe(404);
    });

    it('returns 200 when action approved and executed successfully', async () => {
      const fakeAction = { id: 'pa-1', action: { type: 'auto_tag', entries: [] }, risk: 'low', description: 'Auto-tag', reasoning: '', preview: {}, status: 'pending', createdAt: '', expiresAt: '' };
      mockControlPlane.approve.mockReturnValue({ executed: true, result: 'Action pa-1 approved.', action: fakeAction });
      const res = await request(app).post('/api/pending-actions/pa-1/approve');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /api/pending-actions/:id/dismiss', () => {
    it('returns 404 when action not found', async () => {
      mockControlPlane.dismiss.mockReturnValue(false);
      const res = await request(app).post('/api/pending-actions/nope/dismiss').send({});
      expect(res.status).toBe(404);
    });

    it('returns 200 when dismissed', async () => {
      mockControlPlane.dismiss.mockReturnValue(true);
      const res = await request(app)
        .post('/api/pending-actions/pa-1/dismiss')
        .send({ reason: 'Not needed' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /api/pending-actions/bulk', () => {
    it('returns 400 when action_ids missing', async () => {
      const res = await request(app)
        .post('/api/pending-actions/bulk')
        .send({ decision: 'approve' });
      expect(res.status).toBe(400);
    });

    it('bulk dismisses actions', async () => {
      const res = await request(app)
        .post('/api/pending-actions/bulk')
        .send({ action_ids: ['pa-1', 'pa-2'], decision: 'dismiss' });
      expect(res.status).toBe(200);
      expect(res.body.dismissed).toBe(2);
    });

    it('bulk approves actions', async () => {
      const fakeAction = { id: 'pa-1', action: { type: 'auto_tag', entries: [] }, risk: 'low', description: '', reasoning: '', preview: {}, status: 'pending', createdAt: '', expiresAt: '' };
      mockControlPlane.approve.mockReturnValue({ executed: true, result: 'ok', action: fakeAction });
      const res = await request(app)
        .post('/api/pending-actions/bulk')
        .send({ action_ids: ['pa-1'], decision: 'approve' });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.results)).toBe(true);
    });
  });
});
