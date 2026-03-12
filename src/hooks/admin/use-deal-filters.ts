import { useMemo, useState } from 'react';
import { Deal } from './use-deals';
import { useMarketplaceCompanies } from './use-marketplace-companies';

export type DealStatusFilter = 'all' | 'active_only' | 'closed_won' | 'closed_lost' | 'closed' | string;
export type BuyerTypeFilter = 'all' | 'private_equity' | 'corporate' | 'family_office' | 'independent_sponsor' | 'search_fund' | 'individual_buyer';
export type ListingFilter = 'all' | string;
export type CompanyFilter = string[]; // Changed to array for multiselect
export type AdminFilter = 'all' | 'unassigned' | 'assigned_to_me' | string;
export type DocumentStatusFilter = 'all' | 'nda_signed' | 'fee_signed' | 'both_signed' | 'none_signed' | 'overdue_followup';
export type DateRangeFilter = { start: Date | null; end: Date | null };
export type SortOption = 'newest' | 'oldest' | 'priority' | 'value' | 'probability' | 'stage_entered' | 'last_activity';

export function useDealFilters(deals: Deal[], currentAdminId?: string) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DealStatusFilter>('all');
  const [buyerTypeFilter, setBuyerTypeFilter] = useState<BuyerTypeFilter>('all');
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all');
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>([]);
  const [adminFilter, setAdminFilter] = useState<AdminFilter>('all');
  const [documentStatusFilter, setDocumentStatusFilter] = useState<DocumentStatusFilter>('all');
  const [createdDateRange, setCreatedDateRange] = useState<DateRangeFilter>({ start: null, end: null });
  const [lastActivityRange, setLastActivityRange] = useState<DateRangeFilter>({ start: null, end: null });
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  // Fetch all marketplace companies for comprehensive filtering
  const { data: marketplaceCompanies } = useMarketplaceCompanies();

  const filteredAndSortedDeals = useMemo(() => {
    let filtered = deals;

    // Search filter - comprehensive search across all key fields
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(deal => 
        deal.title?.toLowerCase().includes(query) ||
        deal.listing_title?.toLowerCase().includes(query) ||
        deal.listing_real_company_name?.toLowerCase().includes(query) ||
        deal.buyer_name?.toLowerCase().includes(query) ||
        deal.buyer_company?.toLowerCase().includes(query) ||
        deal.contact_name?.toLowerCase().includes(query) ||
        deal.contact_email?.toLowerCase().includes(query) ||
        deal.contact_company?.toLowerCase().includes(query) ||
        deal.contact_phone?.toLowerCase().includes(query) ||
        deal.stage_name?.toLowerCase().includes(query)
      );
    }

    // Status filter - dynamic stage filtering
    if (statusFilter !== 'all') {
      if (statusFilter === 'active_only') {
        // Show all stages except closed
        filtered = filtered.filter(d => d.stage_name && !['Closed Won', 'Closed Lost'].includes(d.stage_name));
      } else if (statusFilter === 'closed_won') {
        filtered = filtered.filter(d => d.stage_name === 'Closed Won');
      } else if (statusFilter === 'closed_lost') {
        filtered = filtered.filter(d => d.stage_name === 'Closed Lost');
      } else if (statusFilter === 'closed') {
        filtered = filtered.filter(d => d.stage_name && ['Closed Won', 'Closed Lost'].includes(d.stage_name));
      } else {
        // Filter by stage ID (for dynamic stages)
        filtered = filtered.filter(d => d.stage_id === statusFilter);
      }
    }

    // Buyer type filter
    if (buyerTypeFilter !== 'all') {
      filtered = filtered.filter(d => d.buyer_type === buyerTypeFilter);
    }

    // Listing filter
    if (listingFilter !== 'all') {
      filtered = filtered.filter(d => d.listing_id === listingFilter);
    }

    // Company filter (multi-select) - filter by BUYER's company name
    if (companyFilter.length > 0) {
      filtered = filtered.filter(d => {
        const buyerCompany = d.buyer_company?.toLowerCase();
        return companyFilter.some(company => 
          buyerCompany === company.toLowerCase()
        );
      });
    }

    // Admin filter - enhanced with 'assigned_to_me'
    if (adminFilter !== 'all') {
      if (adminFilter === 'unassigned') {
        filtered = filtered.filter(d => !d.assigned_to);
      } else if (adminFilter === 'assigned_to_me' && currentAdminId) {
        filtered = filtered.filter(d => d.assigned_to === currentAdminId);
      } else {
        filtered = filtered.filter(d => d.assigned_to === adminFilter);
      }
    }

    // Created date range filter
    if (createdDateRange.start || createdDateRange.end) {
      filtered = filtered.filter(d => {
        const createdDate = new Date(d.deal_created_at);
        if (createdDateRange.start && createdDate < createdDateRange.start) return false;
        if (createdDateRange.end && createdDate > createdDateRange.end) return false;
        return true;
      });
    }

    // Last activity date range filter
    if (lastActivityRange.start || lastActivityRange.end) {
      filtered = filtered.filter(d => {
        const activityDate = new Date(d.deal_updated_at);
        if (lastActivityRange.start && activityDate < lastActivityRange.start) return false;
        if (lastActivityRange.end && activityDate > lastActivityRange.end) return false;
        return true;
      });
    }

    // Document status filter
    if (documentStatusFilter !== 'all') {
      switch (documentStatusFilter) {
        case 'both_signed':
          filtered = filtered.filter(d => d.nda_status === 'signed' && d.fee_agreement_status === 'signed');
          break;
        case 'nda_signed':
          filtered = filtered.filter(d => d.nda_status === 'signed' && d.fee_agreement_status !== 'signed');
          break;
        case 'fee_signed':
          filtered = filtered.filter(d => d.fee_agreement_status === 'signed' && d.nda_status !== 'signed');
          break;
        case 'none_signed':
          filtered = filtered.filter(d => d.nda_status !== 'signed' && d.fee_agreement_status !== 'signed');
          break;
        case 'overdue_followup':
          filtered = filtered.filter(d => d.followup_overdue === true);
          break;
      }
    }

    // Sorting - added last_activity option
    const sorted = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'newest':
          return new Date(b.deal_created_at).getTime() - new Date(a.deal_created_at).getTime();
        case 'oldest':
          return new Date(a.deal_created_at).getTime() - new Date(b.deal_created_at).getTime();
        case 'priority':
          return (b.buyer_priority_score || 0) - (a.buyer_priority_score || 0);
        case 'value':
          return b.deal_value - a.deal_value;
        case 'probability':
          return b.deal_probability - a.deal_probability;
        case 'stage_entered':
          return new Date(b.deal_stage_entered_at).getTime() - new Date(a.deal_stage_entered_at).getTime();
        case 'last_activity':
          return new Date(b.deal_updated_at).getTime() - new Date(a.deal_updated_at).getTime();
        default:
          return 0;
      }
    });

    return sorted;
  }, [deals, searchQuery, statusFilter, buyerTypeFilter, listingFilter, companyFilter, adminFilter, documentStatusFilter, createdDateRange, lastActivityRange, sortOption, currentAdminId]);

  // Get ALL marketplace companies for comprehensive filtering (not just companies in deals)
  const uniqueCompanies = useMemo(() => {
    if (!marketplaceCompanies || marketplaceCompanies.length === 0) {
      return [];
    }
    
    // marketplaceCompanies already returns the correct format with label, value, and userCount
    // Just sort them alphabetically
    return [...marketplaceCompanies].sort((a, b) => a.label.localeCompare(b.label));
  }, [marketplaceCompanies]);

  // Get unique listings for filter dropdown (show real company name when available)
  const uniqueListings = useMemo(() => {
    const listings = new Map<string, string>();
    deals.forEach(deal => {
      if (deal.listing_id && deal.listing_title) {
        const realName = deal.listing_real_company_name?.trim();
        const display = realName ? `${deal.listing_title} / ${realName}` : deal.listing_title;
        listings.set(deal.listing_id, display);
      }
    });
    return Array.from(listings.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [deals]);

  return {
    searchQuery,
    statusFilter,
    buyerTypeFilter,
    listingFilter,
    companyFilter,
    adminFilter,
    documentStatusFilter,
    createdDateRange,
    lastActivityRange,
    sortOption,
    filteredAndSortedDeals,
    uniqueCompanies,
    uniqueListings,
    setSearchQuery,
    setStatusFilter,
    setBuyerTypeFilter,
    setListingFilter,
    setCompanyFilter,
    setAdminFilter,
    setDocumentStatusFilter,
    setCreatedDateRange,
    setLastActivityRange,
    setSortOption,
  };
}