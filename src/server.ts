import express, { type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Ollama } from 'ollama';
import { ZipExtractor } from './extractor.js';
import { ChatGPTParser } from './parsers/chatgpt.js';
import { ConversationNormalizer } from './parsers/normalizer.js';
import { OllamaPreferenceAnalyzer } from './analyzers/ollama-preferences.js';
import { createStore } from './mcp/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Multer: save uploads to a temp dir on disk (ZipExtractor needs a file path)
const uploadDir = path.join(os.tmpdir(), 'opencontext-uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// Ollama host — defaults to host.docker.internal so containers reach the host machine
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://host.docker.internal:11434';

// Context store
const storePath =
  process.env.OPENCONTEXT_STORE_PATH ??
  path.join(os.homedir(), '.opencontext', 'contexts.json');
const store = createStore(storePath);

// Serve built UI static files
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', ollamaHost: OLLAMA_HOST, store: storePath });
});

// ---------------------------------------------------------------------------
// Ollama — list available models on the host
// ---------------------------------------------------------------------------

app.get('/api/ollama/models', async (_req: Request, res: Response) => {
  try {
    const ollama = new Ollama({ host: OLLAMA_HOST });
    const { models } = await ollama.list();
    res.json(
      models.map((m) => ({
        name: m.name,
        size: m.size,
        modifiedAt: m.modified_at,
      })),
    );
  } catch {
    res.status(503).json({ error: `Ollama unreachable at ${OLLAMA_HOST}` });
  }
});

// ---------------------------------------------------------------------------
// Convert — upload a ChatGPT ZIP and run the full pipeline
// ---------------------------------------------------------------------------

app.post('/api/convert', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const ollamaHost = (req.body.ollamaHost as string | undefined) ?? OLLAMA_HOST;
  const model = (req.body.model as string | undefined) ?? process.env.OLLAMA_MODEL ?? 'gpt-oss:20b';
  const skipPreferences = req.body.skipPreferences === 'true';

  const extractor = new ZipExtractor();
  let tempDir: string | undefined;

  try {
    const extracted = await extractor.extractZip(req.file.path);
    tempDir = extracted.tempDir;

    const parser = new ChatGPTParser();
    const chatGPTConvs = parser.parseConversations(extracted.conversationsPath);

    const normalizer = new ConversationNormalizer();
    const normalized = chatGPTConvs
      .map((c) => normalizer.normalize(c))
      .filter((c) => normalizer.isValidConversation(c));

    let preferences = '';
    let memory = '';

    const analyzer = new OllamaPreferenceAnalyzer(model, ollamaHost);
    if (!skipPreferences) {
      try {
        preferences = await analyzer.analyzePreferences(normalized);
        memory = await analyzer.analyzeMemory(normalized);
      } catch {
        preferences = analyzer.generateBasicPreferences(normalized);
        memory = analyzer.generateBasicMemory(normalized);
      }
    } else {
      preferences = analyzer.generateBasicPreferences(normalized);
      memory = analyzer.generateBasicMemory(normalized);
    }

    res.json({
      conversations: normalized.map((c) => ({
        id: c.id,
        title: c.title,
        created: c.created,
        updated: c.updated,
        messageCount: c.messages.length,
      })),
      preferences,
      memory,
      stats: {
        total: chatGPTConvs.length,
        processed: normalized.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Conversion failed' });
  } finally {
    fs.rmSync(req.file.path, { force: true });
    if (tempDir) extractor.cleanup(tempDir);
  }
});

// ---------------------------------------------------------------------------
// Contexts — CRUD for the MCP context store
// ---------------------------------------------------------------------------

app.get('/api/contexts', (req: Request, res: Response) => {
  const tag = req.query.tag as string | undefined;
  res.json(store.listContexts(tag));
});

app.post('/api/contexts', (req: Request, res: Response) => {
  const { content, tags, source } = req.body as {
    content: string;
    tags?: string[];
    source?: string;
  };
  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  res.status(201).json(store.saveContext(content, tags, source));
});

app.get('/api/contexts/search', (req: Request, res: Response) => {
  const q = req.query.q as string;
  if (!q) {
    res.status(400).json({ error: 'q query param required' });
    return;
  }
  res.json(store.searchContexts(q));
});

app.get('/api/contexts/:id', (req: Request, res: Response) => {
  const entry = store.getContext(req.params['id'] as string);
  if (!entry) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(entry);
});

app.put('/api/contexts/:id', (req: Request, res: Response) => {
  const { content, tags } = req.body as { content: string; tags?: string[] };
  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  const updated = store.updateContext(req.params['id'] as string, content, tags);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(updated);
});

app.delete('/api/contexts/:id', (req: Request, res: Response) => {
  const deleted = store.deleteContext(req.params['id'] as string);
  if (!deleted) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// SPA fallback — all non-API routes serve the React app
// ---------------------------------------------------------------------------

app.get('/{*splat}', (_req: Request, res: Response) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'UI not found — run the build first' });
  }
});

// Export app for testing (supertest imports it without starting the server)
export { app };

// ---------------------------------------------------------------------------
// Start — skipped when imported by tests (NODE_ENV=test set by Vitest)
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV !== 'test') {
  const PORT = parseInt(process.env.PORT ?? '3000', 10);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`opencontext server  →  http://0.0.0.0:${PORT}`);
    console.log(`Ollama host         →  ${OLLAMA_HOST}`);
    console.log(`Context store       →  ${storePath}`);
    console.log(`UI                  →  ${fs.existsSync(publicDir) ? 'served from /public' : 'not built'}`);
  });
}
