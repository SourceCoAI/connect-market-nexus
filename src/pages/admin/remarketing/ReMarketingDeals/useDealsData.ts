import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getTierFromScore } from '@/components/remarketing';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { useFilterEngine } from '@/hooks/use-filter-engine';
import { DEAL_LISTING_FIELDS } from '@/components/filters';
import { useTimeframe } from '@/hooks/use-timeframe';
import { useSavedViews } from '@/hooks/use-saved-views';
import { useAuth } from '@/context/AuthContext';

import type { DealListing, ColumnWidths } from '../types';
import { DEFAULT_COLUMN_WIDTHS } from '../types';

const PAGE_SIZE = 50;

export function useDealsData() {
  const { user } = useAuth();
  const [universeFilter] = useState<string>('all');
  const [scoreFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(undefined);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(undefined);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [industryFilter] = useState<string>('all');
  const [stateFilter] = useState<string>('all');
  const [employeeFilter] = useState<string>('all');
  const [referralPartnerFilter] = useState<string>('all');
  const [universeBuildFilter, setUniverseBuildFilter] = useState<boolean>(false);
  const [hideNotAFit, setHideNotAFit] = useState<boolean>(true);

  const { data: adminProfiles } = useAdminProfiles();

  const [searchParams, setSearchParams] = useSearchParams();
  const sortColumn = searchParams.get('sort') ?? 'rank';
  const sortDirection = (searchParams.get('dir') as 'asc' | 'desc') ?? 'asc';

  const [localOrder, setLocalOrder] = useState<DealListing[]>([]);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_COLUMN_WIDTHS);
  const sortedListingsRef = useRef<DealListing[]>([]);

  const handleColumnResize = (column: keyof ColumnWidths, newWidth: number) => {
    setColumnWidths((prev) => ({ ...prev, [column]: newWidth }));
  };

  const enrichingDealsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    enrichingDealsRef.current.clear();
  }, [sortColumn, sortDirection]);

  const [page, setPage] = useState(0);

  const {
    data: listings,
    isLoading: listingsLoading,
    error: listingsQueryError,
    isError: listingsError,
    refetch: refetchListings,
  } = useQuery({
    queryKey: ['remarketing', 'deals'],
    refetchOnMount: 'always',
    staleTime: 30_000,
    queryFn: async () => {
      const BATCH = 500;
      const allRows: DealListing[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('listings')
          .select(
            `
            id, title, description, location, revenue, ebitda, status, created_at,
            category, industry, website, executive_summary, service_mix,
            internal_company_name, internal_deal_memo_link, geographic_states,
            enriched_at, full_time_employees, linkedin_employee_count,
            linkedin_employee_range, google_review_count, google_rating,
            is_priority_target, deal_total_score,
            seller_interest_score, manual_rank_override,
            main_contact_name, main_contact_title, main_contact_email, main_contact_phone,
            address_city,
            address_state, referral_partner_id, referral_partners(id, name),
            deal_source, deal_owner_id,
            deal_owner:profiles!listings_deal_owner_id_fkey(id, first_name, last_name, email),
            needs_owner_contact, needs_owner_contact_at,
            needs_buyer_search, needs_buyer_search_at,
            universe_build_flagged, universe_build_flagged_at, universe_build_flagged_by,
            is_internal_deal,
            pushed_to_marketplace, pushed_to_marketplace_at, pushed_to_marketplace_by,
            not_a_fit, not_a_fit_reason
          `,
          )
          .is('deleted_at', null)
          .eq('remarketing_status', 'active')
          .or('status.eq.active,status.is.null')
          .or(
            'deal_source.in.(marketplace,manual,referral,remarketing,salesforce_remarketing),' +
              'and(deal_source.in.(captarget,valuation_calculator,valuation_lead,gp_partners,sourceco),pushed_to_all_deals.eq.true)',
          )
          .order('manual_rank_override', { ascending: true, nullsFirst: false })
          .order('deal_total_score', { ascending: false, nullsFirst: true })
          .order('created_at', { ascending: false })
          .range(offset, offset + BATCH - 1);
        if (error) {
          console.error('[Active Deals] Query failed:', error.message, error.code, error.details);
          throw error;
        }
        if (data && data.length > 0) {
          allRows.push(...(data as unknown as DealListing[]));
          offset += BATCH;
          hasMore = data.length === BATCH;
        } else {
          hasMore = false;
        }
      }
      return allRows;
    },
  });

  const { data: universes } = useQuery({
    queryKey: ['remarketing', 'universes-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyer_universes')
        .select('id, name')
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: universeDealMap } = useQuery({
    queryKey: ['remarketing', 'universe-deal-map'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_universe_deals')
        .select('listing_id, universe_id, buyer_universes(id, name)')
        .limit(5000);
      if (error) throw error;
      const map: Record<string, { id: string; name: string }[]> = {};
      data?.forEach((row) => {
        const u = row.buyer_universes as { id: string; name: string } | null;
        if (!u || !u.name) return;
        if (!map[row.listing_id]) map[row.listing_id] = [];
        map[row.listing_id].push({ id: u.id, name: u.name });
      });
      return map;
    },
  });

  const { data: scoreStats } = useQuery({
    queryKey: ['remarketing', 'deal-score-stats'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_scores')
        .select('listing_id, composite_score, status, universe_id')
        .limit(10000);
      if (error) throw error;
      const stats: Record<
        string,
        {
          totalMatches: number;
          approved: number;
          passed: number;
          avgScore: number;
          universeIds: Set<string>;
        }
      > = {};
      data?.forEach((score) => {
        if (!stats[score.listing_id])
          stats[score.listing_id] = {
            totalMatches: 0,
            approved: 0,
            passed: 0,
            avgScore: 0,
            universeIds: new Set(),
          };
        stats[score.listing_id].totalMatches++;
        if (score.status === 'approved') stats[score.listing_id].approved++;
        if (score.status === 'passed') stats[score.listing_id].passed++;
        stats[score.listing_id].avgScore += score.composite_score || 0;
        if (score.universe_id) stats[score.listing_id].universeIds.add(score.universe_id);
      });
      Object.keys(stats).forEach((key) => {
        if (stats[key].totalMatches > 0)
          stats[key].avgScore = stats[key].avgScore / stats[key].totalMatches;
      });
      return stats;
    },
  });

  const { data: pipelineCounts } = useQuery({
    queryKey: ['remarketing', 'pipeline-counts'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipeline')
        .select('listing_id')
        .is('deleted_at', null)
        .limit(5000);
      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach((row) => {
        if (row.listing_id) counts[row.listing_id] = (counts[row.listing_id] || 0) + 1;
      });
      return counts;
    },
  });

  const initialTab = searchParams.get('tab') || 'all';
  const [dealTab, setDealTab] = useState<string>(initialTab);
  const universeCount = universes?.length || 0;

  const kpiStats = useMemo(() => {
    const totalDeals = listings?.length || 0;
    const priorityDeals = listings?.filter((l) => l.is_priority_target === true).length || 0;
    let totalScore = 0;
    let scoredDeals = 0;
    listings?.forEach((l) => {
      if (l.deal_total_score !== null) {
        totalScore += l.deal_total_score;
        scoredDeals++;
      }
    });
    const avgScore = scoredDeals > 0 ? Math.round(totalScore / scoredDeals) : 0;
    const needsScoring = listings?.filter((l) => l.deal_total_score === null).length || 0;
    return { totalDeals, priorityDeals, avgScore, needsScoring };
  }, [listings]);

  const { timeframe, setTimeframe } = useTimeframe('all_time');
  const {
    filteredItems: engineFiltered,
    filterState,
    setFilterState,
    dynamicOptions,
    totalCount,
  } = useFilterEngine(listings || [], DEAL_LISTING_FIELDS);
  const { views: savedViews, addView, removeView } = useSavedViews('remarketing-deals');

  const filteredListings = useMemo(() => {
    if (!engineFiltered) return [];
    return engineFiltered.filter((listing) => {
      if (universeFilter === 'needs_build') {
        if (!listing.needs_buyer_search) return false;
      } else if (universeFilter !== 'all') {
        const stats = scoreStats?.[listing.id];
        if (!stats || !stats.universeIds.has(universeFilter)) return false;
      }
      if (scoreFilter !== 'all') {
        const score = listing.deal_total_score ?? 0;
        const tier = getTierFromScore(score);
        if (scoreFilter !== tier) return false;
      }
      if (referralPartnerFilter !== 'all') {
        if (referralPartnerFilter === 'referred') {
          if (!listing.referral_partner_id) return false;
        } else {
          if (listing.referral_partner_id !== referralPartnerFilter) return false;
        }
      }
      if (industryFilter !== 'all') {
        const li = listing.industry || listing.category;
        if (li !== industryFilter) return false;
      }
      if (stateFilter !== 'all') {
        if (listing.address_state !== stateFilter) return false;
      }
      if (employeeFilter !== 'all') {
        if (listing.linkedin_employee_range !== employeeFilter) return false;
      }
      if (dateFilter !== 'all') {
        const createdAt = new Date(listing.created_at);
        if (dateFilter === 'custom') {
          if (customDateFrom && createdAt < customDateFrom) return false;
          if (customDateTo) {
            const end = new Date(customDateTo);
            end.setHours(23, 59, 59, 999);
            if (createdAt > end) return false;
          }
        } else {
          const now = new Date();
          const daysDiff = Math.floor(
            (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (dateFilter === '7d' && daysDiff > 7) return false;
          if (dateFilter === '30d' && daysDiff > 30) return false;
          if (dateFilter === '90d' && daysDiff > 90) return false;
        }
      }
      if (hideNotAFit && listing.not_a_fit) return false;
      if (universeBuildFilter && !listing.universe_build_flagged) return false;
      if (dealTab === 'marketplace') {
        if (listing.is_internal_deal !== false || listing.status !== 'active') return false;
      } else if (dealTab === 'marketplace_queue') {
        if (!listing.pushed_to_marketplace) return false;
      } else if (dealTab === 'internal') {
        if (listing.is_internal_deal === false) return false;
      } else if (dealTab === 'pipeline') {
        if (!pipelineCounts?.[listing.id]) return false;
      } else if (dealTab === 'needs_universe') {
        const u = universeDealMap?.[listing.id];
        if (u && u.length > 0) return false;
      } else if (dealTab === 'needs_enrichment') {
        if (listing.enriched_at && listing.deal_total_score !== null) return false;
      } else if (dealTab === 'my_deals') {
        if (!user?.id || listing.deal_owner_id !== user.id) return false;
      }
      return true;
    });
  }, [
    engineFiltered,
    universeFilter,
    scoreFilter,
    dateFilter,
    customDateFrom,
    customDateTo,
    industryFilter,
    stateFilter,
    employeeFilter,
    referralPartnerFilter,
    scoreStats,
    hideNotAFit,
    universeBuildFilter,
    dealTab,
    pipelineCounts,
    universeDealMap,
    user?.id,
  ]);

  const handleSort = (column: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get('sort') === column) {
          next.set('dir', next.get('dir') === 'asc' ? 'desc' : 'asc');
        } else {
          next.set('sort', column);
          next.set('dir', column === 'rank' ? 'asc' : 'desc');
        }
        return next;
      },
      { replace: true },
    );
  };

  const sortedListings = useMemo(() => {
    if (!filteredListings) return [];
    return [...filteredListings].sort((a, b) => {
      const stats_a = scoreStats?.[a.id];
      const stats_b = scoreStats?.[b.id];
      let aVal: string | number, bVal: string | number;
      switch (sortColumn) {
        case 'rank':
          aVal = a.manual_rank_override ?? 9999;
          bVal = b.manual_rank_override ?? 9999;
          break;
        case 'deal_name':
          aVal = (a.internal_company_name || a.title || '').toLowerCase();
          bVal = (b.internal_company_name || b.title || '').toLowerCase();
          break;
        case 'referral_source':
          aVal = (a.referral_partners?.name || '').toLowerCase();
          bVal = (b.referral_partners?.name || '').toLowerCase();
          break;
        case 'industry':
          aVal = (a.industry || a.category || '').toLowerCase();
          bVal = (b.industry || b.category || '').toLowerCase();
          break;
        case 'revenue':
          aVal = a.revenue || 0;
          bVal = b.revenue || 0;
          break;
        case 'ebitda':
          aVal = a.ebitda || 0;
          bVal = b.ebitda || 0;
          break;
        case 'linkedinCount':
          aVal = a.linkedin_employee_count || 0;
          bVal = b.linkedin_employee_count || 0;
          break;
        case 'linkedinRange': {
          const p = (r: string | null) => {
            if (!r) return 0;
            const m = r.match(/^(\d+)/);
            return m ? parseInt(m[1], 10) : 0;
          };
          aVal = p(a.linkedin_employee_range);
          bVal = p(b.linkedin_employee_range);
          break;
        }
        case 'googleReviews':
          aVal = a.google_review_count || 0;
          bVal = b.google_review_count || 0;
          break;
        case 'googleRating':
          aVal = a.google_rating || 0;
          bVal = b.google_rating || 0;
          break;
        case 'score':
          aVal = a.deal_total_score ?? 0;
          bVal = b.deal_total_score ?? 0;
          break;
        case 'engagement':
          aVal = stats_a?.totalMatches || 0;
          bVal = stats_b?.totalMatches || 0;
          break;
        case 'added':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'priority':
          aVal = a.is_priority_target ? 1 : 0;
          bVal = b.is_priority_target ? 1 : 0;
          break;
        default:
          aVal = a.manual_rank_override ?? 9999;
          bVal = b.manual_rank_override ?? 9999;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const c = aVal.localeCompare(bVal);
        return sortDirection === 'asc' ? c : -c;
      }
      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [filteredListings, sortColumn, sortDirection, scoreStats]);

  useEffect(() => {
    setPage(0);
  }, [filteredListings.length, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedListings.length / PAGE_SIZE));
  const paginatedListings = useMemo(() => {
    const start = page * PAGE_SIZE;
    return sortedListings.slice(start, start + PAGE_SIZE);
  }, [sortedListings, page]);

  useEffect(() => {
    sortedListingsRef.current = sortedListings;
    setLocalOrder(paginatedListings);
  }, [paginatedListings, sortedListings]);

  return {
    listings,
    listingsLoading,
    listingsError,
    listingsQueryError,
    refetchListings,
    sortedListings,
    localOrder,
    setLocalOrder,
    paginatedListings,
    filterState,
    setFilterState,
    dynamicOptions,
    totalCount,
    timeframe,
    setTimeframe,
    savedViews,
    addView,
    removeView,
    dateFilter,
    setDateFilter,
    customDateFrom,
    setCustomDateFrom,
    customDateTo,
    setCustomDateTo,
    showCustomDatePicker,
    setShowCustomDatePicker,
    universeBuildFilter,
    setUniverseBuildFilter,
    hideNotAFit,
    setHideNotAFit,
    dealTab,
    setDealTab,
    filteredListings,
    sortColumn,
    sortDirection,
    handleSort,
    searchParams,
    page,
    setPage,
    totalPages,
    PAGE_SIZE,
    columnWidths,
    handleColumnResize,
    kpiStats,
    universeCount,
    scoreStats,
    pipelineCounts,
    universeDealMap,
    adminProfiles,
    sortedListingsRef,
  };
}
