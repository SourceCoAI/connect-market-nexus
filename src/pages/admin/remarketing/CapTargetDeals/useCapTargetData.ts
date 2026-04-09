import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/client';
import { useTimeframe } from '@/hooks/use-timeframe';
import { useFilterEngine } from '@/hooks/use-filter-engine';
import { CAPTARGET_FIELDS } from '@/components/filters';
import { useShiftSelect } from '@/hooks/useShiftSelect';
import { useEnrichmentProgress } from '@/hooks/useEnrichmentProgress';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';

import type { CapTargetDeal, SortColumn, SortDirection } from './types';
import { PAGE_SIZE, DEFAULT_COLUMN_WIDTHS } from './types';
import { sortDeals } from './helpers';
import type { DealForList } from '@/components/remarketing';

// Full columns for display rows
const DEAL_SELECT = [
  'id', 'title', 'internal_company_name', 'captarget_client_name',
  'captarget_contact_date', 'captarget_outreach_channel', 'captarget_interest_type',
  'main_contact_name', 'main_contact_email', 'main_contact_title', 'main_contact_phone',
  'captarget_sheet_tab', 'website', 'description', 'owner_response',
  'pushed_to_all_deals', 'pushed_to_all_deals_at', 'deal_source', 'status', 'created_at',
  'enriched_at', 'deal_total_score', 'linkedin_employee_count', 'linkedin_employee_range',
  'google_rating', 'google_review_count', 'captarget_status', 'is_priority_target',
  'needs_buyer_search', 'needs_owner_contact',
  'category', 'executive_summary', 'industry', 'remarketing_status',
].join(', ');

// Lightweight columns for stats and dynamic filter options (no heavy text columns)
const STATS_SELECT = [
  'id', 'pushed_to_all_deals', 'captarget_interest_type', 'enriched_at', 'deal_total_score',
  'is_priority_target', 'captarget_status', 'captarget_contact_date', 'created_at',
  'remarketing_status', 'captarget_sheet_tab', 'captarget_outreach_channel',
  'category', 'industry', 'linkedin_employee_range',
].join(', ');

// Map UI sort columns to DB column names
const SORT_COLUMN_MAP: Record<SortColumn, string> = {
  company_name: 'internal_company_name',
  client_name: 'category',
  contact_name: 'main_contact_name',
  interest_type: 'captarget_interest_type',
  outreach_channel: 'captarget_outreach_channel',
  contact_date: 'captarget_contact_date',
  pushed: 'pushed_to_all_deals',
  score: 'deal_total_score',
  linkedin_employee_count: 'linkedin_employee_count',
  linkedin_employee_range: 'linkedin_employee_range',
  google_review_count: 'google_review_count',
  google_rating: 'google_rating',
  priority: 'is_priority_target',
};

/**
 * Apply base server-side filters to a Supabase query.
 */
function applyBaseFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  opts: {
    hideNotFit: boolean;
    hidePushed: boolean;
    statusTab: 'all' | 'active' | 'inactive';
    kpiFilter: 'priority' | 'needs_scoring' | null;
    dateRange: { from?: Date | null; to?: Date | null };
  },
) {
  let q = query;
  if (opts.hideNotFit) {
    q = q.or('remarketing_status.is.null,remarketing_status.neq.not_a_fit');
  }
  if (opts.hidePushed) {
    q = q.or('pushed_to_all_deals.is.null,pushed_to_all_deals.eq.false');
  }
  if (opts.statusTab !== 'all') {
    q = q.eq('captarget_status', opts.statusTab);
  }
  if (opts.kpiFilter === 'priority') {
    q = q.eq('is_priority_target', true);
  }
  if (opts.kpiFilter === 'needs_scoring') {
    q = q.is('deal_total_score', null);
  }
  if (opts.dateRange.from) {
    q = q.gte('captarget_contact_date', opts.dateRange.from.toISOString().split('T')[0]);
  }
  if (opts.dateRange.to) {
    q = q.lte('captarget_contact_date', opts.dateRange.to.toISOString().split('T')[0]);
  }
  return q;
}

