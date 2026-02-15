import { Ollama } from 'ollama';
import type { NormalizedConversation } from '../parsers/types.js';

export class OllamaPreferenceAnalyzer {
  private ollama: Ollama;
  private model: string;
  private maxTokens: number;

  constructor(model: string = 'gpt-oss:20b', host: string = 'http://localhost:11434') {
    this.ollama = new Ollama({ host });
    this.model = model;
    this.maxTokens = 100000; // Conservative limit for context
  }

  /**
   * Analyze conversations and generate preferences document
   */
  async analyzePreferences(conversations: NormalizedConversation[]): Promise<string> {
    try {
      // Check if Ollama is available
      await this.checkOllamaAvailable();

      // Prepare conversation text
      const conversationText = this.prepareConversationText(conversations);

      // Generate analysis prompt
      const prompt = this.buildAnalysisPrompt(conversationText);

      console.log(`Analyzing ${conversations.length} conversations with ${this.model}...`);

      // Call Ollama
      const response = await this.ollama.generate({
        model: this.model,
        prompt,
        stream: false,
      });

      return response.response || 'No preferences generated.';
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Ollama analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check if Ollama is running and model is available
   */
  private async checkOllamaAvailable(): Promise<void> {
    try {
      const models = await this.ollama.list();
      const modelExists = models.models.some(m => m.name === this.model);

      if (!modelExists) {
        throw new Error(
          `Model '${this.model}' not found. Run: ollama pull ${this.model}`
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('ECONNREFUSED')) {
          throw new Error(
            'Ollama is not running. Start it with: ollama serve'
          );
        }
        throw error;
      }
      throw new Error('Failed to connect to Ollama');
    }
  }

  /**
   * Prepare conversation text for analysis
   */
  private prepareConversationText(conversations: NormalizedConversation[]): string {
    const lines: string[] = [];
    let totalChars = 0;
    const maxChars = this.maxTokens * 4; // Rough char to token ratio

    // Sort by date to get chronological order
    const sorted = [...conversations].sort(
      (a, b) => a.created.getTime() - b.created.getTime()
    );

    for (const conv of sorted) {
      const convText = this.formatConversationForAnalysis(conv);

      // Check if adding this conversation exceeds limit
      if (totalChars + convText.length > maxChars) {
        console.warn(
          `Truncating conversation text at ${totalChars} characters (${conversations.length} conversations processed)`
        );
        break;
      }

      lines.push(convText);
      totalChars += convText.length;
    }

    return lines.join('\n\n---\n\n');
  }

  /**
   * Format conversation for analysis
   */
  private formatConversationForAnalysis(conv: NormalizedConversation): string {
    const lines: string[] = [];

    lines.push(`CONVERSATION: ${conv.title}`);
    lines.push(`DATE: ${conv.created.toISOString().split('T')[0]}`);
    lines.push('');

    for (const msg of conv.messages) {
      const role = msg.role.toUpperCase();
      lines.push(`${role}: ${msg.content}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Build analysis prompt for preferences
   */
  private buildAnalysisPrompt(conversationText: string): string {
    return `Analyze these conversations and write a preferences statement for Claude.

CONVERSATION HISTORY:
${conversationText}

---

Based on these conversations, write preferences in natural paragraph form (NOT bullet points or headers) that describe HOW the user likes to communicate.

Example good output:
"I prefer clear, direct explanations with practical examples. When explaining technical concepts, please provide step-by-step instructions with code examples when relevant. I appreciate concise responses that get to the point quickly, but don't hesitate to provide thorough technical details when needed. I'm comfortable with technical terminology and prefer markdown formatting for code. Please assume I have a software engineering background and can handle advanced topics."

Your output should:
- Be written as the user speaking ("I prefer...", "Please...")
- Focus on communication style, explanation preferences, level of detail
- Be 2-3 paragraphs of natural text
- NOT use markdown headers (##), NOT use bullet points
- NOT list specific topics or projects

Write the preferences now:`;
  }

  /**
   * Build analysis prompt for memory (factual information)
   */
  private buildMemoryPrompt(conversationText: string): string {
    return `Extract factual information about the user from these conversations.

CONVERSATION HISTORY:
${conversationText}

---

Write three sections about the user in third person. Look for facts about their work, expertise, and current focus.

Example format:

Work context:
User is a software engineer working with cloud infrastructure and DevOps tools. They have discussed setting up VPN solutions using Headscale and Tailscale, deploying custom AI software, and managing containerized applications. This suggests they work in infrastructure/platform engineering or a DevOps role.

Personal context:
User demonstrates strong technical expertise in networking, containerization (Docker, Kubernetes), and infrastructure automation. They are familiar with Python, TypeScript, and modern deployment patterns. They show interest in AI/ML systems and custom software deployment architectures.

Top of mind:
User is currently working on VPN architecture decisions, exploring Headscale vs commercial solutions, and planning deployment strategies for AI applications. They are also solving configuration management problems like gitignore patterns and researching regional naming conventions.

---

Now write the three sections based on the conversations above. Write in third person, infer from technical discussions, name specific technologies/tools mentioned:

Work context:
Personal context:
Top of mind:`;
  }

  /**
   * Analyze conversations and generate memory document
   */
  async analyzeMemory(conversations: NormalizedConversation[]): Promise<string> {
    try {
      // Check if Ollama is available
      await this.checkOllamaAvailable();

      // Prepare conversation text
      const conversationText = this.prepareConversationText(conversations);

      // Generate analysis prompt
      const prompt = this.buildMemoryPrompt(conversationText);

      console.log(`Generating memory from ${conversations.length} conversations with ${this.model}...`);

      // Call Ollama
      const response = await this.ollama.generate({
        model: this.model,
        prompt,
        stream: false,
      });

      return response.response || 'No memory generated.';
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Ollama memory generation failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate basic preferences without Ollama (fallback)
   */
  generateBasicPreferences(conversations: NormalizedConversation[]): string {
    const lines: string[] = [];
    const totalMessages = this.countTotalMessages(conversations);
    const dateRange = this.getDateRange(conversations);
    const topics = this.extractTopicKeywords(conversations);

    lines.push('I have ' + conversations.length + ' conversations spanning ' + dateRange + ' with ' + totalMessages + ' total messages.');
    lines.push('');

    if (topics.length > 0) {
      const topTopics = topics.slice(0, 8).map(([topic]) => topic).join(', ');
      lines.push('My main areas of interest include: ' + topTopics + '.');
      lines.push('');
    }

    lines.push('Please provide clear, concise explanations with practical examples when relevant. I appreciate step-by-step guidance for complex topics and prefer technical accuracy over simplification.');
    lines.push('');
    lines.push('---');
    lines.push('Note: This is a basic statistical analysis. For detailed AI-generated preferences, ensure Ollama is running and convert again without --skip-preferences.');

    return lines.join('\n');
  }

  /**
   * Generate basic memory without Ollama (fallback)
   */
  generateBasicMemory(conversations: NormalizedConversation[]): string {
    const lines: string[] = [];
    const topics = this.extractTopicKeywords(conversations);
    const recentConvs = conversations
      .sort((a, b) => b.updated.getTime() - a.updated.getTime())
      .slice(0, 5);

    lines.push('Work context:');
    lines.push('User has discussed topics related to software development, infrastructure, and technical systems. Specific expertise areas could not be determined from basic analysis.');
    lines.push('');

    lines.push('Personal context:');
    if (topics.length > 0) {
      const topTopics = topics.slice(0, 6).map(([topic]) => topic).join(', ');
      lines.push(`User shows interest in ${topTopics}. Additional background details require AI analysis.`);
    } else {
      lines.push('User background and interests require AI analysis for detailed extraction.');
    }
    lines.push('');

    lines.push('Top of mind:');
    if (recentConvs.length > 0) {
      const recentTopics = recentConvs.map(c => c.title).slice(0, 3).join('; ');
      lines.push(`Recent conversations include: ${recentTopics}.`);
    } else {
      lines.push('No recent conversation data available.');
    }
    lines.push('');
    lines.push('---');
    lines.push('Note: This is basic extraction. For detailed AI-generated memory, ensure Ollama is running and convert again without --skip-preferences.');

    return lines.join('\n');
  }

  private countTotalMessages(conversations: NormalizedConversation[]): number {
    return conversations.reduce((sum, conv) => sum + conv.messages.length, 0);
  }

  private getDateRange(conversations: NormalizedConversation[]): string {
    if (conversations.length === 0) return 'N/A';

    const dates = conversations.map(c => c.created.getTime());
    const earliest = new Date(Math.min(...dates));
    const latest = new Date(Math.max(...dates));

    return `${earliest.toISOString().split('T')[0]} to ${latest.toISOString().split('T')[0]}`;
  }

  private extractTopicKeywords(conversations: NormalizedConversation[]): [string, number][] {
    const keywords = new Map<string, number>();

    for (const conv of conversations) {
      const words = conv.title
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3);

      for (const word of words) {
        keywords.set(word, (keywords.get(word) || 0) + 1);
      }
    }

    return Array.from(keywords.entries())
      .sort((a, b) => b[1] - a[1]);
  }
}
