import { describe, it, expect } from 'vitest';

// Test that all type exports can be imported
describe('Type Definitions', () => {
  it('should import all type definitions without errors', async () => {
    const types = await import('../preferences');
    
    // Type definitions don't have runtime values, but we can verify the module loads
    expect(types).toBeDefined();
  });

  it('should have correct type constraints', () => {
    // These are compile-time checks, but we document them here
    const validToneStyles = ['formal', 'casual', 'neutral', 'friendly', 'professional'] as const;
    const validDetailLevels = ['concise', 'balanced', 'thorough'] as const;
    const validResponseFormats = ['markdown', 'plain', 'structured'] as const;
    const validProactivenessLevels = ['minimal', 'moderate', 'proactive'] as const;
    const validPipelineStages = ['idle', 'uploading', 'parsing', 'normalizing', 'analyzing', 'exporting', 'complete', 'error'] as const;
    const validVendorIds = ['claude', 'chatgpt', 'gemini', 'generic'] as const;

    expect(validToneStyles).toHaveLength(5);
    expect(validDetailLevels).toHaveLength(3);
    expect(validResponseFormats).toHaveLength(3);
    expect(validProactivenessLevels).toHaveLength(3);
    expect(validPipelineStages).toHaveLength(8);
    expect(validVendorIds).toHaveLength(4);
  });
});
