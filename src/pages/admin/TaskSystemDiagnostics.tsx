import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──

interface DiagnosticCheck {
  id: string;
  name: string;
  category: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'warn';
  detail?: string;
  durationMs?: number;
}

// ── Diagnostic Checks ──

async function checkTaskTableHealth(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}> {
  const { count, error } = await supabase
    .from('daily_standup_tasks' as never)
    .select('*', { count: 'exact', head: true });
  if (error) return { status: 'fail', detail: `Cannot query tasks table: ${error.message}` };
  return { status: 'pass', detail: `${count ?? 0} total tasks in database` };
}

async function checkStandupMeetings(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}> {
  const { data, error } = await supabase
    .from('standup_meetings' as never)
    .select('id, meeting_title, tasks_extracted, processed_at')
    .order('processed_at', { ascending: false })
    .limit(5);
  if (error) return { status: 'fail', detail: `Cannot query meetings: ${error.message}` };
  if (!data || data.length === 0)
    return { status: 'warn', detail: 'No standup meetings processed yet' };
  const latest = data[0] as {
    processed_at: string;
    tasks_extracted: number;
    meeting_title: string;
  };
  const hoursAgo = (Date.now() - new Date(latest.processed_at).getTime()) / (1000 * 60 * 60);
  if (hoursAgo > 72) {
    return {
      status: 'warn',
      detail: `Last meeting processed ${Math.round(hoursAgo)}h ago: "${latest.meeting_title}"`,
    };
  }
  return {
    status: 'pass',
    detail: `Last meeting ${Math.round(hoursAgo)}h ago, extracted ${latest.tasks_extracted} tasks`,
  };
}

async function checkWebhookLog(): Promise<{ status: 'pass' | 'fail' | 'warn'; detail: string }> {
  const { data, error } = await supabase
    .from('fireflies_webhook_log' as never)
    .select('id, status, transcript_id, created_at, last_error')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error)
    return { status: 'warn', detail: `Webhook log table may not exist yet: ${error.message}` };
  if (!data || data.length === 0)
    return { status: 'pass', detail: 'No webhook events recorded yet (table is new)' };
  const entries = data as {
    id: string;
    status: string;
    created_at: string;
    last_error: string | null;
  }[];
  const failed = entries.filter((e) => e.status === 'failed');
  if (failed.length > 0) {
    return {
      status: 'warn',
      detail: `${failed.length}/${entries.length} recent webhooks failed. Latest error: ${failed[0].last_error?.slice(0, 100) || 'unknown'}`,
    };
  }
  return { status: 'pass', detail: `${entries.length} recent webhooks, all successful` };
}

async function checkTaskCompletion(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Use parallel count queries instead of fetching all rows
  const [totalResult, completedResult, completedNoTimestampResult] = await Promise.all([
    supabase
      .from('daily_standup_tasks' as never)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo),
    supabase
      .from('daily_standup_tasks' as never)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)
      .eq('status', 'completed'),
    supabase
      .from('daily_standup_tasks' as never)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)
      .eq('status', 'completed')
      .is('completed_at', null),
  ]);

  if (totalResult.error) return { status: 'fail', detail: totalResult.error.message };
  const total = totalResult.count ?? 0;
  if (total === 0) return { status: 'warn', detail: 'No tasks in last 30 days' };

  const completedCount = completedResult.count ?? 0;
  const missingTimestamp = completedNoTimestampResult.count ?? 0;
  const rate = Math.round((completedCount / total) * 100);

  if (completedCount > 0 && missingTimestamp > 0) {
    return {
      status: 'warn',
      detail: `${rate}% completion rate (${completedCount}/${total}), but ${missingTimestamp} completed tasks missing completed_at timestamp`,
    };
  }
  return {
    status: rate >= 30 ? 'pass' : 'warn',
    detail: `${rate}% completion rate (${completedCount}/${total}) in last 30 days`,
  };
}

async function checkActivityLog(): Promise<{ status: 'pass' | 'fail' | 'warn'; detail: string }> {
  const { count, error } = await supabase
    .from('rm_task_activity_log' as never)
    .select('*', { count: 'exact', head: true });
  if (error) return { status: 'fail', detail: `Activity log error: ${error.message}` };
  if (!count || count === 0) return { status: 'warn', detail: 'Activity log is empty' };
  return { status: 'pass', detail: `${count} activity log entries recorded` };
}

