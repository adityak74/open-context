import type { VendorInfo } from '../types/preferences';

export const chatGPTInfo: VendorInfo = {
  id: 'chatgpt',
  name: 'ChatGPT',
  description: 'Export as ChatGPT custom instructions',
  supportsPreferences: true,
  supportsMemory: true,
  supportsConversationImport: false,
};

export const claudeInfo: VendorInfo = {
  id: 'claude',
  name: 'Claude',
  description: 'Export as Claude preferences and memory documents',
  supportsPreferences: true,
  supportsMemory: true,
  supportsConversationImport: false,
};

export const geminiInfo: VendorInfo = {
  id: 'gemini',
  name: 'Google Gemini',
  description: 'Export as Gemini Gems / custom instructions',
  supportsPreferences: true,
  supportsMemory: true,
  supportsConversationImport: false,
};
