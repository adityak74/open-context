import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, Info, CheckCircle, XCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface Gap {
  description: string;
  severity: 'info' | 'warning';
  suggestion: string;
}

interface Contradiction {
  entryA: string;
  entryB: string;
  description: string;
}

interface SelfModel {
  identity: {
    contextCount: number;
    typeBreakdown: Record<string, number>;
    bubbleCount: number;
    oldestEntryDate: string;
    newestEntryDate: string;
  };
  coverage: {
    typesWithEntries: string[];
    typesEmpty: string[];
    untyped: number;
  };
  freshness: {
    recentlyUpdated: number;
    stale: number;
    stalestEntries: Array<{ id: string; type?: string; updatedAt: string }>;
  };
  gaps: Gap[];
  contradictions: Contradiction[];
  health: {
    coverageScore: number;
    freshnessScore: number;
    overallHealth: 'healthy' | 'needs-attention' | 'sparse';
  };
  pendingActionsCount: number;
  recentImprovements: Array<{
    timestamp: string;
    actions: Array<{ type: string; count: number }>;
  }>;
}

interface PendingAction {
  id: string;
  createdAt: string;
  expiresAt: string;
  action: { type: string };
  risk: 'low' | 'medium' | 'high';
  description: string;
  reasoning: string;
  preview: Record<string, unknown>;
  status: string;
}

function HealthBadge({ health }: { health: SelfModel['health']['overallHealth'] }) {
  const styles = {
    healthy: 'bg-green-500/15 text-green-400 border-green-500/30',
    'needs-attention': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    sparse: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  const icons = {
    healthy: <CheckCircle size={11} />,
    'needs-attention': <AlertTriangle size={11} />,
    sparse: <XCircle size={11} />,
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${styles[health]}`}>
      {icons[health]}
      {health}
    </span>
  );
}

function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
  const styles = {
    low: 'bg-green-500/15 text-green-400',
    medium: 'bg-yellow-500/15 text-yellow-400',
    high: 'bg-red-500/15 text-red-400',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${styles[risk]}`}>
      {risk.toUpperCase()}
    </span>
  );
}

function PendingActionCard({
  action,
  onApprove,
  onDismiss,
}: {
  action: PendingAction;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-start gap-2">
        <RiskBadge risk={action.risk} />
        <p className="text-xs flex-1">{action.description}</p>
      </div>
      <p className="text-xs text-muted-foreground">{action.reasoning}</p>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={onApprove}>
          Approve
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-muted-foreground" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </Card>
  );
}

