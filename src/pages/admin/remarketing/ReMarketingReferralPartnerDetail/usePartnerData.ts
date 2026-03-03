import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFilterEngine } from '@/hooks/use-filter-engine';
import { REFERRAL_PARTNER_DEAL_FIELDS } from '@/components/filters/filter-definitions';
import type { SortField, SortDir } from './types';
import { normalizeCompanyName } from './helpers';

export function usePartnerData(partnerId: string | undefined) {
  const [hidePushed, setHidePushed] = useState(false);
  const [hideNotFit, setHideNotFit] = useState(true);
  const [sortField, setSortField] = useState<SortField>(() => {
    const saved = sessionStorage.getItem(`referral-sort-${partnerId}`);
    return saved ? (JSON.parse(saved).field as SortField) : 'added';
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    const saved = sessionStorage.getItem(`referral-sort-${partnerId}`);
    return saved ? (JSON.parse(saved).dir as SortDir) : 'desc';
  });

  const toggleSort = (field: SortField) => {
    let newDir: SortDir;
    if (sortField === field) {
      newDir = sortDir === 'asc' ? 'desc' : 'asc';
      setSortDir(newDir);
    } else {
      newDir = 'asc';
      setSortField(field);
      setSortDir(newDir);
    }
    sessionStorage.setItem(`referral-sort-${partnerId}`, JSON.stringify({ field, dir: newDir }));
  };

  // Fetch partner
  const { data: partner, isLoading: partnerLoading } = useQuery({
    queryKey: ['referral-partners', partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_partners')
        .select('*')
        .eq('id', partnerId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!partnerId,
  });

  // Fetch deals
  const { data: deals, isLoading: dealsLoading } = useQuery({
    queryKey: ['referral-partners', partnerId, 'deals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(
          `id, title, internal_company_name, location, revenue, ebitda, category, website,
           status, created_at, full_time_employees, address_city, address_state,
           enriched_at, deal_total_score, pushed_to_all_deals,
           linkedin_employee_count, linkedin_employee_range,
           google_review_count, google_rating, is_priority_target,
           need_buyer_universe, needs_owner_contact,
           main_contact_name, main_contact_title, main_contact_email, main_contact_phone, deal_source,
           remarketing_status`,
        )
        .eq('referral_partner_id', partnerId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!partnerId,
  });

  // Enrichment queue
  const { data: enrichmentQueue } = useQuery({
    queryKey: ['referral-partners', partnerId, 'enrichment-queue'],
    queryFn: async () => {
      if (!deals?.length) return [];
      const dealIds = deals.map((d) => d.id);
      const { data, error } = await supabase
        .from('enrichment_queue')
        .select('listing_id, status')
        .in('listing_id', dealIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!deals?.length,
    refetchInterval: (enrichmentQueue) => {
      const data = enrichmentQueue.state?.data;
      const hasActive = data?.some(
        (d: { status: string }) => d.status === 'pending' || d.status === 'processing',
      );
      return hasActive ? 5000 : false;
    },
  });

  // Submissions
  const { data: submissions, isLoading: submissionsLoading } = useQuery({
    queryKey: ['referral-submissions', partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_submissions')
        .select('*')
        .eq('referral_partner_id', partnerId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!partnerId,
  });

  // Filter engine (search + advanced filters)
  const filterEngine = useFilterEngine(deals || [], REFERRAL_PARTNER_DEAL_FIELDS);

  // KPIs
  const kpis = useMemo(() => {
    if (!deals) return { total: 0, enriched: 0, scored: 0, avgQuality: 0 };
    const enriched = deals.filter((d) => d.enriched_at).length;
    const scored = deals.filter((d) => d.deal_total_score != null).length;
    const qualityScores = deals
      .map((d) => d.deal_total_score)
      .filter((s): s is number => s != null);
    const avgQuality = qualityScores.length
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
      : 0;
    return { total: deals.length, enriched, scored, avgQuality };
  }, [deals]);

  // Sorted deals (applies toggle filters, then filter engine results, then sort)
  const sortedDeals = useMemo(() => {
    let items = [...filterEngine.filteredItems];
    if (hidePushed) items = items.filter((d) => !d.pushed_to_all_deals);
    if (hideNotFit) items = items.filter((d) => d.remarketing_status !== 'not_a_fit');
    return items.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const getValue = (deal: typeof a) => {
        switch (sortField) {
          case 'name':
            return normalizeCompanyName(
              deal.internal_company_name || deal.title || '',
            ).toLowerCase();
          case 'website':
            return (deal.website || '').toLowerCase();
          case 'industry':
            return (deal.category || '').toLowerCase();
          case 'location':
            return (
              deal.address_city && deal.address_state
                ? `${deal.address_city}, ${deal.address_state}`
                : deal.location || ''
            ).toLowerCase();
          case 'revenue':
            return deal.revenue ?? -Infinity;
          case 'ebitda':
            return deal.ebitda ?? -Infinity;
          case 'status':
            return (deal.status || '').toLowerCase();
          case 'quality':
            return deal.deal_total_score ?? -Infinity;
          case 'employees':
            return deal.linkedin_employee_count ?? -Infinity;
          case 'range':
            return (deal.linkedin_employee_range || '').toLowerCase();
          case 'rating':
            return deal.google_rating ?? -Infinity;
          case 'reviews':
            return deal.google_review_count ?? -Infinity;
          case 'added':
            return new Date(deal.created_at).getTime();
          default:
            return 0;
        }
      };
      const va = getValue(a);
      const vb = getValue(b);
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [filterEngine.filteredItems, sortField, sortDir, hidePushed, hideNotFit]);

  // Enrichment progress
  const enrichmentProgress = useMemo(() => {
    if (!enrichmentQueue?.length) return null;
    const active = enrichmentQueue.filter(
      (q: { status: string }) => q.status === 'pending' || q.status === 'processing',
    );
    if (active.length === 0) return null;
    const total = enrichmentQueue.length;
    const completed = enrichmentQueue.filter(
      (q: { status: string }) => q.status === 'completed',
    ).length;
    const failed = enrichmentQueue.filter((q: { status: string }) => q.status === 'failed').length;
    return { total, completed, failed };
  }, [enrichmentQueue]);

  return {
    partner,
    partnerLoading,
    deals,
    dealsLoading,
    submissions,
    submissionsLoading,
    kpis,
    sortedDeals,
    enrichmentProgress,
    sortField,
    sortDir,
    toggleSort,
    hidePushed,
    setHidePushed,
    hideNotFit,
    setHideNotFit,
    // Filter engine
    filterState: filterEngine.filterState,
    setFilterState: filterEngine.setFilterState,
    fieldDefinitions: filterEngine.fieldDefinitions,
    dynamicOptions: filterEngine.dynamicOptions,
    totalCount: filterEngine.totalCount,
    filteredCount: filterEngine.filteredCount,
  };
}
