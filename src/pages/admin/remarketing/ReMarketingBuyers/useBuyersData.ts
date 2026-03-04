import { useState, useMemo } from 'react';
import { useShiftSelect } from '@/hooks/useShiftSelect';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { normalizeDomain } from '@/lib/remarketing/normalizeDomain';
import { useFilterEngine } from '@/hooks/use-filter-engine';
import { BUYER_UNIVERSE_FIELDS } from '@/components/filters';
import type { BuyerType } from '@/types/remarketing';
import { isSponsorType, PAGE_SIZE } from './constants';
import type { BuyerTab } from './constants';

export const useBuyersData = () => {
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const initialTab = (searchParams.get('tab') as BuyerTab) || 'all';
  const [activeTab, setActiveTab] = useState<BuyerTab>(initialTab);
  const universeFilter = searchParams.get('universe') ?? 'all';
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const sortColumn = searchParams.get('sort') ?? 'company_name';
  const sortDirection = (searchParams.get('dir') as 'asc' | 'desc') ?? 'asc';
  // New buyer form state
  const [newBuyer, setNewBuyer] = useState({
    company_name: '',
    company_website: '',
    buyer_type: '' as BuyerType | '',
    universe_id: '',
    thesis_summary: '',
    notes: '',
  });

  // Fetch buyers with universe + firm agreement info (for NDA/marketplace)
  const { data: buyers, isLoading: buyersLoading } = useQuery({
    queryKey: ['remarketing', 'buyers', universeFilter],
    queryFn: async () => {
      let query = supabase
        .from('buyers')
        .select(
          `
          *,
          universe:buyer_universes(id, name),
          firm_agreement:firm_agreements!remarketing_buyers_marketplace_firm_id_fkey(
            id,
            nda_signed,
            nda_signed_at,
            fee_agreement_signed,
            fee_agreement_signed_at,
            primary_company_name
          )
        `,
        )
        .eq('archived', false)
        .order('company_name');

      // Filter by universe
      if (universeFilter !== 'all') {
        query = query.eq('universe_id', universeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch buyer IDs that have transcripts - needed to determine "Strong" vs "Some Intel"
  // Scoped to current buyer set to avoid full table scan
  const buyerIds = useMemo(() => (buyers || []).map((b) => b.id), [buyers]);
  const { data: buyerIdsWithTranscripts } = useQuery({
    queryKey: ['remarketing', 'buyer-transcript-ids', buyerIds.slice(0, 5)],
    queryFn: async () => {
      if (buyerIds.length === 0) return new Set<string>();

      // Batch in chunks of 100 to stay within Supabase limits
      const allIds: string[] = [];
      for (let i = 0; i < buyerIds.length; i += 100) {
        const chunk = buyerIds.slice(i, i + 100);
        const { data, error } = await supabase
          .from('buyer_transcripts')
          .select('buyer_id')
          .in('buyer_id', chunk);
        if (error) {
          // Error fetching transcripts — skipping this chunk
          continue;
        }
        allIds.push(...(data || []).map((t: { buyer_id: string }) => t.buyer_id));
      }

      return new Set(allIds);
    },
    enabled: buyerIds.length > 0,
  });

  // Fetch universes for filter/dropdown
  const { data: universes } = useQuery({
    queryKey: ['remarketing', 'universes'],
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

  // Fetch unsigned NDA / fee agreement items for the "Unsigned Agreements" tab
  const { data: unsignedAgreements } = useQuery({
    queryKey: ['unsigned-agreements-buyers-tab'],
    queryFn: async () => {
      const items: {
        id: string;
        primary_company_name: string;
        type: 'nda' | 'fee_agreement';
        status: string | null;
        sent_at: string | null;
      }[] = [];

      const { data: unsignedNdas } = await supabase
        .from('firm_agreements')
        .select('id, primary_company_name, nda_status, nda_sent_at')
        .eq('nda_signed', false)
        .in('nda_status', ['sent', 'viewed', 'pending']);

      for (const row of unsignedNdas || []) {
        items.push({
          id: row.id,
          primary_company_name: row.primary_company_name,
          type: 'nda',
          status: row.nda_status,
          sent_at: row.nda_sent_at,
        });
      }

      const { data: unsignedFees } = await supabase
        .from('firm_agreements')
        .select('id, primary_company_name, fee_agreement_status, fee_agreement_sent_at')
        .eq('fee_agreement_signed', false)
        .in('fee_agreement_status', ['sent', 'viewed', 'pending']);

      for (const row of unsignedFees || []) {
        items.push({
          id: row.id,
          primary_company_name: row.primary_company_name,
          type: 'fee_agreement',
          status: row.fee_agreement_status,
          sent_at: row.fee_agreement_sent_at,
        });
      }

      items.sort((a, b) => {
        if (!a.sent_at) return 1;
        if (!b.sent_at) return -1;
        return new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime();
      });

      return items;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Compute tab counts from loaded buyers
  const tabCounts = useMemo(() => {
    if (!buyers)
      return {
        all: 0,
        private_equity: 0,
        corporate: 0,
        needs_review: 0,
        needs_agreements: 0,
        unsigned_agreements: 0,
        needs_pe_link: 0,
      };
    let private_equity = 0,
      corporate = 0,
      needs_review = 0,
      needs_agreements = 0,
      needs_pe_link = 0;
    buyers.forEach((b) => {
      if (isSponsorType(b.buyer_type)) private_equity++;
      if (b.buyer_type === 'corporate' || !b.buyer_type) corporate++;
      if ((b as Record<string, unknown>).buyer_type_needs_review) needs_review++;
      if (!b.has_fee_agreement) needs_agreements++;
      if (b.is_pe_backed === true && !b.parent_pe_firm_id) needs_pe_link++;
    });
    return {
      all: buyers.length,
      private_equity,
      corporate,
      needs_review,
      needs_agreements,
      unsigned_agreements: unsignedAgreements?.length ?? 0,
      needs_pe_link,
    };
  }, [buyers, unsignedAgreements]);

  // Calculate platform counts per PE firm (for the PE Firms tab)
  // Counts corporate buyers that have a pe_firm_name (i.e., PE-backed corporates)
  const platformCountsByFirm = useMemo(() => {
    if (!buyers) return new Map<string, number>();
    const counts = new Map<string, number>();
    buyers.forEach((b) => {
      const isPeBacked = b.pe_firm_name && !isSponsorType(b.buyer_type);
      if (isPeBacked) {
        counts.set(b.pe_firm_name!, (counts.get(b.pe_firm_name!) || 0) + 1);
      }
    });
    return counts;
  }, [buyers]);

  // Create buyer mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      // Normalize website for dedup
      const normalizedWebsite =
        normalizeDomain(newBuyer.company_website) || newBuyer.company_website?.trim() || null;
      const universeId = newBuyer.universe_id || null;

      // Website is required — it's the canonical unique identifier for buyers.
      if (!normalizedWebsite) {
        throw new Error('A website is required. Buyers are deduplicated by domain.');
      }

      // Check for duplicate by domain across ALL active buyers (not scoped to universe).
      const { data: existingBuyers } = await supabase
        .from('buyers')
        .select('id, company_name, company_website')
        .eq('archived', false)
        .not('company_website', 'is', null);

      if (existingBuyers) {
        const domainDuplicate = existingBuyers.find(
          (b) => normalizeDomain(b.company_website) === normalizedWebsite,
        );
        if (domainDuplicate) {
          throw new Error(
            `A buyer with this website already exists: "${domainDuplicate.company_name}"`,
          );
        }
      }

      const { error } = await supabase.from('buyers').insert({
        company_name: newBuyer.company_name,
        company_website: normalizedWebsite,
        buyer_type: newBuyer.buyer_type || null,
        universe_id: universeId,
        thesis_summary: newBuyer.thesis_summary || null,
        notes: newBuyer.notes || null,
      });

      if (error) {
        // Map DB-level unique constraint violations to friendly messages
        if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
          throw new Error(
            'A buyer with this website domain already exists. Please check your existing buyers.',
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing'] });
      toast.success(`${newBuyer.company_name} has been added.`);
      setNewBuyer({
        company_name: '',
        company_website: '',
        buyer_type: '',
        universe_id: '',
        thesis_summary: '',
        notes: '',
      });
      setIsAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete buyer mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('buyers').delete().eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing'] });
      toast.success('Buyer deleted');
    },
  });

  // Filter engine (shared FilterBar component)
  const {
    filteredItems: engineFiltered,
    filterState,
    setFilterState,
    dynamicOptions,
    filteredCount,
    totalCount: engineTotal,
  } = useFilterEngine(buyers ?? [], BUYER_UNIVERSE_FIELDS);

  // Filter buyers by tab + apply engine filters + sort
  const filteredBuyers = useMemo(() => {
    let result = [...engineFiltered];

    // Tab filter
    switch (activeTab) {
      case 'private_equity':
        result = result.filter((b) => isSponsorType(b.buyer_type));
        break;
      case 'corporate':
        result = result.filter((b) => b.buyer_type === 'corporate' || !b.buyer_type);
        break;
      case 'needs_review':
        result = result.filter((b) => (b as Record<string, unknown>).buyer_type_needs_review);
        break;
      case 'needs_agreements':
        result = result.filter((b) => !b.has_fee_agreement);
        break;
      case 'needs_pe_link':
        result = result.filter((b) => b.is_pe_backed === true && !b.parent_pe_firm_id);
        break;
    }

    // Sort
    result = [...result].sort((a, b) => {
      let valA: string, valB: string;
      switch (sortColumn) {
        case 'company_name':
          valA = a.company_name?.toLowerCase() || '';
          valB = b.company_name?.toLowerCase() || '';
          break;
        case 'pe_firm_name':
          valA = a.pe_firm_name?.toLowerCase() || '';
          valB = b.pe_firm_name?.toLowerCase() || '';
          break;
        case 'universe':
          valA = (a.universe as { name?: string } | null)?.name?.toLowerCase() || '';
          valB = (b.universe as { name?: string } | null)?.name?.toLowerCase() || '';
          break;
        default:
          valA = a.company_name?.toLowerCase() || '';
          valB = b.company_name?.toLowerCase() || '';
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [engineFiltered, sortColumn, sortDirection, activeTab]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredBuyers.length / PAGE_SIZE));
  const pagedBuyers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredBuyers.slice(start, start + PAGE_SIZE);
  }, [filteredBuyers, currentPage]);

  // Reset to page 1 when filters/search/tab change
  const handleTabChange = (v: string) => {
    setActiveTab(v as BuyerTab);
    setSelectedIds(new Set());
    setCurrentPage(1);
  };

  // Enrich single buyer via enrichment queue
  const handleEnrichBuyer = async (e: React.MouseEvent, buyerId: string) => {
    e.stopPropagation();
    setEnrichingIds((prev) => new Set(prev).add(buyerId));
    try {
      const { queueBuyerEnrichment } = await import('@/lib/remarketing/queueEnrichment');
      await queueBuyerEnrichment([buyerId]);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyers'] });
    } catch {
      // Toast shown by queue utility
    } finally {
      setEnrichingIds((prev) => {
        const next = new Set(prev);
        next.delete(buyerId);
        return next;
      });
    }
  };

  const handleSort = (column: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get('sort') === column) {
          next.set('dir', next.get('dir') === 'asc' ? 'desc' : 'asc');
        } else {
          next.set('sort', column);
          next.set('dir', 'asc');
        }
        return next;
      },
      { replace: true },
    );
  };

  const setUniverseFilter = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'all') next.delete('universe');
        else next.set('universe', value);
        return next;
      },
      { replace: true },
    );
  };

  // Selection helpers (shift-click multi-select)
  const orderedIds = useMemo(() => pagedBuyers.map((b) => b.id), [pagedBuyers]);
  const { handleToggle: toggleSelect } = useShiftSelect(orderedIds, selectedIds, setSelectedIds);
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredBuyers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBuyers.map((b) => b.id)));
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const rows = filteredBuyers.filter((b) => selectedIds.size === 0 || selectedIds.has(b.id));
    const headers = [
      'Company Name',
      'Buyer Type',
      'PE Firm',
      'Website',
      'Location',
      'Thesis',
      'Fee Agreement',
      'NDA',
    ];
    const csv = [
      headers.join(','),
      ...rows.map((b) =>
        [
          `"${(b.company_name || '').replace(/"/g, '""')}"`,
          b.buyer_type || '',
          `"${(b.pe_firm_name || '').replace(/"/g, '""')}"`,
          b.company_website || '',
          [b.hq_city, b.hq_state].filter(Boolean).join(' '),
          `"${(b.thesis_summary || '').replace(/"/g, '""').substring(0, 200)}"`,
          b.has_fee_agreement ? 'Yes' : 'No',
          (b as Record<string, unknown>).nda_signed ? 'Yes' : 'No',
        ].join(','),
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'buyers.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} buyers`);
  };

  return {
    // State
    search,
    setSearch,
    activeTab,
    universeFilter,
    isAddDialogOpen,
    setIsAddDialogOpen,
    selectedIds,
    setSelectedIds,
    currentPage,
    setCurrentPage,
    enrichingIds,
    setEnrichingIds,
    sortColumn,
    sortDirection,
    newBuyer,
    setNewBuyer,

    // Filter engine
    filterState,
    setFilterState,
    dynamicOptions,
    filteredCount,
    engineTotal,

    // Data
    buyers,
    buyersLoading,
    buyerIdsWithTranscripts,
    universes,
    tabCounts,
    platformCountsByFirm,
    filteredBuyers,
    totalPages,
    pagedBuyers,
    unsignedAgreements,

    // Mutations
    createMutation,
    deleteMutation,

    // Handlers
    handleTabChange,
    handleEnrichBuyer,
    handleSort,
    setUniverseFilter,
    toggleSelect,
    toggleSelectAll,
    handleExportCSV,

    // Query client for bulk operations
    queryClient,
  };
};
