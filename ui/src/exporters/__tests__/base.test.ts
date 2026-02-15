import { describe, it, expect, vi } from 'vitest';

const mockPreferences: any = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  has: vi.fn(),
  keys: vi.fn(),
  values: vi.fn(),
  entries: vi.fn(),
  [Symbol.iterator]: vi.fn(),
};

describe('Exporters', () => {
  it('chatGPTExporter should have correct vendor info', async () => {
    const chatGPTModule = await import('../chatgpt');
    console.log(chatGPTModule);
    const { chatGPTExporter } = chatGPTModule;
    expect(chatGPTExporter.info.vendor).toBe('ChatGPT');
    expect(chatGPTExporter.info.vendorOfficial).toBe(true);
  });

  it('claudeExporter should have correct vendor info', async () => {
    const claudeModule = await import('../claude');
    console.log(claudeModule);
    const { claudeExporter } = claudeModule;
    expect(claudeExporter.info.vendor).toBe('Claude');
    expect(claudeExporter.info.vendorOfficial).toBe(true);
  });

  it('geminiExporter should have correct vendor info', async () => {
    const geminiModule = await import('../gemini');
    console.log(geminiModule);
    const { geminiExporter } = geminiModule;
    expect(geminiExporter.info.vendor).toBe('Google Gemini');
    expect(geminiExporter.info.vendorOfficial).toBe(true);
  });

  it('chatGPTExporter should export preferences', async () => {
    const { chatGPTExporter } = await import('../chatgpt');
    const result = chatGPTExporter.exportPreferences(mockPreferences);
    expect(result.files).toHaveLength(2);
  });

  it('claudeExporter should export preferences', async () => {
    const { claudeExporter } = await import('../claude');
    mockPreferences.communicationStyle = {
      tone: 'formal',
      detailLevel: 'balanced',
      useCodeExamples: true,
      preferStepByStep: true,
      responseFormat: 'markdown',
    };
    mockPreferences.behaviorPreferences = {
      proactiveness: 'proactive',
      warnAboutRisks: true,
      suggestAlternatives: true,
      followUpQuestions: true,
    };
    mockPreferences.customInstructions = '';
    const result = claudeExporter.exportPreferences(mockPreferences);
    expect(result.files).toHaveLength(1);
  });

  it('geminiExporter should export preferences', async () => {
    const { geminiExporter } = await import('../gemini');
    mockPreferences.workContext = {
      role: 'Software Engineer',
      industry: 'Technology',
      description: 'I work on the frontend of a web application.',
    };
    mockPreferences.technicalProfile = {
      experienceLevel: 'Intermediate',
      primaryLanguages: ['TypeScript'],
      frameworks: ['React'],
      tools: [],
    };
    mockPreferences.personalContext = {
      background: 'I have a background in design.',
      interests: [],
    };
    mockPreferences.currentFocus = {
      projects: [],
      goals: [],
      topOfMind: '',
    };
    const result = geminiExporter.exportPreferences(mockPreferences);
    expect(result.files).toHaveLength(1);
  });
});
