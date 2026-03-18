import { useState, useMemo, useCallback } from 'react';
import { useShiftSelect } from '@/hooks/useShiftSelect';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { useTimeframe } from '@/hooks/use-timeframe';
import { useFilterEngine } from '@/hooks/use-filter-engine';
import { GP_PARTNER_FIELDS } from '@/components/filters';
import {
  useGlobalGateCheck,
  useGlobalActivityMutations,
} from '@/hooks/remarketing/useGlobalActivityQueue';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { useEnrichmentProgress } from '@/hooks/useEnrichmentProgress';
import type { GPPartnerDeal, SortColumn, SortDirection, NewDealForm } from './types';
import { EMPTY_NEW_DEAL } from './types';

const PAGE_SIZE = 50;

export function useGPPartnerDeals() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { startOrQueueMajorOp } = useGlobalGateCheck();
  const { completeOperation, updateProgress } = useGlobalActivityMutations();
  const { progress: enrichmentProgress, cancelEnrichment } = useEnrichmentProgress();

  const { data: adminProfiles } = useAdminProfiles();
  const { timeframe, setTimeframe, isInRange } = useTimeframe('all_time');

  // Sorting from URL
  const [searchParams, setSearchParams] = useSearchParams();
  const sortColumn = (searchParams.get('sort') as SortColumn) ?? 'created_at';
  const sortDirection = (searchParams.get('dir') as SortDirection) ?? 'desc';

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // URL-persisted filter state (survives browser Back navigation)
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

  // Action states
  const [isPushing, setIsPushing] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isScoring, setIsScoring] = useState(false);

  // Add deal dialog
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [isAddingDeal, setIsAddingDeal] = useState(false);
  const [newDeal, setNewDeal] = useState<NewDealForm>(EMPTY_NEW_DEAL);

  // CSV upload dialog
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);

  // Fetch GP Partner deals
  const {
    data: deals,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['remarketing', 'gp-partner-deals'],
    refetchOnMount: 'always',
    staleTime: 30_000,
    queryFn: async () => {
      const allData: GPPartnerDeal[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('listings')
          .select(
            `
            id, title, internal_company_name, main_contact_name, main_contact_email,
            main_contact_title, main_contact_phone, website, description,
            pushed_to_all_deals, pushed_to_all_deals_at, deal_source, status,
            created_at, enriched_at, deal_total_score, linkedin_employee_count,
            linkedin_employee_range, google_rating, google_review_count,
            is_priority_target, needs_buyer_search, needs_owner_contact,
            category, executive_summary, industry, revenue, ebitda, location,
            address_city, address_state, deal_owner_id, remarketing_status,
            deal_owner:profiles!listings_deal_owner_id_fkey(id, first_name, last_name, email)
          `,
          )
          .eq('deal_source', 'gp_partners')
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allData.push(...(data as GPPartnerDeal[]));
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      return allData;
    },
  });

  // Filter engine
  const {
    filteredItems: engineFiltered,
    filterState,
    setFilterState,
    dynamicOptions,
    filteredCount,
    totalCount: engineTotal,
  } = useFilterEngine(deals ?? [], GP_PARTNER_FIELDS);

  // Sort
  const filteredDeals = useMemo(() => {
    let items = [...engineFiltered];
    if (hidePushed) items = items.filter((d) => !d.pushed_to_all_deals);
    if (hideNotFit) items = items.filter((d) => d.remarketing_status !== 'not_a_fit');
    items.sort((a, b) => {
      let valA: string | number, valB: string | number;
      switch (sortColumn) {
        case 'company_name':
          valA = (a.internal_company_name || a.title || '').toLowerCase();
          valB = (b.internal_company_name || b.title || '').toLowerCase();
          break;
        case 'industry':
          valA = (a.industry || a.category || '').toLowerCase();
          valB = (b.industry || b.category || '').toLowerCase();
          break;
        case 'owner':
          valA = (a.deal_owner?.first_name || a.deal_owner?.email || '').toLowerCase();
          valB = (b.deal_owner?.first_name || b.deal_owner?.email || '').toLowerCase();
          break;
        case 'revenue':
          valA = a.revenue ?? -1;
          valB = b.revenue ?? -1;
          break;
        case 'ebitda':
          valA = a.ebitda ?? -1;
          valB = b.ebitda ?? -1;
          break;
        case 'score':
          valA = a.deal_total_score ?? -1;
          valB = b.deal_total_score ?? -1;
          break;
        case 'linkedin_employee_count':
          valA = a.linkedin_employee_count ?? -1;
          valB = b.linkedin_employee_count ?? -1;
          break;
        case 'linkedin_employee_range':
          valA = (a.linkedin_employee_range || '').toLowerCase();
          valB = (b.linkedin_employee_range || '').toLowerCase();
          break;
        case 'google_review_count':
          valA = a.google_review_count ?? -1;
          valB = b.google_review_count ?? -1;
          break;
        case 'google_rating':
          valA = a.google_rating ?? -1;
          valB = b.google_rating ?? -1;
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
        default:
          return 0;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [engineFiltered, sortColumn, sortDirection, hidePushed, hideNotFit]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredDeals.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedDeals = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredDeals.slice(start, start + PAGE_SIZE);
  }, [filteredDeals, safePage]);

  const handleSort = (col: SortColumn) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (sortColumn === col) {
          next.set('dir', sortDirection === 'asc' ? 'desc' : 'asc');
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
  };

  // Selection helpers
  const allSelected =
    paginatedDeals.length > 0 && paginatedDeals.every((d) => selectedIds.has(d.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedDeals.map((d) => d.id)));
    }
  };

  const orderedIds = useMemo(() => paginatedDeals.map((d) => d.id), [paginatedDeals]);
  const { handleToggle: toggleSelect } = useShiftSelect(orderedIds, selectedIds, setSelectedIds);

  // Push to Active Deals
  const handlePushToAllDeals = useCallback(
    async (dealIds: string[]) => {
      if (dealIds.length === 0) return;
      setIsPushing(true);

      // Validate: only push deals that have a real company website
      const dealsToCheck = deals?.filter((d) => dealIds.includes(d.id)) ?? [];
      const invalidDeals = dealsToCheck.filter((d) => {
        const w = (d.website || '').trim().toLowerCase();
        return (
          !w ||
          w.endsWith('.unknown') ||
          w.startsWith('unknown-') ||
          ['n/a', 'none', 'unknown', 'na', 'null', '-'].includes(w)
        );
      });
      const validIds = dealIds.filter((id) => !invalidDeals.some((d) => d.id === id));

      if (invalidDeals.length > 0) {
        const names = invalidDeals
          .slice(0, 5)
          .map((d) => d.internal_company_name || d.title || 'Unknown')
          .join(', ');
        const extra = invalidDeals.length > 5 ? ` and ${invalidDeals.length - 5} more` : '';
        toast({
          title: 'Missing Company Website',
          description: `Cannot push deals without a valid company website: ${names}${extra}. Add a real domain first.`,
          variant: 'destructive',
        });
      }

      if (validIds.length > 0) {
        const { error } = await supabase
          .from('listings')
          .update({
            status: 'active',
            pushed_to_all_deals: true,
            pushed_to_all_deals_at: new Date().toISOString(),
          } as never)
          .in('id', validIds);

        if (error) {
          toast({ title: 'Error', description: 'Failed to approve deals' });
        } else {
          toast({
            title: 'Approved',
            description: `${validIds.length} deal${validIds.length !== 1 ? 's' : ''} pushed to Active Deals.`,
          });
        }
      }

      setIsPushing(false);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'gp-partner-deals'] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
    },
    [toast, queryClient, deals],
  );

  // Bulk Enrich
  const handleBulkEnrich = useCallback(
    async (mode: 'unenriched' | 'all') => {
      if (!filteredDeals?.length) return;
      const targets =
        mode === 'unenriched' ? filteredDeals.filter((d) => !d.enriched_at) : filteredDeals;
      if (!targets.length) {
        sonnerToast.info('No deals to enrich');
        return;
      }
      setIsEnriching(true);

      let activityItem: { id: string } | null = null;
      try {
        const result = await startOrQueueMajorOp({
          operationType: 'deal_enrichment',
          totalItems: targets.length,
          description: `Enriching ${targets.length} GP Partner deals`,
          userId: user?.id || '',
          contextJson: { source: 'gp_partners' },
        });
        activityItem = result.item;
      } catch {
        /* Non-blocking */
      }

      // When mode='all', force re-enrichment so notes analysis runs on already-enriched deals
      const forceReEnrich = mode === 'all';

      const now = new Date().toISOString();
      const seen = new Set<string>();
      const rows = targets
        .filter((d) => {
          if (seen.has(d.id)) return false;
          seen.add(d.id);
          return true;
        })
        .map((d) => ({
          listing_id: d.id,
          status: 'pending' as const,
          attempts: 0,
          queued_at: now,
          ...(forceReEnrich ? { force: true } : {}),
        }));

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase
          .from('enrichment_queue')
          .upsert(chunk, { onConflict: 'listing_id' });
        if (error) {
          // Queue upsert error — toast shown to user
          sonnerToast.error('Failed to queue enrichment');
          if (activityItem)
            completeOperation.mutate({ id: activityItem.id, finalStatus: 'failed' });
          setIsEnriching(false);
          return;
        }
      }

      sonnerToast.success(`Queued ${targets.length} deals for enrichment`);

      try {
        const { data: result, error: resultError } = await supabase.functions.invoke(
          'process-enrichment-queue',
          { body: { source: 'gp_partners_bulk' } },
        );
        if (resultError) throw resultError;
        if (result?.synced > 0 || result?.processed > 0) {
          const totalDone = (result?.synced || 0) + (result?.processed || 0);
          if (activityItem)
            updateProgress.mutate({ id: activityItem.id, completedItems: totalDone });
          if (result?.processed === 0) {
            sonnerToast.success(`All ${result.synced} deals were already enriched`);
            if (activityItem)
              completeOperation.mutate({ id: activityItem.id, finalStatus: 'completed' });
          }
        }
      } catch {
        /* Non-blocking */
      }

      setIsEnriching(false);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'gp-partner-deals'] });
    },
    [filteredDeals, user, startOrQueueMajorOp, completeOperation, updateProgress, queryClient],
  );

  // Bulk Score
  const handleBulkScore = useCallback(
    async (mode: 'unscored' | 'all') => {
      if (!filteredDeals?.length) return;
      const targets =
        mode === 'unscored'
          ? filteredDeals.filter((d) => d.deal_total_score == null)
          : filteredDeals;
      if (!targets.length) {
        sonnerToast.info('No deals to score');
        return;
      }
      setIsScoring(true);

      let activityItem: { id: string } | null = null;
      try {
        const result = await startOrQueueMajorOp({
          operationType: 'deal_enrichment',
          totalItems: targets.length,
          description: `Scoring ${targets.length} GP Partner deals`,
          userId: user?.id || '',
          contextJson: { source: 'gp_partners_scoring' },
        });
        activityItem = result.item;
      } catch {
        /* Non-blocking */
      }

      try {
        const { queueDealQualityScoring } = await import('@/lib/remarketing/queueScoring');
        const result = await queueDealQualityScoring({ listingIds: targets.map((d) => d.id) });
        if (activityItem)
          updateProgress.mutate({ id: activityItem.id, completedItems: result.scored });
      } catch {
        /* continue */
      }
      if (activityItem) completeOperation.mutate({ id: activityItem.id, finalStatus: 'completed' });
      setIsScoring(false);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'gp-partner-deals'] });
    },
    [filteredDeals, user, startOrQueueMajorOp, completeOperation, updateProgress, queryClient],
  );

  // Enrich selected deals
  const handleEnrichSelected = useCallback(
    async (dealIds: string[], options?: { force?: boolean }) => {
      if (dealIds.length === 0) return;
      setIsEnriching(true);

      const forceReEnrich = options?.force ?? false;

      let activityItem: { id: string } | null = null;
      try {
        const result = await startOrQueueMajorOp({
          operationType: 'deal_enrichment',
          totalItems: dealIds.length,
          description: `Enriching ${dealIds.length} GP Partner deals`,
          userId: user?.id || '',
          contextJson: { source: 'gp_partners_selected' },
        });
        activityItem = result.item;
      } catch {
        /* Non-blocking */
      }

      const now = new Date().toISOString();
      try {
        await supabase.functions.invoke('process-enrichment-queue', {
          body: { action: 'cancel_pending', before: now },
        });
      } catch {
        /* Non-blocking */
      }

      const seen = new Set<string>();
      const rows = dealIds
        .filter((id) => {
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map((id) => ({
          listing_id: id,
          status: 'pending' as const,
          attempts: 0,
          queued_at: now,
          ...(forceReEnrich ? { force: true } : {}),
        }));

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase
          .from('enrichment_queue')
          .upsert(chunk, { onConflict: 'listing_id' });
        if (error) {
          // Queue upsert error — toast shown to user
          sonnerToast.error('Failed to queue enrichment');
          if (activityItem)
            completeOperation.mutate({ id: activityItem.id, finalStatus: 'failed' });
          setIsEnriching(false);
          return;
        }
      }

      sonnerToast.success(`Queued ${rows.length} deals for enrichment`);
      setSelectedIds(new Set());

      try {
        const { data: result, error: resultError } = await supabase.functions.invoke(
          'process-enrichment-queue',
          { body: { source: 'gp_partners_selected' } },
        );
        if (resultError) throw resultError;
        if (result?.synced > 0 || result?.processed > 0) {
          const totalDone = (result?.synced || 0) + (result?.processed || 0);
          if (activityItem)
            updateProgress.mutate({ id: activityItem.id, completedItems: totalDone });
        }
      } catch {
        /* Non-blocking */
      }

      setIsEnriching(false);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'gp-partner-deals'] });
    },
    [user, startOrQueueMajorOp, completeOperation, updateProgress, queryClient],
  );

  // Add single deal
  const handleAddDeal = useCallback(async () => {
    if (!newDeal.company_name.trim()) {
      sonnerToast.error('Company name is required');
      return;
    }
    setIsAddingDeal(true);

    let website = newDeal.website.trim();
    if (website && !website.startsWith('http://') && !website.startsWith('https://')) {
      website = `https://${website}`;
    }

    const { error } = await supabase.from('listings').insert({
      title: newDeal.company_name.trim(),
      internal_company_name: newDeal.company_name.trim(),
      website: website || null,
      main_contact_name: newDeal.contact_name.trim() || null,
      main_contact_email: newDeal.contact_email.trim() || null,
      main_contact_phone: newDeal.contact_phone.trim() || null,
      main_contact_title: newDeal.contact_title.trim() || null,
      industry: newDeal.industry.trim() || null,
      description: newDeal.description.trim() || null,
      location: newDeal.location.trim() || null,
      revenue: newDeal.revenue ? parseFloat(newDeal.revenue) : null,
      ebitda: newDeal.ebitda ? parseFloat(newDeal.ebitda) : null,
      deal_source: 'gp_partners',
      status: 'active',
      is_internal_deal: true,
      pushed_to_all_deals: false,
    } as never);

    setIsAddingDeal(false);
    if (error) {
      sonnerToast.error(`Failed to add deal: ${error.message}`);
    } else {
      sonnerToast.success('Deal added successfully');
      setAddDealOpen(false);
      setNewDeal(EMPTY_NEW_DEAL);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'gp-partner-deals'] });
    }
  }, [newDeal, queryClient]);

  const handleImportComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'gp-partner-deals'] });
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
    setCsvUploadOpen(false);
  }, [queryClient]);

  // Assign deal owner
  const handleAssignOwner = useCallback(
    async (dealId: string, ownerId: string | null) => {
      const ownerProfile = ownerId && adminProfiles ? adminProfiles[ownerId] : null;
      queryClient.setQueryData(
        ['remarketing', 'gp-partner-deals'],
        (old: GPPartnerDeal[] | undefined) =>
          old?.map((deal) =>
            deal.id === dealId
              ? {
                  ...deal,
                  deal_owner_id: ownerId,
                  deal_owner: ownerProfile
                    ? {
                        id: ownerProfile.id,
                        first_name: ownerProfile.first_name,
                        last_name: ownerProfile.last_name,
                        email: ownerProfile.email,
                      }
                    : null,
                }
              : deal,
          ),
      );
      const { error } = await supabase
        .from('listings')
        .update({ deal_owner_id: ownerId })
        .eq('id', dealId);
      if (error) {
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'gp-partner-deals'] });
        sonnerToast.error('Failed to update deal owner');
        return;
      }
      sonnerToast.success(ownerId ? 'Owner assigned' : 'Owner removed');
    },
    [adminProfiles, queryClient],
  );

  // KPI Stats
  const dateFilteredDeals = useMemo(() => {
    if (!deals) return [];
    return deals.filter((d) => isInRange(d.created_at));
  }, [deals, isInRange]);

  const kpiStats = useMemo(() => {
    const totalDeals = dateFilteredDeals.length;
    const priorityDeals = dateFilteredDeals.filter((d) => d.is_priority_target === true).length;
    let totalScore = 0;
    let scoredDeals = 0;
    dateFilteredDeals.forEach((d) => {
      if (d.deal_total_score != null) {
        totalScore += d.deal_total_score;
        scoredDeals++;
      }
    });
    const avgScore = scoredDeals > 0 ? Math.round(totalScore / scoredDeals) : 0;
    const needsScoring = dateFilteredDeals.filter((d) => d.deal_total_score == null).length;
    return { totalDeals, priorityDeals, avgScore, needsScoring };
  }, [dateFilteredDeals]);

  const totalDeals = deals?.length || 0;
  const unpushedCount = deals?.filter((d) => !d.pushed_to_all_deals).length || 0;
  const enrichedCount = deals?.filter((d) => d.enriched_at).length || 0;
  const scoredCount = deals?.filter((d) => d.deal_total_score != null).length || 0;

  return {
    // Data
    deals,
    filteredDeals,
    paginatedDeals,
    isLoading,
    // Filter state
    filterState,
    setFilterState,
    dynamicOptions,
    filteredCount,
    engineTotal,
    timeframe,
    setTimeframe,
    // Sort
    sortColumn,
    sortDirection,
    handleSort,
    // Pagination
    PAGE_SIZE,
    safePage,
    totalPages,
    currentPage,
    setCurrentPage,
    // Selection
    selectedIds,
    setSelectedIds,
    allSelected,
    toggleSelectAll,
    toggleSelect,
    // Hide pushed
    hidePushed,
    setHidePushed,
    // Hide not fit
    hideNotFit,
    setHideNotFit,
    // Action states
    // Action states
    isPushing,
    isEnriching,
    isScoring,
    // Handlers
    handlePushToAllDeals,
    handleBulkEnrich,
    handleBulkScore,
    handleEnrichSelected,
    handleAddDeal,
    handleImportComplete,
    handleAssignOwner,
    // Add deal
    addDealOpen,
    setAddDealOpen,
    isAddingDeal,
    newDeal,
    setNewDeal,
    // CSV
    csvUploadOpen,
    setCsvUploadOpen,
    // Stats
    kpiStats,
    totalDeals,
    unpushedCount,
    enrichedCount,
    scoredCount,
    // Enrichment progress
    enrichmentProgress,
    cancelEnrichment,
    // Admin profiles
    adminProfiles,
    // Refetch & query client
    refetch,
    queryClient,
    toast,
  };
}