async function checkDedupKeys(): Promise<{ status: 'pass' | 'fail' | 'warn'; detail: string }> {
  const { data, error } = await supabase
    .from('daily_standup_tasks' as never)
    .select('dedup_key, source')
    .eq('source', 'ai')
    .is('dedup_key', null)
    .limit(1);
  if (error) {
    if (error.message?.includes('dedup_key')) {
      return { status: 'warn', detail: 'dedup_key column not yet deployed (run migration)' };
    }
    return { status: 'fail', detail: error.message };
  }
  if (data && data.length > 0) {
    return { status: 'warn', detail: 'Some AI tasks missing dedup_key (backfill needed)' };
  }
  return { status: 'pass', detail: 'All AI tasks have dedup keys' };
}

async function checkOverdueTasks(): Promise<{ status: 'pass' | 'fail' | 'warn'; detail: string }> {
  const { count, error } = await supabase
    .from('daily_standup_tasks' as never)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'overdue');
  if (error) return { status: 'fail', detail: error.message };
  const total = count ?? 0;
  if (total > 20) return { status: 'warn', detail: `${total} overdue tasks need attention` };
  return { status: 'pass', detail: `${total} overdue tasks` };
}

async function checkSourceCoverage(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}> {
  const { count, error } = await supabase
    .from('daily_standup_tasks' as never)
    .select('*', { count: 'exact', head: true })
    .is('source', null);
  if (error) return { status: 'fail', detail: error.message };
  if (count && count > 0) {
    return { status: 'warn', detail: `${count} tasks have NULL source field` };
  }
  return { status: 'pass', detail: 'All tasks have source field populated' };
}

