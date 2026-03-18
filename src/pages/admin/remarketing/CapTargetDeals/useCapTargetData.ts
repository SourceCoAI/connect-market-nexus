import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTimeframe } from '@/hooks/use-timeframe';
import { useFilterEngine } from '@/hooks/use-filter-engine';
import { CAPTARGET_FIELDS } from '@/components/filters';
import { useShiftSelect } from '@/hooks/useShiftSelect';
import { useEnrichmentProgress } from '@/hooks/useEnrichmentProgress';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';

import type { CapTargetDeal, SortColumn, SortDirection } from './types';
import { PAGE_SIZE, DEFAULT_COLUMN_WIDTHS } from './types';
import { sortDeals, preFilterDeals } from './helpers';
import type { DealForList } from '@/components/remarketing';

export function useCapTargetData() {
  const { setPageContext } = useAICommandCenterContext();

  // Register page context for AI
  useEffect(() => {
    setPageContext({ page: 'captarget', entity_type: 'leads' });
  }, [setPageContext]);

  // Timeframe
  const { timeframe, setTimeframe, dateRange, isInRange } = useTimeframe('all_time');

  // Enrichment progress
  const { progress: enrichmentProgress, cancelEnrichment } = useEnrichmentProgress();

  // Filters (local state — not URL-persisted)
  const [search] = useState('');
  const [pushedFilter] = useState<string>('all');
  const [sourceTabFilter] = useState<string>('all');

  // Sorting & filters – persisted in URL so navigating back restores them
  const [searchParams, setSearchParams] = useSearchParams();
  const sortColumn = (searchParams.get('sort') as SortColumn) ?? 'contact_date';
  const sortDirection = (searchParams.get('dir') as SortDirection) ?? 'desc';

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

  // ─── Data fetching ───────────────────────────────────────────────────

  const {
    data: deals,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['remarketing', 'captarget-deals'],
    refetchOnMount: 'always',
    staleTime: 30_000,
    queryFn: async () => {
      const allData: CapTargetDeal[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('listings')
          .select(
            `
            id, title, internal_company_name, captarget_client_name,
            captarget_contact_date, captarget_outreach_channel, captarget_interest_type,
            main_contact_name, main_contact_email, main_contact_title, main_contact_phone,
            captarget_sheet_tab, website, description, owner_response,
            pushed_to_all_deals, pushed_to_all_deals_at, deal_source, status, created_at,
            enriched_at, deal_total_score, linkedin_employee_count, linkedin_employee_range,
            google_rating, google_review_count, captarget_status, is_priority_target,
            needs_buyer_search, needs_owner_contact,
            category, executive_summary, industry, remarketing_status
          `,
          )
          .eq('deal_source', 'captarget')
          .order('captarget_contact_date', { ascending: false, nullsFirst: false })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allData.push(...(data as CapTargetDeal[]));
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      return allData;
    },
  });

  // Exclusion log query
  const { data: exclusionLog } = useQuery({
    queryKey: ['captarget-exclusion-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('captarget_sync_exclusions')
        .select('id, company_name, exclusion_reason, exclusion_category, source, excluded_at')
        .order('excluded_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  // ─── Computed / memoized values ──────────────────────────────────────

  // Filter deals by everything EXCEPT status tab (for accurate tab counts)
  const preTabFiltered = useMemo(() => {
    if (!deals) return [];
    return preFilterDeals(deals, {
      search,
      pushedFilter,
      hidePushed,
      hideNotFit,
      sourceTabFilter,
      dateRange,
    });
  }, [deals, search, pushedFilter, sourceTabFilter, dateRange, hidePushed, hideNotFit]);

  const tabItems = useMemo(() => {
    if (statusTab === 'all') return preTabFiltered;
    return preTabFiltered.filter((deal) => deal.captarget_status === statusTab);
  }, [preTabFiltered, statusTab]);

  const {
    filteredItems: engineFiltered,
    filterState,
    setFilterState,
    dynamicOptions,
    filteredCount,
    totalCount: engineTotal,
  } = useFilterEngine(tabItems, CAPTARGET_FIELDS);

  // Sort the engine-filtered results
  const filteredDeals = useMemo(
    () => sortDeals(engineFiltered, sortColumn, sortDirection),
    [engineFiltered, sortColumn, sortDirection],
  );

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredDeals.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedDeals = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredDeals.slice(start, start + PAGE_SIZE);
  }, [filteredDeals, safePage]);

  // Selection helpers
  const allSelected =
    paginatedDeals.length > 0 && paginatedDeals.every((d) => selectedIds.has(d.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedDeals.map((d) => d.id)));
  };

  const orderedIds = useMemo(() => paginatedDeals.map((d) => d.id), [paginatedDeals]);
  const { handleToggle: toggleSelect } = useShiftSelect(orderedIds, selectedIds, setSelectedIds);

  // KPI stats
  const dateFilteredDeals = useMemo(() => {
    if (!deals) return [];
    return deals.filter((d) => isInRange(d.captarget_contact_date || d.created_at));
  }, [deals, isInRange]);

  const kpiStats = useMemo(() => {
    const totalDeals = dateFilteredDeals.length;
    const priorityDeals = dateFilteredDeals.filter((d) => d.is_priority_target === true).length;
    let totalScore = 0;
    let scoredDeals = 0;
    dateFilteredDeals.forEach((d) => {
      const score = d.deal_total_score;
      if (score != null) {
        totalScore += score;
        scoredDeals++;
      }
    });
    const avgScore = scoredDeals > 0 ? Math.round(totalScore / scoredDeals) : 0;
    const needsScoring = dateFilteredDeals.filter((d) => d.deal_total_score == null).length;
    return { totalDeals, priorityDeals, avgScore, needsScoring };
  }, [dateFilteredDeals]);

  // Memoize selected deals for AddToList dialog
  const selectedDealsForList = useMemo((): DealForList[] => {
    if (!deals || selectedIds.size === 0) return [];
    return deals
      .filter((d) => selectedIds.has(d.id))
      .map((d) => ({
        dealId: d.id,
        dealName: d.internal_company_name || d.title || 'Unknown Deal',
        contactName: d.main_contact_name,
        contactEmail: d.main_contact_email,
        contactPhone: d.main_contact_phone,
      }));
  }, [deals, selectedIds]);

  // Summary stats
  const totalDeals = deals?.length || 0;
  const unpushedCount = deals?.filter((d) => !d.pushed_to_all_deals).length || 0;
  const interestCount = deals?.filter((d) => d.captarget_interest_type === 'interest').length || 0;
  const enrichedCount = deals?.filter((d) => d.enriched_at).length || 0;
  const scoredCount = deals?.filter((d) => d.deal_total_score != null).length || 0;

  const filteredTotal = preTabFiltered.length;
  const activeCount = useMemo(
    () => preTabFiltered.filter((d) => d.captarget_status === 'active').length,
    [preTabFiltered],
  );
  const inactiveCount = useMemo(
    () => preTabFiltered.filter((d) => d.captarget_status === 'inactive').length,
    [preTabFiltered],
  );

  return {
    // Raw data
    deals,
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
    filteredCount,
    engineTotal,
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
    paginatedDeals,
    filteredDeals,

    // KPI
    kpiStats,

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
