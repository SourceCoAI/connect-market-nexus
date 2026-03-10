/**
 * TestRunTracker
 *
 * Shows historical test run results persisted to Supabase.
 * Users can expand any past run to see per-test details,
 * filter by status, and delete old runs.
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  History,
  SkipForward,
} from 'lucide-react';
import type { TestRunRow, TestResultRow } from '@/hooks/useTestRunTracking';

// ── Helpers ──

const RUN_TYPE_LABELS: Record<string, string> = {
  run_all: 'Run All Suites',
  system: 'System Tests',
  pandadoc: 'PandaDoc Health',
  chatbot_infra: 'Chatbot Infra',
  chatbot_scenarios: 'Chatbot Scenarios',
  '30q': '30-Question QA',
  enrichment: 'Enrichment',
  smartlead: 'Smartlead',
  listing_pipeline: 'Listing Pipeline',
  buyer_rec: 'AI Buyer Engine',
};

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RunStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <Badge variant="outline" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800/50">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800/50">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Cancelled
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800/50 animate-pulse">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function TestStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'pass':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    case 'fail':
      return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
    case 'warn':
      return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
    case 'skip':
      return <SkipForward className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    case 'running':
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />;
  }
}

// ── Expanded run detail ──

function RunDetail({
  results,
  loading,
}: {
  results: TestResultRow[];
  loading: boolean;
}) {
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading results...
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <p className="text-center py-4 text-muted-foreground text-sm">
        No individual test results recorded for this run.
      </p>
    );
  }

  // Group by suite
  const suites = new Map<string, TestResultRow[]>();
  for (const r of results) {
    const existing = suites.get(r.suite) || [];
    existing.push(r);
    suites.set(r.suite, existing);
  }

  const filtered = filterStatus
    ? results.filter((r) => r.status === filterStatus)
    : results;

  const filteredSuites = new Map<string, TestResultRow[]>();
  for (const r of filtered) {
    const existing = filteredSuites.get(r.suite) || [];
    existing.push(r);
    filteredSuites.set(r.suite, existing);
  }

  // Count statuses for filter chips
  const statusCounts = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-3 pt-2">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant={filterStatus === null ? 'default' : 'outline'}
          size="sm"
          className="h-6 text-xs px-2"
          onClick={() => setFilterStatus(null)}
        >
          All ({results.length})
        </Button>
        {statusCounts.pass && (
          <Button
            variant={filterStatus === 'pass' ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setFilterStatus(filterStatus === 'pass' ? null : 'pass')}
          >
            <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
            Pass ({statusCounts.pass})
          </Button>
        )}
        {statusCounts.fail && (
          <Button
            variant={filterStatus === 'fail' ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setFilterStatus(filterStatus === 'fail' ? null : 'fail')}
          >
            <XCircle className="h-3 w-3 mr-1 text-red-500" />
            Fail ({statusCounts.fail})
          </Button>
        )}
        {statusCounts.warn && (
          <Button
            variant={filterStatus === 'warn' ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setFilterStatus(filterStatus === 'warn' ? null : 'warn')}
          >
            <AlertTriangle className="h-3 w-3 mr-1 text-yellow-500" />
            Warn ({statusCounts.warn})
          </Button>
        )}
      </div>

      {/* Results grouped by suite */}
      {Array.from(filteredSuites.entries()).map(([suite, suiteResults]) => (
        <div key={suite} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {RUN_TYPE_LABELS[suite] || suite}
          </p>
          <div className="border rounded-md divide-y divide-border/50">
            {suiteResults.map((r) => (
              <div
                key={r.id}
                className={`flex items-start gap-2 px-3 py-1.5 text-xs ${
                  r.status === 'fail'
                    ? 'bg-red-50/50 dark:bg-red-950/20'
                    : r.status === 'warn'
                      ? 'bg-yellow-50/50 dark:bg-yellow-950/20'
                      : ''
                }`}
              >
                <TestStatusIcon status={r.status} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground">{r.test_name}</span>
                  {r.category && (
                    <span className="ml-2 text-muted-foreground">({r.category})</span>
                  )}
                  {r.error && (
                    <p className="text-red-500 dark:text-red-400 mt-0.5 break-words">
                      {r.error}
                    </p>
                  )}
                </div>
                {r.duration_ms != null && (
                  <span className="text-muted-foreground shrink-0">
                    {r.duration_ms}ms
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ──

interface TestRunTrackerProps {
  runs: TestRunRow[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (runId: string) => Promise<void>;
  onFetchResults: (runId: string) => Promise<TestResultRow[]>;
}

export default function TestRunTracker({
  runs,
  loading,
  onRefresh,
  onDelete,
  onFetchResults,
}: TestRunTrackerProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<TestResultRow[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  const toggleExpand = useCallback(
    async (runId: string) => {
      if (expandedRunId === runId) {
        setExpandedRunId(null);
        setExpandedResults([]);
        return;
      }
      setExpandedRunId(runId);
      setLoadingResults(true);
      const results = await onFetchResults(runId);
      setExpandedResults(results);
      setLoadingResults(false);
    },
    [expandedRunId, onFetchResults],
  );

  // Stats summary from most recent completed run
  const lastCompleted = runs.find((r) => r.status === 'completed');
  const runningRun = runs.find((r) => r.status === 'running');

  return (
    <Card>
      <CardHeader className="py-3 px-4 flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Test Run History</CardTitle>
          {runningRun && (
            <Badge variant="secondary" className="animate-pulse text-[10px]">
              1 running
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {/* Quick summary of last completed run */}
        {lastCompleted && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="text-center p-2 rounded-md bg-muted/50">
              <p className="text-[10px] text-muted-foreground uppercase">Total</p>
              <p className="text-lg font-bold">{lastCompleted.total_tests}</p>
            </div>
            <div className="text-center p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20">
              <p className="text-[10px] text-muted-foreground uppercase">Passed</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {lastCompleted.passed}
              </p>
            </div>
            <div className="text-center p-2 rounded-md bg-red-50 dark:bg-red-950/20">
              <p className="text-[10px] text-muted-foreground uppercase">Failed</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {lastCompleted.failed}
              </p>
            </div>
            <div className="text-center p-2 rounded-md bg-yellow-50 dark:bg-yellow-950/20">
              <p className="text-[10px] text-muted-foreground uppercase">Warnings</p>
              <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                {lastCompleted.warnings}
              </p>
            </div>
          </div>
        )}

        {/* Run list */}
        {loading && runs.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading history...
          </div>
        ) : runs.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">
            No test runs recorded yet. Click "Run All Suites" to start.
          </p>
        ) : (
          <div className="space-y-1">
            {runs.map((run) => {
              const isExpanded = expandedRunId === run.id;
              const passRate =
                run.total_tests > 0
                  ? Math.round((run.passed / run.total_tests) * 100)
                  : 0;

              return (
                <div
                  key={run.id}
                  className={`border rounded-md transition-colors ${
                    isExpanded ? 'border-primary/30 bg-muted/30' : 'hover:bg-muted/20'
                  }`}
                >
                  {/* Run header row */}
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                    onClick={() => toggleExpand(run.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {RUN_TYPE_LABELS[run.run_type] || run.run_type}
                        </span>
                        <RunStatusBadge status={run.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{formatTime(run.started_at)}</span>
                        <span>{timeAgo(run.started_at)}</span>
                        {run.duration_ms != null && (
                          <span>{formatDuration(run.duration_ms)}</span>
                        )}
                      </div>
                    </div>

                    {/* Compact stats */}
                    {run.total_tests > 0 && (
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1 text-xs">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          <span>{run.passed}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <XCircle className="h-3 w-3 text-red-500" />
                          <span>{run.failed}</span>
                        </div>
                        {run.warnings > 0 && (
                          <div className="flex items-center gap-1 text-xs">
                            <AlertTriangle className="h-3 w-3 text-yellow-500" />
                            <span>{run.warnings}</span>
                          </div>
                        )}
                        <div className="w-16">
                          <Progress
                            value={passRate}
                            className="h-1.5"
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {passRate}%
                        </span>
                      </div>
                    )}

                    {/* Running indicator with suite progress */}
                    {run.status === 'running' &&
                      run.suites_total != null &&
                      run.suites_total > 0 && (
                        <div className="text-xs text-muted-foreground shrink-0">
                          Suite {(run.suites_completed ?? 0) + 1}/{run.suites_total}
                        </div>
                      )}
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-border/50">
                      <div className="flex justify-end pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 text-xs h-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(run.id);
                            setExpandedRunId(null);
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete Run
                        </Button>
                      </div>
                      <RunDetail
                        results={expandedResults}
                        loading={loadingResults}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
