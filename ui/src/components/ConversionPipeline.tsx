import { useAppState } from '../store/context';
import type { PipelineStage } from '../types/preferences';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, AlertCircle, Circle, Loader2 } from 'lucide-react';

const stageLabels: Record<PipelineStage, string> = {
  idle: 'Ready',
  uploading: 'Uploading',
  parsing: 'Parsing',
  normalizing: 'Normalizing',
  analyzing: 'Analyzing',
  exporting: 'Exporting',
  complete: 'Complete',
  error: 'Error',
};

const stageOrder: PipelineStage[] = [
  'uploading',
  'parsing',
  'normalizing',
  'complete',
];

export default function ConversionPipeline() {
  const { state, dispatch } = useAppState();
  const { pipeline, conversations } = state;

  const currentStageIndex = stageOrder.indexOf(pipeline.stage);

  function resetPipeline() {
    dispatch({ type: 'RESET_PIPELINE' });
    dispatch({ type: 'SET_CONVERSATIONS', payload: [] });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Conversion Pipeline</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Monitor the progress of your conversation import and conversion.
        </p>
      </div>

      {/* Stage progress */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {stageOrder.map((stage, index) => {
              let status: 'pending' | 'active' | 'done' | 'error' = 'pending';
              if (pipeline.stage === 'complete') {
                status = 'done';
              } else if (pipeline.stage === 'error' && index <= currentStageIndex) {
                status = index === currentStageIndex ? 'error' : 'done';
              } else if (index < currentStageIndex) {
                status = 'done';
              } else if (index === currentStageIndex) {
                status = 'active';
              }

              const isLast = index === stageOrder.length - 1;

              return (
                <div key={stage} className="flex items-center gap-1 flex-shrink-0">
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-xs whitespace-nowrap ${
                      status === 'done'
                        ? 'text-green-500'
                        : status === 'error'
                          ? 'text-destructive'
                          : status === 'active'
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                    }`}
                  >
                    {status === 'done' ? (
                      <Check size={12} />
                    ) : status === 'error' ? (
                      <AlertCircle size={12} />
                    ) : status === 'active' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Circle size={12} />
                    )}
                    <span className={status === 'active' ? 'font-medium' : ''}>
                      {stageLabels[stage]}
                    </span>
                  </div>
                  {!isLast && (
                    <span className="text-border text-xs mx-0.5">›</span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Progress bar */}
      {pipeline.stage !== 'idle' && (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pipeline.stage === 'error' ? 'bg-destructive' : 'bg-foreground'
              }`}
              style={{ width: `${pipeline.progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{pipeline.message}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { value: pipeline.conversationCount, label: 'Conversations' },
          { value: pipeline.messageCount, label: 'Messages' },
          { value: conversations.filter((c) => c.selected).length, label: 'Selected' },
        ].map(({ value, label }) => (
          <Card key={label} className="bg-card border-border text-center">
            <CardContent className="p-4">
              <span className="block text-2xl font-semibold text-foreground">{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Error display */}
      {pipeline.stage === 'error' && pipeline.error && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/40 rounded-md px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span><strong>Error:</strong> {pipeline.error}</span>
        </div>
      )}

      {/* Stage badges legend */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Legend:</span>
        <Badge variant="secondary" className="text-xs gap-1">
          <Check size={10} className="text-green-500" /> Done
        </Badge>
        <Badge variant="secondary" className="text-xs gap-1">
          <Loader2 size={10} /> Active
        </Badge>
        <Badge variant="secondary" className="text-xs gap-1">
          <Circle size={10} /> Pending
        </Badge>
        <Badge variant="secondary" className="text-xs gap-1">
          <AlertCircle size={10} className="text-destructive" /> Error
        </Badge>
      </div>

      {/* Actions */}
      {(pipeline.stage === 'complete' || pipeline.stage === 'error') && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetPipeline} className="border-border text-foreground hover:bg-accent">
            Reset Pipeline
          </Button>
        </div>
      )}

      {pipeline.stage === 'idle' && (
        <div className="text-center text-muted-foreground py-12">
          <p>No conversion in progress.</p>
          <p className="mt-1 text-sm">Go to the Conversations tab to upload an export file.</p>
        </div>
      )}
    </div>
  );
}
