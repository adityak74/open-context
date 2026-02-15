import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    exclude: ['ui/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/parsers/types.ts', 'src/mcp/index.ts', 'src/mcp/types.ts'],
    },
  },
});
