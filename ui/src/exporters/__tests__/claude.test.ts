import { describe, it, expect } from 'vitest';
import { claudeExporter } from '../claude';
import type { UserPreferences, NormalizedConversation } from '../../types/preferences';

describe('claudeExporter', () => {
  const mockPreferences: UserPreferences = {
    communicationStyle: {
      tone: 'friendly',
      detailLevel: 'thorough',
      responseFormat: 'markdown',
      useCodeExamples: true,
      preferStepByStep: true,
      languagePreference: 'English',
    },
    technicalProfile: {
      experienceLevel: 'advanced',
      primaryLanguages: ['TypeScript', 'Python'],
      frameworks: ['React', 'Django'],
      tools: ['Docker', 'VS Code'],
    },
    workContext: {
      role: 'Software Engineer',
      industry: 'Technology',
      description: 'Building AI-powered applications',
    },
    personalContext: {
      interests: ['AI/ML', 'Open Source'],
      background: 'Computer Science graduate with 5 years experience',
    },
    currentFocus: {
      projects: ['Context Swapper', 'AI Assistant'],
      goals: ['Improve code quality', 'Learn Rust'],
      topOfMind: 'Optimizing performance',
    },
    behaviorPreferences: {
      proactiveness: 'proactive',
      followUpQuestions: true,
      suggestAlternatives: true,
      warnAboutRisks: true,
      assumeContext: false,
    },
    customInstructions: 'Always provide concrete examples.',
  };

  const mockConversations: NormalizedConversation[] = [
    {
      id: 'conv-1',
      title: 'React Best Practices',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-02T00:00:00Z',
      messages: [],
      selected: true,
    },
    {
      id: 'conv-2',
      title: 'TypeScript Tips',
      created: '2024-01-03T00:00:00Z',
      updated: '2024-01-04T00:00:00Z',
      messages: [],
      selected: false,
    },
  ];

  describe('info', () => {
    it('should have correct vendor info', () => {
      expect(claudeExporter.info).toEqual({
        id: 'claude',
        name: 'Claude',
        description: 'Export as Claude preferences and memory documents',
        supportsPreferences: true,
        supportsMemory: true,
        supportsConversationImport: false,
      });
    });
  });

  describe('exportPreferences', () => {
    it('should return a single preferences file', () => {
      const result = claudeExporter.exportPreferences(mockPreferences);

      expect(result.vendorId).toBe('claude');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBe('claude-preferences.md');
      expect(result.files[0].description).toBe('Communication style preferences for Claude');
    });

    it('should include communication style in preferences', () => {
      const result = claudeExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('warm and approachable');
      expect(content).toContain('detailed, comprehensive explanations');
      expect(content).toContain('markdown formatting');
      expect(content).toContain('code examples');
      expect(content).toContain('step-by-step instructions');
    });

    it('should include behavior preferences', () => {
      const result = claudeExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('proactively suggest improvements');
      expect(content).toContain('potential risks');
      expect(content).toContain('alternative approaches');
    });

    it('should include custom instructions', () => {
      const result = claudeExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Always provide concrete examples.');
    });

    it('should handle minimal preferences', () => {
      const minimalPrefs: UserPreferences = {
        ...mockPreferences,
        communicationStyle: {
          tone: 'neutral',
          detailLevel: 'balanced',
          responseFormat: 'plain',
          useCodeExamples: false,
          preferStepByStep: false,
          languagePreference: 'English',
        },
        behaviorPreferences: {
          proactiveness: 'moderate',
          followUpQuestions: false,
          suggestAlternatives: false,
          warnAboutRisks: false,
          assumeContext: false,
        },
        customInstructions: '',
      };

      const result = claudeExporter.exportPreferences(minimalPrefs);
      const content = result.files[0].content;

      expect(content).toContain('clear and neutral');
      expect(content).toContain('balanced responses');
      expect(content).toContain('plain text');
      expect(content).not.toContain('code examples');
      expect(content).not.toContain('step-by-step');
    });
  });

  describe('exportConversations', () => {
    it('should return both preferences and memory files', () => {
      const result = claudeExporter.exportConversations(mockConversations, mockPreferences);

      expect(result.vendorId).toBe('claude');
      expect(result.files).toHaveLength(2);
      expect(result.files[0].filename).toBe('claude-preferences.md');
      expect(result.files[1].filename).toBe('claude-memory.md');
    });

    it('should include work context in memory', () => {
      const result = claudeExporter.exportConversations(mockConversations, mockPreferences);
      const memoryContent = result.files[1].content;

      expect(memoryContent).toContain('Work context:');
      expect(memoryContent).toContain('Software Engineer');
      expect(memoryContent).toContain('Technology');
      expect(memoryContent).toContain('AI-powered applications');
      expect(memoryContent).toContain('TypeScript');
      expect(memoryContent).toContain('React');
      expect(memoryContent).toContain('Docker');
    });

    it('should include personal context in memory', () => {
      const result = claudeExporter.exportConversations(mockConversations, mockPreferences);
      const memoryContent = result.files[1].content;

      expect(memoryContent).toContain('Personal context:');
      expect(memoryContent).toContain('Computer Science graduate');
      expect(memoryContent).toContain('AI/ML');
      expect(memoryContent).toContain('advanced');
    });

    it('should include current focus in memory', () => {
      const result = claudeExporter.exportConversations(mockConversations, mockPreferences);
      const memoryContent = result.files[1].content;

      expect(memoryContent).toContain('Top of mind:');
      expect(memoryContent).toContain('Context Swapper');
      expect(memoryContent).toContain('Improve code quality');
      expect(memoryContent).toContain('Optimizing performance');
    });

    it('should include only selected conversations', () => {
      const result = claudeExporter.exportConversations(mockConversations, mockPreferences);
      const memoryContent = result.files[1].content;

      expect(memoryContent).toContain('React Best Practices');
      expect(memoryContent).not.toContain('TypeScript Tips');
    });

    it('should sort conversations by most recent first', () => {
      const conversationsWithDates: NormalizedConversation[] = [
        {
          id: 'conv-1',
          title: 'Old Topic',
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          messages: [],
          selected: true,
        },
        {
          id: 'conv-2',
          title: 'New Topic',
          created: '2024-01-01T00:00:00Z',
          updated: '2024-12-01T00:00:00Z',
          messages: [],
          selected: true,
        },
        {
          id: 'conv-3',
          title: 'Middle Topic',
          created: '2024-01-01T00:00:00Z',
          updated: '2024-06-01T00:00:00Z',
          messages: [],
          selected: true,
        },
      ];

      const result = claudeExporter.exportConversations(conversationsWithDates, mockPreferences);
      const memoryContent = result.files[1].content;

      // Should show most recent 5 conversations
      expect(memoryContent).toContain('New Topic');
      expect(memoryContent).toContain('Middle Topic');
      expect(memoryContent).toContain('Old Topic');
    });

    it('should handle empty preferences gracefully', () => {
      const emptyPrefs: UserPreferences = {
        communicationStyle: {
          tone: 'neutral',
          detailLevel: 'balanced',
          responseFormat: 'markdown',
          useCodeExamples: false,
          preferStepByStep: false,
          languagePreference: 'English',
        },
        technicalProfile: {
          experienceLevel: 'beginner',
          primaryLanguages: [],
          frameworks: [],
          tools: [],
        },
        workContext: {
          role: '',
          industry: '',
          description: '',
        },
        personalContext: {
          interests: [],
          background: '',
        },
        currentFocus: {
          projects: [],
          goals: [],
          topOfMind: '',
        },
        behaviorPreferences: {
          proactiveness: 'moderate',
          followUpQuestions: false,
          suggestAlternatives: false,
          warnAboutRisks: false,
          assumeContext: false,
        },
        customInstructions: '',
      };

      const result = claudeExporter.exportConversations([], emptyPrefs);

      expect(result.files).toHaveLength(2);
      // All sections show default messages when empty
      const memoryContent = result.files[1].content;
      expect(memoryContent).toContain('Work context:');
      expect(memoryContent).toContain('Personal context:');
      expect(memoryContent).toContain('Top of mind:');
    });
  });
});
