import { useState } from 'react';
import {
  Eye,
  EyeOff,
  User,
  Code2,
  Target,
  MessageSquare,
  Settings2,
  CheckCircle2,
  Plug,
  Copy,
  Check,
} from 'lucide-react';
import type { UserPreferences } from '../types/preferences';
import { useAppState } from '../store/context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Redacted({ children, hidden }: { children: React.ReactNode; hidden: boolean }) {
  return <span className={hidden ? 'blur-sm select-none cursor-default' : ''}>{children}</span>;
}

function EmptyValue() {
  return <span className="text-muted-foreground/40">—</span>;
}

function TagList({ tags, hidden }: { tags: string[]; hidden: boolean }) {
  if (!tags.length) return <EmptyValue />;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className={`text-xs px-2 py-0.5 ${hidden ? 'blur-sm select-none' : ''}`}
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
}

function DashField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 text-sm min-h-[1.4em]">
      <span className="text-muted-foreground/60 text-xs min-w-[72px] flex-shrink-0">{label}</span>
      <div className="flex-1 min-w-0 text-foreground">{children}</div>
    </div>
  );
}

function DashCard({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`bg-card border-border ${className ?? ''}`}>
      <CardHeader className="flex flex-row items-center gap-2 py-2.5 px-4 border-b border-border space-y-0">
        <Icon size={13} className="text-muted-foreground" />
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex flex-col gap-2.5">{children}</CardContent>
    </Card>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={handleCopy}
      title="Copy to clipboard"
      className="flex items-center gap-1.5 h-7 text-xs px-2.5"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span>{copied ? 'Copied!' : 'Copy'}</span>
    </Button>
  );
}

type McpTab = 'node' | 'docker';

const MCP_TOOLS = [
  { name: 'save_context', desc: 'Save a memory or note from chat' },
  { name: 'recall_context', desc: 'Search and retrieve saved contexts' },
  { name: 'list_contexts', desc: 'List all contexts, optionally by tag' },
  { name: 'search_contexts', desc: 'Multi-keyword search across all contexts' },
  { name: 'update_context', desc: 'Update an existing context by ID' },
  { name: 'delete_context', desc: 'Remove a context by ID' },
];

