/**
 * Query hooks for ValuationLeads — data fetching, filtering, sorting,
 * pagination, and selection state.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTimeframe } from '@/hooks/use-timeframe';
import { useFilterEngine } from '@/hooks/use-filter-engine';
import { VALUATION_LEAD_FIELDS } from '@/components/filters';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { useEnrichmentProgress } from '@/hooks/useEnrichmentProgress';
import type { ValuationLead, SortColumn, SortDirection } from './types';
import {
  cleanWebsiteToDomain,
  extractBusinessName,
  inferWebsite,
  QUALITY_ORDER,
} from './helpers';

const PAGE_SIZE = 50;

export { PAGE_SIZE };

export function useValuationLeadsQueries() {
  const { data: adminProfiles } = useAdminProfiles();

  const {
    progress: enrichmentProgress,
    summary: enrichmentSummary,
    showSummary: showEnrichmentSummary,
    dismissSummary,
    pauseEnrichment,
    resumeEnrichment,
    cancelEnrichment,
  } = useEnrichmentProgress();

  const { timeframe, setTimeframe, isInRange } = useTimeframe('all_time');

  // URL-persisted filter state (survives browser Back navigation)
  const [searchParams, setSearchParams] = useSearchParams();
  const sortColumn = (searchParams.get('sort') as SortColumn) ?? 'created_at';
  const sortDirection = (searchParams.get('dir') as SortDirection) ?? 'desc';
  const activeTab = searchParams.get('tab') ?? 'all';
  const setActiveTab = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('tab', v);
          else n.delete('tab');
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch valuation leads
  const {
    data: leads,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['remarketing', 'valuation-leads'],
    refetchOnMount: 'always',
    staleTime: 30_000,
    queryFn: async () => {
      const allData: ValuationLead[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('valuation_leads')
          .select(
            '*, listings!valuation_leads_pushed_listing_id_fkey(description, executive_summary)',
          )
          .eq('excluded', false)
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          const normalized = data.map((row) => ({
            ...row,
            listing_description:
              row.listings?.description || row.listings?.executive_summary || null,
            listings: undefined,
            revenue: row.revenue != null ? Number(row.revenue) : null,
            ebitda: row.ebitda != null ? Number(row.ebitda) : null,
            valuation_low: row.valuation_low != null ? Number(row.valuation_low) : null,
            valuation_mid: row.valuation_mid != null ? Number(row.valuation_mid) : null,
            valuation_high: row.valuation_high != null ? Number(row.valuation_high) : null,
            lead_score: row.lead_score != null ? Number(row.lead_score) : null,
            readiness_score: row.readiness_score != null ? Number(row.readiness_score) : null,
            locations_count: row.locations_count != null ? Number(row.locations_count) : null,
          }));
          allData.push(...(normalized as unknown as ValuationLead[]));
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      return allData;
    },
  });

  const calculatorTypes = useMemo(() => {
    if (!leads) return ['general'];
    const types = new Set(leads.map((l) => l.calculator_type));
    types.add('general');
    return Array.from(types).sort((a, b) => {
      if (a === 'general') return -1;
      if (b === 'general') return 1;
      return a.localeCompare(b);
    });
  }, [leads]);

  const {
    filteredItems: engineFiltered,
    filterState,
    setFilterState,
    dynamicOptions,
    filteredCount,
    totalCount: engineTotal,
  } = useFilterEngine(leads ?? [], VALUATION_LEAD_FIELDS);


  // Apply tab + timeframe on top of engine-filtered results, then sort
  const filteredLeads = useMemo(() => {
    let filtered = engineFiltered;
    filtered = filtered.filter((l) => !l.is_archived);
    if (hideNotFit) filtered = filtered.filter((l) => !l.not_a_fit);
    if (hidePushed) filtered = filtered.filter((l) => !l.pushed_to_all_deals);
    if (activeTab !== 'all') {
      filtered = filtered.filter((l) => l.calculator_type === activeTab);
    }
    filtered = filtered.filter((l) => isInRange(l.created_at));

    // Deduplicate by normalized domain
    const domainMap = new Map<string, ValuationLead>();
    for (const lead of filtered) {
      const domain = cleanWebsiteToDomain(lead.website);
      const key = domain ?? `__no_domain_${lead.id}`;
      const existing = domainMap.get(key);
      if (!existing) {
        domainMap.set(key, lead);
      } else {
        const existingScore = existing.lead_score ?? -1;
        const newScore = lead.lead_score ?? -1;
        const existingDate = existing.created_at ?? '';
        const newDate = lead.created_at ?? '';
        if (newScore > existingScore || (newScore === existingScore && newDate > existingDate)) {
          domainMap.set(key, lead);
        }
      }
    }
    filtered = Array.from(domainMap.values());

    // Sort
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let valA: string | number, valB: string | number;
      switch (sortColumn) {
        case 'display_name':
          valA = extractBusinessName(a).toLowerCase();
          valB = extractBusinessName(b).toLowerCase();
          break;
        case 'website':
          valA = (inferWebsite(a) || '').toLowerCase();
          valB = (inferWebsite(b) || '').toLowerCase();
          break;
        case 'industry':
          valA = (a.industry || '').toLowerCase();
          valB = (b.industry || '').toLowerCase();
          break;
        case 'location':
          valA = (a.location || '').toLowerCase();
          valB = (b.location || '').toLowerCase();
          break;
        case 'revenue':
          valA = a.revenue ?? -1;
          valB = b.revenue ?? -1;
          break;
        case 'ebitda':
          valA = a.ebitda ?? -1;
          valB = b.ebitda ?? -1;
          break;
        case 'valuation':
          valA = a.valuation_mid ?? -1;
          valB = b.valuation_mid ?? -1;
          break;
        case 'exit_timing': {
          const timingOrder: Record<string, number> = { now: 3, '1-2years': 2, exploring: 1 };
          valA = timingOrder[a.exit_timing || ''] ?? 0;
          valB = timingOrder[b.exit_timing || ''] ?? 0;
          break;
        }
        case 'intros':
          valA = a.open_to_intros ? 1 : 0;
          valB = b.open_to_intros ? 1 : 0;
          break;
        case 'quality':
          valA = QUALITY_ORDER[a.quality_label || ''] ?? 0;
          valB = QUALITY_ORDER[b.quality_label || ''] ?? 0;
          break;
        case 'score':
          valA = a.lead_score ?? -1;
          valB = b.lead_score ?? -1;
          break;
        case 'created_at':
          valA = a.created_at || '';
          valB = b.created_at || '';
          break;
        case 'pushed':
          valA = a.pushed_to_all_deals ? 1 : 0;
          valB = b.pushed_to_all_deals ? 1 : 0;
          break;
        case 'priority':
          valA = a.is_priority_target ? 1 : 0;
          valB = b.is_priority_target ? 1 : 0;
          break;
        case 'owner': {
          const ownerA = a.deal_owner_id ? adminProfiles?.[a.deal_owner_id]?.displayName || '' : '';
          const ownerB = b.deal_owner_id ? adminProfiles?.[b.deal_owner_id]?.displayName || '' : '';
          valA = ownerA.toLowerCase();
          valB = ownerB.toLowerCase();
          break;
        }
        default:
          return 0;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [engineFiltered, activeTab, isInRange, sortColumn, sortDirection, adminProfiles, hidePushed, hideNotFit]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLeads = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredLeads.slice(start, start + PAGE_SIZE);
  }, [filteredLeads, safePage]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [activeTab, timeframe, sortColumn, sortDirection, filterState, setCurrentPage]);

  const handleSort = (col: SortColumn) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get('sort') === col) {
          next.set('dir', next.get('dir') === 'asc' ? 'desc' : 'asc');
        } else {
          next.set('sort', col);
          next.set('dir', 'asc');
        }
        return next;
      },
      { replace: true },
    );
  };

  const allSelected =
    paginatedLeads.length > 0 && paginatedLeads.every((l) => selectedIds.has(l.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedLeads.map((l) => l.id)));
    }
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const kpiStats = useMemo(() => {
    const totalLeads = filteredLeads.length;
    const openToIntros = filteredLeads.filter((l) => l.open_to_intros === true).length;
    const exitNow = filteredLeads.filter((l) => l.exit_timing === 'now').length;
    const pushedCount = filteredLeads.filter((l) => l.pushed_to_all_deals === true).length;
    const avgScore =
      filteredLeads.length > 0
        ? Math.round(
            filteredLeads.reduce((sum, l) => sum + (l.lead_score ?? 0), 0) / filteredLeads.length,
          )
        : 0;
    return { totalLeads, openToIntros, exitNow, pushedCount, avgScore };
  }, [filteredLeads]);

  return {
    // Data
    leads,
    isLoading,
    refetch,
    filteredLeads,
    paginatedLeads,
    adminProfiles,
    calculatorTypes,
    kpiStats,
    // Filter / sort
    filterState,
    setFilterState,
    dynamicOptions,
    filteredCount,
    engineTotal,
    sortColumn,
    sortDirection,
    handleSort,
    // Tab / timeframe
    activeTab,
    setActiveTab,
    timeframe,
    setTimeframe,
    // Pagination
    currentPage,
    setCurrentPage,
    totalPages,
    safePage,
    PAGE_SIZE,
    // Selection
    selectedIds,
    setSelectedIds,
    allSelected,
    toggleSelectAll,
    toggleSelect,
    // Toggles
    hidePushed,
    setHidePushed,
    hideNotFit,
    setHideNotFit,
    // Enrichment (pass-through from useEnrichmentProgress)
    enrichmentProgress,
    enrichmentSummary,
    showEnrichmentSummary,
    dismissSummary,
    pauseEnrichment,
    resumeEnrichment,
    cancelEnrichment,
  };
}
