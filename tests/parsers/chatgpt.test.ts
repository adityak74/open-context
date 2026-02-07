import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ChatGPTParser } from '../../src/parsers/chatgpt';
import type { Message, MessageNode } from '../../src/parsers/types';

describe('ChatGPTParser', () => {
  let parser: ChatGPTParser;
  let testDir: string;

  beforeEach(() => {
    parser = new ChatGPTParser();
    testDir = join(tmpdir(), `chatgpt-parser-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('parseConversations', () => {
    it('parses array format conversations.json', () => {
      const data = [
        {
          conversation_id: 'conv1',
          title: 'Test Conversation',
          create_time: 1700000000,
          update_time: 1700001000,
          mapping: {},
          current_node: 'node1',
          moderation_results: [],
          plugin_ids: null,
          conversation_template_id: null,
          gizmo_id: null,
          is_archived: false,
          safe_urls: [],
        },
      ];
      const filePath = join(testDir, 'conversations.json');
      writeFileSync(filePath, JSON.stringify(data));

      const result = parser.parseConversations(filePath);
      expect(result).toHaveLength(1);
      expect(result[0].conversation_id).toBe('conv1');
      expect(result[0].title).toBe('Test Conversation');
    });

    it('parses object format with conversations property', () => {
      const data = {
        conversations: [
          {
            conversation_id: 'conv2',
            title: 'Object Format',
            create_time: 1700000000,
            update_time: 1700001000,
            mapping: {},
            current_node: 'node1',
            moderation_results: [],
            plugin_ids: null,
            conversation_template_id: null,
            gizmo_id: null,
            is_archived: false,
            safe_urls: [],
          },
        ],
      };
      const filePath = join(testDir, 'conversations.json');
      writeFileSync(filePath, JSON.stringify(data));

      const result = parser.parseConversations(filePath);
      expect(result).toHaveLength(1);
      expect(result[0].conversation_id).toBe('conv2');
    });

    it('throws error for invalid format', () => {
      const filePath = join(testDir, 'conversations.json');
      writeFileSync(filePath, JSON.stringify({ invalid: 'format' }));

      expect(() => parser.parseConversations(filePath)).toThrow(
        'Failed to parse conversations.json: Invalid conversations.json format'
      );
    });

    it('throws error for invalid JSON', () => {
      const filePath = join(testDir, 'conversations.json');
      writeFileSync(filePath, 'not json content');

      expect(() => parser.parseConversations(filePath)).toThrow('Failed to parse conversations.json');
    });

    it('throws error when file does not exist', () => {
      expect(() => parser.parseConversations('/nonexistent/file.json')).toThrow();
    });
  });

  describe('walkMessageTree', () => {
    it('returns messages in BFS order', () => {
      const mapping: Record<string, MessageNode> = {
        root: {
          id: 'root',
          message: null,
          parent: null,
          children: ['msg1'],
        },
        msg1: {
          id: 'msg1',
          message: createMessage('msg1', 'user', 'Hello'),
          parent: 'root',
          children: ['msg2'],
        },
        msg2: {
          id: 'msg2',
          message: createMessage('msg2', 'assistant', 'Hi there'),
          parent: 'msg1',
          children: [],
        },
      };

      const result = parser.walkMessageTree(mapping);
      expect(result).toHaveLength(2);
      expect(result[0].author.role).toBe('user');
      expect(result[1].author.role).toBe('assistant');
    });

    it('returns empty array when no root node found', () => {
      const mapping: Record<string, MessageNode> = {
        node1: {
          id: 'node1',
          message: createMessage('node1', 'user', 'Hello'),
          parent: 'some-parent',
          children: [],
        },
      };

      const result = parser.walkMessageTree(mapping);
      expect(result).toHaveLength(0);
    });

    it('skips nodes without messages', () => {
      const mapping: Record<string, MessageNode> = {
        root: {
          id: 'root',
          message: null,
          parent: null,
          children: ['msg1'],
        },
        msg1: {
          id: 'msg1',
          message: createMessage('msg1', 'user', 'Hello'),
          parent: 'root',
          children: [],
        },
      };

      const result = parser.walkMessageTree(mapping);
      expect(result).toHaveLength(1);
    });

    it('skips system messages', () => {
      const mapping: Record<string, MessageNode> = {
        root: {
          id: 'root',
          message: null,
          parent: null,
          children: ['sys', 'msg1'],
        },
        sys: {
          id: 'sys',
          message: createMessage('sys', 'system', 'System prompt'),
          parent: 'root',
          children: [],
        },
        msg1: {
          id: 'msg1',
          message: createMessage('msg1', 'user', 'Hello'),
          parent: 'root',
          children: [],
        },
      };

      const result = parser.walkMessageTree(mapping);
      expect(result).toHaveLength(1);
      expect(result[0].author.role).toBe('user');
    });

    it('handles missing nodes in children gracefully', () => {
      const mapping: Record<string, MessageNode> = {
        root: {
          id: 'root',
          message: null,
          parent: null,
          children: ['msg1', 'nonexistent'],
        },
        msg1: {
          id: 'msg1',
          message: createMessage('msg1', 'user', 'Hello'),
          parent: 'root',
          children: [],
        },
      };

      const result = parser.walkMessageTree(mapping);
      expect(result).toHaveLength(1);
    });

    it('handles messages with no content', () => {
      const mapping: Record<string, MessageNode> = {
        root: {
          id: 'root',
          message: null,
          parent: null,
          children: ['msg1'],
        },
        msg1: {
          id: 'msg1',
          message: {
            id: 'msg1',
            author: { role: 'user' },
            create_time: 1700000000,
            content: { content_type: 'text', parts: [] },
            status: 'finished',
            weight: 1,
            metadata: {},
            recipient: 'all',
          },
          parent: 'root',
          children: [],
        },
      };

      const result = parser.walkMessageTree(mapping);
      expect(result).toHaveLength(0);
    });

    it('handles messages with null content', () => {
      const mapping: Record<string, MessageNode> = {
        root: {
          id: 'root',
          message: null,
          parent: null,
          children: ['msg1'],
        },
        msg1: {
          id: 'msg1',
          message: {
            id: 'msg1',
            author: { role: 'user' },
            create_time: 1700000000,
            content: null as any,
            status: 'finished',
            weight: 1,
            metadata: {},
            recipient: 'all',
          },
          parent: 'root',
          children: [],
        },
      };

      const result = parser.walkMessageTree(mapping);
      expect(result).toHaveLength(0);
    });

    it('handles message with text content type', () => {
      const mapping: Record<string, MessageNode> = {
        root: {
          id: 'root',
          message: null,
          parent: null,
          children: ['msg1'],
        },
        msg1: {
          id: 'msg1',
          message: {
            id: 'msg1',
            author: { role: 'user' },
            create_time: 1700000000,
            content: { content_type: 'text', text: 'Hello text' },
            status: 'finished',
            weight: 1,
            metadata: {},
            recipient: 'all',
          },
          parent: 'root',
          children: [],
        },
      };

      const result = parser.walkMessageTree(mapping);
      expect(result).toHaveLength(1);
    });

    it('does not revisit visited nodes (handles cycles)', () => {
      const mapping: Record<string, MessageNode> = {
        root: {
          id: 'root',
          message: null,
          parent: null,
          children: ['msg1'],
        },
        msg1: {
          id: 'msg1',
          message: createMessage('msg1', 'user', 'Hello'),
          parent: 'root',
          children: ['root'], // circular reference
        },
      };

      const result = parser.walkMessageTree(mapping);
      expect(result).toHaveLength(1);
    });
  });

  describe('extractTextContent', () => {
    it('extracts text from text field', () => {
      const message = createMessage('m1', 'user', '');
      message.content = { content_type: 'text', text: 'Direct text' };

      const result = parser.extractTextContent(message);
      expect(result).toBe('Direct text');
    });

    it('extracts text from parts array', () => {
      const message = createMessage('m1', 'user', 'Hello');

      const result = parser.extractTextContent(message);
      expect(result).toBe('Hello');
    });

    it('joins multiple string parts with newlines', () => {
      const message = createMessage('m1', 'user', '');
      message.content = { content_type: 'text', parts: ['Part 1', 'Part 2'] };

      const result = parser.extractTextContent(message);
      expect(result).toBe('Part 1\nPart 2');
    });

    it('filters out non-string parts (images)', () => {
      const message = createMessage('m1', 'user', '');
      message.content = {
        content_type: 'multimodal_text',
        parts: [
          'Text part',
          { asset_pointer: 'file://image.png', content_type: 'image/png' } as any,
        ],
      };

      const result = parser.extractTextContent(message);
      expect(result).toBe('Text part');
    });

    it('returns empty string when no content', () => {
      const message = createMessage('m1', 'user', '');
      message.content = { content_type: 'text' };

      const result = parser.extractTextContent(message);
      expect(result).toBe('');
    });
  });

  describe('extractImages', () => {
    it('extracts images from parts', () => {
      const message = createMessage('m1', 'user', '');
      message.content = {
        content_type: 'multimodal_text',
        parts: [
          'Some text',
          { asset_pointer: 'file://image1.png' } as any,
          { asset_pointer: 'file://image2.jpg' } as any,
        ],
      };

      const result = parser.extractImages(message);
      expect(result).toEqual(['file://image1.png', 'file://image2.jpg']);
    });

    it('extracts images from attachments', () => {
      const message = createMessage('m1', 'user', '');
      message.metadata = {
        attachments: [
          { id: 'att1', name: 'photo.png', size: 100, mimeType: 'image/png' },
          { id: 'att2', name: 'doc.pdf', size: 200, mimeType: 'application/pdf' },
        ],
      };

      const result = parser.extractImages(message);
      expect(result).toEqual(['att1']);
    });

    it('returns empty array when no images', () => {
      const message = createMessage('m1', 'user', 'Text only');

      const result = parser.extractImages(message);
      expect(result).toEqual([]);
    });

    it('handles both parts images and attachment images', () => {
      const message = createMessage('m1', 'user', '');
      message.content = {
        content_type: 'multimodal_text',
        parts: [{ asset_pointer: 'file://part-image.png' } as any],
      };
      message.metadata = {
        attachments: [{ id: 'att1', name: 'photo.png', size: 100, mimeType: 'image/jpeg' }],
      };

      const result = parser.extractImages(message);
      expect(result).toEqual(['file://part-image.png', 'att1']);
    });

    it('handles missing parts', () => {
      const message = createMessage('m1', 'user', '');
      message.content = { content_type: 'text' };

      const result = parser.extractImages(message);
      expect(result).toEqual([]);
    });
  });
});

function createMessage(
  id: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  text: string
): Message {
  return {
    id,
    author: { role },
    create_time: 1700000000,
    content: {
      content_type: 'text',
      parts: text ? [text] : [],
    },
    status: 'finished_successfully',
    weight: 1,
    metadata: {},
    recipient: 'all',
  };
}
