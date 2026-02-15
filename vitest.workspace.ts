import { defineWorkspace } from 'vitest/config';
import path from 'path';

export default defineWorkspace([
  // Root/CLI tests - Node environment
  {
    test: {
      name: 'cli',
      include: ['tests/**/*.test.ts'],
      globals: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary', 'json'],
        include: ['src/**/*.ts'],
        exclude: ['src/index.ts', 'src/parsers/types.ts', 'src/mcp/index.ts', 'src/mcp/types.ts'],
      },
    },
  },
  // UI tests - jsdom environment
  {
    root: './ui',
    plugins: [],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './ui/src'),
      },
    },
    test: {
      name: 'ui',
      include: ['src/**/*.test.{ts,tsx}'],
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
      },
    },
  },
]);
