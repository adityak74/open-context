import type { NormalizedConversation, NormalizedMessage } from '../parsers/types';

export class MarkdownFormatter {
  /**
   * Format conversation as markdown
   */
  formatConversation(conversation: NormalizedConversation): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${this.escapeMarkdown(conversation.title)}\n`);

    // Metadata
    lines.push(`**Created:** ${this.formatDate(conversation.created)}`);
    lines.push(`**Last Updated:** ${this.formatDate(conversation.updated)}`);
    lines.push(`**Messages:** ${conversation.messages.length}\n`);
    lines.push('---\n');

    // Messages
    for (const message of conversation.messages) {
      lines.push(this.formatMessage(message));
      lines.push(''); // Blank line between messages
    }

    // Footer
    lines.push('---\n');
    lines.push('*Exported from ChatGPT via opencontext*');

    return lines.join('\n');
  }

  /**
   * Format a single message
   */
  private formatMessage(message: NormalizedMessage): string {
    const lines: string[] = [];

    // Role header
    const roleLabel = this.getRoleLabel(message.role);
    lines.push(`## ${roleLabel}`);
    lines.push('');

    // Content
    if (message.content) {
      lines.push(message.content);
      lines.push('');
    }

    // Images
    if (message.images && message.images.length > 0) {
      for (const image of message.images) {
        lines.push(`[Image: ${image}]`);
      }
      lines.push('');
    }

    // Attachments
    if (message.metadata?.attachments && message.metadata.attachments.length > 0) {
      for (const attachment of message.metadata.attachments) {
        lines.push(`[Attachment: ${attachment}]`);
      }
      lines.push('');
    }

    // Model info (for assistant messages)
    if (message.role === 'assistant' && message.metadata?.model) {
      lines.push(`*Model: ${message.metadata.model}*`);
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  /**
   * Get display label for role
   */
  private getRoleLabel(role: string): string {
    switch (role) {
      case 'user':
        return 'User';
      case 'assistant':
        return 'Assistant';
      case 'system':
        return 'System';
      default:
        return 'Unknown';
    }
  }

  /**
   * Format date as readable string
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  /**
   * Escape markdown special characters in title
   */
  private escapeMarkdown(text: string): string {
    // Only escape characters that would break the title
    return text.replace(/[#*_]/g, '\\$&');
  }

  /**
   * Generate summary of all conversations
   */
  formatIndex(conversations: NormalizedConversation[]): string {
    const lines: string[] = [];

    lines.push('# Conversation Index\n');
    lines.push(`Total conversations: ${conversations.length}\n`);
    lines.push('---\n');

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      const filename = this.generateFilename(i + 1, conv.title);

      lines.push(`### ${i + 1}. ${this.escapeMarkdown(conv.title)}`);
      lines.push(`- **File:** \`${filename}\``);
      lines.push(`- **Created:** ${this.formatDate(conv.created)}`);
      lines.push(`- **Messages:** ${conv.messages.length}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate filename for conversation
   */
  generateFilename(index: number, title: string): string {
    // Sanitize title for filename
    const sanitized = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);

    // Pad index with zeros
    const paddedIndex = index.toString().padStart(3, '0');

    return `${paddedIndex}-${sanitized}.md`;
  }
}
