import { useState, useEffect, useCallback } from 'react';
import { supabase, untypedFrom } from '@/integrations/supabase/client';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RefreshCw,
  Trash2,
  Users,
  Building2,
  Brain,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  Contact,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

interface QueueItem {
  id: string;
  status: string;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  attempts: number;
  label: string;
}

interface ContactDiscoveryRow {
  id: string;
  buyer_id: string;
  trigger_source: string;
  status: string;
  pe_firm_name: string | null;
  company_name: string;
  pe_contacts_found: number;
  company_contacts_found: number;
  total_saved: number;
  skipped_duplicates: number;
  existing_contacts_count: number;
  error_message: string | null;
  pe_search_error: string | null;
  company_search_error: string | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
  // joined
  buyer_label?: string;
}

const EMPTY_STATS: QueueStats = { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[status] || 'bg-muted text-muted-foreground'}`}
    >
      {status}
    </span>
  );
}

function StatsCards({ stats, label }: { stats: QueueStats; label: string }) {
  const progress = stats.total > 0 ? ((stats.completed + stats.failed) / stats.total) * 100 : 0;
  const isActive = stats.pending > 0 || stats.processing > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-800/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" />
              Pending
            </p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 dark:border-blue-800/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Loader2 className="h-3 w-3" />
              Processing
            </p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.processing}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-800/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Completed
            </p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {stats.completed}
            </p>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <XCircle className="h-3 w-3" />
              Failed
            </p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats.failed}</p>
          </CardContent>
        </Card>
      </div>
      {isActive && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{label} enrichment in progress…</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}
    </div>
  );
}

function QueueTable({ items, loading }: { items: QueueItem[]; loading: boolean }) {
  if (loading)
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading…
      </div>
    );
  if (items.length === 0)
    return <p className="text-center py-8 text-muted-foreground text-sm">No items in queue</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="p-2">Name</th>
            <th className="p-2">Status</th>
            <th className="p-2">Queued</th>
            <th className="p-2">Attempts</th>
            <th className="p-2">Error</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="p-2 font-medium text-foreground truncate max-w-[200px]">
                {item.label}
              </td>
              <td className="p-2">
                <StatusBadge status={item.status} />
              </td>
              <td className="p-2 text-muted-foreground text-xs">
                {new Date(item.queued_at).toLocaleString()}
              </td>
              <td className="p-2 text-muted-foreground">{item.attempts}</td>
              <td className="p-2 text-red-500 text-xs truncate max-w-[250px]">
                {item.last_error || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TRIGGER_LABELS: Record<string, string> = {
  approval: 'Approval',
  bulk_approval: 'Bulk Approval',
  manual: 'Manual',
  retry: 'Retry',
};

function ContactDiscoveryTable({
  items,
  loading,
}: {
  items: ContactDiscoveryRow[];
  loading: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading)
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  if (items.length === 0)
    return (
      <p className="text-center py-8 text-muted-foreground text-sm">
        No contact discovery runs yet
      </p>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="p-2 w-6" />
            <th className="p-2">Buyer / Company</th>
            <th className="p-2">Trigger</th>
            <th className="p-2">Status</th>
            <th className="p-2 text-center">PE Found</th>
            <th className="p-2 text-center">Co Found</th>
            <th className="p-2 text-center">Saved</th>
            <th className="p-2">Duration</th>
            <th className="p-2">Time</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const isExpanded = expandedId === row.id;
            const hasError = row.error_message || row.pe_search_error || row.company_search_error;
            return (
              <>
                <tr
                  key={row.id}
                  className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer ${hasError ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                >
                  <td className="p-2 text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </td>
                  <td className="p-2">
                    <div className="font-medium text-foreground truncate max-w-[200px]">
                      {row.buyer_label || row.company_name}
                    </div>
                    {row.pe_firm_name && (
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                        PE: {row.pe_firm_name}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <span className="text-xs text-muted-foreground">
                      {TRIGGER_LABELS[row.trigger_source] || row.trigger_source}
                    </span>
                  </td>
                  <td className="p-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="p-2 text-center font-mono text-xs">
                    {row.pe_contacts_found || '—'}
                  </td>
                  <td className="p-2 text-center font-mono text-xs">
                    {row.company_contacts_found || '—'}
                  </td>
                  <td className="p-2 text-center font-mono text-xs font-medium">
                    {row.total_saved}
                  </td>
                  <td className="p-2 text-muted-foreground text-xs">
                    {row.duration_ms ? `${(row.duration_ms / 1000).toFixed(1)}s` : '...'}
                  </td>
                  <td className="p-2 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(row.started_at).toLocaleString()}
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${row.id}-detail`} className="bg-muted/20">
                    <td colSpan={9} className="p-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">Existing contacts:</span>{' '}
                          <span className="font-medium">{row.existing_contacts_count}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Skipped dupes:</span>{' '}
                          <span className="font-medium">{row.skipped_duplicates}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Buyer ID:</span>{' '}
                          <span className="font-mono">{row.buyer_id.slice(0, 8)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Completed:</span>{' '}
                          <span>
                            {row.completed_at
                              ? new Date(row.completed_at).toLocaleString()
                              : 'In progress'}
                          </span>
                        </div>
                      </div>
                      {row.pe_search_error && (
                        <div className="mt-2 text-xs text-red-500">
                          <span className="font-medium">PE search error:</span>{' '}
                          {row.pe_search_error}
                        </div>
                      )}
                      {row.company_search_error && (
                        <div className="mt-1 text-xs text-red-500">
                          <span className="font-medium">Company search error:</span>{' '}
                          {row.company_search_error}
                        </div>
                      )}
                      {row.error_message && (
                        <div className="mt-1 text-xs text-red-500">
                          <span className="font-medium">Error:</span> {row.error_message}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function EnrichmentQueue() {
  // Register AI Command Center context
  const { setPageContext } = useAICommandCenterContext();
  useEffect(() => {
    setPageContext({ page: 'enrichment_queue', entity_type: 'enrichment' });
  }, [setPageContext]);

  const [dealStats, setDealStats] = useState<QueueStats>(EMPTY_STATS);
  const [buyerStats, setBuyerStats] = useState<QueueStats>(EMPTY_STATS);
  const [scoringStats, setScoringStats] = useState<QueueStats>(EMPTY_STATS);
  const [searchStats, setSearchStats] = useState<QueueStats>(EMPTY_STATS);
  const [dealItems, setDealItems] = useState<QueueItem[]>([]);
  const [buyerItems, setBuyerItems] = useState<QueueItem[]>([]);
  const [scoringItems, setScoringItems] = useState<QueueItem[]>([]);
  const [searchItems, setSearchItems] = useState<QueueItem[]>([]);
  const [contactDiscoveryStats, setContactDiscoveryStats] = useState<QueueStats>(EMPTY_STATS);
  const [contactDiscoveryItems, setContactDiscoveryItems] = useState<ContactDiscoveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('deals');

  const fetchStatsForTable = useCallback(
    async (
      table: 'enrichment_queue' | 'buyer_enrichment_queue' | 'remarketing_scoring_queue',
      cutoff: string,
    ): Promise<QueueStats> => {
      const dateCol = table === 'remarketing_scoring_queue' ? 'created_at' : 'queued_at';
      const q = (status: string) =>
        supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('status', status)
          .gte(dateCol, cutoff);
      const [p, pr, c, f] = await Promise.all([
        q('pending'),
        q('processing'),
        q('completed'),
        q('failed'),
      ]);
      return {
        pending: p.count ?? 0,
        processing: pr.count ?? 0,
        completed: c.count ?? 0,
        failed: f.count ?? 0,
        total: (p.count ?? 0) + (pr.count ?? 0) + (c.count ?? 0) + (f.count ?? 0),
      };
    },
    [],
  );

  /** Fetch stats for buyer_search_jobs (different status names) */
  const fetchSearchStats = useCallback(async (cutoff: string): Promise<QueueStats> => {
    const q = (status: string) =>
      untypedFrom('buyer_search_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', status)
        .gte('created_at', cutoff);
    const [p, pr, c, f] = await Promise.all([
      q('pending'),
      q('searching'),
      q('completed'),
      q('failed'),
    ]);
    // "searching" and "scoring" both count as processing
    const scoringRes = await untypedFrom('buyer_search_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'scoring')
      .gte('created_at', cutoff);
    return {
      pending: p.count ?? 0,
      processing: (pr.count ?? 0) + (scoringRes.count ?? 0),
      completed: c.count ?? 0,
      failed: f.count ?? 0,
      total:
        (p.count ?? 0) +
        (pr.count ?? 0) +
        (scoringRes.count ?? 0) +
        (c.count ?? 0) +
        (f.count ?? 0),
    };
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    try {
      const [ds, bs, ss, searchS] = await Promise.all([
        fetchStatsForTable('enrichment_queue', cutoff),
        fetchStatsForTable('buyer_enrichment_queue', cutoff),
        fetchStatsForTable('remarketing_scoring_queue', cutoff),
        fetchSearchStats(cutoff),
      ]);
      setDealStats(ds);
      setBuyerStats(bs);
      setScoringStats(ss);
      setSearchStats(searchS);

      // Fetch recent items for the active tab
      const [dealRes, buyerRes, scoringRes] = await Promise.all([
        supabase
          .from('enrichment_queue')
          .select(
            'id, listing_id, status, queued_at, started_at, completed_at, last_error, attempts',
          )
          .gte('queued_at', cutoff)
          .order('queued_at', { ascending: false })
          .limit(100),
        supabase
          .from('buyer_enrichment_queue')
          .select('id, buyer_id, status, queued_at, started_at, completed_at, last_error, attempts')
          .gte('queued_at', cutoff)
          .order('queued_at', { ascending: false })
          .limit(100),
        supabase
          .from('remarketing_scoring_queue')
          .select(
            'id, buyer_id, listing_id, score_type, status, created_at, processed_at, last_error, attempts',
          )
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      // Fetch labels for deals
      type DealQueueRow = {
        id: string;
        listing_id: string;
        status: string;
        queued_at: string;
        started_at: string | null;
        completed_at: string | null;
        last_error: string | null;
        attempts: number;
      };
      type BuyerQueueRow = {
        id: string;
        buyer_id: string;
        status: string;
        queued_at: string;
        started_at: string | null;
        completed_at: string | null;
        last_error: string | null;
        attempts: number;
      };
      type ScoringQueueRow = {
        id: string;
        buyer_id: string | null;
        listing_id: string | null;
        score_type: string;
        status: string;
        created_at: string;
        processed_at: string | null;
        last_error: string | null;
        attempts: number;
      };
      type ListingLabel = {
        id: string;
        internal_company_name: string | null;
        title: string | null;
      };
      type BuyerLabel = { id: string; company_name: string | null };

      const dealListingIds = (dealRes.data || [])
        .map((d: DealQueueRow) => d.listing_id)
        .filter(Boolean);
      const dealLabels: Record<string, string> = {};
      if (dealListingIds.length > 0) {
        const { data: listings, error: listingsError } = await supabase
          .from('listings')
          .select('id, internal_company_name, title')
          .in('id', dealListingIds.slice(0, 100));
        if (listingsError) throw listingsError;
        (listings || []).forEach((l: ListingLabel) => {
          dealLabels[l.id] = l.internal_company_name || l.title || l.id.slice(0, 8);
        });
      }
      setDealItems(
        (dealRes.data || []).map((d: DealQueueRow) => ({
          ...d,
          label: dealLabels[d.listing_id] || d.listing_id?.slice(0, 8) || '—',
        })),
      );

      // Fetch labels for buyers
      const buyerIds = (buyerRes.data || []).map((b: BuyerQueueRow) => b.buyer_id).filter(Boolean);
      const buyerLabels: Record<string, string> = {};
      if (buyerIds.length > 0) {
        const { data: buyers, error: buyersError } = await supabase
          .from('buyers')
          .select('id, company_name')
          .in('id', buyerIds.slice(0, 100));
        if (buyersError) throw buyersError;
        (buyers || []).forEach((b: BuyerLabel) => {
          buyerLabels[b.id] = b.company_name || b.id.slice(0, 8);
        });
      }
      setBuyerItems(
        (buyerRes.data || []).map((b: BuyerQueueRow) => ({
          ...b,
          label: buyerLabels[b.buyer_id] || b.buyer_id?.slice(0, 8) || '—',
        })),
      );

      // Fetch labels for scoring items (may reference listings or buyers)
      const scoringListingIds = (scoringRes.data || [])
        .map((s: ScoringQueueRow) => s.listing_id)
        .filter((id): id is string => Boolean(id));
      const scoringBuyerIds = (scoringRes.data || [])
        .map((s: ScoringQueueRow) => s.buyer_id)
        .filter((id): id is string => Boolean(id));
      const scoringListingLabels: Record<string, string> = {};
      const scoringBuyerLabels: Record<string, string> = {};
      if (scoringListingIds.length > 0) {
        const { data: sListings } = await supabase
          .from('listings')
          .select('id, internal_company_name, title')
          .in('id', scoringListingIds.slice(0, 100));
        (sListings || []).forEach((l: ListingLabel) => {
          scoringListingLabels[l.id] = l.internal_company_name || l.title || l.id.slice(0, 8);
        });
      }
      if (scoringBuyerIds.length > 0) {
        const { data: sBuyers } = await supabase
          .from('buyers')
          .select('id, company_name')
          .in('id', scoringBuyerIds.slice(0, 100));
        (sBuyers || []).forEach((b: BuyerLabel) => {
          scoringBuyerLabels[b.id] = b.company_name || b.id.slice(0, 8);
        });
      }
      setScoringItems(
        (scoringRes.data || []).map((s: ScoringQueueRow) => ({
          ...s,
          queued_at: s.created_at,
          completed_at: s.processed_at,
          started_at: null,
          label: s.listing_id
            ? scoringListingLabels[s.listing_id] || s.listing_id.slice(0, 8)
            : s.buyer_id
              ? scoringBuyerLabels[s.buyer_id] || s.buyer_id.slice(0, 8)
              : '—',
        })),
      );

      // Fetch buyer search jobs
      const { data: searchJobsData } = await untypedFrom('buyer_search_jobs')
        .select(
          'id, listing_id, listing_name, status, progress_pct, progress_message, buyers_found, buyers_inserted, buyers_updated, error, started_at, completed_at, created_at',
        )
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(100);
      setSearchItems(
        (searchJobsData || []).map((s: Record<string, unknown>) => ({
          id: s.id,
          status: s.status === 'searching' || s.status === 'scoring' ? 'processing' : s.status,
          queued_at: s.created_at,
          started_at: s.started_at,
          completed_at: s.completed_at,
          last_error: s.error,
          attempts: 1,
          label: (s.listing_name as string) || (s.listing_id as string)?.slice(0, 8) || '—',
        })),
      );

      // --- Contact Discovery Log ---
      const { data: cdRows } = await untypedFrom('contact_discovery_log')
        .select(
          'id, buyer_id, trigger_source, status, pe_firm_name, company_name, pe_contacts_found, company_contacts_found, total_saved, skipped_duplicates, existing_contacts_count, error_message, pe_search_error, company_search_error, duration_ms, started_at, completed_at',
        )
        .gte('started_at', cutoff)
        .order('started_at', { ascending: false })
        .limit(100);

      const cdData: ContactDiscoveryRow[] = cdRows || [];

      // Compute stats: map statuses to queue-style buckets
      const cdStatsMap = { pending: 0, processing: 0, completed: 0, failed: 0 };
      for (const r of cdData) {
        if (r.status === 'started') cdStatsMap.processing++;
        else if (r.status === 'completed') cdStatsMap.completed++;
        else if (r.status === 'partial')
          cdStatsMap.completed++; // partial = completed with warnings
        else if (r.status === 'skipped') cdStatsMap.completed++;
        else if (r.status === 'failed') cdStatsMap.failed++;
      }
      setContactDiscoveryStats({
        ...cdStatsMap,
        total: cdData.length,
      });

      // Resolve buyer labels
      const cdBuyerIds = [...new Set(cdData.map((r) => r.buyer_id).filter(Boolean))];
      const cdBuyerLabels: Record<string, string> = {};
      if (cdBuyerIds.length > 0) {
        const { data: cdBuyers } = await supabase
          .from('buyers')
          .select('id, company_name')
          .in('id', cdBuyerIds.slice(0, 100));
        (cdBuyers || []).forEach((b: { id: string; company_name: string | null }) => {
          cdBuyerLabels[b.id] = b.company_name || b.id.slice(0, 8);
        });
      }
      setContactDiscoveryItems(
        cdData.map((r) => ({ ...r, buyer_label: cdBuyerLabels[r.buyer_id] })),
      );
    } catch (err) {
      console.error('Failed to fetch queue data:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchStatsForTable, fetchSearchStats]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const clearFailed = async (
    table:
      | 'enrichment_queue'
      | 'buyer_enrichment_queue'
      | 'remarketing_scoring_queue'
      | 'buyer_search_jobs',
  ) => {
    const { error } = await untypedFrom(table).delete().eq('status', 'failed');
    if (error) {
      toast.error('Failed to clear');
      return;
    }
    toast.success('Failed items cleared');
    fetchAll();
  };

  const activeCount =
    dealStats.pending +
    dealStats.processing +
    buyerStats.pending +
    buyerStats.processing +
    scoringStats.pending +
    scoringStats.processing +
    searchStats.pending +
    searchStats.processing +
    contactDiscoveryStats.processing;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Enrichment Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor all background enrichment and scoring jobs (last 24h)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Badge variant="secondary" className="animate-pulse">
              {activeCount} active
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="deals" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Deal Enrichment
            {dealStats.pending + dealStats.processing > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {dealStats.pending + dealStats.processing}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="buyers" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Buyer Enrichment
            {buyerStats.pending + buyerStats.processing > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {buyerStats.pending + buyerStats.processing}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="scoring" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            Scoring
            {scoringStats.pending + scoringStats.processing > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {scoringStats.pending + scoringStats.processing}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="search" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            AI Buyer Search
            {searchStats.pending + searchStats.processing > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {searchStats.pending + searchStats.processing}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-1.5">
            <Contact className="h-3.5 w-3.5" />
            Contact Discovery
            {contactDiscoveryStats.processing > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 animate-pulse">
                {contactDiscoveryStats.processing}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deals" className="space-y-4 mt-4">
          <StatsCards stats={dealStats} label="Deal" />
          <Card>
            <CardHeader className="py-3 px-4 flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Recent Items</CardTitle>
              {dealStats.failed > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 text-xs"
                  onClick={() => clearFailed('enrichment_queue')}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear Failed
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <QueueTable items={dealItems} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="buyers" className="space-y-4 mt-4">
          <StatsCards stats={buyerStats} label="Buyer" />
          <Card>
            <CardHeader className="py-3 px-4 flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Recent Items</CardTitle>
              {buyerStats.failed > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 text-xs"
                  onClick={() => clearFailed('buyer_enrichment_queue')}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear Failed
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <QueueTable items={buyerItems} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scoring" className="space-y-4 mt-4">
          <StatsCards stats={scoringStats} label="Scoring" />
          <Card>
            <CardHeader className="py-3 px-4 flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Recent Items</CardTitle>
              {scoringStats.failed > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 text-xs"
                  onClick={() => clearFailed('remarketing_scoring_queue')}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear Failed
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <QueueTable items={scoringItems} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search" className="space-y-4 mt-4">
          <StatsCards stats={searchStats} label="AI Buyer Search" />
          <Card>
            <CardHeader className="py-3 px-4 flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Recent AI Buyer Searches</CardTitle>
              {searchStats.failed > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 text-xs"
                  onClick={() => clearFailed('buyer_search_jobs')}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear Failed
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <QueueTable items={searchItems} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4 mt-4">
          <StatsCards stats={contactDiscoveryStats} label="Contact Discovery" />
          <Card>
            <CardHeader className="py-3 px-4 flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Recent Contact Discovery Runs</CardTitle>
              <p className="text-xs text-muted-foreground">
                Click a row to see full details and errors
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <ContactDiscoveryTable items={contactDiscoveryItems} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
