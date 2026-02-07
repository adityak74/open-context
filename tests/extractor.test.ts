import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import AdmZip from 'adm-zip';
import { ZipExtractor } from '../src/extractor';

describe('ZipExtractor', () => {
  let extractor: ZipExtractor;
  let testDir: string;

  beforeEach(() => {
    extractor = new ZipExtractor();
    testDir = join(tmpdir(), `extractor-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('extractZip', () => {
    it('extracts zip with conversations.json', async () => {
      const zipPath = createTestZip(testDir, {
        'conversations.json': JSON.stringify([{ conversation_id: 'test' }]),
      });

      const result = await extractor.extractZip(zipPath);

      expect(result.conversationsPath).toContain('conversations.json');
      expect(existsSync(result.conversationsPath)).toBe(true);
      expect(result.tempDir).toBeTruthy();

      // Cleanup
      extractor.cleanup(result.tempDir);
    });

    it('includes userPath when user.json exists', async () => {
      const zipPath = createTestZip(testDir, {
        'conversations.json': '[]',
        'user.json': JSON.stringify({ id: 'user1', email: 'test@example.com' }),
      });

      const result = await extractor.extractZip(zipPath);

      expect(result.userPath).toBeDefined();
      expect(existsSync(result.userPath!)).toBe(true);

      extractor.cleanup(result.tempDir);
    });

    it('sets userPath to undefined when user.json does not exist', async () => {
      const zipPath = createTestZip(testDir, {
        'conversations.json': '[]',
      });

      const result = await extractor.extractZip(zipPath);
      expect(result.userPath).toBeUndefined();

      extractor.cleanup(result.tempDir);
    });

    it('includes imagesDir when images directory exists', async () => {
      const zipPath = createTestZip(testDir, {
        'conversations.json': '[]',
        'images/test.png': 'fake-image-data',
      });

      const result = await extractor.extractZip(zipPath);

      expect(result.imagesDir).toBeDefined();
      expect(existsSync(result.imagesDir!)).toBe(true);

      extractor.cleanup(result.tempDir);
    });

    it('sets imagesDir to undefined when images directory does not exist', async () => {
      const zipPath = createTestZip(testDir, {
        'conversations.json': '[]',
      });

      const result = await extractor.extractZip(zipPath);
      expect(result.imagesDir).toBeUndefined();

      extractor.cleanup(result.tempDir);
    });

    it('throws error when zip file does not exist', async () => {
      await expect(extractor.extractZip('/nonexistent/file.zip')).rejects.toThrow(
        'Zip file not found'
      );
    });

    it('throws error when conversations.json is missing from zip', async () => {
      const zipPath = createTestZip(testDir, {
        'readme.txt': 'No conversations here',
      });

      await expect(extractor.extractZip(zipPath)).rejects.toThrow(
        'conversations.json not found in zip archive'
      );
    });
  });

  describe('cleanup', () => {
    it('removes temporary directory', () => {
      const tempDir = join(testDir, 'temp-cleanup');
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(join(tempDir, 'test.txt'), 'data');

      expect(existsSync(tempDir)).toBe(true);
      extractor.cleanup(tempDir);
      expect(existsSync(tempDir)).toBe(false);
    });

    it('does nothing when directory does not exist', () => {
      expect(() => extractor.cleanup('/nonexistent/dir')).not.toThrow();
    });

    it('handles errors gracefully without throwing', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Calling cleanup on nonexistent dir should not throw
      expect(() => extractor.cleanup('/nonexistent/dir')).not.toThrow();
      consoleSpy.mockRestore();
    });
  });
});

function createTestZip(dir: string, files: Record<string, string>): string {
  const zip = new AdmZip();

  for (const [path, content] of Object.entries(files)) {
    zip.addFile(path, Buffer.from(content));
  }

  const zipPath = join(dir, 'test-export.zip');
  zip.writeZip(zipPath);

  return zipPath;
}
