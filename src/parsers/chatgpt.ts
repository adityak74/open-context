import { readFileSync } from 'fs';
import type { ChatGPTConversation, Message, MessageNode } from './types.js';

export class ChatGPTParser {
  /**
   * Parse conversations.json from ChatGPT export
   */
  parseConversations(filePath: string): ChatGPTConversation[] {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Handle both array format and object with conversations property
      if (Array.isArray(data)) {
        return data;
      } else if (data.conversations && Array.isArray(data.conversations)) {
        return data.conversations;
      } else {
        throw new Error('Invalid conversations.json format');
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse conversations.json: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Walk message tree to extract messages in chronological order
   */
  walkMessageTree(mapping: Record<string, MessageNode>): Message[] {
    const messages: Message[] = [];

    // Find root node (node with no parent)
    let rootId: string | null = null;
    for (const [id, node] of Object.entries(mapping)) {
      if (node.parent === null) {
        rootId = id;
        break;
      }
    }

    if (!rootId) {
      return messages;
    }

    // Traverse tree using BFS to maintain order
    const queue: string[] = [rootId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      const node = mapping[currentId];
      if (!node) {
        continue;
      }

      // Add message if it exists and has content
      if (node.message && this.isValidMessage(node.message)) {
        messages.push(node.message);
      }

      // Add children to queue
      if (node.children && node.children.length > 0) {
        // ChatGPT stores multiple branches, typically we want the first child
        // or the child that leads to current_node
        queue.push(...node.children);
      }
    }

    return messages;
  }

  /**
   * Check if message is valid and should be included
   */
  private isValidMessage(message: Message): boolean {
    // Skip system messages without content
    if (message.author.role === 'system') {
      return false;
    }

    // Check if message has content
    if (!message.content) {
      return false;
    }

    // Check for text content
    if (message.content.parts && message.content.parts.length > 0) {
      return true;
    }

    if (message.content.text && message.content.text.trim().length > 0) {
      return true;
    }

    return false;
  }

  /**
   * Extract text content from message
   */
  extractTextContent(message: Message): string {
    if (message.content.text) {
      return message.content.text;
    }

    if (message.content.parts) {
      return message.content.parts
        .filter(part => typeof part === 'string')
        .join('\n');
    }

    return '';
  }

  /**
   * Extract image references from message
   */
  extractImages(message: Message): string[] {
    const images: string[] = [];

    // Check content parts for image objects
    if (message.content.parts) {
      for (const part of message.content.parts) {
        if (typeof part === 'object' && part.asset_pointer) {
          images.push(part.asset_pointer);
        }
      }
    }

    // Check attachments
    if (message.metadata?.attachments) {
      for (const attachment of message.metadata.attachments) {
        if (attachment.mimeType?.startsWith('image/')) {
          images.push(attachment.id);
        }
      }
    }

    return images;
  }
}