export function useCapTargetData() {
  const queryClient = useQueryClient();
  const { setPageContext } = useAICommandCenterContext();

  // Register page context for AI
  useEffect(() => {
    setPageContext({ page: 'captarget', entity_type: 'leads' });
  }, [setPageContext]);

  // Timeframe
  const { timeframe, setTimeframe, dateRange, isInRange } = useTimeframe('all_time');

  // Enrichment progress
  const { progress: enrichmentProgress, cancelEnrichment } = useEnrichmentProgress();

  // Sorting & filters – persisted in URL so navigating back restores them
  const [searchParams, setSearchParams] = useSearchParams();
  const sortColumn = (searchParams.get('sort') as SortColumn) ?? 'contact_date';
  const sortDirection = (searchParams.get('dir') as SortDirection) ?? 'desc';

  // KPI card filter (URL-persisted)
  const kpiFilter = (searchParams.get('kpi') as 'priority' | 'needs_scoring' | null) ?? null;
  const setKpiFilter = useCallback(
    (v: 'priority' | 'needs_scoring' | null) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v) n.set('kpi', v);
          else n.delete('kpi');
          n.delete('cp');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const hidePushed = searchParams.get('hidePushed') === '1';
  const setHidePushed = useCallback(
    (v: boolean) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v) n.set('hidePushed', '1');
          else n.delete('hidePushed');
          n.delete('cp');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const hideNotFit = searchParams.get('hideNotFit') !== '0'; // hidden by default
  const setHideNotFit = useCallback(
    (v: boolean) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (!v) n.set('hideNotFit', '0');
          else n.delete('hideNotFit');
          n.delete('cp');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const statusTab = (searchParams.get('status') as 'all' | 'active' | 'inactive') ?? 'all';
  const setStatusTab = useCallback(
    (v: 'all' | 'active' | 'inactive') => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('status', v);
          else n.delete('status');
          n.delete('cp');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Column resizing
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);
  const resizingRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback(
    (col: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = columnWidths[col] || 100;
      resizingRef.current = { col, startX, startW };

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const diff = ev.clientX - resizingRef.current.startX;
        const newWidth = Math.max(40, resizingRef.current.startW + diff);
        setColumnWidths((prev) => ({ ...prev, [resizingRef.current!.col]: newWidth }));
      };

      const onMouseUp = () => {
        resizingRef.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [columnWidths],
  );

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Pagination (URL-persisted)
  const currentPage = Number(searchParams.get('cp')) || 1;
  const setCurrentPage = useCallback(
    (v: number | ((prev: number) => number)) => {
      setSearchParams(
        (p) => {
          const cur = Number(p.get('cp')) || 1;
          const resolved = typeof v === 'function' ? v(cur) : v;
          const n = new URLSearchParams(p);
          if (resolved > 1) n.set('cp', String(resolved));
          else n.delete('cp');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Sort handler
  const handleSort = useCallback(
    (col: SortColumn) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (next.get('sort') === col) {
            next.set('dir', next.get('dir') === 'asc' ? 'desc' : 'asc');
          } else {
            next.set('sort', col);
            next.set('dir', 'asc');
          }
          // Reset pagination when sort changes
          next.delete('cp');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Detect if advanced filter rules are active (read from URL before useFilterEngine)
  const rawFilterParam = searchParams.get('f');
  const hasAdvancedFilters = useMemo(() => {
    if (!rawFilterParam) return false;
    try {
      const state = JSON.parse(atob(rawFilterParam)) as { rules?: unknown[]; search?: string };
      return (state.rules?.length ?? 0) > 0 || (state.search?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }, [rawFilterParam]);

  // ─── Data fetching ───────────────────────────────────────────────────

  // Lightweight stats query — for counts, KPIs, tab badges, and filter dropdown options.
  // Fetches all captarget deals but only small columns (no description/executive_summary).
  const { data: statsData } = useQuery({
    queryKey: ['remarketing', 'captarget-deals', 'stats'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await untypedFrom('listings')
        .select(STATS_SELECT)
        .eq('deal_source', 'captarget');
      if (error) throw error;
      return (data || []) as unknown as CapTargetDeal[];
    },
  });

  // Base filter options (memoized for query key stability)
  const baseFilterOpts = useMemo(
    () => ({ hideNotFit, hidePushed, statusTab, kpiFilter, dateRange }),
    [hideNotFit, hidePushed, statusTab, kpiFilter, dateRange],
  );

  // Main page data query — two modes:
  //  • Server mode (no advanced filters): fetches only one page + count from DB
  //  • Client mode (advanced filters active): fetches all base-filtered rows,
  //    then runs the filter engine client-side
  const {
    data: queryResult,
    isLoading,
  } = useQuery({
    queryKey: [
      'remarketing',
      'captarget-deals',
      'page',
      hideNotFit,
      hidePushed,
      statusTab,
      kpiFilter,
      sortColumn,
      sortDirection,
      currentPage,
      dateRange?.from?.getTime() ?? null,
      dateRange?.to?.getTime() ?? null,
      hasAdvancedFilters ? rawFilterParam : null,
    ],
    refetchOnMount: 'always',
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!hasAdvancedFilters) {
        // SERVER MODE: fetch only the current page with server-side filtering & sorting
        let query = untypedFrom('listings')
          .select(DEAL_SELECT, { count: 'exact' })
          .eq('deal_source', 'captarget');

        query = applyBaseFilters(query, baseFilterOpts);

        const dbColumn = SORT_COLUMN_MAP[sortColumn] || 'captarget_contact_date';
        query = query.order(dbColumn, {
          ascending: sortDirection === 'asc',
          nullsFirst: false,
        });

        const start = (currentPage - 1) * PAGE_SIZE;
        query = query.range(start, start + PAGE_SIZE - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        return {
          deals: (data || []) as CapTargetDeal[],
          totalFilteredCount: count || 0,
          mode: 'server' as const,
        };
      } else {
        // CLIENT MODE: fetch all base-filtered rows for client-side filter engine
        const allData: CapTargetDeal[] = [];
        const batchSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          let query = untypedFrom('listings')
            .select(DEAL_SELECT)
            .eq('deal_source', 'captarget');

          query = applyBaseFilters(query, baseFilterOpts);
          query = query
            .order('captarget_contact_date', { ascending: false, nullsFirst: false })
            .range(offset, offset + batchSize - 1);

          const { data, error } = await query;
          if (error) throw error;
          if (data && data.length > 0) {
            allData.push(...(data as unknown as CapTargetDeal[]));
            offset += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }

        return {
          deals: allData,
          totalFilteredCount: allData.length,
          mode: 'client' as const,
        };
      }
    },
  });

  // Refetch invalidates all captarget queries (stats + page)
  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'captarget-deals'] });
  }, [queryClient]);

  // Exclusion log query
  const { data: exclusionLog } = useQuery({
    queryKey: ['captarget-exclusion-log'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('captarget_sync_exclusions')
        .select('id, company_name, exclusion_reason, exclusion_category, source, excluded_at')
        .order('excluded_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  // ─── Filter engine (for state management + client mode filtering) ───

  const engineInput = useMemo(
    () => (queryResult?.deals ?? []) as CapTargetDeal[],
    [queryResult],
  );

  const {
    filteredItems: engineFiltered,
    filterState,
    setFilterState,
    dynamicOptions: _engineDynamicOptions,
    filteredCount,
    totalCount: engineTotal,
  } = useFilterEngine(engineInput, CAPTARGET_FIELDS);

  // Compute dynamic options from stats data (full dataset, not just current page)
  const dynamicOptions = useMemo(() => {
    if (!statsData?.length) return _engineDynamicOptions;
    const result: Record<string, { label: string; value: string }[]> = {};
    for (const field of CAPTARGET_FIELDS) {
      if (!field.dynamicOptions) continue;
      const unique = new Set<string>();
      for (const item of statsData) {
        const rec = item as unknown as Record<string, unknown>;
        const val = field.accessor ? field.accessor(rec) : rec[field.key];
        if (val != null && val !== '') unique.add(String(val));
      }
      result[field.key] = Array.from(unique)
        .sort()
        .map((v) => ({ label: v, value: v }));
    }
    return result;
  }, [statsData, _engineDynamicOptions]);

  // ─── Computed / memoized values ──────────────────────────────────────

  // Final filtered deals
  const filteredDeals = useMemo(() => {
    if (!queryResult) return [];
    if (queryResult.mode === 'server') {
      // Already filtered, sorted, and paginated by DB
      return queryResult.deals;
    }
    // Client mode: apply filter engine rules + sort
    return sortDeals(engineFiltered, sortColumn, sortDirection);
  }, [queryResult, engineFiltered, sortColumn, sortDirection]);

  // Pagination
  const totalFilteredCount =
    queryResult?.mode === 'server' ? queryResult.totalFilteredCount : filteredDeals.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedDeals = useMemo(() => {
    if (!queryResult) return [];
    if (queryResult.mode === 'server') return queryResult.deals; // already paginated
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredDeals.slice(start, start + PAGE_SIZE);
  }, [queryResult, filteredDeals, safePage]);

  // Selection helpers
  const allSelected =
    paginatedDeals.length > 0 && paginatedDeals.every((d) => selectedIds.has(d.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedDeals.map((d) => d.id)));
  };

  const orderedIds = useMemo(() => paginatedDeals.map((d) => d.id), [paginatedDeals]);
  const { handleToggle: toggleSelect } = useShiftSelect(orderedIds, selectedIds, setSelectedIds);

  // ─── Stats from lightweight query ────────────────────────────────────

  const kpiStats = useMemo(() => {
    if (!statsData) return { totalDeals: 0, priorityDeals: 0, avgScore: 0, needsScoring: 0 };
    const dateFilteredDeals = statsData.filter((d) =>
      isInRange(d.captarget_contact_date || d.created_at),
    );
    const total = dateFilteredDeals.length;
    const priorityDeals = dateFilteredDeals.filter((d) => d.is_priority_target === true).length;
    let totalScore = 0;
    let scored = 0;
    dateFilteredDeals.forEach((d) => {
      if (d.deal_total_score != null) {
        totalScore += d.deal_total_score;
        scored++;
      }
    });
    const avgScore = scored > 0 ? Math.round(totalScore / scored) : 0;
    const needsScoring = dateFilteredDeals.filter((d) => d.deal_total_score == null).length;
    return { totalDeals: total, priorityDeals, avgScore, needsScoring };
  }, [statsData, isInRange]);

  // Memoize selected deals for AddToList dialog
  const selectedDealsForList = useMemo((): DealForList[] => {
    if (selectedIds.size === 0) return [];
    return paginatedDeals
      .filter((d) => selectedIds.has(d.id))
      .map((d) => ({
        dealId: d.id,
        dealName: d.internal_company_name || d.title || 'Unknown Deal',
        contactName: d.main_contact_name,
        contactEmail: d.main_contact_email,
        contactPhone: d.main_contact_phone,
      }));
  }, [paginatedDeals, selectedIds]);

  // Summary stats (from lightweight stats query)
  const totalDeals = statsData?.length || 0;
  const unpushedCount = useMemo(
    () => statsData?.filter((d) => !d.pushed_to_all_deals).length || 0,
    [statsData],
  );
  const interestCount = useMemo(
    () => statsData?.filter((d) => d.captarget_interest_type === 'interest').length || 0,
    [statsData],
  );
  const enrichedCount = useMemo(
    () => statsData?.filter((d) => d.enriched_at).length || 0,
    [statsData],
  );
  const scoredCount = useMemo(
    () => statsData?.filter((d) => d.deal_total_score != null).length || 0,
    [statsData],
  );

  // Tab counts (computed from stats data with base filters EXCEPT statusTab)
  const { filteredTotal, activeCount, inactiveCount } = useMemo(() => {
    if (!statsData) return { filteredTotal: 0, activeCount: 0, inactiveCount: 0 };
    const filtered = statsData.filter((d) => {
      if (hidePushed && d.pushed_to_all_deals) return false;
      if (hideNotFit && d.remarketing_status === 'not_a_fit') return false;
      if (dateRange.from || dateRange.to) {
        const dateStr = d.captarget_contact_date || d.created_at;
        const dealDate = dateStr ? new Date(dateStr) : null;
        if (!dealDate) return false;
        if (dateRange.from && dealDate < dateRange.from) return false;
        if (dateRange.to && dealDate > dateRange.to) return false;
      }
      return true;
    });
    return {
      filteredTotal: filtered.length,
      activeCount: filtered.filter((d) => d.captarget_status === 'active').length,
      inactiveCount: filtered.filter((d) => d.captarget_status === 'inactive').length,
    };
  }, [statsData, hidePushed, hideNotFit, dateRange]);

  return {
    // Raw data (current page for selected-deal operations)
    deals: paginatedDeals,
    isLoading,
    refetch,
    exclusionLog,

    // Timeframe
    timeframe,
    setTimeframe,

    // Enrichment progress
    enrichmentProgress,
    cancelEnrichment,

    // Filters
    filterState,
    setFilterState,
    dynamicOptions,
    filteredCount: queryResult?.mode === 'server' ? queryResult.totalFilteredCount : filteredCount,
    engineTotal: queryResult?.mode === 'server' ? queryResult.totalFilteredCount : engineTotal,
    hidePushed,
    setHidePushed,
    hideNotFit,
    setHideNotFit,

    // Status tabs
    statusTab,
    setStatusTab,

    // Sorting
    sortColumn,
    sortDirection,
    handleSort,

    // Column widths
    columnWidths,
    handleResizeStart,

    // Selection
    selectedIds,
    setSelectedIds,
    allSelected,
    toggleSelectAll,
    toggleSelect,
    selectedDealsForList,

    // Pagination
    currentPage,
    setCurrentPage,
    safePage,
    totalPages,
    totalFilteredCount,
    paginatedDeals,
    filteredDeals,

    // KPI
    kpiStats,
    kpiFilter,
    setKpiFilter,

    // Summary stats
    totalDeals,
    unpushedCount,
    interestCount,
    enrichedCount,
    scoredCount,
    filteredTotal,
    activeCount,
    inactiveCount,
  };
}
