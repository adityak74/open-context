import { describe, it, expect, beforeEach } from 'vitest';
import { MarkdownFormatter } from '../../src/formatters/markdown';
import type { NormalizedConversation, NormalizedMessage } from '../../src/parsers/types';

describe('MarkdownFormatter', () => {
  let formatter: MarkdownFormatter;

  beforeEach(() => {
    formatter = new MarkdownFormatter();
  });

  describe('formatConversation', () => {
    it('formats a conversation with header and metadata', () => {
      const conversation = createConversation('Test Chat', [
        createMessage('user', 'Hello!'),
        createMessage('assistant', 'Hi there!'),
      ]);

      const result = formatter.formatConversation(conversation);

      expect(result).toContain('# Test Chat');
      expect(result).toContain('**Created:**');
      expect(result).toContain('**Last Updated:**');
      expect(result).toContain('**Messages:** 2');
      expect(result).toContain('## User');
      expect(result).toContain('Hello!');
      expect(result).toContain('## Assistant');
      expect(result).toContain('Hi there!');
    });

    it('includes footer', () => {
      const conversation = createConversation('Test', [
        createMessage('user', 'Hello'),
      ]);

      const result = formatter.formatConversation(conversation);
      expect(result).toContain('*Exported from ChatGPT via context-swapper*');
    });

    it('includes separator between metadata and messages', () => {
      const conversation = createConversation('Test', [
        createMessage('user', 'Hello'),
      ]);

      const result = formatter.formatConversation(conversation);
      expect(result).toContain('---');
    });

    it('escapes markdown special characters in title', () => {
      const conversation = createConversation('Test #1 with *bold* and _underline_', [
        createMessage('user', 'Hello'),
      ]);

      const result = formatter.formatConversation(conversation);
      expect(result).toContain('\\#');
      expect(result).toContain('\\*');
      expect(result).toContain('\\_');
    });

    it('formats messages with images', () => {
      const msg = createMessage('user', 'Check this');
      msg.images = ['file://image1.png', 'file://image2.jpg'];

      const conversation = createConversation('Test', [msg]);
      const result = formatter.formatConversation(conversation);

      expect(result).toContain('[Image: file://image1.png]');
      expect(result).toContain('[Image: file://image2.jpg]');
    });

    it('formats messages with attachments', () => {
      const msg = createMessage('user', 'See attached');
      msg.metadata = { attachments: ['doc.pdf', 'data.csv'] };

      const conversation = createConversation('Test', [msg]);
      const result = formatter.formatConversation(conversation);

      expect(result).toContain('[Attachment: doc.pdf]');
      expect(result).toContain('[Attachment: data.csv]');
    });

    it('includes model info for assistant messages', () => {
      const msg = createMessage('assistant', 'Response');
      msg.metadata = { model: 'gpt-4' };

      const conversation = createConversation('Test', [msg]);
      const result = formatter.formatConversation(conversation);

      expect(result).toContain('*Model: gpt-4*');
    });

    it('does not include model info for user messages', () => {
      const msg = createMessage('user', 'Question');
      msg.metadata = { model: 'gpt-4' };

      const conversation = createConversation('Test', [msg]);
      const result = formatter.formatConversation(conversation);

      expect(result).not.toContain('*Model: gpt-4*');
    });

    it('handles system role label', () => {
      const conversation = createConversation('Test', [
        createMessage('system', 'You are helpful'),
      ]);

      const result = formatter.formatConversation(conversation);
      expect(result).toContain('## System');
    });

    it('handles unknown role label', () => {
      const msg = createMessage('user', 'Test');
      (msg as any).role = 'unknown';

      const conversation = createConversation('Test', [msg]);
      const result = formatter.formatConversation(conversation);

      expect(result).toContain('## Unknown');
    });

    it('handles empty message content', () => {
      const conversation = createConversation('Test', [
        createMessage('user', ''),
      ]);

      const result = formatter.formatConversation(conversation);
      expect(result).toContain('## User');
    });
  });

  describe('formatIndex', () => {
    it('generates conversation index', () => {
      const conversations = [
        createConversation('First Chat', [createMessage('user', 'Hi')]),
        createConversation('Second Chat', [createMessage('user', 'Hello')]),
      ];

      const result = formatter.formatIndex(conversations);

      expect(result).toContain('# Conversation Index');
      expect(result).toContain('Total conversations: 2');
      expect(result).toContain('### 1. First Chat');
      expect(result).toContain('### 2. Second Chat');
      expect(result).toContain('**File:**');
      expect(result).toContain('**Created:**');
      expect(result).toContain('**Messages:**');
    });

    it('handles empty conversations list', () => {
      const result = formatter.formatIndex([]);

      expect(result).toContain('# Conversation Index');
      expect(result).toContain('Total conversations: 0');
    });

    it('escapes markdown in conversation titles', () => {
      const conversations = [
        createConversation('Test #1 *important*', [createMessage('user', 'Hi')]),
      ];

      const result = formatter.formatIndex(conversations);
      expect(result).toContain('\\#');
      expect(result).toContain('\\*');
    });
  });

  describe('generateFilename', () => {
    it('generates padded index with sanitized title', () => {
      expect(formatter.generateFilename(1, 'Hello World')).toBe('001-hello-world.md');
    });

    it('pads index with zeros', () => {
      expect(formatter.generateFilename(42, 'Test')).toBe('042-test.md');
    });

    it('removes special characters from title', () => {
      expect(formatter.generateFilename(1, 'Hello! @World #2024')).toBe('001-hello-world-2024.md');
    });

    it('truncates long titles to 50 chars', () => {
      const longTitle = 'This is a very long conversation title that exceeds fifty characters easily';
      const result = formatter.generateFilename(1, longTitle);
      const nameWithoutIndex = result.replace('001-', '').replace('.md', '');
      expect(nameWithoutIndex.length).toBeLessThanOrEqual(50);
    });

    it('handles empty title', () => {
      expect(formatter.generateFilename(1, '')).toBe('001-.md');
    });

    it('removes leading and trailing hyphens from sanitized title', () => {
      expect(formatter.generateFilename(1, '---Test---')).toBe('001-test.md');
    });
  });
});

function createConversation(
  title: string,
  messages: NormalizedMessage[]
): NormalizedConversation {
  return {
    id: 'conv-test',
    title,
    created: new Date('2024-01-15'),
    updated: new Date('2024-01-16'),
    messages,
  };
}

function createMessage(
  role: 'user' | 'assistant' | 'system',
  content: string
): NormalizedMessage {
  return {
    role,
    content,
    timestamp: new Date('2024-01-15T10:00:00Z'),
  };
}
