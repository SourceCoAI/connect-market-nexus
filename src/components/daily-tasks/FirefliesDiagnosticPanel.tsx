import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  AlertTriangle,
  Database,
  Cloud,
  Cpu,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type StepStatus = 'idle' | 'running' | 'pass' | 'fail' | 'warn';

interface DiagnosticStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  detail?: string;
}

const INITIAL_STEPS: DiagnosticStep[] = [
  {
    id: 'db_tables',
    label: 'Database Tables',
    description: 'Check standup_meetings and daily_standup_tasks tables exist',
    status: 'idle',
  },
  {
    id: 'existing_meetings',
    label: 'Processed Meetings',
    description: 'Count meetings already synced from Fireflies',
    status: 'idle',
  },
  {
    id: 'existing_tasks',
    label: 'Extracted Tasks',
    description: 'Count tasks by status in daily_standup_tasks',
    status: 'idle',
  },
  {
    id: 'sync_function',
    label: 'Sync Edge Function',
    description: 'Invoke sync-standup-meetings (48h lookback)',
    status: 'idle',
  },
  {
    id: 'webhook_function',
    label: 'Webhook Edge Function',
    description: 'Invoke process-standup-webhook with a real transcript',
    status: 'idle',
  },
  {
    id: 'final_check',
    label: 'Final Task Count',
    description: 'Verify new tasks were created',
    status: 'idle',
  },
];

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'pass':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'fail':
      return <XCircle className="h-4 w-4 text-red-600" />;
    case 'warn':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    default:
      return <div className="h-4 w-4 rounded-full border-2 border-muted" />;
  }
}

function StepIcon({ id }: { id: string }) {
  if (id.startsWith('db') || id.startsWith('existing')) return <Database className="h-3.5 w-3.5" />;
  if (id.includes('function') || id.includes('webhook')) return <Cloud className="h-3.5 w-3.5" />;
  return <Cpu className="h-3.5 w-3.5" />;
}

