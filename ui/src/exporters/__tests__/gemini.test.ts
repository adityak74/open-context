import { describe, it, expect } from 'vitest';
import { geminiExporter } from '../gemini';
import type { UserPreferences, NormalizedConversation } from '../../types/preferences';

describe('geminiExporter', () => {
  const mockPreferences: UserPreferences = {
    communicationStyle: {
      tone: 'formal',
      detailLevel: 'thorough',
      responseFormat: 'structured',
      useCodeExamples: true,
      preferStepByStep: true,
      languagePreference: 'English',
    },
    technicalProfile: {
      experienceLevel: 'intermediate',
      primaryLanguages: ['Python', 'Go'],
      frameworks: ['FastAPI', 'Gin'],
      tools: ['Kubernetes', 'PostgreSQL'],
    },
    workContext: {
      role: 'DevOps Engineer',
      industry: 'Cloud Services',
      description: 'Managing infrastructure at scale',
    },
    personalContext: {
      interests: ['Automation', 'Cloud Native'],
      background: 'Former sysadmin transitioning to SRE',
    },
    currentFocus: {
      projects: ['CI/CD Pipeline', 'Monitoring Stack'],
      goals: ['Achieve 99.99% uptime', 'Reduce MTTR'],
      topOfMind: 'Observability best practices',
    },
    behaviorPreferences: {
      proactiveness: 'proactive',
      followUpQuestions: true,
      suggestAlternatives: true,
      warnAboutRisks: true,
      assumeContext: false,
    },
    customInstructions: 'Focus on production-ready examples.',
  };

  const mockConversations: NormalizedConversation[] = [
    {
      id: 'conv-1',
      title: 'Terraform Best Practices',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-05T00:00:00Z',
      messages: [],
      selected: true,
    },
    {
      id: 'conv-2',
      title: 'Kubernetes Troubleshooting',
      created: '2024-01-02T00:00:00Z',
      updated: '2024-01-06T00:00:00Z',
      messages: [],
      selected: true,
    },
    {
      id: 'conv-3',
      title: 'Not Selected',
      created: '2024-01-03T00:00:00Z',
      updated: '2024-01-07T00:00:00Z',
      messages: [],
      selected: false,
    },
  ];

  describe('info', () => {
    it('should have correct vendor info', () => {
      expect(geminiExporter.info).toEqual({
        id: 'gemini',
        name: 'Google Gemini',
        description: 'Export as Gemini Gems / custom instructions',
        supportsPreferences: true,
        supportsMemory: true,
        supportsConversationImport: false,
      });
    });
  });

  describe('exportPreferences', () => {
    it('should return a single instructions file', () => {
      const result = geminiExporter.exportPreferences(mockPreferences);

      expect(result.vendorId).toBe('gemini');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBe('gemini-instructions.txt');
      expect(result.files[0].description).toBe('Custom instructions for Google Gemini');
    });

    it('should include About me section', () => {
      const result = geminiExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('About me:');
      expect(content).toContain('DevOps Engineer');
      expect(content).toContain('Cloud Services');
      expect(content).toContain('infrastructure at scale');
    });

    it('should include technical profile', () => {
      const result = geminiExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Technical level: intermediate');
      expect(content).toContain('Languages: Python, Go');
      expect(content).toContain('Frameworks: FastAPI, Gin');
    });

    it('should include personal context', () => {
      const result = geminiExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Former sysadmin transitioning to SRE');
      // Note: Personal interests are not included in gemini exporter output
    });

    it('should include Current focus section', () => {
      const result = geminiExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Current focus:');
      expect(content).toContain('Projects: CI/CD Pipeline, Monitoring Stack');
      expect(content).toContain('Goals: Achieve 99.99% uptime, Reduce MTTR');
      expect(content).toContain('Observability best practices');
    });

    it('should include Response style section', () => {
      const result = geminiExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Response style:');
      expect(content).toContain('Tone: formal');
      expect(content).toContain('Detail: thorough');
      expect(content).toContain('Include code examples');
      expect(content).toContain('Use step-by-step format');
      expect(content).toContain('Suggest alternatives');
      expect(content).toContain('Flag risks');
    });

    it('should include Additional instructions section', () => {
      const result = geminiExporter.exportPreferences(mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Additional instructions:');
      expect(content).toContain('Focus on production-ready examples.');
    });

    it('should handle all tone styles correctly', () => {
      const tones = [
        { tone: 'formal' as const, expected: 'Tone: formal' },
        { tone: 'casual' as const, expected: 'Tone: casual' },
        { tone: 'neutral' as const, expected: 'Tone: neutral' },
        { tone: 'friendly' as const, expected: 'Tone: friendly' },
        { tone: 'professional' as const, expected: 'Tone: professional' },
      ];

      tones.forEach(({ tone, expected }) => {
        const prefs = {
          ...mockPreferences,
          communicationStyle: { ...mockPreferences.communicationStyle, tone },
        };
        const result = geminiExporter.exportPreferences(prefs);
        expect(result.files[0].content).toContain(expected);
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

      const result = geminiExporter.exportPreferences(emptyPrefs);

      expect(result.files).toHaveLength(1);
      const content = result.files[0].content;
      expect(content).toContain('Response style:');
      expect(content).toContain('Tone: neutral');
      expect(content).toContain('Detail: balanced');
      // About me is included when experience level is present
      expect(content).toContain('About me:');
      // Current focus section is not included when all fields are empty
      expect(content).not.toContain('Current focus:');
      expect(content).not.toContain('Additional instructions:');
    });
  });

  describe('exportConversations', () => {
    it('should include selected conversations in Current focus', () => {
      const result = geminiExporter.exportConversations(mockConversations, mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Recent topics:');
      expect(content).toContain('Kubernetes Troubleshooting');
      expect(content).toContain('Terraform Best Practices');
      expect(content).not.toContain('Not Selected');
    });

    it('should sort conversations by most recent and limit to 3', () => {
      const manyConversations: NormalizedConversation[] = [
        {
          id: 'conv-1',
          title: 'First',
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

      const result = geminiExporter.exportConversations(manyConversations, mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Fourth');
      expect(content).toContain('Third');
      expect(content).toContain('Second');
      expect(content).not.toContain('First');
    });

    it('should include all sections when exporting with conversations', () => {
      const result = geminiExporter.exportConversations(mockConversations, mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('About me:');
      expect(content).toContain('Current focus:');
      expect(content).toContain('Response style:');
      expect(content).toContain('Additional instructions:');
      expect(content).toContain('Recent topics:');
    });

    it('should handle empty conversations array', () => {
      const result = geminiExporter.exportConversations([], mockPreferences);
      const content = result.files[0].content;

      expect(content).toContain('Current focus:');
      expect(content).toContain('Projects: CI/CD Pipeline, Monitoring Stack');
      expect(content).not.toContain('Recent topics:');
    });
  });
});
