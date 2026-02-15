import AdmZip from 'adm-zip';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync, rmSync } from 'fs';
import type { ExtractedFiles } from './parsers/types.js';

export class ZipExtractor {
  /**
   * Extract ChatGPT export zip to temporary directory
   */
  async extractZip(zipPath: string): Promise<ExtractedFiles> {
    // Validate zip file exists
    if (!existsSync(zipPath)) {
      throw new Error(`Zip file not found: ${zipPath}`);
    }

    // Create temporary directory
    const tempDir = join(tmpdir(), `opencontext-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      // Extract zip
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(tempDir, true);

      // Find conversations.json
      const conversationsPath = join(tempDir, 'conversations.json');
      if (!existsSync(conversationsPath)) {
        throw new Error('conversations.json not found in zip archive');
      }

      // Check for optional files
      const userPath = join(tempDir, 'user.json');
      const imagesDir = join(tempDir, 'images');

      return {
        conversationsPath,
        userPath: existsSync(userPath) ? userPath : undefined,
        imagesDir: existsSync(imagesDir) ? imagesDir : undefined,
        tempDir,
      };
    } catch (error) {
      // Clean up on failure
      this.cleanup(tempDir);
      throw error;
    }
  }

  /**
   * Clean up temporary directory
   */
  cleanup(tempDir: string): void {
    try {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn(`Warning: Failed to clean up temp directory: ${tempDir}`);
    }
  }
}
