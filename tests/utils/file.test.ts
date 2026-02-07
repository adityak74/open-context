import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ensureDir, writeFile, copyImages, sanitizeFilename, formatFileSize } from '../../src/utils/file';

describe('ensureDir', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `file-test-${Date.now()}`);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('creates directory when it does not exist', () => {
    const dirPath = join(testDir, 'new-dir');
    expect(existsSync(dirPath)).toBe(false);
    ensureDir(dirPath);
    expect(existsSync(dirPath)).toBe(true);
  });

  it('does nothing when directory already exists', () => {
    mkdirSync(testDir, { recursive: true });
    expect(existsSync(testDir)).toBe(true);
    ensureDir(testDir);
    expect(existsSync(testDir)).toBe(true);
  });

  it('creates nested directories recursively', () => {
    const nestedPath = join(testDir, 'a', 'b', 'c');
    ensureDir(nestedPath);
    expect(existsSync(nestedPath)).toBe(true);
  });
});

describe('writeFile', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `writefile-test-${Date.now()}`);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('writes content to a file', () => {
    const filePath = join(testDir, 'test.txt');
    writeFile(filePath, 'hello world');
    expect(readFileSync(filePath, 'utf-8')).toBe('hello world');
  });

  it('creates parent directories if they do not exist', () => {
    const filePath = join(testDir, 'sub', 'dir', 'test.txt');
    writeFile(filePath, 'nested content');
    expect(readFileSync(filePath, 'utf-8')).toBe('nested content');
  });

  it('overwrites existing file', () => {
    const filePath = join(testDir, 'overwrite.txt');
    writeFile(filePath, 'original');
    writeFile(filePath, 'updated');
    expect(readFileSync(filePath, 'utf-8')).toBe('updated');
  });
});

describe('copyImages', () => {
  let sourceDir: string;
  let destDir: string;

  beforeEach(() => {
    const base = join(tmpdir(), `copyimg-test-${Date.now()}`);
    sourceDir = join(base, 'source');
    destDir = join(base, 'dest');
    mkdirSync(sourceDir, { recursive: true });
  });

  afterEach(() => {
    const base = sourceDir.substring(0, sourceDir.lastIndexOf('/'));
    if (existsSync(base)) {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('returns 0 when source directory does not exist', () => {
    const result = copyImages('/nonexistent-dir-xyz', destDir);
    expect(result).toBe(0);
  });

  it('copies files from source to destination', () => {
    writeFileSync(join(sourceDir, 'img1.png'), 'image1');
    writeFileSync(join(sourceDir, 'img2.jpg'), 'image2');
    const count = copyImages(sourceDir, destDir);
    expect(count).toBe(2);
    expect(existsSync(join(destDir, 'img1.png'))).toBe(true);
    expect(existsSync(join(destDir, 'img2.jpg'))).toBe(true);
  });

  it('skips directories in source', () => {
    writeFileSync(join(sourceDir, 'img.png'), 'image');
    mkdirSync(join(sourceDir, 'subdir'));
    const count = copyImages(sourceDir, destDir);
    expect(count).toBe(1);
  });

  it('creates destination directory if needed', () => {
    writeFileSync(join(sourceDir, 'img.png'), 'image');
    expect(existsSync(destDir)).toBe(false);
    copyImages(sourceDir, destDir);
    expect(existsSync(destDir)).toBe(true);
  });
});

describe('sanitizeFilename', () => {
  it('converts to lowercase and replaces special chars with hyphens', () => {
    expect(sanitizeFilename('Hello World!')).toBe('hello-world');
  });

  it('removes leading and trailing hyphens', () => {
    expect(sanitizeFilename('---Hello---')).toBe('hello');
  });

  it('truncates to max length', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(50);
  });

  it('respects custom max length', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeFilename(longName, 20).length).toBeLessThanOrEqual(20);
  });

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('');
  });

  it('handles string with only special characters', () => {
    expect(sanitizeFilename('!@#$%')).toBe('');
  });

  it('preserves alphanumeric characters', () => {
    expect(sanitizeFilename('abc123')).toBe('abc123');
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatFileSize(3.7 * 1024 * 1024 * 1024)).toBe('3.7 GB');
  });

  it('uses correct boundary values', () => {
    expect(formatFileSize(1023)).toBe('1023 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1024 * 1024 - 1)).toContain('KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });
});
