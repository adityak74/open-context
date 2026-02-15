import { describe, it, expect } from 'vitest';
import { chatgptExporter } from '../chatgpt';
import type { UserPreferences, NormalizedConversation } from '../../types/preferences';

describe('chatgptExporter', () => {
  const mockPreferences: UserPreferences = {
    communicationStyle: {
      tone: 'professional',
      detailLevel: 'concise',
      responseFormat: 'plain',
      useCodeExamples: true,
      preferStepByStep: true,
      languagePreference: 'English',
    },
    technicalProfile: {
      experienceLevel: 'expert',
      primaryLanguages: ['JavaScript', 'Rust'],
      frameworks: ['Next.js', 'Axum'],
      tools: ['Git', 'Docker'],
    },
    workContext: {
      role: 'Senior Developer',
      industry: 'Fintech',
      description: 'Leading a team of 5 engineers',
    },
    personalContext: {
      interests: ['Blockchain', 'System Design'],
      background: 'Former backend engineer turned full-stack',
    },
    currentFocus: {
      projects: ['Payment Gateway', 'API Redesign'],
      goals: ['Scale to 1M users', 'Reduce latency'],
      topOfMind: 'Security best practices',
    },
    behaviorPreferences: {
      proactiveness: 'minimal',
      followUpQuestions: true,
      suggestAlternatives: true,
      warnAboutRisks: true,
      assumeContext: false,
    },
    customInstructions: 'Always use TypeScript examples when possible.',
  };

  const mockConversations: NormalizedConversation[] = [
    {
      id: 'conv-1',
      title: 'Database Optimization',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-02T00:00:00Z',
      messages: [],
      selected: true,
    },
    {
      id: 'conv-2',
      title: 'API Design Patterns',
      created: '2024-01-03T00:00:00Z',
      updated: '2024-01-04T00:00:00Z',
      messages: [],
      selected: true,
    },
    {
      id: 'conv-3',
      title: 'Old Conversation',
      created: '2024-01-05T00:00:00Z',
      updated: '2024-01-05T00:00:00Z',
      messages: [],
      selected: false,
    },
  ];

  describe('info', () => {
    it('should have correct vendor info', () => {
      expect(chatgptExporter.info).toEqual({
        id: 'chatgpt',
        name: 'ChatGPT',
        description: 'Export as ChatGPT custom instructions',
        supportsPreferences: true,
        supportsMemory: true,
        supportsConversationImport: false,
      });
    });
  });

  describe('exportPreferences', () => {
    it('should return two files (what-to-know and how-to-respond)', () => {
      const result = chatgptExporter.exportPreferences(mockPreferences);

      expect(result.vendorId).toBe('chatgpt');
      expect(result.files).toHaveLength(2);
      expect(result.files[0].filename).toBe('chatgpt-what-to-know.txt');
      expect(result.files[1].filename).toBe('chatgpt-how-to-respond.txt');
    });

    it('should include work context in what-to-know', () => {
      const result = chatgptExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Senior Developer');
      expect(content).toContain('Fintech');
      expect(content).toContain('Leading a team');
    });

    it('should include technical profile in what-to-know', () => {
      const result = chatgptExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('expert');
      expect(content).toContain('JavaScript');
      expect(content).toContain('Rust');
      expect(content).toContain('Next.js');
    });

    it('should include personal context in what-to-know', () => {
      const result = chatgptExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Blockchain');
      expect(content).toContain('System Design');
      expect(content).toContain('Former backend engineer');
    });

    it('should include current focus in what-to-know', () => {
      const result = chatgptExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Payment Gateway');
      expect(content).toContain('Scale to 1M users');
      expect(content).toContain('Security best practices');
    });

    it('should include communication style in how-to-respond', () => {
      const result = chatgptExporter.exportPreferences(mockPreferences);
      const content = result.files[1].content;

      expect(content).toContain('precise and business-oriented');
      expect(content).toContain('concise and to the point');
    });

    it('should include behavior preferences in how-to-respond', () => {
      const result = chatgptExporter.exportPreferences(mockPreferences);
      const content = result.files[1].content;

      expect(content).toContain('code examples');
      expect(content).toContain('step-by-step');
      expect(content).toContain('follow-up questions');
      expect(content).toContain('alternative approaches');
      expect(content).toContain('potential risks');
      expect(content).toContain('Only answer what I specifically ask');
    });

    it('should include custom instructions in how-to-respond', () => {
      const result = chatgptExporter.exportPreferences(mockPreferences);
      const content = result.files[1].content;

      expect(content).toContain('Always use TypeScript examples when possible.');
    });

    it('should handle all tone styles correctly', () => {
      const tones = [
        { tone: 'formal' as const, expected: 'formal, professional' },
        { tone: 'casual' as const, expected: 'casual, conversational' },
        { tone: 'neutral' as const, expected: 'clear, neutral' },
        { tone: 'friendly' as const, expected: 'warm and approachable' },
        { tone: 'professional' as const, expected: 'precise and business-oriented' },
      ];

      tones.forEach(({ tone, expected }) => {
        const prefs = {
          ...mockPreferences,
          communicationStyle: { ...mockPreferences.communicationStyle, tone },
        };
        const result = chatgptExporter.exportPreferences(prefs);
        expect(result.files[1].content).toContain(expected);
      });
    });

    it('should handle all detail levels correctly', () => {
      const details = [
        { level: 'concise' as const, expected: 'concise and to the point' },
        { level: 'balanced' as const, expected: 'thorough but not verbose' },
        { level: 'thorough' as const, expected: 'detailed, comprehensive explanations' },
      ];

      details.forEach(({ level, expected }) => {
        const prefs = {
          ...mockPreferences,
          communicationStyle: { ...mockPreferences.communicationStyle, detailLevel: level },
        };
        const result = chatgptExporter.exportPreferences(prefs);
        expect(result.files[1].content).toContain(expected);
      });
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

      const result = chatgptExporter.exportPreferences(emptyPrefs);

      expect(result.files).toHaveLength(2);
      // what-to-know includes technical experience level even when empty
      expect(result.files[0].content).toContain('My technical experience level is beginner');
      expect(result.files[1].content).toContain('clear, neutral');
    });
  });

  describe('exportConversations', () => {
    it('should include selected conversations in what-to-know', () => {
      const result = chatgptExporter.exportConversations(mockConversations, mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Recent topics');
      expect(content).toContain('API Design Patterns');
      expect(content).toContain('Database Optimization');
      expect(content).not.toContain('Old Conversation');
    });

    it('should sort conversations by most recent and limit to 3', () => {
      const manyConversations: NormalizedConversation[] = [
        {
          id: 'conv-1',
          title: 'Oldest',
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          messages: [],
          selected: true,
        },
        {
          id: 'conv-2',
          title: 'Second',
          created: '2024-01-01T00:00:00Z',
          updated: '2024-02-01T00:00:00Z',
          messages: [],
          selected: true,
        },
        {
          id: 'conv-3',
          title: 'Third',
          created: '2024-01-01T00:00:00Z',
          updated: '2024-03-01T00:00:00Z',
          messages: [],
          selected: true,
        },
        {
          id: 'conv-4',
          title: 'Fourth',
          created: '2024-01-01T00:00:00Z',
          updated: '2024-04-01T00:00:00Z',
          messages: [],
          selected: true,
        },
      ];

      const result = chatgptExporter.exportConversations(manyConversations, mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Fourth');
      expect(content).toContain('Third');
      expect(content).toContain('Second');
      expect(content).not.toContain('Oldest');
    });

    it('should include how-to-respond file unchanged', () => {
      const result = chatgptExporter.exportConversations(mockConversations, mockPreferences);

      expect(result.files[1].filename).toBe('chatgpt-how-to-respond.txt');
      expect(result.files[1].content).toContain('precise and business-oriented');
    });
  });
});
