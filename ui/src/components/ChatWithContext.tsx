import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  MessageCircle,
  Layers,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Tag,
  Sparkles,
} from 'lucide-react';
import type { Bubble, ContextEntry } from '@/types/bubbles';

interface VendorTarget {
  id: string;
  name: string;
  chatUrl: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Vendor definitions
// ---------------------------------------------------------------------------

const VENDORS: VendorTarget[] = [
  {
    id: 'claude',
    name: 'Claude',
    chatUrl: 'https://claude.ai/new',
    description: 'Start a new conversation on Claude with your bubble context',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    chatUrl: 'https://chatgpt.com/',
    description: 'Start a new conversation on ChatGPT with your bubble context',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    chatUrl: 'https://gemini.google.com/app',
    description: 'Start a new conversation on Gemini with your bubble context',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildContextPrompt(bubble: Bubble, contexts: ContextEntry[]): string {
  const lines: string[] = [];

  lines.push(`Here is my context from "${bubble.name}":`);
  if (bubble.description) {
    lines.push(bubble.description);
  }
  lines.push('');

  for (const ctx of contexts) {
    lines.push(`---`);
    if (ctx.tags.length > 0) {
      lines.push(`[${ctx.tags.join(', ')}]`);
    }
    lines.push(ctx.content);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('Please use this context to inform our conversation. Let me know what you can help me with based on this context.');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Bubble selector row
// ---------------------------------------------------------------------------

function BubbleRow({
  bubble,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
  contexts,
  loadingContexts,
}: {
  bubble: Bubble;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  contexts: ContextEntry[];
  loadingContexts: boolean;
}) {
  return (
    <Card
      className={`bg-card border transition-colors ${
        isSelected ? 'border-foreground/50 bg-secondary' : 'border-border'
      }`}
    >
      <CardHeader className="flex flex-row items-center gap-3 p-3 space-y-0">
        <button
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
          <div className="flex items-center gap-2">
            <Layers size={13} className="text-muted-foreground flex-shrink-0" />
            <h3 className="text-sm font-semibold text-foreground truncate">{bubble.name}</h3>
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4 flex-shrink-0">
              {bubble.contextCount}
            </Badge>
          </div>
          {bubble.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{bubble.description}</p>
          )}
        </div>

        <Button
          size="sm"
          variant={isSelected ? 'default' : 'outline'}
          onClick={onSelect}
          className="gap-1.5 h-7 text-xs flex-shrink-0"
        >
          {isSelected ? (
            <>
              <Check size={12} />
              Selected
            </>
          ) : (
            'Select'
          )}
        </Button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="px-3 pb-3 pt-0 border-t border-border mt-0">
          {loadingContexts ? (
            <p className="text-xs text-muted-foreground py-3 text-center">Loading contexts...</p>
          ) : contexts.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              No contexts in this bubble.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 pt-2">
              {contexts.map((ctx) => (
                <div
                  key={ctx.id}
                  className="text-xs text-muted-foreground bg-muted/30 rounded-sm p-2"
                >
                  <p className="text-foreground whitespace-pre-wrap break-words leading-relaxed">
                    {ctx.content.length > 150 ? ctx.content.slice(0, 150) + '...' : ctx.content}
                  </p>
                  {ctx.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ctx.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-xs px-1 py-0 h-3.5 gap-0.5"
                        >
                          <Tag size={8} />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChatWithContext() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<string>('claude');

  const [contextCache, setContextCache] = useState<Record<string, ContextEntry[]>>({});
  const [loadingContexts, setLoadingContexts] = useState<string | null>(null);

  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [copiedOnly, setCopiedOnly] = useState(false);
  const [copiedAndOpened, setCopiedAndOpened] = useState(false);

  // Fetch bubbles on mount
  useEffect(() => {
    fetchBubbles();
  }, []);

  async function fetchBubbles() {
    try {
      const res = await fetch('/api/bubbles');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setBubbles((await res.json()) as Bubble[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bubbles');
    } finally {
      setLoading(false);
    }
  }

  async function fetchContextsForBubble(bubbleId: string): Promise<ContextEntry[]> {
    if (contextCache[bubbleId]) return contextCache[bubbleId];

    setLoadingContexts(bubbleId);
    try {
      const res = await fetch(`/api/bubbles/${bubbleId}/contexts`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const contexts = (await res.json()) as ContextEntry[];
      setContextCache((prev) => ({ ...prev, [bubbleId]: contexts }));
      return contexts;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contexts');
      return [];
    } finally {
      setLoadingContexts(null);
    }
  }

  async function handleToggle(bubbleId: string) {
    if (expandedId === bubbleId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(bubbleId);
    await fetchContextsForBubble(bubbleId);
  }

  async function handleSelect(bubbleId: string) {
    const newId = selectedBubbleId === bubbleId ? null : bubbleId;
    setSelectedBubbleId(newId);
    setGeneratedPrompt(null);
    setCopiedOnly(false);
    setCopiedAndOpened(false);
    if (newId) {
      await fetchContextsForBubble(newId);
    }
  }

  async function handleGenerate() {
    if (!selectedBubbleId) return;

    setError(null);

    const bubble = bubbles.find((b) => b.id === selectedBubbleId);
    if (!bubble) return;

    const contexts = await fetchContextsForBubble(selectedBubbleId);
    if (contexts.length === 0) {
      setError('Selected bubble has no contexts. Add some contexts first.');
      return;
    }

    const prompt = buildContextPrompt(bubble, contexts);
    setGeneratedPrompt(prompt);
    setCopiedOnly(false);
    setCopiedAndOpened(false);
  }

  function handleCopyAndOpen() {
    if (!generatedPrompt) return;

    const vendor = VENDORS.find((v) => v.id === selectedVendor);
    if (!vendor) return;

    navigator.clipboard?.writeText(generatedPrompt).then(() => {
      setCopiedAndOpened(true);
      setTimeout(() => setCopiedAndOpened(false), 3000);
      window.open(vendor.chatUrl, '_blank', 'noopener,noreferrer');
    }).catch(() => {
      setError('Could not copy to clipboard. Please copy manually.');
    });
  }

  function handleCopy() {
    if (!generatedPrompt) return;
    navigator.clipboard?.writeText(generatedPrompt).then(() => {
      setCopiedOnly(true);
      setTimeout(() => setCopiedOnly(false), 1800);
    }).catch(() => {
      setError('Could not copy to clipboard. Please copy manually.');
    });
  }

  const selectedBubble = bubbles.find((b) => b.id === selectedBubbleId);
  const selectedVendorInfo = VENDORS.find((v) => v.id === selectedVendor);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <MessageCircle size={20} />
          Start Chat with Context
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Select a bubble, pick your AI vendor, and start a new conversation pre-loaded with your
          saved context.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 bg-destructive/10 border border-destructive/40 rounded-md px-4 py-2.5 text-sm text-destructive">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="hover:opacity-80"
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      {/* Step 1: Select a bubble */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">1. Select a bubble</h3>
        <p className="text-xs text-muted-foreground">
          Choose a bubble whose context you want to use as your conversation starter.
        </p>

        {loading && (
          <p className="text-center text-muted-foreground py-8 text-sm">Loading bubbles...</p>
        )}

        {!loading && bubbles.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            <p className="text-sm">No bubbles yet.</p>
            <p className="mt-1 text-xs">
              Create bubbles in the <strong>Bubbles</strong> page first.
            </p>
          </div>
        )}

        {!loading && bubbles.length > 0 && (
          <div className="flex flex-col gap-2">
            {bubbles.map((bubble) => (
              <BubbleRow
                key={bubble.id}
                bubble={bubble}
                isSelected={selectedBubbleId === bubble.id}
                isExpanded={expandedId === bubble.id}
                onSelect={() => handleSelect(bubble.id)}
                onToggle={() => handleToggle(bubble.id)}
                contexts={contextCache[bubble.id] ?? []}
                loadingContexts={loadingContexts === bubble.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Step 2: Pick vendor */}
      {selectedBubbleId && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">2. Choose your AI vendor</h3>
          <p className="text-xs text-muted-foreground">
            Where do you want to start the chat?
          </p>

          <div className="grid grid-cols-3 gap-3">
            {VENDORS.map((vendor) => (
              <button
                key={vendor.id}
                className={`text-left p-3 rounded-md border transition-colors flex flex-col gap-1.5 ${
                  selectedVendor === vendor.id
                    ? 'border-foreground/50 bg-secondary'
                    : 'border-border bg-card hover:bg-accent'
                }`}
                onClick={() => {
                  setSelectedVendor(vendor.id);
                  setGeneratedPrompt(null);
                  setCopiedOnly(false);
                  setCopiedAndOpened(false);
                }}
              >
                <h4 className="text-sm font-semibold text-foreground">{vendor.name}</h4>
                <p className="text-xs text-muted-foreground">{vendor.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Generate & launch */}
      {selectedBubbleId && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">3. Generate context prompt</h3>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={!selectedBubbleId}
              className="gap-2"
            >
              <Sparkles size={14} />
              Generate Prompt from "{selectedBubble?.name}"
            </Button>
            {selectedBubble && (
              <span className="text-xs text-muted-foreground">
                {selectedBubble.contextCount} context{selectedBubble.contextCount === 1 ? '' : 's'} will
                be included
              </span>
            )}
          </div>

          {/* Generated prompt preview */}
          {generatedPrompt && (
            <Card className="bg-card border-border overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between py-2.5 px-4 border-b border-border space-y-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Generated Context Prompt
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="border-border text-foreground hover:bg-accent h-7 text-xs gap-1"
                  >
                    {copiedOnly ? <Check size={11} /> : <Copy size={11} />}
                    {copiedOnly ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Textarea
                  value={generatedPrompt}
                  onChange={(e) => setGeneratedPrompt(e.target.value)}
                  className="border-0 rounded-none bg-background text-sm text-muted-foreground font-mono resize-none min-h-48 focus-visible:ring-0"
                  rows={10}
                />
              </CardContent>
            </Card>
          )}

          {/* Launch button */}
          {generatedPrompt && (
            <div className="flex items-center gap-3">
              <Button
                onClick={handleCopyAndOpen}
                className="gap-2"
              >
                {copiedAndOpened ? <Check size={14} /> : <ExternalLink size={14} />}
                {copiedAndOpened
                  ? 'Copied! Opening...'
                  : `Copy & Open ${selectedVendorInfo?.name ?? 'Chat'}`}
              </Button>
              <span className="text-xs text-muted-foreground">
                The context prompt will be copied to your clipboard. Paste it into the chat to get
                started.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