async function checkEntityLinking(): Promise<{ status: 'pass' | 'fail' | 'warn'; detail: string }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Use parallel count queries instead of fetching all rows
  const [totalResult, linkedResult, dealResult, buyerResult, contactResult] = await Promise.all([
    supabase
      .from('daily_standup_tasks' as never)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo),
    supabase
      .from('daily_standup_tasks' as never)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)
      .not('entity_type', 'is', null)
      .not('entity_id', 'is', null),
    supabase
      .from('daily_standup_tasks' as never)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)
      .eq('entity_type', 'deal'),
    supabase
      .from('daily_standup_tasks' as never)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)
      .eq('entity_type', 'buyer'),
    supabase
      .from('daily_standup_tasks' as never)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)
      .eq('entity_type', 'contact'),
  ]);

  if (totalResult.error) return { status: 'fail', detail: totalResult.error.message };
  const total = totalResult.count ?? 0;
  if (total === 0) return { status: 'warn', detail: 'No recent tasks to check' };

  const linked = linkedResult.count ?? 0;
  const rate = Math.round((linked / total) * 100);

  const breakdown = [
    dealResult.count ? `deal: ${dealResult.count}` : null,
    buyerResult.count ? `buyer: ${buyerResult.count}` : null,
    contactResult.count ? `contact: ${contactResult.count}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    status: rate >= 50 ? 'pass' : 'warn',
    detail: `${rate}% entity-linked (${linked}/${total}). ${breakdown || 'none'}`,
  };
}

async function checkContactMatching(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}> {
  const { data, error } = await supabase
    .from('daily_standup_tasks' as never)
    .select('entity_type')
    .eq('entity_type', 'contact')
    .limit(1);
  if (error) return { status: 'fail', detail: error.message };
  if (!data || data.length === 0) {
    return { status: 'warn', detail: 'No tasks linked to contacts yet (feature is new)' };
  }
  return { status: 'pass', detail: 'Contact linking is active' };
}

async function checkWebhookRetry(): Promise<{ status: 'pass' | 'fail' | 'warn'; detail: string }> {
  const { data, error } = await supabase
    .from('fireflies_webhook_log' as never)
    .select('id, attempt_count, status, created_at')
    .gt('attempt_count', 1)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return { status: 'warn', detail: `Cannot check retry data: ${error.message}` };
  if (!data || data.length === 0)
    return { status: 'pass', detail: 'No webhook retries recorded (no failures to retry)' };
  const entries = data as { id: string; attempt_count: number; status: string }[];
  const stillFailed = entries.filter((e) => e.status === 'failed');
  if (stillFailed.length > 0) {
    return {
      status: 'warn',
      detail: `${stillFailed.length} webhooks still failed after retry (max attempts: ${Math.max(...stillFailed.map((e) => e.attempt_count))})`,
    };
  }
  return { status: 'pass', detail: `${entries.length} webhooks recovered via retry` };
}

async function checkExtractionPipeline(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [meetingsResult, tasksResult] = await Promise.all([
    supabase
      .from('standup_meetings' as never)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),
    supabase
      .from('daily_standup_tasks' as never)
      .select('*', { count: 'exact', head: true })
      .eq('source', 'ai')
      .gte('created_at', sevenDaysAgo),
  ]);
  if (meetingsResult.error || tasksResult.error) {
    return {
      status: 'fail',
      detail: meetingsResult.error?.message || tasksResult.error?.message || 'Query error',
    };
  }
  const meetings = meetingsResult.count ?? 0;
  const tasks = tasksResult.count ?? 0;
  if (meetings === 0) return { status: 'warn', detail: 'No meetings processed in last 7 days' };
  const avgTasks = Math.round((tasks / meetings) * 10) / 10;
  return {
    status: avgTasks >= 1 ? 'pass' : 'warn',
    detail: `${meetings} meetings → ${tasks} AI tasks (avg ${avgTasks}/meeting) in last 7 days`,
  };
}

async function checkProcessingMetrics(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('task_processing_metrics' as never)
    .select(
      'tasks_extracted, tasks_deduplicated, contacts_matched, low_confidence_count, processing_duration_ms',
    )
    .gte('created_at', sevenDaysAgo);
  if (error) {
    if (error.message?.includes('task_processing_metrics')) {
      return { status: 'warn', detail: 'Metrics table not yet deployed (run migration)' };
    }
    return { status: 'fail', detail: error.message };
  }
  if (!data || data.length === 0) {
    return { status: 'warn', detail: 'No processing metrics recorded yet' };
  }
  const metrics = data as {
    tasks_extracted: number;
    tasks_deduplicated: number;
    contacts_matched: number;
    low_confidence_count: number;
    processing_duration_ms: number;
  }[];
  const totalExtracted = metrics.reduce((s, m) => s + m.tasks_extracted, 0);
  const totalDeduped = metrics.reduce((s, m) => s + m.tasks_deduplicated, 0);
  const totalLowConf = metrics.reduce((s, m) => s + m.low_confidence_count, 0);
  const avgDuration = Math.round(
    metrics.reduce((s, m) => s + (m.processing_duration_ms || 0), 0) / metrics.length,
  );
  const dedupRate =
    totalExtracted > 0 ? Math.round((totalDeduped / (totalExtracted + totalDeduped)) * 100) : 0;
  return {
    status: totalLowConf > totalExtracted * 0.3 ? 'warn' : 'pass',
    detail: `${metrics.length} meetings: ${totalExtracted} tasks, ${dedupRate}% dedup rate, ${totalLowConf} low-confidence, avg ${avgDuration}ms`,
  };
}

async function checkDeadLetterQueue(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}> {
  const { count, error } = await supabase
    .from('fireflies_webhook_log' as never)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'dead_letter');
  if (error) return { status: 'warn', detail: `Cannot check DLQ: ${error.message}` };
  const total = count ?? 0;
  if (total > 0) {
    return {
      status: 'warn',
      detail: `${total} webhooks in dead-letter queue (exceeded max retries)`,
    };
  }
  return { status: 'pass', detail: 'No dead-lettered webhooks' };
}

async function checkRateLimiting(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('webhook_rate_limit' as never)
    .select('*', { count: 'exact', head: true })
    .gte('requested_at', oneHourAgo);
  if (error) {
    if (error.message?.includes('webhook_rate_limit')) {
      return { status: 'warn', detail: 'Rate limit table not yet deployed (run migration)' };
    }
    return { status: 'fail', detail: error.message };
  }
  const total = count ?? 0;
  return {
    status: total > 100 ? 'warn' : 'pass',
    detail: `${total} webhook requests in last hour`,
  };
}

async function checkDelayedWebhooks(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}> {
  const { data, error } = await supabase
    .from('fireflies_webhook_log' as never)
    .select('id, process_after, delay_reason')
    .eq('status', 'delayed')
    .order('process_after', { ascending: true })
    .limit(5);
  if (error) return { status: 'warn', detail: `Cannot check delayed webhooks: ${error.message}` };
  if (!data || data.length === 0) {
    return { status: 'pass', detail: 'No delayed webhooks pending' };
  }
  const entries = data as { id: string; process_after: string; delay_reason: string }[];
  const nextProcessAt = entries[0]?.process_after;
  return {
    status: 'pass',
    detail: `${entries.length} delayed webhook(s), next processing at ${nextProcessAt ? new Date(nextProcessAt).toLocaleString() : 'unknown'}`,
  };
}

async function checkLowConfidenceTasks(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [lowConfResult, totalResult] = await Promise.all([
    supabase
      .from('daily_standup_tasks' as never)
      .select('*', { count: 'exact', head: true })
      .eq('extraction_confidence', 'low')
      .gte('created_at', sevenDaysAgo),
    supabase
      .from('daily_standup_tasks' as never)
      .select('*', { count: 'exact', head: true })
      .eq('source', 'ai')
      .gte('created_at', sevenDaysAgo),
  ]);
  if (lowConfResult.error || totalResult.error) {
    return {
      status: 'fail',
      detail: lowConfResult.error?.message || totalResult.error?.message || 'Query error',
    };
  }
  const lowConf = lowConfResult.count ?? 0;
  const total = totalResult.count ?? 0;
  if (total === 0) return { status: 'pass', detail: 'No AI tasks in last 7 days' };
  const rate = Math.round((lowConf / total) * 100);
  return {
    status: rate > 30 ? 'warn' : 'pass',
    detail: `${lowConf}/${total} AI tasks (${rate}%) have low confidence in last 7 days`,
  };
}

const ALL_CHECKS = [
  { id: 'task-table', name: 'Task Table Health', category: 'Database', fn: checkTaskTableHealth },
  {
    id: 'standup-meetings',
    name: 'Standup Meetings',
    category: 'Pipeline',
    fn: checkStandupMeetings,
  },
  { id: 'webhook-log', name: 'Webhook Log', category: 'Pipeline', fn: checkWebhookLog },
  {
    id: 'webhook-retry',
    name: 'Webhook Retry Health',
    category: 'Pipeline',
    fn: checkWebhookRetry,
  },
  {
    id: 'dead-letter',
    name: 'Dead-Letter Queue',
    category: 'Pipeline',
    fn: checkDeadLetterQueue,
  },
  {
    id: 'delayed-webhooks',
    name: 'Delayed Webhooks',
    category: 'Pipeline',
    fn: checkDelayedWebhooks,
  },
  {
    id: 'rate-limiting',
    name: 'Webhook Rate Limiting',
    category: 'Pipeline',
    fn: checkRateLimiting,
  },
  {
    id: 'extraction-pipeline',
    name: 'Extraction Pipeline',
    category: 'Pipeline',
    fn: checkExtractionPipeline,
  },
  { id: 'completion', name: 'Task Completion Rate', category: 'Metrics', fn: checkTaskCompletion },
  {
    id: 'processing-metrics',
    name: 'Processing Metrics',
    category: 'Metrics',
    fn: checkProcessingMetrics,
  },
  {
    id: 'low-confidence',
    name: 'Low-Confidence Tasks',
    category: 'Metrics',
    fn: checkLowConfidenceTasks,
  },
  { id: 'activity-log', name: 'Activity Audit Log', category: 'Audit', fn: checkActivityLog },
  { id: 'dedup-keys', name: 'Deduplication Keys', category: 'Data Integrity', fn: checkDedupKeys },
  { id: 'overdue', name: 'Overdue Tasks', category: 'Metrics', fn: checkOverdueTasks },
  {
    id: 'source-coverage',
    name: 'Source Field Coverage',
    category: 'Data Integrity',
    fn: checkSourceCoverage,
  },
  {
    id: 'entity-linking',
    name: 'Entity Linking Coverage',
    category: 'Data Integrity',
    fn: checkEntityLinking,
  },
  {
    id: 'contact-matching',
    name: 'Contact Matching',
    category: 'Pipeline',
    fn: checkContactMatching,
  },
];

// ── Component ──

function StatusIcon({ status }: { status: DiagnosticCheck['status'] }) {
  switch (status) {
    case 'pass':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'fail':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'warn':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    default:
      return <div className="h-4 w-4 rounded-full bg-muted" />;
  }
}

function HealthScore({ checks }: { checks: DiagnosticCheck[] }) {
  const completed = checks.filter((c) => ['pass', 'fail', 'warn'].includes(c.status));
  if (completed.length === 0) return null;
  const score = completed.reduce(
    (s, c) => s + (c.status === 'pass' ? 2 : c.status === 'warn' ? 1 : 0),
    0,
  );
  const max = completed.length * 2;
  const pct = Math.round((score / max) * 100);
  const color = pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600';
  const label = pct >= 80 ? 'Healthy' : pct >= 60 ? 'Needs Work' : 'Critical';
  return (
    <div className="flex items-center gap-3">
      <span className={`text-3xl font-bold ${color}`}>{pct}%</span>
      <div>
        <Badge variant={pct >= 80 ? 'default' : pct >= 60 ? 'secondary' : 'destructive'}>
          {label}
        </Badge>
        <p className="text-xs text-muted-foreground mt-1">
          {score}/{max} points ({completed.length} checks)
        </p>
      </div>
    </div>
  );
}

export default function TaskSystemDiagnostics() {
  const [checks, setChecks] = useState<DiagnosticCheck[]>(
    ALL_CHECKS.map((c) => ({ id: c.id, name: c.name, category: c.category, status: 'pending' })),
  );
  const [running, setRunning] = useState(false);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    setChecks(
      ALL_CHECKS.map((c) => ({ id: c.id, name: c.name, category: c.category, status: 'pending' })),
    );

    for (const check of ALL_CHECKS) {
      setChecks((prev) => prev.map((c) => (c.id === check.id ? { ...c, status: 'running' } : c)));

      const start = performance.now();
      try {
        const result = await check.fn();
        const durationMs = Math.round(performance.now() - start);
        setChecks((prev) =>
          prev.map((c) =>
            c.id === check.id
              ? { ...c, status: result.status, detail: result.detail, durationMs }
              : c,
          ),
        );
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        setChecks((prev) =>
          prev.map((c) =>
            c.id === check.id
              ? {
                  ...c,
                  status: 'fail',
                  detail: err instanceof Error ? err.message : 'Unknown error',
                  durationMs,
                }
              : c,
          ),
        );
      }
    }

    setRunning(false);
  }, []);

  const categories = [...new Set(ALL_CHECKS.map((c) => c.category))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Task System Diagnostics</h2>
          <p className="text-sm text-muted-foreground">
            Run checks against the task creation pipeline, webhook system, and data integrity
          </p>
        </div>
        <div className="flex items-center gap-3">
          <HealthScore checks={checks} />
          <Button onClick={runDiagnostics} disabled={running}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running...
              </>
            ) : checks.some((c) => c.status !== 'pending') ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-run
              </>
            ) : (
              <>
                <PlayCircle className="mr-2 h-4 w-4" />
                Run Diagnostics
              </>
            )}
          </Button>
        </div>
      </div>

      {categories.map((category) => (
        <Card key={category}>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{category}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {checks
              .filter((c) => c.category === category)
              .map((check) => (
                <div key={check.id} className="flex items-start gap-3 rounded-md border p-3">
                  <StatusIcon status={check.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{check.name}</span>
                      {check.durationMs != null && (
                        <span className="text-xs text-muted-foreground">{check.durationMs}ms</span>
                      )}
                    </div>
                    {check.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
                    )}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
