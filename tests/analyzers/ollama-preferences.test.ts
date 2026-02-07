import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OllamaPreferenceAnalyzer } from '../../src/analyzers/ollama-preferences';
import type { NormalizedConversation } from '../../src/parsers/types';

// Mock the ollama module
vi.mock('ollama', () => {
  const OllamaMock = class {
    list: ReturnType<typeof vi.fn>;
    generate: ReturnType<typeof vi.fn>;
    constructor() {
      this.list = vi.fn();
      this.generate = vi.fn();
    }
  };
  return { Ollama: OllamaMock };
});

describe('OllamaPreferenceAnalyzer', () => {
  let analyzer: OllamaPreferenceAnalyzer;

  beforeEach(() => {
    analyzer = new OllamaPreferenceAnalyzer('test-model', 'http://localhost:11434');
  });

  describe('constructor', () => {
    it('creates instance with default parameters', () => {
      const defaultAnalyzer = new OllamaPreferenceAnalyzer();
      expect(defaultAnalyzer).toBeInstanceOf(OllamaPreferenceAnalyzer);
    });

    it('creates instance with custom parameters', () => {
      const customAnalyzer = new OllamaPreferenceAnalyzer('custom-model', 'http://custom:1234');
      expect(customAnalyzer).toBeInstanceOf(OllamaPreferenceAnalyzer);
    });
  });

  describe('analyzePreferences', () => {
    it('throws error when Ollama is not available', async () => {
      const conversations = createSampleConversations(2);

      // Access private ollama instance and mock list to throw
      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(analyzer.analyzePreferences(conversations)).rejects.toThrow(
        'Ollama analysis failed'
      );
    });

    it('throws error when model is not found', async () => {
      const conversations = createSampleConversations(2);

      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockResolvedValue({ models: [{ name: 'other-model' }] });

      await expect(analyzer.analyzePreferences(conversations)).rejects.toThrow(
        "Model 'test-model' not found"
      );
    });

    it('returns generated preferences when successful', async () => {
      const conversations = createSampleConversations(2);

      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockResolvedValue({
        models: [{ name: 'test-model' }],
      });
      ollamaInstance.generate.mockResolvedValue({
        response: 'I prefer clear explanations.',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await analyzer.analyzePreferences(conversations);
      consoleSpy.mockRestore();

      expect(result).toBe('I prefer clear explanations.');
    });

    it('returns fallback text when response is empty', async () => {
      const conversations = createSampleConversations(1);

      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockResolvedValue({
        models: [{ name: 'test-model' }],
      });
      ollamaInstance.generate.mockResolvedValue({ response: '' });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await analyzer.analyzePreferences(conversations);
      consoleSpy.mockRestore();

      expect(result).toBe('No preferences generated.');
    });

    it('wraps non-Error exceptions', async () => {
      const conversations = createSampleConversations(1);

      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockRejectedValue('string error');

      await expect(analyzer.analyzePreferences(conversations)).rejects.toThrow(
        'Failed to connect to Ollama'
      );
    });

    it('re-throws non-Error from generate call', async () => {
      const conversations = createSampleConversations(1);

      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockResolvedValue({
        models: [{ name: 'test-model' }],
      });
      ollamaInstance.generate.mockRejectedValue(42);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await expect(analyzer.analyzePreferences(conversations)).rejects.toBe(42);
      consoleSpy.mockRestore();
    });
  });

  describe('analyzeMemory', () => {
    it('throws error when Ollama is not available', async () => {
      const conversations = createSampleConversations(2);

      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(analyzer.analyzeMemory(conversations)).rejects.toThrow(
        'Ollama memory generation failed'
      );
    });

    it('returns generated memory when successful', async () => {
      const conversations = createSampleConversations(2);

      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockResolvedValue({
        models: [{ name: 'test-model' }],
      });
      ollamaInstance.generate.mockResolvedValue({
        response: 'Work context: User is a developer.',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await analyzer.analyzeMemory(conversations);
      consoleSpy.mockRestore();

      expect(result).toBe('Work context: User is a developer.');
    });

    it('returns fallback text when response is empty', async () => {
      const conversations = createSampleConversations(1);

      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockResolvedValue({
        models: [{ name: 'test-model' }],
      });
      ollamaInstance.generate.mockResolvedValue({ response: '' });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await analyzer.analyzeMemory(conversations);
      consoleSpy.mockRestore();

      expect(result).toBe('No memory generated.');
    });

    it('wraps non-Error exceptions', async () => {
      const conversations = createSampleConversations(1);

      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockRejectedValue('string error');

      await expect(analyzer.analyzeMemory(conversations)).rejects.toThrow(
        'Failed to connect to Ollama'
      );
    });

    it('re-throws non-Error from generate call', async () => {
      const conversations = createSampleConversations(1);

      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockResolvedValue({
        models: [{ name: 'test-model' }],
      });
      ollamaInstance.generate.mockRejectedValue(99);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await expect(analyzer.analyzeMemory(conversations)).rejects.toBe(99);
      consoleSpy.mockRestore();
    });
  });

  describe('generateBasicPreferences', () => {
    it('generates basic stats-based preferences', () => {
      const conversations = createSampleConversations(3);
      const result = analyzer.generateBasicPreferences(conversations);

      expect(result).toContain('3 conversations');
      expect(result).toContain('total messages');
      expect(result).toContain('clear, concise explanations');
      expect(result).toContain('Note:');
    });

    it('includes topic keywords from conversation titles', () => {
      const conversations = [
        createConversation('1', 'Docker Container Setup', 2),
        createConversation('2', 'Docker Deployment Guide', 2),
      ];

      const result = analyzer.generateBasicPreferences(conversations);
      expect(result).toContain('docker');
    });

    it('handles empty conversations list', () => {
      const result = analyzer.generateBasicPreferences([]);
      expect(result).toContain('0 conversations');
    });
  });

  describe('generateBasicMemory', () => {
    it('generates basic memory document', () => {
      const conversations = createSampleConversations(3);
      const result = analyzer.generateBasicMemory(conversations);

      expect(result).toContain('Work context:');
      expect(result).toContain('Personal context:');
      expect(result).toContain('Top of mind:');
      expect(result).toContain('Note:');
    });

    it('includes recent conversation titles', () => {
      const conversations = [
        createConversation('1', 'Recent Topic Alpha', 2),
        createConversation('2', 'Recent Topic Beta', 2),
      ];

      const result = analyzer.generateBasicMemory(conversations);
      expect(result).toContain('Recent Topic');
    });

    it('handles empty conversations list', () => {
      const result = analyzer.generateBasicMemory([]);
      expect(result).toContain('Work context:');
      expect(result).toContain('No recent conversation data available.');
    });

    it('includes topic keywords when available', () => {
      const conversations = [
        createConversation('1', 'Python Programming Tutorial', 2),
        createConversation('2', 'Python Testing Guide', 2),
      ];

      const result = analyzer.generateBasicMemory(conversations);
      expect(result).toContain('python');
    });

    it('handles conversations with no extractable topics', () => {
      const conversations = [
        createConversation('1', 'Hi', 1),
        createConversation('2', 'Ok', 1),
      ];

      const result = analyzer.generateBasicMemory(conversations);
      expect(result).toContain('User background and interests require AI analysis');
    });
  });

  describe('prepareConversationText (via analyzePreferences)', () => {
    it('sorts conversations chronologically', async () => {
      const conversations = [
        createConversation('2', 'Second Chat', 1, new Date('2024-02-01')),
        createConversation('1', 'First Chat', 1, new Date('2024-01-01')),
      ];

      // Access the private method indirectly via the prompt that would be built
      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockResolvedValue({
        models: [{ name: 'test-model' }],
      });
      ollamaInstance.generate.mockImplementation(async (params: any) => {
        // Verify the conversation text has First before Second
        const firstIdx = params.prompt.indexOf('First Chat');
        const secondIdx = params.prompt.indexOf('Second Chat');
        expect(firstIdx).toBeLessThan(secondIdx);
        return { response: 'result' };
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await analyzer.analyzePreferences(conversations);
      consoleSpy.mockRestore();
    });

    it('truncates when exceeding max tokens', async () => {
      // maxTokens is 100000, maxChars = 100000 * 4 = 400000
      // Each conversation needs enough content to eventually exceed this
      const longConversations = [];
      for (let i = 0; i < 200; i++) {
        const conv = createConversation(
          `${i}`,
          `Conversation ${i} about topic`,
          1,
          new Date(`2024-01-${String(i % 28 + 1).padStart(2, '0')}`)
        );
        conv.messages[0].content = 'x'.repeat(5000);
        longConversations.push(conv);
      }

      // Reduce maxTokens to make truncation happen faster
      (analyzer as any).maxTokens = 100; // 100 * 4 = 400 chars max

      const ollamaInstance = (analyzer as any).ollama;
      ollamaInstance.list.mockResolvedValue({
        models: [{ name: 'test-model' }],
      });
      ollamaInstance.generate.mockResolvedValue({ response: 'result' });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await analyzer.analyzePreferences(longConversations);

      // The truncation warning should have been logged
      expect(warnSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});

function createSampleConversations(count: number): NormalizedConversation[] {
  return Array.from({ length: count }, (_, i) =>
    createConversation(
      `conv${i}`,
      `Conversation ${i} about programming`,
      2 + i,
      new Date(`2024-01-${String(i + 1).padStart(2, '0')}`)
    )
  );
}

function createConversation(
  id: string,
  title: string,
  messageCount: number,
  created: Date = new Date('2024-01-01'),
): NormalizedConversation {
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `Message ${i} content`,
    timestamp: new Date(created.getTime() + i * 60000),
  }));

  return {
    id,
    title,
    created,
    updated: new Date(created.getTime() + messageCount * 60000),
    messages,
  };
}