export function FirefliesDiagnosticPanel() {
  const [steps, setSteps] = useState<DiagnosticStep[]>(INITIAL_STEPS);
  const [running, setRunning] = useState(false);
  const [taskCountBefore, setTaskCountBefore] = useState<number | null>(null);

  function updateStep(id: string, update: Partial<DiagnosticStep>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...update } : s)));
  }

  async function runDiagnostics() {
    setRunning(true);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'idle', detail: undefined })));

    // Step 1: Check DB tables
    updateStep('db_tables', { status: 'running' });
    try {
      const { count: meetingsCount, error: e1 } = await supabase
        .from('standup_meetings' as never)
        .select('*', { count: 'exact', head: true });
      const { count: tasksCount, error: e2 } = await supabase
        .from('daily_standup_tasks' as never)
        .select('*', { count: 'exact', head: true });

      if (e1 || e2) {
        updateStep('db_tables', {
          status: 'fail',
          detail: `standup_meetings: ${e1 ? e1.message : 'OK'}, daily_standup_tasks: ${e2 ? e2.message : 'OK'}`,
        });
      } else {
        updateStep('db_tables', {
          status: 'pass',
          detail: `standup_meetings: ${meetingsCount ?? 0} rows, daily_standup_tasks: ${tasksCount ?? 0} rows`,
        });
      }
    } catch (err) {
      updateStep('db_tables', {
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    // Step 2: Check existing meetings
    updateStep('existing_meetings', { status: 'running' });
    try {
      const { data: meetings, error } = await supabase
        .from('standup_meetings' as never)
        .select('id, meeting_title, meeting_date, tasks_extracted')
        .order('meeting_date', { ascending: false })
        .limit(5);

      if (error) {
        updateStep('existing_meetings', { status: 'fail', detail: error.message });
      } else if (!meetings || meetings.length === 0) {
        updateStep('existing_meetings', {
          status: 'warn',
          detail: 'No meetings have been synced yet. The sync function has never successfully run.',
        });
      } else {
        const lines = (meetings as { meeting_title: string; meeting_date: string; tasks_extracted: number }[])
          .map((m) => `${m.meeting_date}: "${m.meeting_title}" (${m.tasks_extracted} tasks)`)
          .join('\n');
        updateStep('existing_meetings', {
          status: 'pass',
          detail: `${meetings.length} most recent:\n${lines}`,
        });
      }
    } catch (err) {
      updateStep('existing_meetings', {
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    // Step 3: Count tasks by status
    updateStep('existing_tasks', { status: 'running' });
    try {
      const { data: allTasks, error } = await supabase
        .from('daily_standup_tasks' as never)
        .select('status');

      if (error) {
        updateStep('existing_tasks', { status: 'fail', detail: error.message });
      } else {
        const counts: Record<string, number> = {};
        for (const t of (allTasks || []) as { status: string }[]) {
          counts[t.status] = (counts[t.status] || 0) + 1;
        }
        const total = (allTasks || []).length;
        setTaskCountBefore(total);
        if (total === 0) {
          updateStep('existing_tasks', {
            status: 'warn',
            detail: 'No tasks exist yet. Tasks will be created after a successful sync + extraction.',
          });
        } else {
          const breakdown = Object.entries(counts)
            .map(([s, c]) => `${s}: ${c}`)
            .join(', ');
          updateStep('existing_tasks', {
            status: 'pass',
            detail: `${total} total tasks — ${breakdown}`,
          });
        }
      }
    } catch (err) {
      updateStep('existing_tasks', {
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    // Step 4: Invoke sync-standup-meetings
    updateStep('sync_function', { status: 'running' });
    try {
      const { data, error } = await supabase.functions.invoke('sync-standup-meetings', {
        body: { lookback_hours: 48 },
      });

      if (error) {
        updateStep('sync_function', {
          status: 'fail',
          detail: `Edge function error: ${error.message}. Is "sync-standup-meetings" deployed?`,
        });
      } else if (data?.success === false) {
        updateStep('sync_function', {
          status: 'fail',
          detail: `Function returned error: ${data.error || 'Unknown'}. Check FIREFLIES_API_KEY.`,
        });
      } else {
        const parts = [];
        parts.push(`Checked ${data.transcripts_checked ?? 0} Fireflies meetings`);
        if (data.already_processed) parts.push(`${data.already_processed} already processed`);
        if (data.newly_processed) parts.push(`${data.newly_processed} newly extracted`);
        if (data.failed) parts.push(`${data.failed} failed`);

        const hasFailures = (data.failed ?? 0) > 0;
        const isNew = (data.newly_processed ?? 0) > 0;

        let failureDetails = '';
        if (hasFailures && data.results) {
          const failures = data.results.filter((r: { success: boolean }) => !r.success);
          failureDetails =
            '\nFailures:\n' +
            failures
              .map((f: { title: string; error: string }) => `  "${f.title}": ${f.error}`)
              .join('\n');
        }

        updateStep('sync_function', {
          status: hasFailures ? 'warn' : 'pass',
          detail: parts.join(', ') + '.' + (isNew ? ' Tasks were extracted!' : '') + failureDetails,
        });
      }
    } catch (err) {
      updateStep('sync_function', {
        status: 'fail',
        detail: `Failed to invoke: ${err instanceof Error ? err.message : 'Unknown error'}. Is the function deployed?`,
      });
    }

    // Step 5: Test webhook function with a recent transcript
    updateStep('webhook_function', { status: 'running' });
    try {
      // Get a recent transcript ID from standup_meetings to test with (safe — it'll be skipped as duplicate)
      const { data: recentMeeting } = await supabase
        .from('standup_meetings' as never)
        .select('fireflies_transcript_id, meeting_title')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentMeeting) {
        const meeting = recentMeeting as { fireflies_transcript_id: string; meeting_title: string };
        const { data, error } = await supabase.functions.invoke('process-standup-webhook', {
          body: {
            data: {
              transcript_id: meeting.fireflies_transcript_id,
              title: meeting.meeting_title,
            },
          },
        });

        if (error) {
          updateStep('webhook_function', {
            status: 'fail',
            detail: `Edge function error: ${error.message}. Is "process-standup-webhook" deployed?`,
          });
        } else if (data?.skipped) {
          updateStep('webhook_function', {
            status: 'pass',
            detail: `Webhook responded correctly (skipped duplicate: "${meeting.meeting_title}"). Function is deployed and working.`,
          });
        } else if (data?.success) {
          updateStep('webhook_function', {
            status: 'pass',
            detail: `Webhook processed "${meeting.meeting_title}" — ${data.tasks_extracted ?? 0} tasks extracted.`,
          });
        } else {
          updateStep('webhook_function', {
            status: 'fail',
            detail: `Unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
          });
        }
      } else {
        // No meetings exist yet — try invoking webhook to see if the function is at least deployed
        const { error } = await supabase.functions.invoke('process-standup-webhook', {
          body: { data: { transcript_id: 'test-diagnostic-ping' } },
        });

        if (error) {
          updateStep('webhook_function', {
            status: 'fail',
            detail: `Edge function error: ${error.message}. Is "process-standup-webhook" deployed?`,
          });
        } else {
          updateStep('webhook_function', {
            status: 'warn',
            detail: 'Function is deployed but no meetings exist to test with. Run sync first.',
          });
        }
      }
    } catch (err) {
      updateStep('webhook_function', {
        status: 'fail',
        detail: `Failed to invoke: ${err instanceof Error ? err.message : 'Unknown error'}. Is the function deployed?`,
      });
    }

    // Step 6: Final task count
    updateStep('final_check', { status: 'running' });
    try {
      const { count, error } = await supabase
        .from('daily_standup_tasks' as never)
        .select('*', { count: 'exact', head: true });

      if (error) {
        updateStep('final_check', { status: 'fail', detail: error.message });
      } else {
        const total = count ?? 0;
        const diff = taskCountBefore !== null ? total - taskCountBefore : 0;
        if (diff > 0) {
          updateStep('final_check', {
            status: 'pass',
            detail: `${total} total tasks (+${diff} new). Pipeline is working end-to-end!`,
          });
        } else if (total > 0) {
          updateStep('final_check', {
            status: 'pass',
            detail: `${total} total tasks (no new ones — meetings may already have been processed).`,
          });
        } else {
          updateStep('final_check', {
            status: 'warn',
            detail: 'Still 0 tasks. Check that FIREFLIES_API_KEY and GEMINI_API_KEY are set, and that edge functions are deployed.',
          });
        }
      }
    } catch (err) {
      updateStep('final_check', {
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    setRunning(false);
  }

  const passCount = steps.filter((s) => s.status === 'pass').length;
  const failCount = steps.filter((s) => s.status === 'fail').length;
  const warnCount = steps.filter((s) => s.status === 'warn').length;
  const isDone = !running && steps.every((s) => s.status !== 'idle');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Fireflies Pipeline Diagnostic</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tests the full meeting sync → task extraction pipeline
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isDone && (
              <div className="flex items-center gap-1.5">
                {failCount > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {failCount} failed
                  </Badge>
                )}
                {warnCount > 0 && (
                  <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">
                    {warnCount} warnings
                  </Badge>
                )}
                {passCount > 0 && (
                  <Badge variant="outline" className="border-green-300 text-green-700 text-[10px]">
                    {passCount} passed
                  </Badge>
                )}
              </div>
            )}
            <Button size="sm" onClick={runDiagnostics} disabled={running}>
              {running ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {running ? 'Running...' : 'Run Diagnostics'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {steps.map((step, i) => (
          <div key={step.id}>
            <div className="flex items-start gap-3 py-2">
              <div className="mt-0.5">
                <StatusIcon status={step.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <StepIcon id={step.id} />
                  <span className="text-sm font-medium">{step.label}</span>
                  <span className="text-xs text-muted-foreground">{step.description}</span>
                </div>
                {step.detail && (
                  <pre
                    className={cn(
                      'text-xs mt-1 whitespace-pre-wrap font-mono rounded px-2 py-1.5',
                      step.status === 'pass' && 'bg-green-50 text-green-800',
                      step.status === 'fail' && 'bg-red-50 text-red-800',
                      step.status === 'warn' && 'bg-amber-50 text-amber-800',
                    )}
                  >
                    {step.detail}
                  </pre>
                )}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="ml-2 flex items-center gap-1 text-muted-foreground/40">
                <ArrowRight className="h-3 w-3" />
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
