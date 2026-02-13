#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

const storePath = process.env.OPENCONTEXT_STORE_PATH || undefined;

const server = createMcpServer(storePath);
const transport = new StdioServerTransport();

server.connect(transport).catch((error) => {
  console.error('Failed to start opencontext MCP server:', error);
  process.exit(1);
});
