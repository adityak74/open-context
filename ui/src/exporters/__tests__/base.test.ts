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
    const { chatgptExporter } = await import('../chatgpt');
    expect(chatgptExporter.info.name).toBe('ChatGPT');
    expect(chatgptExporter.info.supportsPreferences).toBe(true);
  });

  it('claudeExporter should have correct vendor info', async () => {
    const { claudeExporter } = await import('../claude');
    expect(claudeExporter.info.name).toBe('Claude');
    expect(claudeExporter.info.supportsPreferences).toBe(true);
  });

  it('geminiExporter should have correct vendor info', async () => {
    const { geminiExporter } = await import('../gemini');
    expect(geminiExporter.info.name).toBe('Google Gemini');
    expect(geminiExporter.info.supportsPreferences).toBe(true);
  });

  it('chatGPTExporter should export preferences', async () => {
    const { chatgptExporter } = await import('../chatgpt');
    mockPreferences.workContext = { role: 'Engineer', industry: 'Tech', description: '' };
    mockPreferences.personalContext = { background: '', interests: [] };
    mockPreferences.currentFocus = { projects: [], goals: [], topOfMind: '' };
    mockPreferences.technicalProfile = { experienceLevel: '', primaryLanguages: [], frameworks: [], tools: [] };
    mockPreferences.communicationStyle = { tone: 'balanced', detailLevel: 'balanced', useCodeExamples: false, preferStepByStep: false, responseFormat: 'markdown' };
    mockPreferences.behaviorPreferences = { proactiveness: 'balanced', warnAboutRisks: false, suggestAlternatives: false, followUpQuestions: false };
    mockPreferences.customInstructions = '';
    const result = chatgptExporter.exportPreferences(mockPreferences);
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