function McpSection() {
  const [tab, setTab] = useState<McpTab>('docker');

  const nodeConfig = JSON.stringify(
    {
      mcpServers: {
        opencontext: {
          command: 'node',
          args: ['PATH_TO_PROJECT/dist/mcp/index.js'],
        },
      },
    },
    null,
    2,
  );

  const devConfig = JSON.stringify(
    {
      mcpServers: {
        opencontext: {
          command: 'npx',
          args: ['tsx', 'PATH_TO_PROJECT/src/mcp/index.ts'],
        },
      },
    },
    null,
    2,
  );

  const dockerConfig = JSON.stringify(
    {
      mcpServers: {
        opencontext: {
          command: 'docker',
          args: ['run', '-i', '--rm', '-v', 'opencontext-data:/root/.opencontext', 'opencontext-mcp'],
        },
      },
    },
    null,
    2,
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center gap-2 py-2.5 px-4 border-b border-border space-y-0">
        <Plug size={13} className="text-muted-foreground" />
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">
          MCP Server
        </CardTitle>
        <span className="text-xs bg-secondary text-secondary-foreground border border-border px-2 py-0.5 rounded-full font-mono">
          opencontext
        </span>
      </CardHeader>
      <CardContent className="p-4 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Connect the <strong className="text-foreground">opencontext MCP server</strong> to Claude
          Code or Claude Desktop so Claude can save and recall your context across conversations.
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          {MCP_TOOLS.map((tool) => (
            <div
              key={tool.name}
              className="flex flex-col gap-0.5 bg-muted border border-border rounded-sm px-2.5 py-2"
            >
              <code className="text-xs text-foreground font-mono">{tool.name}</code>
              <span className="text-xs text-muted-foreground">{tool.desc}</span>
            </div>
          ))}
        </div>

        {/* Setup tabs */}
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex gap-1 bg-muted rounded-sm p-0.5">
            {(['docker', 'node'] as McpTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 text-xs py-1.5 rounded-sm font-medium transition-colors ${
                  tab === t
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'docker' ? 'Docker' : 'Node.js'}
              </button>
            ))}
          </div>

          {tab === 'docker' && (
            <>
              {/* Docker Step 1 */}
              <div className="flex gap-3 items-start">
                <span className="bg-muted border border-border text-muted-foreground text-xs font-semibold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  1
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <p className="text-sm text-foreground">Build the Docker image</p>
                  <div className="flex items-center gap-2 bg-background border border-border rounded-sm px-3 py-2 font-mono text-sm text-muted-foreground">
                    <code className="flex-1">docker build -t opencontext-mcp .</code>
                    <CopyButton text="docker build -t opencontext-mcp ." />
                  </div>
                </div>
              </div>

              {/* Docker Step 2 — Claude Code */}
              <div className="flex gap-3 items-start">
                <span className="bg-muted border border-border text-muted-foreground text-xs font-semibold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  2
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <p className="text-sm text-foreground">
                    Claude Code — add to{' '}
                    <code className="bg-muted border border-border px-1.5 py-0.5 rounded-sm text-xs text-foreground">
                      ~/.claude/settings.json
                    </code>
                  </p>
                  <div className="flex flex-col gap-2 bg-background border border-border rounded-sm px-3 py-2 font-mono text-xs text-muted-foreground">
                    <pre className="whitespace-pre-wrap break-all">{dockerConfig}</pre>
                    <CopyButton text={dockerConfig} />
                  </div>
                </div>
              </div>

              {/* Docker Alt — Claude Desktop */}
              <div className="flex gap-3 items-start">
                <span className="bg-muted border border-border text-muted-foreground text-xs font-semibold w-8 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 px-1">
                  alt
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <p className="text-sm text-foreground">
                    Claude Desktop — add to{' '}
                    <code className="bg-muted border border-border px-1.5 py-0.5 rounded-sm text-xs text-foreground">
                      ~/Library/Application Support/Claude/claude_desktop_config.json
                    </code>
                  </p>
                  <div className="flex flex-col gap-2 bg-background border border-border rounded-sm px-3 py-2 font-mono text-xs text-muted-foreground">
                    <pre className="whitespace-pre-wrap break-all">{dockerConfig}</pre>
                    <CopyButton text={dockerConfig} />
                  </div>
                </div>
              </div>

              {/* Docker Step 3 */}
              <div className="flex gap-3 items-start">
                <span className="bg-muted border border-border text-muted-foreground text-xs font-semibold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  3
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <p className="text-sm text-foreground">
                    Context persists in the{' '}
                    <code className="bg-muted border border-border px-1.5 py-0.5 rounded-sm text-xs text-foreground">
                      opencontext-data
                    </code>{' '}
                    Docker named volume
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The <code className="bg-muted border border-border px-1 py-0.5 rounded-sm text-xs">-i</code> flag
                    is required — the MCP server communicates over stdin/stdout. Each Claude request
                    spins up a short-lived container; the volume keeps data across runs.
                  </p>
                </div>
              </div>
            </>
          )}

          {tab === 'node' && (
            <>
              {/* Node Step 1 */}
              <div className="flex gap-3 items-start">
                <span className="bg-muted border border-border text-muted-foreground text-xs font-semibold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  1
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <p className="text-sm text-foreground">Build the project</p>
                  <div className="flex items-center gap-2 bg-background border border-border rounded-sm px-3 py-2 font-mono text-sm text-muted-foreground">
                    <code className="flex-1">npm run build</code>
                    <CopyButton text="npm run build" />
                  </div>
                </div>
              </div>

              {/* Node Step 2 */}
              <div className="flex gap-3 items-start">
                <span className="bg-muted border border-border text-muted-foreground text-xs font-semibold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  2
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <p className="text-sm text-foreground">
                    Add to{' '}
                    <code className="bg-muted border border-border px-1.5 py-0.5 rounded-sm text-xs text-foreground">
                      ~/.claude/settings.json
                    </code>
                  </p>
                  <div className="flex flex-col gap-2 bg-background border border-border rounded-sm px-3 py-2 font-mono text-xs text-muted-foreground">
                    <pre className="whitespace-pre-wrap break-all">{nodeConfig}</pre>
                    <CopyButton text={nodeConfig} />
                  </div>
                </div>
              </div>

              {/* Node Alt step */}
              <div className="flex gap-3 items-start">
                <span className="bg-muted border border-border text-muted-foreground text-xs font-semibold w-8 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 px-1">
                  alt
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <p className="text-sm text-foreground">Or run in dev mode (no build needed)</p>
                  <div className="flex flex-col gap-2 bg-background border border-border rounded-sm px-3 py-2 font-mono text-xs text-muted-foreground">
                    <pre className="whitespace-pre-wrap break-all">{devConfig}</pre>
                    <CopyButton text={devConfig} />
                  </div>
                </div>
              </div>

              {/* Node Step 3 */}
              <div className="flex gap-3 items-start">
                <span className="bg-muted border border-border text-muted-foreground text-xs font-semibold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  3
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <p className="text-sm text-foreground">
                    Context is stored at{' '}
                    <code className="bg-muted border border-border px-1.5 py-0.5 rounded-sm text-xs text-foreground">
                      ~/.opencontext/contexts.json
                    </code>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Set{' '}
                    <code className="bg-muted border border-border px-1 py-0.5 rounded-sm text-xs">
                      OPENCONTEXT_STORE_PATH
                    </code>{' '}
                    env var to use a custom path.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function computeCompleteness(preferences: UserPreferences): number {
  const checks = [
    !!preferences.workContext.role,
    !!preferences.workContext.industry,
    !!preferences.workContext.description,
    !!preferences.personalContext.background,
    preferences.personalContext.interests.length > 0,
    preferences.currentFocus.projects.length > 0,
    preferences.currentFocus.goals.length > 0,
    !!preferences.currentFocus.topOfMind,
    preferences.technicalProfile.primaryLanguages.length > 0,
    !!preferences.customInstructions,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export default function Dashboard() {
  const { state } = useAppState();
  const [privacyMode, setPrivacyMode] = useState(false);
  const { preferences: p, conversations } = state;

  const completeness = computeCompleteness(p);
  const selectedCount = conversations.filter((c) => c.selected).length;
  const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);
  const completenessColor =
    completeness < 40
      ? 'text-destructive'
      : completeness < 70
        ? 'text-yellow-500'
        : 'text-green-500';

  return (
    <div className="flex flex-col gap-4">
      {/* Logo hero */}
      <div className="flex flex-col items-center gap-2 pt-2 pb-4">
        <img src="/opencontext-logo.png" alt="opencontext" className="w-16 h-16" />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">opencontext</h1>
        <p className="text-sm text-muted-foreground">Portable AI preferences &amp; context</p>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Your Context</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            A snapshot of your profile and imported conversations
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPrivacyMode((v) => !v)}
          className={`flex items-center gap-1.5 ${privacyMode ? 'border-yellow-500/50 text-yellow-500' : 'border-border text-muted-foreground hover:text-foreground'}`}
          title={privacyMode ? 'Show personal information' : 'Hide personal information'}
        >
          {privacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>{privacyMode ? 'Show info' : 'Hide info'}</span>
        </Button>
      </div>

      {/* Privacy banner */}
      {privacyMode && (
        <div className="flex items-center gap-2 bg-yellow-500/8 border border-yellow-500/40 rounded-md px-4 py-2.5 text-sm text-yellow-500">
          <EyeOff size={13} />
          <span>Personal information is hidden — safe to share your screen.</span>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { value: conversations.length, label: 'Conversations' },
          { value: totalMessages, label: 'Messages' },
          { value: selectedCount, label: 'Selected' },
          { value: `${completeness}%`, label: 'Profile complete', colorClass: completenessColor },
        ].map(({ value, label, colorClass }) => (
          <Card key={label} className="bg-card border-border text-center">
            <CardContent className="p-4">
              <span className={`block text-2xl font-semibold ${colorClass ?? 'text-foreground'}`}>
                {value}
              </span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Preference cards grid */}
      <div className="grid grid-cols-2 gap-3">
        <DashCard title="Work & Personal" icon={User}>
          <DashField label="Role">
            {p.workContext.role ? (
              <Redacted hidden={privacyMode}>{p.workContext.role}</Redacted>
            ) : (
              <EmptyValue />
            )}
          </DashField>
          <DashField label="Industry">
            {p.workContext.industry ? (
              <Redacted hidden={privacyMode}>{p.workContext.industry}</Redacted>
            ) : (
              <EmptyValue />
            )}
          </DashField>
          <DashField label="Background">
            {p.personalContext.background ? (
              <Redacted hidden={privacyMode}>{p.personalContext.background}</Redacted>
            ) : (
              <EmptyValue />
            )}
          </DashField>
          <DashField label="Interests">
            <TagList tags={p.personalContext.interests} hidden={privacyMode} />
          </DashField>
        </DashCard>

        <DashCard title="Current Focus" icon={Target}>
          <DashField label="Top of mind">
            {p.currentFocus.topOfMind ? (
              <Redacted hidden={privacyMode}>{p.currentFocus.topOfMind}</Redacted>
            ) : (
              <EmptyValue />
            )}
          </DashField>
          <DashField label="Projects">
            <TagList tags={p.currentFocus.projects} hidden={privacyMode} />
          </DashField>
          <DashField label="Goals">
            <TagList tags={p.currentFocus.goals} hidden={privacyMode} />
          </DashField>
        </DashCard>

        <DashCard title="Tech Profile" icon={Code2}>
          <DashField label="Level">{p.technicalProfile.experienceLevel}</DashField>
          <DashField label="Languages">
            <TagList tags={p.technicalProfile.primaryLanguages} hidden={false} />
          </DashField>
          <DashField label="Frameworks">
            <TagList tags={p.technicalProfile.frameworks} hidden={false} />
          </DashField>
          <DashField label="Tools">
            <TagList tags={p.technicalProfile.tools} hidden={false} />
          </DashField>
        </DashCard>

        <DashCard title="Communication" icon={Settings2}>
          <DashField label="Tone">{p.communicationStyle.tone}</DashField>
          <DashField label="Detail">{p.communicationStyle.detailLevel}</DashField>
          <DashField label="Format">{p.communicationStyle.responseFormat}</DashField>
          <DashField label="Language">{p.communicationStyle.languagePreference}</DashField>
        </DashCard>
      </div>

      {/* Conversations list */}
      <DashCard title="Conversations" icon={MessageSquare}>
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No conversations imported yet. Go to Conversations to import.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {conversations.slice(0, 10).map((conv) => (
              <div
                key={conv.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-sm text-sm ${
                  conv.selected ? 'bg-secondary' : 'bg-muted'
                }`}
              >
                {conv.selected && (
                  <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                )}
                <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  <Redacted hidden={privacyMode}>
                    {conv.title || 'Untitled conversation'}
                  </Redacted>
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {conv.messages.length} msgs
                </span>
              </div>
            ))}
            {conversations.length > 10 && (
              <p className="text-center text-xs text-muted-foreground pt-1">
                +{conversations.length - 10} more conversations
              </p>
            )}
          </div>
        )}
      </DashCard>

      {/* MCP server section */}
      <McpSection />
    </div>
  );
}