export default function AwarenessPanel() {
  const [model, setModel] = useState<SelfModel | null>(null);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [awarenessRes, pendingRes] = await Promise.all([
        fetch('/api/awareness'),
        fetch('/api/pending-actions'),
      ]);
      if (!awarenessRes.ok) throw new Error('Failed to load awareness data');
      setModel(await awarenessRes.json() as SelfModel);
      if (pendingRes.ok) setPending(await pendingRes.json() as PendingAction[]);
    } catch {
      setError('Failed to load awareness data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function runDeepAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize' }),
      });
      if (res.ok) {
        const data = await res.json() as { result: string };
        setSummary(data.result);
      }
    } catch {
      // Non-fatal
    } finally {
      setAnalyzing(false);
    }
  }

  async function approveAction(id: string) {
    await fetch(`/api/pending-actions/${id}/approve`, { method: 'POST' });
    // Use optimistic update only — fetchData would flash a loading state immediately
    // after the remove and would race with the optimistic update.
    setPending((prev) => prev.filter((a) => a.id !== id));
  }

  async function dismissAction(id: string) {
    await fetch(`/api/pending-actions/${id}/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setPending((prev) => prev.filter((a) => a.id !== id));
  }

  async function approveAll(risk: 'low' | 'medium') {
    const ids = pending.filter((a) => a.risk === risk).map((a) => a.id);
    if (ids.length === 0) return;
    await fetch('/api/pending-actions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_ids: ids, decision: 'approve' }),
    });
    // Optimistic update — remove approved actions from local state without re-fetching
    setPending((prev) => prev.filter((a) => !ids.includes(a.id)));
  }

  if (loading) {
    return <div className="text-muted-foreground text-sm">Loading awareness data...</div>;
  }

  if (error || !model) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error ?? 'No data'}</p>
        <Button size="sm" variant="outline" onClick={fetchData}>Retry</Button>
      </div>
    );
  }

  const { identity, coverage, freshness, gaps, contradictions, health, recentImprovements } = model;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Context Awareness</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Self-model of the context store — what's known, what's missing, what needs attention.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={runDeepAnalysis}
            disabled={analyzing}
            className="gap-1.5 text-xs"
          >
            <Zap size={12} />
            {analyzing ? 'Analyzing...' : 'Deep Analysis'}
          </Button>
          <Button size="sm" variant="ghost" onClick={fetchData} className="gap-1.5 text-xs">
            <RefreshCw size={12} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Health summary */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Store Health</span>
          <HealthBadge health={health.overallHealth} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-2xl font-semibold tabular-nums">{identity.contextCount}</div>
            <div className="text-xs text-muted-foreground">entries</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold tabular-nums">{Math.round(health.coverageScore * 100)}%</div>
            <div className="text-xs text-muted-foreground">coverage</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold tabular-nums">{Math.round(health.freshnessScore * 100)}%</div>
            <div className="text-xs text-muted-foreground">freshness</div>
          </div>
        </div>
      </Card>

      {/* AI Summary */}
      {summary && (
        <Card className="p-4 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Zap size={12} className="text-yellow-400" />
            <span className="text-xs font-medium text-muted-foreground">AI Summary</span>
          </div>
          <p className="text-sm leading-relaxed">{summary}</p>
        </Card>
      )}

      {/* Type coverage */}
      {(coverage.typesWithEntries.length > 0 || coverage.typesEmpty.length > 0) && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Type Coverage</h2>
          <div className="flex flex-wrap gap-1.5">
            {coverage.typesWithEntries.map((t) => (
              <Badge key={t} variant="outline" className="text-xs gap-1">
                <CheckCircle size={9} className="text-green-400" /> {t}
                {identity.typeBreakdown[t] !== undefined && (
                  <span className="text-muted-foreground">·{identity.typeBreakdown[t]}</span>
                )}
              </Badge>
            ))}
            {coverage.typesEmpty.map((t) => (
              <Badge key={t} variant="outline" className="text-xs gap-1 opacity-50">
                <XCircle size={9} className="text-muted-foreground" /> {t}
              </Badge>
            ))}
          </div>
          {coverage.untyped > 0 && (
            <p className="text-xs text-muted-foreground">{coverage.untyped} untyped entries</p>
          )}
        </div>
      )}

      {/* Freshness */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Freshness</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between px-3 py-2 rounded-md bg-muted">
            <span className="text-muted-foreground">Updated last 7 days</span>
            <span className="font-medium">{freshness.recentlyUpdated}</span>
          </div>
          <div className="flex justify-between px-3 py-2 rounded-md bg-muted">
            <span className="text-muted-foreground">Stale (90+ days)</span>
            <span className={freshness.stale > 0 ? 'font-medium text-yellow-400' : 'font-medium'}>
              {freshness.stale}
            </span>
          </div>
        </div>
      </div>

      {/* Gaps */}
      {gaps.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Gaps</h2>
          <div className="space-y-2">
            {gaps.map((gap) => (
              <div key={gap.description.slice(0, 40)} className="flex gap-2 text-xs py-2 border-b border-border last:border-0">
                {gap.severity === 'warning' ? (
                  <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
                ) : (
                  <Info size={13} className="text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <p>{gap.description}</p>
                  <p className="text-muted-foreground">{gap.suggestion}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contradictions */}
      {contradictions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Contradictions</h2>
          <div className="space-y-2">
            {contradictions.map((c) => (
              <Card key={`${c.entryA}-${c.entryB}`} className="p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-yellow-400" />
                  <span className="text-xs">{c.description}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Entries: <code className="font-mono">{c.entryA.slice(0, 8)}</code> vs{' '}
                  <code className="font-mono">{c.entryB.slice(0, 8)}</code>
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Pending actions */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Pending Actions</h2>
            <div className="flex gap-1.5">
              {pending.some((a) => a.risk === 'low') && (
                <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => approveAll('low')}>
                  Approve all low-risk
                </Button>
              )}
              {pending.some((a) => a.risk === 'medium') && (
                <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => approveAll('medium')}>
                  Approve all medium-risk
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {pending.map((action) => (
              <PendingActionCard
                key={action.id}
                action={action}
                onApprove={() => approveAction(action.id)}
                onDismiss={() => dismissAction(action.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent improvements */}
      {recentImprovements.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Recent Improvements</h2>
          <div className="space-y-1">
            {recentImprovements.map((r) => (
              <div key={r.timestamp} className="text-xs flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                <span className="text-muted-foreground shrink-0">{new Date(r.timestamp).toLocaleTimeString()}</span>
                <span>{r.actions.map((a) => `${a.type} (${a.count})`).join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
