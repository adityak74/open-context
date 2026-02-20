import { Ollama } from 'ollama';
import { ContextEntry } from './types.js';
import { Gap, Contradiction, OPPOSITION_PAIRS } from './awareness.js';
import { SchemaType, SchemaField } from './schema.js';

export interface SuggestedType {
  typeName: string;
  description: string;
  fields: Array<{ name: string; type: SchemaField['type']; description: string }>;
}

export interface RankedEntry {
  entry: ContextEntry;
  score: number;
}

export interface StalenessResult {
  entryId: string;
  stale: boolean;
  reason: string;
}

export interface EnrichedGap extends Gap {
  naturalLanguage: string;
  source: 'ollama' | 'deterministic';
}

export class ContextAnalyzer {
  private ollama: Ollama;
  private model: string;
  private available: boolean | null = null;

  constructor(
    model: string = process.env.OLLAMA_MODEL ?? 'gpt-oss:20b',
    host: string = process.env.OLLAMA_HOST ?? 'http://localhost:11434',
  ) {
    this.ollama = new Ollama({ host });
    this.model = model;
  }

  private async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      const { models } = await this.ollama.list();
      this.available = models.some((m) => m.name === this.model || m.name.startsWith(this.model.split(':')[0]!));
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async detectContradictions(entries: ContextEntry[]): Promise<Contradiction[]> {
    if (!(await this.isAvailable())) {
      return this.deterministicContradictions(entries);
    }

    const active = entries.filter((e) => !e.archived);
    const byType: Record<string, ContextEntry[]> = {};
    for (const entry of active) {
      const key = entry.contextType ?? 'untyped';
      if (!byType[key]) byType[key] = [];
      byType[key].push(entry);
    }

    const contradictions: Contradiction[] = [];
    // Cap the sample per type and total pairs to avoid O(n²) API calls.
    // With MAX_SAMPLE=10: at most 45 pairs per type; MAX_TOTAL_PAIRS caps globally.
    const MAX_SAMPLE_PER_TYPE = 10;
    const MAX_TOTAL_PAIRS = 50;
    const CALL_TIMEOUT_MS = 10_000;
    let totalPairs = 0;

    for (const [typeName, typeEntries] of Object.entries(byType)) {
      if (totalPairs >= MAX_TOTAL_PAIRS) break;
      const sample = typeEntries.slice(-MAX_SAMPLE_PER_TYPE);
      for (let i = 0; i < sample.length - 1; i++) {
        for (let j = i + 1; j < sample.length; j++) {
          if (totalPairs >= MAX_TOTAL_PAIRS) break;
          totalPairs++;
          const a = sample[i]!;
          const b = sample[j]!;
          try {
            const prompt = `You are analyzing a user's saved context entries for contradictions.\n\nEntries (type: "${typeName}"):\n1. [id: ${a.id}] "${a.content}"\n2. [id: ${b.id}] "${b.content}"\n\nAre these contradictory? Respond ONLY as JSON: { "contradictory": boolean, "explanation": string }`;
            // Race the Ollama call against a per-call timeout to prevent blocking indefinitely.
            const response = await Promise.race([
              this.ollama.generate({ model: this.model, prompt, stream: false }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), CALL_TIMEOUT_MS),
              ),
            ]);
            const jsonStr = response.response.match(/\{[\s\S]*\}/)?.[0];
            if (jsonStr) {
              const result = JSON.parse(jsonStr) as { contradictory: boolean; explanation: string };
              if (result.contradictory) {
                contradictions.push({
                  entryA: a.id,
                  entryB: b.id,
                  description: result.explanation,
                });
              }
            }
          } catch {
            // Skip timed-out or failed comparisons
          }
        }
      }
    }
    return contradictions;
  }

  async suggestSchemaTypes(untypedEntries: ContextEntry[]): Promise<SuggestedType[]> {
    if (!(await this.isAvailable())) {
      return this.deterministicSchemaSuggestions(untypedEntries);
    }

    const sample = untypedEntries.slice(-20);
    const entriesText = sample
      .map((e, i) => `${i + 1}. "${e.content.slice(0, 200)}"`)
      .join('\n');

    try {
      const prompt = `You are analyzing untyped context entries to suggest schema types.\n\nEntries without a type:\n${entriesText}\n\nSuggest 1-3 schema type(s) that would organize these entries. Respond ONLY as JSON array:\n[{ "typeName": string, "description": string, "fields": [{ "name": string, "type": "string"|"string[]"|"number", "description": string }] }]`;
      const response = await this.ollama.generate({
        model: this.model,
        prompt,
        stream: false,
      });
      const jsonStr = response.response.match(/\[[\s\S]*\]/)?.[0];
      if (jsonStr) {
        return JSON.parse(jsonStr) as SuggestedType[];
      }
    } catch {
      // Fall through to deterministic
    }
    return this.deterministicSchemaSuggestions(untypedEntries);
  }

  async summarizeContext(entries: ContextEntry[], focus?: string): Promise<string> {
    if (!(await this.isAvailable())) {
      return this.deterministicSummary(entries);
    }

    const sample = entries.slice(-10);
    const entriesText = sample
      .map((e, i) => `${i + 1}. [${e.contextType ?? 'note'}] "${e.content.slice(0, 300)}"`)
      .join('\n');

    const focusNote = focus ? `\nFocus on: ${focus}` : '';
    try {
      const prompt = `You are summarizing saved context for an AI agent that is about to start working.${focusNote}\n\nContext entries:\n${entriesText}\n\nWrite a 2-3 sentence briefing. Do not use bullet points. Write in present tense.`;
      const response = await this.ollama.generate({
        model: this.model,
        prompt,
        stream: false,
      });
      return response.response.trim();
    } catch {
      return this.deterministicSummary(entries);
    }
  }

  async rankByRelevance(entries: ContextEntry[], query: string): Promise<RankedEntry[]> {
    if (!(await this.isAvailable())) {
      return this.deterministicRanking(entries, query);
    }

    const sample = entries.slice(0, 20);
    const entriesText = sample
      .map((e, i) => `${i + 1}. [id: ${e.id}] "${e.content.slice(0, 200)}"`)
      .join('\n');

    try {
      const prompt = `You are ranking context entries by relevance to a query.\n\nQuery: "${query}"\n\nEntries:\n${entriesText}\n\nRank ALL entries by relevance (most relevant first). Respond ONLY as JSON: { "ranked": [ids in order] }`;
      const response = await this.ollama.generate({
        model: this.model,
        prompt,
        stream: false,
      });
      const jsonStr = response.response.match(/\{[\s\S]*\}/)?.[0];
      if (jsonStr) {
        const result = JSON.parse(jsonStr) as { ranked: string[] };
        const idOrder = result.ranked;
        const byId = new Map(sample.map((e) => [e.id, e]));
        const ranked: RankedEntry[] = [];
        for (let i = 0; i < idOrder.length; i++) {
          const entry = byId.get(idOrder[i]!);
          if (entry) ranked.push({ entry, score: 1 - i / idOrder.length });
        }
        // Add any entries not in the ranked list at the end
        for (const entry of sample) {
          if (!idOrder.includes(entry.id)) ranked.push({ entry, score: 0 });
        }
        return ranked;
      }
    } catch {
      // Fall through
    }
    return this.deterministicRanking(entries, query);
  }

  // --- Deterministic fallbacks ---

  private deterministicContradictions(entries: ContextEntry[]): Contradiction[] {
    const active = entries.filter((e) => !e.archived).slice(-50);
    const contradictions: Contradiction[] = [];
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]!;
        const b = active[j]!;
        if (a.contextType && b.contextType && a.contextType !== b.contextType) continue;
        const textA = a.content.toLowerCase();
        const textB = b.content.toLowerCase();
        for (const [word, opposite] of OPPOSITION_PAIRS) {
          if (
            (textA.includes(word!) && textB.includes(opposite!)) ||
            (textB.includes(word!) && textA.includes(opposite!))
          ) {
            contradictions.push({
              entryA: a.id,
              entryB: b.id,
              description: `Entry mentions "${word}" while another mentions "${opposite}"`,
            });
            break;
          }
        }
      }
    }
    return contradictions.slice(0, 5);
  }

  private deterministicSchemaSuggestions(entries: ContextEntry[]): SuggestedType[] {
    const tagGroups: Record<string, ContextEntry[]> = {};
    for (const entry of entries) {
      for (const tag of entry.tags) {
        if (!tagGroups[tag]) tagGroups[tag] = [];
        tagGroups[tag].push(entry);
      }
    }
    const suggestions: SuggestedType[] = [];
    for (const [tag, group] of Object.entries(tagGroups)) {
      if (group.length >= 3) {
        suggestions.push({
          typeName: tag,
          description: `Entries grouped by tag "${tag}"`,
          fields: [
            { name: 'content', type: 'string', description: 'Main content' },
            { name: 'notes', type: 'string', description: 'Additional notes' },
          ],
        });
      }
    }
    return suggestions.slice(0, 3);
  }

  private deterministicSummary(entries: ContextEntry[]): string {
    const byType: Record<string, number> = {};
    for (const e of entries) {
      const t = e.contextType ?? 'note';
      byType[t] = (byType[t] ?? 0) + 1;
    }
    const typeStr = Object.entries(byType)
      .map(([t, n]) => `${n} ${t}(s)`)
      .join(', ');
    const newest = entries
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
    return `Store contains ${entries.length} entries: ${typeStr || 'no entries'}.${newest ? ` Most recent: "${newest.content.slice(0, 80)}..."` : ''}`;
  }

  private deterministicRanking(entries: ContextEntry[], query: string): RankedEntry[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return entries
      .map((entry) => {
        const text = `${entry.content} ${entry.tags.join(' ')} ${entry.contextType ?? ''}`.toLowerCase();
        const score = terms.reduce((acc, term) => acc + (text.includes(term) ? 1 : 0), 0) / terms.length;
        return { entry, score };
      })
      .sort((a, b) => b.score - a.score);
  }
}
