# CLAUDE.md — AI Assistant Guide for opencontext

## Project Overview

**opencontext** is a CLI tool that lets users take their full chat export from any AI provider (ChatGPT, Google Gemini, etc.) and convert it into a format compatible with Claude. The primary use case is onboarding to a fresh Claude account with your existing conversation history intact.

### The Problem

When users switch to Claude, they lose all their prior conversation context from other AI platforms. Chat exports from providers like ChatGPT come in provider-specific JSON formats that Claude can't read directly.

### The Solution

opencontext reads exported conversation archives, normalizes them, and outputs Claude-compatible conversation data — so users can hit the ground running on a new Claude account with their full history.

### Supported Sources (Planned)

- **ChatGPT** — `conversations.json` from the ChatGPT data export (Settings → Export data)
- **Google Gemini** — Gemini activity export via Google Takeout
- **Other providers** — Extensible parser system for adding new sources

### Target Output

- Claude-compatible conversation format for import

## Repository Status

This is a greenfield project being actively bootstrapped.

## Tech Stack (Planned)

- **Language:** Node.js / TypeScript (or Python — TBD by initial implementation)
- **Type:** CLI application
- **Package manager:** npm or yarn (Node.js) / pip (Python)

## Project Structure (Planned)

```
opencontext/
├── CLAUDE.md              # This file — AI assistant guide
├── README.md              # User-facing documentation
├── package.json           # Project metadata and scripts
├── src/
│   ├── index.ts           # CLI entry point
│   ├── parsers/           # Input format parsers
│   │   ├── chatgpt.ts     # ChatGPT conversations.json parser
│   │   ├── gemini.ts      # Google Gemini export parser
│   │   └── base.ts        # Base parser interface
│   ├── formatters/
│   │   └── claude.ts      # Claude output formatter
│   ├── types/             # Shared type definitions
│   │   └── conversation.ts # Normalized conversation schema
│   └── utils/             # Helpers (file I/O, validation, etc.)
├── tests/                 # Test files
│   ├── fixtures/          # Sample export files for testing
│   ├── parsers/           # Parser tests
│   └── formatters/        # Formatter tests
└── .github/
    └── workflows/         # CI/CD pipelines
```

## Key Concepts

### Conversion Pipeline

```
[ChatGPT export JSON]  →  Parser  →  [Normalized Schema]  →  Formatter  →  [Claude format]
[Gemini export]        →  Parser  ↗                        ↘
```

All source formats are parsed into a single **normalized conversation schema**, then a Claude formatter outputs the final result. This keeps parsers and the formatter decoupled.

### Normalized Conversation Schema

The intermediate data model between parsing and formatting:

- **Conversation** — title, creation timestamp, update timestamp, list of messages
- **Message** — role (`user` | `assistant` | `system`), content blocks, timestamp
- **Content** — text, code blocks, images/attachments (as references)

### Parsers (Source Providers)

Each source provider has a parser that knows how to read that provider's export format:

- **ChatGPT**: Reads `conversations.json` — handles the nested message tree structure, maps `author.role` to standard roles, extracts text/code content parts
- **Gemini**: Reads Google Takeout export — maps Gemini-specific activity data to conversations

Every parser implements a common interface and outputs the normalized schema.

### Formatter (Claude Output)

The Claude formatter takes normalized conversations and produces Claude-compatible output. This is the only output target for now — the tool is purpose-built for migrating **to** Claude.

### Adding a New Source Provider

1. Study the provider's export format (request a data export, inspect the JSON/files)
2. Create a parser in `src/parsers/<provider>.ts` implementing the base parser interface
3. Map the provider's roles, content types, and metadata to the normalized schema
4. Add sample fixture data in `tests/fixtures/<provider>/`
5. Write parser tests covering normal conversations, edge cases (empty messages, multimedia, long threads)
6. Register the parser in the CLI argument handling

## Development Workflow

### Getting Started

```bash
# Install dependencies
npm install

# Convert a ChatGPT export to Claude format
npm start -- --from chatgpt export/conversations.json -o claude_conversations.json

# Run in development mode
npm run dev
```

### Common Commands

| Command          | Description                          |
| ---------------- | ------------------------------------ |
| `npm test`       | Run the test suite                   |
| `npm run lint`   | Run linter                           |
| `npm run build`  | Compile TypeScript (if applicable)   |
| `npm start`      | Run the CLI                          |

### Testing

- Place test files in `tests/` or co-locate as `*.test.ts` next to source files
- Keep sample export fixtures in `tests/fixtures/` — small, anonymized snippets
- Run tests before committing: `npm test`
- Parsers and the formatter are the core logic — prioritize test coverage there
- Test edge cases: empty conversations, messages with only images, very long threads, special characters

### Linting & Formatting

- Follow the project's ESLint and Prettier configs
- Run `npm run lint` before committing
- Do not disable lint rules inline without clear justification

## Conventions for AI Assistants

### Code Style

- Keep functions small and focused
- Use descriptive variable names — no abbreviations
- Prefer explicit error handling over silent failures
- Type all function parameters and return values (if TypeScript)
- Handle malformed export data gracefully — users may have partial or corrupted exports

### Commit Messages

- Use conventional commit format: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Keep the subject line under 72 characters
- Reference issue numbers when applicable

### What NOT to Do

- Do not add unnecessary abstractions or over-engineer
- Do not add dependencies without clear justification
- Do not modify CI/CD configs without being asked
- Do not introduce breaking changes to the CLI interface without discussion
- Do not commit generated files, build artifacts, or secrets
- Do not include real user conversation data in tests — use anonymized fixtures only

### PR Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a summary of what changed and why
- Ensure tests pass and linting is clean before requesting review

### Privacy Considerations

- Conversation exports contain personal data — never log, upload, or persist user content beyond the conversion output
- Test fixtures must use synthetic/anonymized data
- The tool runs entirely locally — no network calls
