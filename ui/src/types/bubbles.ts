export interface ContextEntry {
  id: string;
  content: string;
  tags: string[];
  source: string;
  bubbleId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bubble {
  id: string;
  name: string;
  description?: string;
  contextCount: number;
  createdAt: string;
  updatedAt: string;
}
