import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Pencil,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Tag,
  Clock,
  Layers,
} from 'lucide-react';
import type { Bubble, ContextEntry } from '@/types/bubbles';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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
// Bubble name/description form (create & edit)
// ---------------------------------------------------------------------------

function BubbleForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: { name: string; description: string };
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), description.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Bubble name</Label>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Work Projects, Learning, Personal"
          className="bg-input border-border text-foreground text-sm"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Description <span className="font-normal opacity-60">(optional)</span></Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this bubble for?"
          className="bg-input border-border text-foreground text-sm"
        />
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
        <Button type="submit" size="sm" disabled={!name.trim() || isSaving} className="gap-1.5">
          <Check size={13} />
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Context form (create & edit within a bubble)
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
          placeholder="Enter context content…"
          rows={4}
          className="bg-input border-border text-foreground text-sm resize-none"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">
            Tags <span className="font-normal opacity-60">(comma-separated)</span>
          </Label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. idea, research, todo"
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
        <Button type="submit" size="sm" disabled={!content.trim() || isSaving} className="gap-1.5">
          <Check size={13} />
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Context row inside a bubble
// ---------------------------------------------------------------------------

function ContextRow({
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
    <div className="border border-border rounded-sm overflow-hidden">
      <div className="flex items-start gap-2 p-2.5">
        <div className="flex-1 min-w-0">
          {!isEditing && (
            <p className="text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {entry.content.length > 250
                ? entry.content.slice(0, 250) + '…'
                : entry.content}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {entry.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0 h-4 gap-0.5">
                <Tag size={9} />
                {tag}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
              <Clock size={9} />
              {wasUpdated ? `Updated ${formatDate(entry.updatedAt)}` : formatDate(entry.createdAt)}
            </span>
          </div>
        </div>
        {!isEditing && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={onEdit}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label="Edit context"
              title="Edit"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive transition-colors p-1"
              aria-label="Delete context"
              title="Delete"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>
      {isEditing && (
        <div className="p-2.5 border-t border-border bg-muted/20">
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
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded bubble detail (contexts list + add form)
// ---------------------------------------------------------------------------

function BubbleDetail({
  bubble,
  onError,
}: {
  bubble: Bubble;
  onError: (msg: string) => void;
}) {
  const [contexts, setContexts] = useState<ContextEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchContexts();
  }, [bubble.id]);

  async function fetchContexts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/bubbles/${bubble.id}/contexts`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setContexts(((await res.json()) as ContextEntry[]).slice().reverse());
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load contexts');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(content: string, tags: string[], source: string) {
    setIsAdding(true);
    try {
      const res = await fetch('/api/contexts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, tags, source, bubbleId: bubble.id }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const created = (await res.json()) as ContextEntry;
      setContexts((prev) => [created, ...prev]);
      setShowAdd(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create context');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleUpdate(id: string, content: string, tags: string[], source: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/contexts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, tags, source, bubbleId: bubble.id }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const updated = (await res.json()) as ContextEntry;
      setContexts((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update context');
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
      onError(err instanceof Error ? err.message : 'Failed to delete context');
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      {/* Add context button + form */}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setShowAdd((v) => !v); setEditingId(null); }}
          className="gap-1.5 h-7 text-xs border-border"
        >
          <Plus size={12} />
          Add Context
        </Button>
      </div>

      {showAdd && (
        <div className="border border-dashed border-border rounded-sm p-3">
          <ContextForm
            initial={{ content: '', tags: '', source: 'ui' }}
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
            isSaving={isAdding}
          />
        </div>
      )}

      {loading && (
        <p className="text-xs text-muted-foreground py-3 text-center">Loading…</p>
      )}

      {!loading && contexts.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground py-3 text-center">
          No contexts in this bubble yet. Add one above.
        </p>
      )}

      {!loading && contexts.map((entry) => (
        <ContextRow
          key={entry.id}
          entry={entry}
          isEditing={editingId === entry.id}
          isSaving={savingId === entry.id}
          onEdit={() => { setEditingId(entry.id); setShowAdd(false); }}
          onCancelEdit={() => setEditingId(null)}
          onSaveEdit={(content, tags, source) => handleUpdate(entry.id, content, tags, source)}
          onDelete={() => handleDelete(entry.id)}
        />
      ))}

      {contexts.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {contexts.length} context{contexts.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single bubble card
// ---------------------------------------------------------------------------

function BubbleCard({
  bubble,
  isExpanded,
  isEditing,
  isSaving,
  onToggle,
  onEdit,
  onDelete,
  onSaveEdit,
  onCancelEdit,
  onError,
}: {
  bubble: Bubble;
  isExpanded: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveEdit: (name: string, description: string) => void;
  onCancelEdit: () => void;
  onError: (msg: string) => void;
}) {
  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-3 p-3 space-y-0">
        {/* Expand toggle */}
        {!isEditing && (
          <button
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            aria-label={isExpanded ? 'Collapse bubble' : 'Expand bubble'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <BubbleForm
              initial={{ name: bubble.name, description: bubble.description ?? '' }}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
              isSaving={isSaving}
            />
          ) : (
            <>
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={onToggle}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onToggle()}
                aria-label={`Bubble: ${bubble.name}`}
              >
                <h3 className="text-sm font-semibold text-foreground">{bubble.name}</h3>
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4 flex-shrink-0">
                  {bubble.contextCount}
                </Badge>
              </div>
              {bubble.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {bubble.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                {formatDate(bubble.createdAt)}
              </p>
            </>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onEdit}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label="Edit bubble"
              title="Edit bubble"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive transition-colors p-1"
              aria-label="Delete bubble"
              title="Delete bubble"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </CardHeader>

      {isExpanded && !isEditing && (
        <CardContent className="p-3 border-t border-border">
          <BubbleDetail bubble={bubble} onError={onError} />
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BubblesManager() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

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

  async function handleCreate(name: string, description: string) {
    setIsCreating(true);
    try {
      const res = await fetch('/api/bubbles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || undefined }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const created = (await res.json()) as Bubble;
      setBubbles((prev) => [...prev, { ...created, contextCount: 0 }]);
      setShowCreate(false);
      setExpandedId(created.id); // auto-expand newly created bubble
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bubble');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(id: string, name: string, description: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/bubbles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || undefined }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const updated = (await res.json()) as Bubble;
      setBubbles((prev) =>
        prev.map((b) => (b.id === id ? { ...updated, contextCount: b.contextCount } : b)),
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bubble');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/bubbles/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`Server error ${res.status}`);
      setBubbles((prev) => prev.filter((b) => b.id !== id));
      if (expandedId === id) setExpandedId(null);
      if (editingId === id) setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bubble');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Bubbles</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Project workspaces for grouping related contexts. Manage via UI or MCP tools.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setShowCreate((v) => !v); setEditingId(null); }}
          className="gap-1.5 flex-shrink-0"
        >
          <Plus size={14} />
          New Bubble
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 bg-destructive/10 border border-destructive/40 rounded-md px-4 py-2.5 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:opacity-80" aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <Card className="bg-card border-border border-dashed">
          <CardHeader className="px-4 pt-3 pb-0 space-y-0">
            <div className="flex items-center gap-2">
              <Layers size={13} className="text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                New Bubble
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <BubbleForm
              initial={{ name: '', description: '' }}
              onSave={handleCreate}
              onCancel={() => setShowCreate(false)}
              isSaving={isCreating}
            />
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-center text-muted-foreground py-12 text-sm">Loading bubbles…</p>
      )}

      {/* Bubble list */}
      {!loading && (
        <>
          <div className="flex flex-col gap-2">
            {bubbles.map((bubble) => (
              <BubbleCard
                key={bubble.id}
                bubble={bubble}
                isExpanded={expandedId === bubble.id}
                isEditing={editingId === bubble.id}
                isSaving={savingId === bubble.id}
                onToggle={() => {
                  setExpandedId(expandedId === bubble.id ? null : bubble.id);
                  setEditingId(null);
                }}
                onEdit={() => {
                  setEditingId(bubble.id);
                  setShowCreate(false);
                }}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(name, description) => handleUpdate(bubble.id, name, description)}
                onDelete={() => handleDelete(bubble.id)}
                onError={setError}
              />
            ))}
          </div>

          {bubbles.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              <p>No bubbles yet.</p>
              <p className="mt-1 text-xs">
                Click <strong>New Bubble</strong> or use the MCP{' '}
                <code className="bg-muted px-1 rounded-sm text-xs">create_bubble</code> tool.
              </p>
            </div>
          )}

          {bubbles.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              {bubbles.length} bubble{bubbles.length === 1 ? '' : 's'} ·{' '}
              {bubbles.reduce((s, b) => s + b.contextCount, 0)} contexts total
            </p>
          )}
        </>
      )}
    </div>
  );
}
