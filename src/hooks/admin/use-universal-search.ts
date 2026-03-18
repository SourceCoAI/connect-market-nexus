import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Fetch all rows from a Supabase query by paginating in chunks to bypass the default 1000-row limit. */
async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: (from: number, to: number) => any,
  pageSize = 5000,
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await buildQuery(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    allRows.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return allRows;
}

export interface UniversalSearchResult {
  id: string;
  title: string;
  subtitle?: string;
  category: SearchCategory;
  href: string;
  meta?: string;
}

export type SearchCategory =
  | 'deals'
  | 'all_deals'
  | 'captarget'
  | 'gp_partners'
  | 'sourceco'
  | 'valuation_leads'
  | 'inbound_leads'
  | 'owner_leads'
  | 'referral_partners'
  | 'buyers'
  | 'buyer_contacts';

const CATEGORY_CONFIG: Record<SearchCategory, { label: string; color: string }> = {
  deals: { label: 'Pipeline Deals', color: 'text-blue-600' },
  all_deals: { label: 'All Deals', color: 'text-indigo-600' },
  captarget: { label: 'CapTarget', color: 'text-orange-600' },
  gp_partners: { label: 'GP Partners', color: 'text-emerald-600' },
  sourceco: { label: 'SourceCo', color: 'text-cyan-600' },
  valuation_leads: { label: 'Valuation Leads', color: 'text-purple-600' },
  inbound_leads: { label: 'Inbound Leads', color: 'text-cyan-600' },
  owner_leads: { label: 'Owner/Seller Leads', color: 'text-amber-600' },
  referral_partners: { label: 'Referral Partners', color: 'text-rose-600' },
  buyers: { label: 'Remarketing Buyers', color: 'text-teal-600' },
  buyer_contacts: { label: 'Buyer Contacts', color: 'text-sky-600' },
};

export function getCategoryConfig(cat: SearchCategory) {
  return CATEGORY_CONFIG[cat];
}

