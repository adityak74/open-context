# open-context

**Portable AI context — import, manage, and export your conversation history across every AI platform.**

open-context lets you migrate your full chat history from ChatGPT or Gemini into Claude-compatible formats, and gives Claude persistent memory through a built-in MCP server. This single Docker image bundles the React web UI, REST API server, and MCP server together.

---

## What is open-context?

When you switch AI assistants, you lose everything — your communication style, your background, your conversation history. open-context solves that by:

1. **Importing** your chat history from ChatGPT (Gemini support coming)
2. **Analyzing** your patterns with a local LLM (Ollama) to generate preferences and memory
3. **Exporting** to Claude, ChatGPT custom instructions, or Gemini formats
4. **Persisting** new context across every Claude conversation via an MCP server

Everything runs locally. Your data never leaves your machine.

---

## How to use this image

### Quick start — web UI + REST API

```bash
docker run -p 3000:3000 \
  -v open-context-data:/root/.opencontext \
  adityakarnam/open-context:latest
```

Open [http://localhost:3000](http://localhost:3000).

### With a specific version (recommended)

```bash
docker run -p 3000:3000 \
  -v open-context-data:/root/.opencontext \
  adityakarnam/open-context:0.0.1
```

### MCP server (stdio mode for Claude Code / Claude Desktop)

Override the default command to run the MCP server instead:

```bash
docker run -i --rm \
  -v open-context-data:/root/.opencontext \
  adityakarnam/open-context:latest \
  node dist/mcp/index.js
```

### Connect to Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "open-context": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "open-context-data:/root/.opencontext",
        "adityakarnam/open-context:latest",
        "node", "dist/mcp/index.js"
      ]
    }
  }
}
```

### Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "open-context": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "open-context-data:/root/.opencontext",
        "adityakarnam/open-context:latest",
        "node", "dist/mcp/index.js"
      ]
    }
  }
}
```

### With docker compose

```yaml
services:
  open-context:
    image: adityakarnam/open-context:latest
    ports:
      - "3000:3000"
    volumes:
      - open-context-data:/root/.opencontext

volumes:
  open-context-data:
```

---

## Persistent storage

All data is stored in the mounted volume at `/root/.opencontext` — no browser localStorage is used.

| File | Description |
|------|-------------|
| `preferences.json` | Your structured preferences (used by the UI form) |
| `preferences.md` | Claude preferences doc — paste into Claude Settings → Preferences |
| `memory.md` | Claude memory doc — paste into Claude → Manage Memory |
| `contexts.json` | MCP context entries saved by Claude |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `OLLAMA_HOST` | `http://host.docker.internal:11434` | Ollama endpoint for AI analysis |
| `OLLAMA_MODEL` | `gpt-oss:20b` | Model used for preference analysis |
| `OPENCONTEXT_STORE_PATH` | `/root/.opencontext/contexts.json` | MCP context store path |

`host.docker.internal` resolves to the host machine from inside the container. On Linux, add `--add-host=host.docker.internal:host-gateway`.

---

## MCP tools

Once connected, Claude gains these persistent memory tools:

| Tool | What it does |
|------|-------------|
| `save_context` | Save a note or memory with optional tags |
| `recall_context` | Full-text search across saved contexts |
| `list_contexts` | List all contexts, optionally filtered by tag |
| `search_contexts` | Multi-keyword AND search |
| `update_context` | Update content or tags of a saved context |
| `delete_context` | Remove a context by ID |
| `create_bubble` | Create a project workspace (bubble) |
| `list_bubbles` | List all bubbles |
| `get_bubble` | Get a bubble and its contexts |
| `update_bubble` | Rename or update a bubble |
| `delete_bubble` | Delete a bubble and optionally its contexts |

---

## Image variants

| Tag | Description |
|-----|-------------|
| `0.0.1`, `latest` | Current stable release — UI + API + MCP on `node:25-slim` |

---

## License

MIT — [github.com/adityak74/open-context](https://github.com/adityak74/open-context)
