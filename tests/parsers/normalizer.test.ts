import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationNormalizer } from '../../src/parsers/normalizer';
import type { ChatGPTConversation, NormalizedConversation, MessageNode, Message } from '../../src/parsers/types';

describe('ConversationNormalizer', () => {
  let normalizer: ConversationNormalizer;

  beforeEach(() => {
    normalizer = new ConversationNormalizer();
  });

  describe('normalize', () => {
    it('normalizes a ChatGPT conversation to common format', () => {
      const conversation = createConversation('conv1', 'Test Chat', [
        createMessageNode('root', null, null, ['msg1']),
        createMessageNode('msg1', 'root', createMsg('msg1', 'user', 'Hello'), ['msg2']),
        createMessageNode('msg2', 'msg1', createMsg('msg2', 'assistant', 'Hi there!'), []),
      ]);

      const result = normalizer.normalize(conversation);

      expect(result.id).toBe('conv1');
      expect(result.title).toBe('Test Chat');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hello');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].content).toBe('Hi there!');
    });

    it('uses "Untitled Conversation" when title is empty', () => {
      const conversation = createConversation('conv1', '', [
        createMessageNode('root', null, null, ['msg1']),
        createMessageNode('msg1', 'root', createMsg('msg1', 'user', 'Hello'), []),
      ]);

      const result = normalizer.normalize(conversation);
      expect(result.title).toBe('Untitled Conversation');
    });

    it('converts unix timestamps to Date objects', () => {
      const conversation = createConversation('conv1', 'Test', [
        createMessageNode('root', null, null, []),
      ]);
      conversation.create_time = 1700000000;
      conversation.update_time = 1700001000;

      const result = normalizer.normalize(conversation);
      expect(result.created).toEqual(new Date(1700000000 * 1000));
      expect(result.updated).toEqual(new Date(1700001000 * 1000));
    });

    it('normalizes tool role to assistant', () => {
      const conversation = createConversation('conv1', 'Test', [
        createMessageNode('root', null, null, ['msg1']),
        createMessageNode('msg1', 'root', createMsg('msg1', 'tool', 'Tool output'), []),
      ]);

      const result = normalizer.normalize(conversation);
      expect(result.messages[0].role).toBe('assistant');
    });

    it('normalizes unknown role to assistant (default case)', () => {
      const msg = createMsg('msg1', 'user', 'Test');
      (msg.author as any).role = 'custom_role';
      const conversation = createConversation('conv1', 'Test', [
        createMessageNode('root', null, null, ['msg1']),
        createMessageNode('msg1', 'root', msg, []),
      ]);

      const result = normalizer.normalize(conversation);
      expect(result.messages[0].role).toBe('assistant');
    });

    it('normalizes system role via private method', () => {
      // normalizeRole is private, but we test it directly to cover the 'system' case
      // which is unreachable via normalize() since walkMessageTree filters system messages
      const normalizeRole = (normalizer as any).normalizeRole.bind(normalizer);
      expect(normalizeRole('system')).toBe('system');
      expect(normalizeRole('user')).toBe('user');
      expect(normalizeRole('assistant')).toBe('assistant');
      expect(normalizeRole('tool')).toBe('assistant');
      expect(normalizeRole('unknown')).toBe('assistant');
    });

    it('preserves image references', () => {
      const msg = createMsg('msg1', 'user', '');
      msg.content = {
        content_type: 'multimodal_text',
        parts: [
          'Check this',
          { asset_pointer: 'file://image.png' } as any,
        ],
      };

      const conversation = createConversation('conv1', 'Test', [
        createMessageNode('root', null, null, ['msg1']),
        createMessageNode('msg1', 'root', msg, []),
      ]);

      const result = normalizer.normalize(conversation);
      expect(result.messages[0].images).toEqual(['file://image.png']);
    });

    it('preserves model metadata', () => {
      const msg = createMsg('msg1', 'assistant', 'Response');
      msg.metadata = { model_slug: 'gpt-4' };

      const conversation = createConversation('conv1', 'Test', [
        createMessageNode('root', null, null, ['msg1']),
        createMessageNode('msg1', 'root', msg, []),
      ]);

      const result = normalizer.normalize(conversation);
      expect(result.messages[0].metadata?.model).toBe('gpt-4');
    });

    it('preserves attachment metadata', () => {
      const msg = createMsg('msg1', 'user', 'See attachment');
      msg.metadata = {
        attachments: [
          { id: 'att1', name: 'doc.pdf', size: 1000, mimeType: 'application/pdf' },
        ],
      };

      const conversation = createConversation('conv1', 'Test', [
        createMessageNode('root', null, null, ['msg1']),
        createMessageNode('msg1', 'root', msg, []),
      ]);

      const result = normalizer.normalize(conversation);
      expect(result.messages[0].metadata?.attachments).toEqual(['doc.pdf']);
    });

    it('trims message content', () => {
      const conversation = createConversation('conv1', 'Test', [
        createMessageNode('root', null, null, ['msg1']),
        createMessageNode('msg1', 'root', createMsg('msg1', 'user', '  Hello  '), []),
      ]);

      const result = normalizer.normalize(conversation);
      expect(result.messages[0].content).toBe('Hello');
    });

    it('omits images array when no images present', () => {
      const conversation = createConversation('conv1', 'Test', [
        createMessageNode('root', null, null, ['msg1']),
        createMessageNode('msg1', 'root', createMsg('msg1', 'user', 'Hello'), []),
      ]);

      const result = normalizer.normalize(conversation);
      expect(result.messages[0].images).toBeUndefined();
    });
  });

  describe('isValidConversation', () => {
    it('returns true for conversation with content', () => {
      const normalized: NormalizedConversation = {
        id: 'conv1',
        title: 'Test',
        created: new Date(),
        updated: new Date(),
        messages: [
          { role: 'user', content: 'Hello', timestamp: new Date() },
        ],
      };

      expect(normalizer.isValidConversation(normalized)).toBe(true);
    });

    it('returns false for conversation with no messages', () => {
      const normalized: NormalizedConversation = {
        id: 'conv1',
        title: 'Test',
        created: new Date(),
        updated: new Date(),
        messages: [],
      };

      expect(normalizer.isValidConversation(normalized)).toBe(false);
    });

    it('returns false when all messages have empty content', () => {
      const normalized: NormalizedConversation = {
        id: 'conv1',
        title: 'Test',
        created: new Date(),
        updated: new Date(),
        messages: [
          { role: 'user', content: '', timestamp: new Date() },
          { role: 'assistant', content: '', timestamp: new Date() },
        ],
      };

      expect(normalizer.isValidConversation(normalized)).toBe(false);
    });

    it('returns true when at least one message has content', () => {
      const normalized: NormalizedConversation = {
        id: 'conv1',
        title: 'Test',
        created: new Date(),
        updated: new Date(),
        messages: [
          { role: 'user', content: '', timestamp: new Date() },
          { role: 'assistant', content: 'Response', timestamp: new Date() },
        ],
      };

      expect(normalizer.isValidConversation(normalized)).toBe(true);
    });
  });
});

function createConversation(
  id: string,
  title: string,
  nodes: { id: string; node: MessageNode }[]
): ChatGPTConversation {
  const mapping: Record<string, MessageNode> = {};
  for (const { id, node } of nodes) {
    mapping[id] = node;
  }

  return {
    conversation_id: id,
    title,
    create_time: 1700000000,
    update_time: 1700001000,
    mapping,
    current_node: nodes.length > 0 ? nodes[nodes.length - 1].id : '',
    moderation_results: [],
    plugin_ids: null,
    conversation_template_id: null,
    gizmo_id: null,
    is_archived: false,
    safe_urls: [],
  };
}

function createMessageNode(
  id: string,
  parent: string | null,
  message: Message | null,
  children: string[]
): { id: string; node: MessageNode } {
  return {
    id,
    node: { id, message, parent, children },
  };
}

function createMsg(
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
      parts: [text],
    },
    status: 'finished_successfully',
    weight: 1,
    metadata: {},
    recipient: 'all',
  };
}
