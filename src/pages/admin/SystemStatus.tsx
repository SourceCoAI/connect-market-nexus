/**
 * SystemStatus: A single-page dashboard that checks all critical platform
 * services and displays an overall "operational / degraded / down" verdict.
 *
 * Checks performed:
 *  1. Supabase Database (REST API round-trip via profiles table)
 *  2. Supabase Auth (auth.getSession lightweight call)
 *  3. Supabase Storage (list buckets)
 *  4. Supabase Edge Functions (invoke a lightweight ping, if available)
 *  5. Analytics tables (page_views, user_events, etc.)
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Activity,
  Database,
  Shield,
  HardDrive,
  Zap,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ServiceStatus = 'operational' | 'degraded' | 'down' | 'checking' | 'pending';

interface ServiceCheck {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: ServiceStatus;
  latencyMs?: number;
  error?: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Check functions
// ---------------------------------------------------------------------------

async function checkDatabase(): Promise<Partial<ServiceCheck>> {
  const start = performance.now();
  try {
    const { error, count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    const latencyMs = Math.round(performance.now() - start);
    if (error) return { status: 'down', latencyMs, error: error.message };
    return {
      status: latencyMs > 3000 ? 'degraded' : 'operational',
      latencyMs,
      detail: `${count ?? '?'} profiles · ${latencyMs}ms`,
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkAuth(): Promise<Partial<ServiceCheck>> {
  const start = performance.now();
  try {
    const { error } = await supabase.auth.getSession();
    const latencyMs = Math.round(performance.now() - start);
    if (error) return { status: 'down', latencyMs, error: error.message };
    return {
      status: latencyMs > 3000 ? 'degraded' : 'operational',
      latencyMs,
      detail: `Session check OK · ${latencyMs}ms`,
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkStorage(): Promise<Partial<ServiceCheck>> {
  const start = performance.now();
  try {
    const { error } = await supabase.storage.listBuckets();
    const latencyMs = Math.round(performance.now() - start);
    if (error) return { status: 'down', latencyMs, error: error.message };
    return {
      status: latencyMs > 3000 ? 'degraded' : 'operational',
      latencyMs,
      detail: `Buckets accessible · ${latencyMs}ms`,
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkEdgeFunctions(): Promise<Partial<ServiceCheck>> {
  const start = performance.now();
  try {
    // Try to invoke a lightweight edge function.
    // We use admin-stats as a quick reachability check — a 401/403 still
    // proves the Edge Functions runtime is up.
    const res = await supabase.functions.invoke('admin-stats', {
      method: 'POST',
      body: { ping: true },
    });
    const latencyMs = Math.round(performance.now() - start);
    // Any response (including auth errors) means the runtime is reachable
    if (
      res.error &&
      !res.error.message.includes('401') &&
      !res.error.message.includes('403') &&
      !res.error.message.includes('non-2xx')
    ) {
      // A network-level error means Edge Functions are truly unreachable
      if (
        res.error.message.includes('Failed to fetch') ||
        res.error.message.includes('NetworkError')
      ) {
        return { status: 'down', latencyMs, error: res.error.message };
      }
    }
    return {
      status: latencyMs > 5000 ? 'degraded' : 'operational',
      latencyMs,
      detail: `Runtime reachable · ${latencyMs}ms`,
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkAnalyticsTables(): Promise<Partial<ServiceCheck>> {
  const start = performance.now();
  const tables = [
    'page_views',
    'user_events',
    'listing_analytics',
    'search_analytics',
    'user_sessions',
  ] as const;
  try {
    const results = await Promise.allSettled(
      tables.map((t) => supabase.from(t).select('*', { count: 'exact', head: true })),
    );
    const latencyMs = Math.round(performance.now() - start);

    const failures = results.filter((r) => r.status === 'rejected');
    const errors = results
      .filter(
        (r): r is PromiseFulfilledResult<{ error: { message: string } | null }> =>
          r.status === 'fulfilled',
      )
      .filter((r) => r.value.error != null);

    if (failures.length + errors.length === tables.length) {
      return { status: 'down', latencyMs, error: 'All analytics tables unreachable' };
    }
    if (failures.length + errors.length > 0) {
      return {
        status: 'degraded',
        latencyMs,
        detail: `${tables.length - failures.length - errors.length}/${tables.length} tables OK · ${latencyMs}ms`,
      };
    }
    return {
      status: 'operational',
      latencyMs,
      detail: `All ${tables.length} tables OK · ${latencyMs}ms`,
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function overallStatus(services: ServiceCheck[]): ServiceStatus {
  if (services.some((s) => s.status === 'checking' || s.status === 'pending')) return 'checking';
  if (services.every((s) => s.status === 'operational')) return 'operational';
  if (services.some((s) => s.status === 'down')) return 'down';
  return 'degraded';
}

const STATUS_CONFIG: Record<ServiceStatus, { label: string; className: string }> = {
  operational: { label: 'Operational', className: 'text-green-600 bg-green-50 border-green-200' },
  degraded: { label: 'Degraded', className: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  down: { label: 'Down', className: 'text-red-600 bg-red-50 border-red-200' },
  checking: { label: 'Checking...', className: 'text-blue-600 bg-blue-50 border-blue-200' },
  pending: { label: 'Not checked', className: 'text-muted-foreground bg-muted/30 border-border' },
};

function StatusBadge({ status }: { status: ServiceStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border',
        cfg.className,
      )}
    >
      {status === 'checking' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'operational' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'degraded' && <AlertTriangle className="h-3 w-3" />}
      {status === 'down' && <XCircle className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const INITIAL_SERVICES: ServiceCheck[] = [
  {
    id: 'database',
    name: 'Database',
    description: 'PostgreSQL via Supabase REST API',
    icon: <Database className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'auth',
    name: 'Authentication',
    description: 'Supabase Auth service',
    icon: <Shield className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'storage',
    name: 'File Storage',
    description: 'Supabase Storage buckets',
    icon: <HardDrive className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'edge',
    name: 'Edge Functions',
    description: 'Serverless function runtime',
    icon: <Zap className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'analytics',
    name: 'Analytics Pipeline',
    description: 'page_views, user_events, listing_analytics, search_analytics, user_sessions',
    icon: <BarChart3 className="h-5 w-5" />,
    status: 'pending',
  },
];

const CHECK_FNS: Record<string, () => Promise<Partial<ServiceCheck>>> = {
  database: checkDatabase,
  auth: checkAuth,
  storage: checkStorage,
  edge: checkEdgeFunctions,
  analytics: checkAnalyticsTables,
};

export default function SystemStatus() {
  const [services, setServices] = useState<ServiceCheck[]>(INITIAL_SERVICES);
  const [isRunning, setIsRunning] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setIsRunning(true);

    // Mark all as checking
    setServices((prev) =>
      prev.map((s) => ({
        ...s,
        status: 'checking' as const,
        error: undefined,
        detail: undefined,
        latencyMs: undefined,
      })),
    );

    // Run all checks in parallel and update each as it completes
    const promises = INITIAL_SERVICES.map(async (svc) => {
      const fn = CHECK_FNS[svc.id];
      if (!fn) return { id: svc.id };
      const result = await fn();
      setServices((prev) => prev.map((s) => (s.id === svc.id ? { ...s, ...result } : s)));
      return { id: svc.id, ...result };
    });

    await Promise.allSettled(promises);
    setLastChecked(new Date().toLocaleString());
    setIsRunning(false);
  }, []);

  const overall = overallStatus(services);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">System Status</h1>
            <p className="text-sm text-muted-foreground">
              {lastChecked ? `Last checked: ${lastChecked}` : 'Run a check to see current status'}
            </p>
          </div>
        </div>
        <Button onClick={runChecks} disabled={isRunning}>
          {isRunning ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {isRunning ? 'Checking...' : 'Run Status Check'}
        </Button>
      </div>

      {/* Overall status banner */}
      <div
        className={cn(
          'flex items-center justify-between rounded-lg border-2 px-6 py-4',
          overall === 'operational' && 'border-green-300 bg-green-50',
          overall === 'degraded' && 'border-yellow-300 bg-yellow-50',
          overall === 'down' && 'border-red-300 bg-red-50',
          (overall === 'checking' || overall === 'pending') && 'border-border bg-muted/30',
        )}
      >
        <div>
          <p className="text-sm font-medium text-muted-foreground">Overall Platform Status</p>
          <p
            className={cn(
              'text-xl font-bold',
              overall === 'operational' && 'text-green-700',
              overall === 'degraded' && 'text-yellow-700',
              overall === 'down' && 'text-red-700',
            )}
          >
            {overall === 'operational' && 'All Systems Operational'}
            {overall === 'degraded' && 'Partial Service Degradation'}
            {overall === 'down' && 'Service Disruption Detected'}
            {overall === 'checking' && 'Running checks...'}
            {overall === 'pending' && 'Status unknown — run a check'}
          </p>
        </div>
        {overall !== 'pending' && overall !== 'checking' && <StatusBadge status={overall} />}
      </div>

      {/* Service cards */}
      <div className="space-y-3">
        {services.map((svc) => (
          <div
            key={svc.id}
            className={cn(
              'flex items-start gap-4 rounded-lg border px-5 py-4 transition-colors',
              svc.status === 'down' && 'border-red-200 bg-red-50/50',
              svc.status === 'degraded' && 'border-yellow-200 bg-yellow-50/50',
            )}
          >
            <div
              className={cn(
                'mt-0.5',
                svc.status === 'operational' && 'text-green-600',
                svc.status === 'degraded' && 'text-yellow-600',
                svc.status === 'down' && 'text-red-600',
                (svc.status === 'checking' || svc.status === 'pending') && 'text-muted-foreground',
              )}
            >
              {svc.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{svc.name}</span>
                <StatusBadge status={svc.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>
              {svc.detail && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">{svc.detail}</p>
              )}
              {svc.error && (
                <p className="text-xs text-red-600 mt-1 font-mono break-all">{svc.error}</p>
              )}
            </div>
            {svc.latencyMs !== undefined && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {svc.latencyMs}ms
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
