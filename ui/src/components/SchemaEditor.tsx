import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

interface SchemaField {
  type: 'string' | 'string[]' | 'number' | 'boolean' | 'enum';
  required?: boolean;
  description?: string;
  values?: string[];
  default?: unknown;
}

interface SchemaType {
  name: string;
  description: string;
  fields: Record<string, SchemaField>;
}

interface Schema {
  version: number;
  types: SchemaType[];
}

const STARTER_TEMPLATES: Schema[] = [
  {
    version: 1,
    types: [
      {
        name: 'decision',
        description: 'Architectural or technical decisions with rationale',
        fields: {
          what: { type: 'string', required: true, description: 'What was decided' },
          why: { type: 'string', required: true, description: 'Reasoning behind the decision' },
          alternatives: { type: 'string[]', description: 'Options that were considered and rejected' },
          project: { type: 'string', description: 'Which project this applies to' },
        },
      },
      {
        name: 'preference',
        description: 'User preferences that agents should respect',
        fields: {
          domain: { type: 'string', required: true, description: 'Category (code-style, tooling, communication, etc.)' },
          rule: { type: 'string', required: true, description: 'The actual preference' },
          strength: { type: 'enum', values: ['strong', 'mild', 'flexible'], default: 'mild', description: 'How strongly to enforce this preference' },
        },
      },
      {
        name: 'bug_pattern',
        description: 'Recurring bugs and their solutions',
        fields: {
          symptom: { type: 'string', required: true, description: 'How the bug manifests' },
          root_cause: { type: 'string', description: 'Why it happens' },
          fix: { type: 'string', description: 'How to resolve it' },
        },
      },
    ],
  },
];

const EMPTY_FIELD: SchemaField = { type: 'string', required: false, description: '' };

function FieldEditor({
  name,
  field,
  onChange,
  onRename,
  onDelete,
}: {
  name: string;
  field: SchemaField;
  onChange: (field: SchemaField) => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border last:border-0">
      <div className="flex-1 grid grid-cols-2 gap-2">
        <Input
          value={name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="field_name"
          className="h-7 text-xs font-mono"
        />
        <select
          value={field.type}
          onChange={(e) => onChange({ ...field, type: e.target.value as SchemaField['type'] })}
          className="h-7 text-xs rounded-md border border-input bg-background px-2"
        >
          <option value="string">string</option>
          <option value="string[]">string[]</option>
          <option value="number">number</option>
          <option value="boolean">boolean</option>
          <option value="enum">enum</option>
        </select>
        <Input
          value={field.description ?? ''}
          onChange={(e) => onChange({ ...field, description: e.target.value })}
          placeholder="Description..."
          className="h-7 text-xs col-span-2"
        />
        {field.type === 'enum' && (
          <Input
            value={field.values?.join(', ') ?? ''}
            onChange={(e) =>
              onChange({ ...field, values: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })
            }
            placeholder="value1, value2, value3"
            className="h-7 text-xs col-span-2"
          />
        )}
      </div>
      <div className="flex items-center gap-1 pt-0.5">
        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={field.required ?? false}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
            className="h-3 w-3"
          />
          req
        </label>
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive p-0.5 rounded"
          aria-label="Delete field"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function TypeEditor({
  type,
  onChange,
  onDelete,
}: {
  type: SchemaType;
  onChange: (t: SchemaType) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  // Monotonically increasing counter for field keys — avoids collision when
  // fields are deleted and re-added (e.g. add field_1, add field_2, delete field_1,
  // add again → field_3, not field_2 which would overwrite the existing field_2).
  const fieldCounter = useRef(Object.keys(type.fields).length + 1);

  function addField() {
    const key = `field_${fieldCounter.current++}`;
    onChange({
      ...type,
      fields: { ...type.fields, [key]: { ...EMPTY_FIELD } },
    });
  }

  function updateField(oldName: string, newName: string, field: SchemaField) {
    const entries = Object.entries(type.fields).map(([k, v]) =>
      k === oldName ? [newName, field] : [k, v],
    );
    onChange({ ...type, fields: Object.fromEntries(entries) });
  }

  function deleteField(name: string) {
    const { [name]: _removed, ...rest } = type.fields;
    onChange({ ...type, fields: rest });
  }

  return (
    <Card className="p-4 gap-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1.5">
          <Input
            value={type.name}
            onChange={(e) => onChange({ ...type, name: e.target.value })}
            placeholder="type_name"
            className="h-7 text-sm font-mono font-medium"
          />
          <Input
            value={type.description}
            onChange={(e) => onChange({ ...type, description: e.target.value })}
            placeholder="Description of what this type tracks..."
            className="h-7 text-xs"
          />
        </div>
        <div className="flex gap-1 pt-0.5">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-muted-foreground hover:text-foreground p-0.5"
            aria-label="Toggle fields"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive p-0.5"
            aria-label="Delete type"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3">
          <Separator className="mb-2" />
          {Object.entries(type.fields).map(([name, field]) => (
            <FieldEditor
              key={name}
              name={name}
              field={field}
              onChange={(f) => updateField(name, name, f)}
              onRename={(newName) => updateField(name, newName, field)}
              onDelete={() => deleteField(name)}
            />
          ))}
          <button
            onClick={addField}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus size={12} /> Add field
          </button>
        </div>
      )}
    </Card>
  );
}

export default function SchemaEditor() {
  const [schema, setSchema] = useState<Schema>({ version: 1, types: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/schema')
      .then((r) => r.json())
      .then((data: Schema) => {
        setSchema(data ?? { version: 1, types: [] });
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load schema');
        setLoading(false);
      });
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/schema', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schema),
      });
      if (!res.ok) throw new Error('Save failed');
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      setError('Failed to save schema');
    } finally {
      setSaving(false);
    }
  }, [schema]);

  function addType() {
    setSchema((s) => ({
      ...s,
      types: [...s.types, { name: `type_${s.types.length + 1}`, description: '', fields: {} }],
    }));
  }

  function updateType(index: number, type: SchemaType) {
    setSchema((s) => {
      const types = [...s.types];
      types[index] = type;
      return { ...s, types };
    });
  }

  function deleteType(index: number) {
    setSchema((s) => ({ ...s, types: s.types.filter((_, i) => i !== index) }));
  }

  function loadTemplate() {
    const template = STARTER_TEMPLATES[0];
    if (template) setSchema(template);
  }

  if (loading) {
    return <div className="text-muted-foreground text-sm">Loading schema...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Context Schema</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define custom context types. Agents use these types to save structured, queryable context.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && <span className="text-xs text-muted-foreground">Saved {savedAt}</span>}
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button size="sm" variant="outline" onClick={save} disabled={saving} className="gap-1.5">
            <Save size={13} />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {schema.types.length === 0 && (
        <Card className="p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">No context types defined yet.</p>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={loadTemplate}>
              Load starter template
            </Button>
            <Button size="sm" onClick={addType} className="gap-1.5">
              <Plus size={13} /> New type
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {schema.types.map((type, index) => (
          <TypeEditor
            key={type.name}
            type={type}
            onChange={(t) => updateType(index, t)}
            onDelete={() => deleteType(index)}
          />
        ))}
      </div>

      {schema.types.length > 0 && (
        <button
          onClick={addType}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus size={14} /> Add context type
        </button>
      )}

      {schema.types.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Preview (schema.json)</Label>
          <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-48 leading-relaxed">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
