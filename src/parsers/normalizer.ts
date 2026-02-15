import type { ChatGPTConversation, NormalizedConversation, NormalizedMessage, Message } from './types.js';
import { ChatGPTParser } from './chatgpt.js';

export class ConversationNormalizer {
  private parser: ChatGPTParser;

  constructor() {
    this.parser = new ChatGPTParser();
  }

  /**
   * Normalize ChatGPT conversation to common format
   */
  normalize(conversation: ChatGPTConversation): NormalizedConversation {
    const messages = this.parser.walkMessageTree(conversation.mapping);

    return {
      id: conversation.conversation_id,
      title: conversation.title || 'Untitled Conversation',
      created: new Date(conversation.create_time * 1000),
      updated: new Date(conversation.update_time * 1000),
      messages: messages.map(msg => this.normalizeMessage(msg)),
    };
  }

  /**
   * Normalize a single message
   */
  private normalizeMessage(message: Message): NormalizedMessage {
    const role = this.normalizeRole(message.author.role);
    const content = this.parser.extractTextContent(message);
    const images = this.parser.extractImages(message);

    return {
      role,
      content: content.trim(),
      images: images.length > 0 ? images : undefined,
      timestamp: new Date(message.create_time * 1000),
      metadata: {
        model: message.metadata?.model_slug,
        attachments: message.metadata?.attachments?.map(a => a.name),
      },
    };
  }

  /**
   * Normalize role names
   */
  private normalizeRole(role: string): 'user' | 'assistant' | 'system' {
    switch (role) {
      case 'user':
        return 'user';
      case 'assistant':
      case 'tool':
        return 'assistant';
      case 'system':
        return 'system';
      default:
        return 'assistant';
    }
  }

  /**
   * Filter out empty or invalid conversations
   */
  isValidConversation(normalized: NormalizedConversation): boolean {
    // Must have at least one message
    if (normalized.messages.length === 0) {
      return false;
    }

    // Must have at least one message with content
    const hasContent = normalized.messages.some(msg => msg.content.length > 0);
    return hasContent;
  }
}