export function useUniversalSearch() {
  const [query, setQuery] = useState('');

  // --- Pipeline Deals (via RPC) ---
  const dealsQuery = useQuery({
    queryKey: ['universal-search', 'deals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_deals_with_buyer_profiles');
      if (error) throw error;
      return (data ?? []).map((d: Record<string, unknown>) => ({
        id: d.deal_id as string,
        title: (d.deal_title as string) || 'Untitled Deal',
        subtitle: [
          d.listing_title,
          d.listing_internal_company_name,
          d.contact_name,
          d.contact_email,
          d.buyer_name,
        ]
          .filter(Boolean)
          .join(' · '),
        category: 'deals' as SearchCategory,
        href: `/admin/deals`,
        meta: [d.stage_name, d.contact_company, d.buyer_company].filter(Boolean).join(' | '),
      }));
    },
    staleTime: 60_000,
  });

  // --- All Deals (all listings regardless of status or source) ---
  const allDealsQuery = useQuery({
    queryKey: ['universal-search', 'all-deals'],
    queryFn: async () => {
      const rows = await fetchAllRows<Record<string, unknown>>(
        (from, to) =>
          supabase
            .from('listings')
            .select(
              'id, title, internal_company_name, real_company_name, description, location, category, industry, website, deal_source, remarketing_status, main_contact_name, main_contact_email, captarget_client_name, address_state, status',
            )
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .range(from, to),
      );
      return rows.map((l: Record<string, unknown>) => {
        // Route to the appropriate detail page based on deal_source
        const dealSource = l.deal_source as string | null;
        let href = `/admin/remarketing/deals/${l.id}`;
        let category: SearchCategory = 'all_deals';
        if (dealSource === 'captarget') {
          category = 'captarget';
          href = `/admin/remarketing/leads/captarget`;
        } else if (dealSource === 'gp_partners') {
          category = 'gp_partners';
          href = `/admin/remarketing/leads/gp-partners`;
        } else if (dealSource === 'sourceco') {
          category = 'sourceco';
          href = `/admin/remarketing/leads/sourceco`;
        }

        const companyName = (l.internal_company_name || l.real_company_name || l.title || 'Untitled') as string;
        return {
          id: l.id as string,
          title: companyName,
          subtitle: [
            l.industry,
            l.location || l.address_state,
            l.category,
            l.main_contact_name,
            l.captarget_client_name,
            l.real_company_name && l.real_company_name !== companyName ? l.real_company_name : null,
          ]
            .filter(Boolean)
            .join(' · '),
          category,
          href,
          meta: [
            (l.description as string)?.slice(0, 80),
            l.website,
            l.main_contact_email,
            dealSource,
            l.remarketing_status,
            l.status,
            l.title && l.title !== companyName ? l.title : null,
          ]
            .filter(Boolean)
            .join(' | '),
        };
      });
    },
    staleTime: 60_000,
  });

  // --- Valuation Leads ---
  const valuationQuery = useQuery({
    queryKey: ['universal-search', 'valuation-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('valuation_leads')
        .select('id, display_name, business_name, full_name, email, website, industry, location')
        .eq('excluded', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((v) => ({
        id: v.id,
        title: v.display_name || v.business_name || v.full_name || 'Unknown',
        subtitle: [v.email, v.industry, v.location].filter(Boolean).join(' · '),
        category: 'valuation_leads' as SearchCategory,
        href: `/admin/remarketing/leads/valuation`,
        meta: v.website || undefined,
      }));
    },
    staleTime: 60_000,
  });

  // --- Inbound Leads ---
  const inboundQuery = useQuery({
    queryKey: ['universal-search', 'inbound-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inbound_leads')
        .select('id, name, email, company_name, role, message, lead_type')
        .is('lead_type', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id,
        title: l.name || l.email || 'Unknown',
        subtitle: [l.company_name, l.role].filter(Boolean).join(' · '),
        category: 'inbound_leads' as SearchCategory,
        href: `/admin/settings/inbound-leads`,
        meta: l.message?.slice(0, 80) || undefined,
      }));
    },
    staleTime: 60_000,
  });

  // --- Owner/Seller Leads ---
  const ownerQuery = useQuery({
    queryKey: ['universal-search', 'owner-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inbound_leads')
        .select('id, name, email, company_name, business_website, message')
        .eq('lead_type', 'owner')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id,
        title: l.name || l.email || 'Unknown',
        subtitle: [l.company_name, l.business_website].filter(Boolean).join(' · '),
        category: 'owner_leads' as SearchCategory,
        href: `/admin/settings/owner-leads`,
        meta: l.message?.slice(0, 80) || undefined,
      }));
    },
    staleTime: 60_000,
  });

  // --- Referral Partners ---
  const referralQuery = useQuery({
    queryKey: ['universal-search', 'referral-partners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_partners')
        .select('id, name, company, email, phone')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        title: p.name || p.company || 'Unknown',
        subtitle: [p.company, p.email, p.phone].filter(Boolean).join(' · '),
        category: 'referral_partners' as SearchCategory,
        href: `/admin/remarketing/leads/referrals/${p.id}`,
        meta: undefined,
      }));
    },
    staleTime: 60_000,
  });

  // --- Remarketing Buyers ---
  const buyersQuery = useQuery({
    queryKey: ['universal-search', 'remarketing-buyers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyers')
        .select(
          'id, company_name, company_website, buyer_type, pe_firm_name, thesis_summary, hq_city, hq_state',
        )
        .eq('archived', false)
        .order('company_name');
      if (error) throw error;
      return (data ?? []).map((b) => ({
        id: b.id,
        title: b.company_name || 'Unknown',
        subtitle: [
          b.buyer_type,
          b.pe_firm_name,
          b.hq_city && b.hq_state ? `${b.hq_city}, ${b.hq_state}` : b.hq_state,
        ]
          .filter(Boolean)
          .join(' · '),
        category: 'buyers' as SearchCategory,
        href: `/admin/remarketing/buyers/${b.id}`,
        meta: [b.company_website, b.thesis_summary?.slice(0, 80)].filter(Boolean).join(' | '),
      }));
    },
    staleTime: 60_000,
  });

  // --- Buyer Contacts ---
  const buyerContactsQuery = useQuery({
    queryKey: ['universal-search', 'buyer-contacts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, title, phone, remarketing_buyer_id, buyers!inner(company_name)')
        .eq('contact_type', 'buyer')
        .eq('archived', false)
        .order('first_name');
      if (error) throw error;
      return (data ?? []).map((c: Record<string, unknown>) => {
        const buyer = c.buyers as Record<string, unknown> | null;
        const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
        return {
          id: c.id as string,
          title: fullName || (c.email as string) || 'Unknown Contact',
          subtitle: [c.title, c.email, c.phone].filter(Boolean).join(' · '),
          category: 'buyer_contacts' as SearchCategory,
          href: `/admin/remarketing/buyers/${c.remarketing_buyer_id as string}`,
          meta: buyer?.company_name as string | undefined,
        };
      });
    },
    staleTime: 60_000,
  });

  const isLoading =
    dealsQuery.isLoading ||
    allDealsQuery.isLoading ||
    valuationQuery.isLoading ||
    inboundQuery.isLoading ||
    ownerQuery.isLoading ||
    referralQuery.isLoading ||
    buyersQuery.isLoading ||
    buyerContactsQuery.isLoading;

  const allResults: UniversalSearchResult[] = useMemo(
    () => {
      // Combine all sources, then deduplicate by id within each category
      const combined = [
        ...(dealsQuery.data ?? []),
        ...(allDealsQuery.data ?? []),
        ...(valuationQuery.data ?? []),
        ...(inboundQuery.data ?? []),
        ...(ownerQuery.data ?? []),
        ...(referralQuery.data ?? []),
        ...(buyersQuery.data ?? []),
        ...(buyerContactsQuery.data ?? []),
      ];

      // Deduplicate: keep first occurrence per id+category
      const seen = new Set<string>();
      return combined.filter((r) => {
        const key = `${r.category}:${r.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    [
      dealsQuery.data,
      allDealsQuery.data,
      valuationQuery.data,
      inboundQuery.data,
      ownerQuery.data,
      referralQuery.data,
      buyersQuery.data,
      buyerContactsQuery.data,
    ],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const tokens = q.split(/\s+/);
    return allResults
      .filter((r) => {
        const haystack = [r.title, r.subtitle, r.meta].filter(Boolean).join(' ').toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      })
      .slice(0, 100);
  }, [query, allResults]);

  const grouped = useMemo(() => {
    const map = new Map<SearchCategory, UniversalSearchResult[]>();
    for (const r of filtered) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    return map;
  }, [filtered]);

  return { query, setQuery, results: filtered, grouped, isLoading, allResults };
}
