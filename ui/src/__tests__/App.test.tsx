import { describe, it, expect } from 'vitest';

describe('App', () => {
  it('should be importable', async () => {
    // App.tsx imports CSS and uses browser APIs, so we just test the module can be imported
    const appModule = await import('../App');
    expect(appModule).toBeDefined();
    expect(appModule.default).toBeDefined();
  });
});
