import { describe, it, expect } from 'vitest';
import { exporters } from '../index';
import { claudeExporter } from '../claude';
import { chatgptExporter } from '../chatgpt';
import { geminiExporter } from '../gemini';

describe('exporters index', () => {
  it('should export all vendor exporters', () => {
    expect(exporters).toHaveProperty('claude');
    expect(exporters).toHaveProperty('chatgpt');
    expect(exporters).toHaveProperty('gemini');
  });

  it('should have correct exporter references', () => {
    expect(exporters.claude).toBe(claudeExporter);
    expect(exporters.chatgpt).toBe(chatgptExporter);
    expect(exporters.gemini).toBe(geminiExporter);
  });

  it('should export VendorExporter type', () => {
    // This is a type export, we can't test it directly at runtime
    // but we can verify the structure of exporters
    Object.values(exporters).forEach((exporter) => {
      expect(exporter).toHaveProperty('info');
      expect(exporter).toHaveProperty('exportPreferences');
      expect(exporter).toHaveProperty('exportConversations');
      expect(typeof exporter.exportPreferences).toBe('function');
      expect(typeof exporter.exportConversations).toBe('function');
    });
  });
});
