import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Loader2,
  Clock,
  Shield,
  FileText,
  Send,
  Search,
  Webhook,
  Database,
  Copy,
  MinusCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──────────────────────────────────────────

interface TestResult {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  detail: string;
  durationMs: number;
}

interface TestResponse {
  results: TestResult[];
  cleanup: string[];
  summary: string;
  ranAt: string;
  ranBy: string;
  error?: string;
}

type RunState = 'idle' | 'running' | 'done' | 'error';

// ── Test metadata (icons + groups for display) ──────

const TEST_META: Record<string, { icon: typeof Shield; group: string }> = {
  env_config: { icon: Shield, group: 'Configuration' },
  api_auth: { icon: Shield, group: 'Configuration' },
  templates: { icon: FileText, group: 'Templates' },
  create_document: { icon: Send, group: 'Document Pipeline' },
  session_token: { icon: Search, group: 'Document Pipeline' },
  webhook_handler: { icon: Webhook, group: 'Webhook Pipeline' },
  db_verification: { icon: Database, group: 'Webhook Pipeline' },
  idempotency: { icon: Copy, group: 'Webhook Pipeline' },
};

const STATUS_ICON = {
  pass: CheckCircle2,
  fail: XCircle,
  warn: AlertTriangle,
  skip: MinusCircle,
};

const STATUS_COLOR = {
  pass: 'text-emerald-400',
  fail: 'text-red-400',
  warn: 'text-amber-400',
  skip: 'text-zinc-500',
};

const STATUS_BG = {
  pass: 'bg-emerald-500/10 border-emerald-500/20',
  fail: 'bg-red-500/10 border-red-500/20',
  warn: 'bg-amber-500/10 border-amber-500/20',
  skip: 'bg-zinc-500/10 border-zinc-500/20',
};

const PANDADOC_STORAGE_KEY = 'sourceco-pandadoc-test-results';

// ── Component ──────────────────────────────────────

export default function PandaDocHealthCheck() {
  const [runState, setRunState] = useState<RunState>('idle');
  const [response, setResponse] = useState<TestResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, setLastRun] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runTests = useCallback(async () => {
    setRunState('running');
    setErrorMsg(null);
    setResponse(null);

    try {
      const { data, error } = await supabase.functions.invoke('pandadoc-integration-test');

      if (error) {
        setRunState('error');
        setErrorMsg(error.message || 'Edge function invocation failed');
        return;
      }

      if (data?.error) {
        setRunState('error');
        setErrorMsg(data.error);
        try {
          localStorage.setItem(
            PANDADOC_STORAGE_KEY,
            JSON.stringify({ error: data.error, results: [] }),
          );
        } catch {
          /* ignore */
        }
        return;
      }

      const resp = data as TestResponse;
      setResponse(resp);
      setLastRun(resp.ranAt);
      setRunState('done');
      // Auto-expand failed and warned tests so errors are immediately visible
      const autoExpand = new Set<string>();
      for (const r of resp.results) {
        if (r.status === 'fail' || r.status === 'warn') autoExpand.add(r.id);
      }
      setExpanded(autoExpand);
    } catch (e: unknown) {
      setRunState('error');
      setErrorMsg((e as Error).message || 'Unexpected error');
    }
  }, []);

  const results = response?.results || [];
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  const skipped = results.filter((r) => r.status === 'skip').length;

  // Group results for display
  const groups = results.reduce<Record<string, TestResult[]>>((acc, r) => {
    const group = TEST_META[r.id]?.group || 'Other';
    if (!acc[group]) acc[group] = [];
    acc[group].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PandaDoc Health Check</h1>
          <p className="text-muted-foreground text-sm mt-1">
            End-to-end integration test for the NDA & Fee Agreement signing pipeline. Tests run
            server-side through your actual edge functions.
          </p>
        </div>
        <Button onClick={runTests} disabled={runState === 'running'} size="lg" className="gap-2">
          {runState === 'running' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run Tests
            </>
          )}
        </Button>
      </div>

      {/* What it tests */}
      {runState === 'idle' && (
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">What this tests</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">Configuration</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>All 4 env vars set (API key, webhook key, template UUIDs)</li>
                <li>PandaDoc API key authenticates</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Document Pipeline</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>NDA & Fee Agreement templates resolve</li>
                <li>Test document creates from template</li>
                <li>Embedded session token generates</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Webhook Pipeline</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>HMAC-SHA256 signature verified</li>
                <li>Simulated webhook accepted by handler</li>
                <li>firm_agreements DB updated correctly</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-2 border-t">
            All test data is automatically cleaned up. No emails are sent. API keys stay
            server-side.
          </p>
        </div>
      )}

      {/* Error state */}
      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 text-red-400 font-medium text-sm mb-1">
            <XCircle className="h-4 w-4" />
            Test execution failed
          </div>
          <p className="text-sm text-red-300">{errorMsg}</p>
        </div>
      )}

      {/* Summary bar */}
      {response && (
        <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-6 text-sm font-medium">
            {passed > 0 && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {passed} passed
              </span>
            )}
            {failed > 0 && (
              <span className="flex items-center gap-1.5 text-red-400">
                <XCircle className="h-4 w-4" />
                {failed} failed
              </span>
            )}
            {warned > 0 && (
              <span className="flex items-center gap-1.5 text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                {warned} warnings
              </span>
            )}
            {skipped > 0 && (
              <span className="flex items-center gap-1.5 text-zinc-500">
                <MinusCircle className="h-4 w-4" />
                {skipped} skipped
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {results.reduce((a, r) => a + r.durationMs, 0)}ms total
          </div>
        </div>
      )}

      {/* Test results grouped */}
      {Object.entries(groups).map(([groupName, groupResults]) => (
        <div key={groupName} className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-semibold">{groupName}</h3>
          </div>
          <div className="divide-y">
            {groupResults.map((r) => {
              const Icon = STATUS_ICON[r.status];
              const isOpen = expanded.has(r.id);
              return (
                <div key={r.id}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(r.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                  >
                    <Icon className={cn('h-5 w-5 shrink-0', STATUS_COLOR[r.status])} />
                    <span className="text-sm font-medium flex-1">{r.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] px-1.5 py-0',
                        STATUS_BG[r.status],
                        STATUS_COLOR[r.status],
                      )}
                    >
                      {r.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{r.durationMs}ms</span>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {isOpen && r.detail && (
                    <div
                      className={cn(
                        'mx-4 mb-3 p-3 rounded-md text-xs font-mono break-words whitespace-pre-wrap border',
                        r.status === 'fail'
                          ? 'bg-red-500/10 border-red-500/30 text-red-300'
                          : r.status === 'warn'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : r.status === 'pass'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : 'bg-muted border-border text-muted-foreground',
                      )}
                    >
                      {r.detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Cleanup log */}
      {response?.cleanup && response.cleanup.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground">Cleanup</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            {response.cleanup.map((note, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
