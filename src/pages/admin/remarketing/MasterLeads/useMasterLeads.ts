import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type LeadSource = 'captarget' | 'gp_partner' | 'sourceco' | 'valuation' | 'referral';

export interface MasterLead {
  id: string;
  source: LeadSource;
  companyName: string;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  industry: string | null;
  location: string | null;
  revenue: number | null;
  ebitda: number | null;
  /** For valuation leads this holds the mid valuation estimate */
  valuationEstimate: number | null;
  score: number | null;
  linkedinEmployeeCount: number | null;
  linkedinEmployeeRange: string | null;
  googleReviewCount: number | null;
  pushedToActiveDeals: boolean;
  dateAdded: string | null;
  /** Path to navigate to for the detail page */
  detailPath: string;
}

export type SortColumn =
  | 'companyName'
  | 'source'
  | 'contactName'
  | 'industry'
  | 'location'
  | 'revenue'
  | 'ebitda'
  | 'score'
  | 'linkedinEmployeeCount'
  | 'linkedinEmployeeRange'
  | 'googleReviewCount'
  | 'pushedToActiveDeals'
  | 'dateAdded';

type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 50;

export function useMasterLeads() {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-persisted state
  const activeSource = (searchParams.get('source') ?? 'all') as 'all' | LeadSource;
  const setActiveSource = useCallback(
    (v: string) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('source', v);
          else n.delete('source');
          n.delete('cp');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const sortColumn = (searchParams.get('sort') as SortColumn) ?? 'dateAdded';
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
  const currentPage = Number(searchParams.get('cp')) || 1;
  const setCurrentPage = useCallback(
    (v: number) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v > 1) n.set('cp', String(v));
          else n.delete('cp');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [search, setSearch] = useState('');

  // ── Fetch listings-based leads (captarget + gp_partner + sourceco) ──
  const { data: listingLeads, isLoading: listingsLoading } = useQuery({
    queryKey: ['master-leads', 'listings'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const allData: MasterLead[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('listings')
          .select(
            `id, title, internal_company_name, website, main_contact_name, main_contact_email,
             industry, category, location, revenue, ebitda, deal_total_score,
             linkedin_employee_count, linkedin_employee_range, google_review_count,
             pushed_to_all_deals, deal_source, created_at`,
          )
          .in('deal_source', ['captarget', 'gp_partner', 'sourceco'])
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          for (const row of data) {
            const source = row.deal_source as LeadSource;
            const sourcePathMap: Record<string, string> = {
              captarget: 'captarget',
              gp_partner: 'gp-partners',
              sourceco: 'sourceco',
            };
            allData.push({
              id: row.id,
              source,
              companyName: row.internal_company_name || row.title || 'Unknown',
              website: row.website,
              contactName: row.main_contact_name,
              contactEmail: row.main_contact_email,
              industry: row.industry || row.category,
              location: row.location,
              revenue: row.revenue != null ? Number(row.revenue) : null,
              ebitda: row.ebitda != null ? Number(row.ebitda) : null,
              valuationEstimate: null,
              score: row.deal_total_score != null ? Number(row.deal_total_score) : null,
              linkedinEmployeeCount: row.linkedin_employee_count != null ? Number(row.linkedin_employee_count) : null,
              googleReviewCount: row.google_review_count != null ? Number(row.google_review_count) : null,
              pushedToActiveDeals: !!row.pushed_to_all_deals,
              dateAdded: row.created_at,
              detailPath: `/admin/remarketing/leads/${sourcePathMap[source] ?? source}/${row.id}`,
            });
          }
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      return allData;
    },
  });

  // ── Fetch valuation leads ──
  const { data: valuationLeads, isLoading: valuationLoading } = useQuery({
    queryKey: ['master-leads', 'valuation'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const allData: MasterLead[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('valuation_leads')
          .select(
            `id, display_name, business_name, full_name, email, website,
             industry, location, revenue, ebitda, valuation_mid,
             lead_score, pushed_to_all_deals, created_at`,
          )
          .eq('excluded', false)
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          for (const row of data) {
            allData.push({
              id: row.id,
              source: 'valuation',
              companyName: row.display_name || row.business_name || 'Unknown',
              website: row.website,
              contactName: row.full_name,
              contactEmail: row.email,
              industry: row.industry,
              location: row.location,
              revenue: row.revenue != null ? Number(row.revenue) : null,
              ebitda: row.ebitda != null ? Number(row.ebitda) : null,
              valuationEstimate: row.valuation_mid != null ? Number(row.valuation_mid) : null,
              score: row.lead_score != null ? Number(row.lead_score) : null,
              linkedinEmployeeCount: null,
              googleReviewCount: null,
              pushedToActiveDeals: !!row.pushed_to_all_deals,
              dateAdded: row.created_at,
              detailPath: '/admin/remarketing/leads/valuation',
            });
          }
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      return allData;
    },
  });

  // ── Fetch referral partners ──
  const { data: referralLeads, isLoading: referralLoading } = useQuery({
    queryKey: ['master-leads', 'referrals'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_partners')
        .select('id, name, company, email, phone, is_active, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(
        (row): MasterLead => ({
          id: row.id,
          source: 'referral',
          companyName: row.company || row.name || 'Unknown',
          website: null,
          contactName: row.name,
          contactEmail: row.email,
          industry: null,
          location: null,
          revenue: null,
          ebitda: null,
          valuationEstimate: null,
          score: null,
          linkedinEmployeeCount: null,
          googleReviewCount: null,
          pushedToActiveDeals: false,
          dateAdded: row.created_at,
          detailPath: `/admin/remarketing/leads/referrals/${row.id}`,
        }),
      );
    },
  });

  const isLoading = listingsLoading || valuationLoading || referralLoading;

  // ── Combine all leads ──
  const allLeads = useMemo(() => {
    return [
      ...(listingLeads ?? []),
      ...(valuationLeads ?? []),
      ...(referralLeads ?? []),
    ];
  }, [listingLeads, valuationLeads, referralLeads]);

  // ── Source counts ──
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allLeads.length,
      captarget: 0,
      gp_partner: 0,
      sourceco: 0,
      valuation: 0,
      referral: 0,
    };
    for (const lead of allLeads) {
      counts[lead.source] = (counts[lead.source] || 0) + 1;
    }
    return counts;
  }, [allLeads]);

  // ── Filter, search, sort ──
  const filteredLeads = useMemo(() => {
    let items = allLeads;

    // Source filter
    if (activeSource !== 'all') {
      items = items.filter((l) => l.source === activeSource);
    }

    // Hide pushed
    if (hidePushed) {
      items = items.filter((l) => !l.pushedToActiveDeals);
    }

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (l) =>
          l.companyName.toLowerCase().includes(q) ||
          (l.contactName && l.contactName.toLowerCase().includes(q)) ||
          (l.industry && l.industry.toLowerCase().includes(q)) ||
          (l.location && l.location.toLowerCase().includes(q)),
      );
    }

    // Sort
    const sorted = [...items];
    sorted.sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      switch (sortColumn) {
        case 'companyName':
          valA = a.companyName.toLowerCase();
          valB = b.companyName.toLowerCase();
          break;
        case 'source':
          valA = a.source;
          valB = b.source;
          break;
        case 'contactName':
          valA = (a.contactName || '').toLowerCase();
          valB = (b.contactName || '').toLowerCase();
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
          valA = a.source === 'valuation' ? (a.valuationEstimate ?? -1) : (a.ebitda ?? -1);
          valB = b.source === 'valuation' ? (b.valuationEstimate ?? -1) : (b.ebitda ?? -1);
          break;
        case 'score':
          valA = a.score ?? -1;
          valB = b.score ?? -1;
          break;
        case 'linkedinEmployeeCount':
          valA = a.linkedinEmployeeCount ?? -1;
          valB = b.linkedinEmployeeCount ?? -1;
          break;
        case 'googleReviewCount':
          valA = a.googleReviewCount ?? -1;
          valB = b.googleReviewCount ?? -1;
          break;
        case 'pushedToActiveDeals':
          valA = a.pushedToActiveDeals ? 1 : 0;
          valB = b.pushedToActiveDeals ? 1 : 0;
          break;
        case 'dateAdded':
          valA = a.dateAdded || '';
          valB = b.dateAdded || '';
          break;
        default:
          return 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [allLeads, activeSource, hidePushed, search, sortColumn, sortDirection]);

  // ── KPI stats ──
  const kpiStats = useMemo(() => {
    const total = allLeads.length;
    const pushed = allLeads.filter((l) => l.pushedToActiveDeals).length;
    const scored = allLeads.filter((l) => l.score != null);
    const avgScore =
      scored.length > 0
        ? Math.round(scored.reduce((sum, l) => sum + (l.score ?? 0), 0) / scored.length)
        : 0;
    return { total, pushed, avgScore };
  }, [allLeads]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLeads = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredLeads.slice(start, start + PAGE_SIZE);
  }, [filteredLeads, safePage]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeSource, search, sortColumn, sortDirection, hidePushed, setCurrentPage]);

  const handleSort = useCallback(
    (col: SortColumn) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (sortColumn === col) {
            next.set('dir', sortDirection === 'asc' ? 'desc' : 'asc');
          } else {
            next.set('sort', col);
            next.set('dir', 'asc');
          }
          return next;
        },
        { replace: true },
      );
    },
    [sortColumn, sortDirection, setSearchParams],
  );

  return {
    // Data
    allLeads,
    filteredLeads,
    paginatedLeads,
    isLoading,
    // KPI
    kpiStats,
    sourceCounts,
    // Source filter
    activeSource,
    setActiveSource,
    // Search
    search,
    setSearch,
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
    // Hide pushed
    hidePushed,
    setHidePushed,
  };
}
