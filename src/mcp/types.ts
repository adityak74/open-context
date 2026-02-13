export interface ContextEntry {
  id: string;
  content: string;
  tags: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContextStore {
  version: number;
  entries: ContextEntry[];
}
