#!/usr/bin/env node

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

import { ZipExtractor } from './extractor.js';
import { ChatGPTParser } from './parsers/chatgpt.js';
import { ConversationNormalizer } from './parsers/normalizer.js';
import { MarkdownFormatter } from './formatters/markdown.js';
import { OllamaPreferenceAnalyzer } from './analyzers/ollama-preferences.js';
import { ensureDir, writeFile, copyImages } from './utils/file.js';
import type { NormalizedConversation } from './parsers/types.js';

const program = new Command();

program
  .name('opencontext')
  .description('Convert ChatGPT conversations to Claude-compatible format')
  .version('1.0.0');

program
  .command('convert <zip-file>')
  .description('Convert ChatGPT export zip to Claude format')
  .option('-o, --output <dir>', 'Output directory', './claude-export')
  .option('--model <name>', 'Ollama model for preference analysis', 'gpt-oss:20b')
  .option('--ollama-host <url>', 'Ollama host URL', 'http://localhost:11434')
  .option('--skip-preferences', 'Skip Ollama preference analysis', false)
  .option('--verbose', 'Show detailed logging', false)
  .action(async (zipFile: string, options) => {
    try {
      await convertExport(zipFile, options);
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

async function convertExport(
  zipFile: string,
  options: {
    output: string;
    model: string;
    ollamaHost: string;
    skipPreferences: boolean;
    verbose: boolean;
  }
) {
  const { output, model, ollamaHost, skipPreferences, verbose } = options;

  // Validate input
  if (!existsSync(zipFile)) {
    throw new Error(`Zip file not found: ${zipFile}`);
  }

  console.log(chalk.blue('\n🔄 ChatGPT to Claude Converter\n'));

  // Step 1: Extract zip
  console.log(chalk.gray('📦 Extracting zip file...'));
  const extractor = new ZipExtractor();
  const extracted = await extractor.extractZip(zipFile);
  if (verbose) {
    console.log(chalk.gray(`   Temp directory: ${extracted.tempDir}`));
  }

  try {
    // Step 2: Parse conversations
    console.log(chalk.gray('📖 Parsing conversations...'));
    const parser = new ChatGPTParser();
    const conversations = parser.parseConversations(extracted.conversationsPath);
    console.log(chalk.gray(`   Found ${conversations.length} conversations`));

    // Step 3: Normalize conversations
    console.log(chalk.gray('🔄 Normalizing format...'));
    const normalizer = new ConversationNormalizer();
    const normalized: NormalizedConversation[] = [];

    for (const conv of conversations) {
      const norm = normalizer.normalize(conv);
      if (normalizer.isValidConversation(norm)) {
        normalized.push(norm);
      }
    }

    console.log(chalk.gray(`   ${normalized.length} valid conversations`));

    if (normalized.length === 0) {
      throw new Error('No valid conversations found in export');
    }

    // Step 4: Create output directory
    ensureDir(output);
    const conversationsDir = join(output, 'conversations');
    ensureDir(conversationsDir);

    // Step 5: Convert to markdown
    console.log(chalk.gray('📝 Generating markdown files...'));
    const formatter = new MarkdownFormatter();

    for (let i = 0; i < normalized.length; i++) {
      const conv = normalized[i];
      const filename = formatter.generateFilename(i + 1, conv.title);
      const markdown = formatter.formatConversation(conv);
      const filepath = join(conversationsDir, filename);

      writeFile(filepath, markdown);

      if (verbose) {
        console.log(chalk.gray(`   ✓ ${filename}`));
      }
    }

    // Generate index
    const indexMarkdown = formatter.formatIndex(normalized);
    writeFile(join(output, 'index.md'), indexMarkdown);

    // Step 6: Copy images
    if (extracted.imagesDir) {
      console.log(chalk.gray('🖼️  Copying images...'));
      const imagesDir = join(output, 'images');
      const imageCount = copyImages(extracted.imagesDir, imagesDir);
      console.log(chalk.gray(`   Copied ${imageCount} images`));
    }

    // Step 7: Generate user profile
    if (extracted.userPath) {
      console.log(chalk.gray('👤 Generating user profile...'));
      try {
        const userJson = JSON.parse(readFileSync(extracted.userPath, 'utf-8'));
        const userProfile = generateUserProfile(userJson);
        writeFile(join(output, 'user-profile.md'), userProfile);
      } catch (error) {
        console.warn(chalk.yellow('   ⚠ Failed to parse user.json'));
      }
    }

    // Step 8: Analyze preferences and memory with Ollama
    if (!skipPreferences) {
      console.log(chalk.gray(`🤖 Analyzing with ${model} at ${ollamaHost}...`));
      const analyzer = new OllamaPreferenceAnalyzer(model, ollamaHost);

      // Generate preferences
      try {
        console.log(chalk.gray('   → Generating preferences...'));
        const preferences = await analyzer.analyzePreferences(normalized);
        writeFile(join(output, 'preferences.md'), preferences);
        console.log(chalk.gray('   ✓ Preferences generated'));
      } catch (error) {
        console.warn(
          chalk.yellow(
            `   ⚠ Preferences generation failed: ${error instanceof Error ? error.message : error}`
          )
        );
        console.log(chalk.gray('   → Generating basic preferences instead...'));
        const basicPreferences = analyzer.generateBasicPreferences(normalized);
        writeFile(join(output, 'preferences.md'), basicPreferences);
      }

      // Generate memory
      try {
        console.log(chalk.gray('   → Generating memory...'));
        const memory = await analyzer.analyzeMemory(normalized);
        writeFile(join(output, 'memory.md'), memory);
        console.log(chalk.gray('   ✓ Memory generated'));
      } catch (error) {
        console.warn(
          chalk.yellow(
            `   ⚠ Memory generation failed: ${error instanceof Error ? error.message : error}`
          )
        );
        console.log(chalk.gray('   → Generating basic memory instead...'));
        const basicMemory = analyzer.generateBasicMemory(normalized);
        writeFile(join(output, 'memory.md'), basicMemory);
      }
    }

    // Success summary
    console.log(chalk.green('\n✅ Conversion complete!\n'));
    console.log(chalk.bold('Output directory:'), output);
    console.log(chalk.gray(`├── preferences.md          (Claude preferences - paste in Settings)`));
    console.log(chalk.gray(`├── memory.md               (Claude memory - paste in Manage Memory)`));
    if (extracted.userPath) {
      console.log(chalk.gray(`├── user-profile.md         (user profile from export)`));
    }
    console.log(chalk.gray(`├── index.md                (conversation index)`));
    console.log(chalk.gray(`└── conversations/          (${normalized.length} markdown files)`));
    if (extracted.imagesDir) {
      console.log(chalk.gray(`    └── images/             (exported images)`));
    }

    console.log(chalk.blue('\n💡 Next steps:'));
    console.log(chalk.gray('1. Go to Claude Settings → paste preferences.md content'));
    console.log(chalk.gray('2. Go to Manage Memory → paste memory.md content'));
    console.log(chalk.gray('3. Upload relevant conversations from conversations/ folder\n'));
  } finally {
    // Cleanup temp directory
    if (verbose) {
      console.log(chalk.gray('\n🧹 Cleaning up...'));
    }
    extractor.cleanup(extracted.tempDir);
  }
}

function generateUserProfile(userJson: any): string {
  const lines: string[] = [];

  lines.push('# User Profile\n');
  lines.push('*Exported from ChatGPT*\n');
  lines.push('---\n');

  if (userJson.email) {
    lines.push(`**Email:** ${userJson.email}`);
  }

  if (userJson.name) {
    lines.push(`**Name:** ${userJson.name}`);
  }

  if (userJson.created) {
    const date = new Date(userJson.created * 1000);
    lines.push(`**Account Created:** ${date.toISOString().split('T')[0]}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Note: This profile was automatically extracted from your ChatGPT export.*');

  return lines.join('\n');
}

// Parse CLI arguments
program.parse();
