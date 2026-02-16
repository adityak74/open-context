import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, X, Check, Search, Tag, Clock, Database } from 'lucide-react';
import type { ContextEntry } from '@/types/bubbles';

function tagsFromString(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Inline form for creating or editing a context entry
// ---------------------------------------------------------------------------

function ContextForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: { content: string; tags: string; source: string };
  onSave: (content: string, tags: string[], source: string) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [content, setContent] = useState(initial.content);
  const [tags, setTags] = useState(initial.tags);
  const [source, setSource] = useState(initial.source);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    onSave(content.trim(), tagsFromString(tags), source.trim() || 'ui');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Content</Label>
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Enter context content..."
          rows={5}
          className="bg-input border-border text-foreground text-sm resize-none"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">
            Tags
            <span className="ml-1 font-normal opacity-60">(comma-separated)</span>
          </Label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. work, project, goal"
            className="bg-input border-border text-foreground text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Source</Label>
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="ui"
            className="bg-input border-border text-foreground text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
          className="text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!content.trim() || isSaving}
          className="gap-1.5"
        >
          <Check size={13} />
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Single context card
// ---------------------------------------------------------------------------

function ContextCard({
  entry,
  onEdit,
  onDelete,
  onSaveEdit,
  isEditing,
  isSaving,
  onCancelEdit,
}: {
  entry: ContextEntry;
  onEdit: () => void;
  onDelete: () => void;
  onSaveEdit: (content: string, tags: string[], source: string) => void;
  isEditing: boolean;
  isSaving: boolean;
  onCancelEdit: () => void;
}) {
  const wasUpdated = entry.updatedAt !== entry.createdAt;

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardHeader className="flex flex-row items-start gap-3 p-3 space-y-0">
        <div className="flex-1 min-w-0">
          {!isEditing && (
            <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {entry.content.length > 300
                ? entry.content.slice(0, 300) + '…'
                : entry.content}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {entry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {entry.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs px-2 py-0 h-5 gap-1"
                  >
                    <Tag size={10} />
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
              <Clock size={10} />
              <span>
                {wasUpdated ? `Updated ${formatDate(entry.updatedAt)}` : `Created ${formatDate(entry.createdAt)}`}
              </span>
              {entry.source && entry.source !== 'ui' && (
                <>
                  <span className="mx-1 opacity-40">&middot;</span>
                  <Database size={10} />
                  <span>{entry.source}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onEdit}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label="Edit context"
              title="Edit"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive transition-colors p-1"
              aria-label="Delete context"
              title="Delete"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </CardHeader>

      {isEditing && (
        <CardContent className="p-3 border-t border-border">
          <ContextForm
            initial={{
              content: entry.content,
              tags: entry.tags.join(', '),
              source: entry.source,
            }}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            isSaving={isSaving}
          />
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ContextsManager() {
  const [contexts, setContexts] = useState<ContextEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  async function fetchContexts() {
    try {
      const res = await fetch('/api/contexts');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = (await res.json()) as ContextEntry[];
      setContexts(data.slice().reverse()); // newest first
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contexts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchContexts();
  }, []);

  async function handleCreate(content: string, tags: string[], source: string) {
    setIsCreating(true);
    try {
      const res = await fetch('/api/contexts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, tags, source }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const created = (await res.json()) as ContextEntry;
      setContexts((prev) => [created, ...prev]);
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create context');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(id: string, content: string, tags: string[], source: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/contexts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, tags, source }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const updated = (await res.json()) as ContextEntry;
      setContexts((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update context');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/contexts/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`Server error ${res.status}`);
      setContexts((prev) => prev.filter((c) => c.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete context');
    }
  }

  const filtered = contexts.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.content.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q)) ||
      c.source.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">MCP Contexts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage saved context entries used by the open-context MCP server.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setShowCreateForm((v) => !v);
            setEditingId(null);
          }}
          className="gap-1.5 flex-shrink-0"
        >
          <Plus size={14} />
          New Context
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 bg-destructive/10 border border-destructive/40 rounded-md px-4 py-2.5 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:opacity-80">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <Card className="bg-card border-border border-dashed">
          <CardHeader className="px-4 pt-3 pb-0 space-y-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              New Context
            </span>
          </CardHeader>
          <CardContent className="p-4">
            <ContextForm
              initial={{ content: '', tags: '', source: 'ui' }}
              onSave={handleCreate}
              onCancel={() => setShowCreateForm(false)}
              isSaving={isCreating}
            />
          </CardContent>
        </Card>
      )}

      {/* Search */}
      {(contexts.length > 0 || search) && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contexts, tags, or source…"
            className="bg-input border-border text-foreground text-sm pl-8"
          />
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center text-muted-foreground py-12 text-sm">
          Loading contexts…
        </div>
      )}

      {/* Context list */}
      {!loading && (
        <>
          <div className="flex flex-col gap-2">
            {filtered.map((entry) => (
              <ContextCard
                key={entry.id}
                entry={entry}
                isEditing={editingId === entry.id}
                isSaving={savingId === entry.id}
                onEdit={() => {
                  setEditingId(entry.id);
                  setShowCreateForm(false);
                }}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(content, tags, source) => handleUpdate(entry.id, content, tags, source)}
                onDelete={() => handleDelete(entry.id)}
              />
            ))}
          </div>

          {filtered.length === 0 && !loading && (
            <div className="text-center text-muted-foreground py-12">
              {search ? (
                <p>No contexts match your search.</p>
              ) : (
                <>
                  <p>No contexts saved yet.</p>
                  <p className="mt-1 text-xs">
                    Use the MCP server or click <strong>New Context</strong> to add your first entry.
                  </p>
                </>
              )}
            </div>
          )}

          {contexts.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              {filtered.length === contexts.length
                ? `${contexts.length} context${contexts.length === 1 ? '' : 's'}`
                : `${filtered.length} of ${contexts.length} contexts`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
