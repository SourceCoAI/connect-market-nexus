import { useState, useMemo } from 'react';

export interface UniverseDeal {
  id: string;
  added_at: string;
  status: string;
  listing: {
    id: string;
    title: string;
    internal_company_name?: string;
    description?: string;
    executive_summary?: string;
    location?: string;
    address_city?: string;
    address_state?: string;
    revenue?: number;
    ebitda?: number;
    enriched_at?: string;
    geographic_states?: string[];
    linkedin_employee_count?: number;
    linkedin_employee_range?: string;
    google_rating?: number;
    google_review_count?: number;
    deal_total_score?: number | null;
    seller_interest_score?: number | null;
  };
}

export interface DealEngagement {
  approved: number;
  interested: number;
  passed: number;
  avgScore: number;
}

export type SortField =
  | 'name'
  | 'description'
  | 'serviceArea'
  | 'approved'
  | 'interested'
  | 'passed'
  | 'added'
  | 'liCount'
  | 'liRange'
  | 'googleReviews'
  | 'googleRating'
  | 'revenue'
  | 'ebitda'
  | 'quality'
  | 'sellerInterest'
  | 'score';

export type SortDir = 'asc' | 'desc';

export const EMPLOYEE_RANGES = [
  { label: '1-10', min: 1, max: 10 },
  { label: '11-50', min: 11, max: 50 },
  { label: '51-200', min: 51, max: 200 },
  { label: '200+', min: 201, max: Infinity },
];

export const SCORE_TIERS = [
  { label: 'A (80+)', value: 'A' },
  { label: 'B (65-79)', value: 'B' },
  { label: 'C (50-64)', value: 'C' },
  { label: 'D (35-49)', value: 'D' },
  { label: 'F (<35)', value: 'F' },
];

export const getScoreTier = (score: number) => {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
};

export const useUniverseDealsFilters = (
  deals: UniverseDeal[],
  engagementStats: Record<string, DealEngagement>,
) => {
  // Sort state
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Filter state
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [qualityTierFilter, setQualityTierFilter] = useState<string>('all');
  const [enrichmentFilter, setEnrichmentFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Derive unique states from deals
  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    deals.forEach((d) => d.listing.geographic_states?.forEach((s) => states.add(s)));
    return Array.from(states).sort();
  }, [deals]);

  // Filter deals
  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      const l = deal.listing;
      // Search
      if (search) {
        const q = search.toLowerCase();
        const matchName = (l.internal_company_name || l.title || '').toLowerCase().includes(q);
        const matchDesc = (l.description || '').toLowerCase().includes(q);
        const matchLoc = (l.location || '').toLowerCase().includes(q);
        const matchCity = (l.address_city || '').toLowerCase().includes(q);
        const matchState = (l.address_state || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchLoc && !matchCity && !matchState) return false;
      }
      // State
      if (stateFilter !== 'all') {
        if (!l.geographic_states?.includes(stateFilter)) return false;
      }
      // Employee range
      if (employeeFilter !== 'all') {
        const range = EMPLOYEE_RANGES.find((r) => r.label === employeeFilter);
        if (range) {
          const count = l.linkedin_employee_count || 0;
          if (count < range.min || count > range.max) return false;
        }
      }
      // Quality tier
      if (qualityTierFilter !== 'all') {
        const score = l.deal_total_score;
        if (score == null) return qualityTierFilter === 'none';
        if (getScoreTier(score) !== qualityTierFilter) return false;
      }
      // Enrichment
      if (enrichmentFilter === 'enriched' && !l.enriched_at) return false;
      if (enrichmentFilter === 'not_enriched' && l.enriched_at) return false;
      return true;
    });
  }, [deals, search, stateFilter, employeeFilter, qualityTierFilter, enrichmentFilter]);

  // Sort deals
  const sortedDeals = useMemo(() => {
    if (!sortField) return filteredDeals;
    const sorted = [...filteredDeals].sort((a, b) => {
      const engA = engagementStats[a.listing.id] || {
        approved: 0,
        interested: 0,
        passed: 0,
        avgScore: 0,
      };
      const engB = engagementStats[b.listing.id] || {
        approved: 0,
        interested: 0,
        passed: 0,
        avgScore: 0,
      };
      let valA: string | number, valB: string | number;
      switch (sortField) {
        case 'name':
          valA = (a.listing.internal_company_name || a.listing.title || '').toLowerCase();
          valB = (b.listing.internal_company_name || b.listing.title || '').toLowerCase();
          break;
        case 'description':
          valA = (a.listing.executive_summary || '').toLowerCase();
          valB = (b.listing.executive_summary || '').toLowerCase();
          break;
        case 'serviceArea':
          valA = (a.listing.geographic_states || []).join(',');
          valB = (b.listing.geographic_states || []).join(',');
          break;
        case 'approved':
          valA = engA.approved;
          valB = engB.approved;
          break;
        case 'interested':
          valA = engA.interested;
          valB = engB.interested;
          break;
        case 'passed':
          valA = engA.passed;
          valB = engB.passed;
          break;
        case 'added':
          valA = new Date(a.added_at).getTime();
          valB = new Date(b.added_at).getTime();
          break;
        case 'liCount':
          valA = a.listing.linkedin_employee_count || 0;
          valB = b.listing.linkedin_employee_count || 0;
          break;
        case 'liRange':
          valA = a.listing.linkedin_employee_range || '';
          valB = b.listing.linkedin_employee_range || '';
          break;
        case 'googleReviews':
          valA = a.listing.google_review_count || 0;
          valB = b.listing.google_review_count || 0;
          break;
        case 'googleRating':
          valA = a.listing.google_rating || 0;
          valB = b.listing.google_rating || 0;
          break;
        case 'revenue':
          valA = a.listing.revenue || 0;
          valB = b.listing.revenue || 0;
          break;
        case 'ebitda':
          valA = a.listing.ebitda || 0;
          valB = b.listing.ebitda || 0;
          break;
        case 'quality':
          valA = a.listing.deal_total_score ?? -1;
          valB = b.listing.deal_total_score ?? -1;
          break;
        case 'sellerInterest':
          valA = a.listing.seller_interest_score ?? -1;
          valB = b.listing.seller_interest_score ?? -1;
          break;
        case 'score':
          valA = engA.avgScore;
          valB = engB.avgScore;
          break;
        default:
          return 0;
      }
      if (typeof valA === 'string' && typeof valB === 'string')
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sortDir === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
    return sorted;
  }, [filteredDeals, sortField, sortDir, engagementStats]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'desc') setSortDir('asc');
      else {
        setSortField(null);
        setSortDir('desc');
      }
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const hasActiveFilters =
    stateFilter !== 'all' ||
    employeeFilter !== 'all' ||
    qualityTierFilter !== 'all' ||
    enrichmentFilter !== 'all' ||
    search.length > 0;

  const clearAllFilters = () => {
    setSearch('');
    setStateFilter('all');
    setEmployeeFilter('all');
    setQualityTierFilter('all');
    setEnrichmentFilter('all');
  };

  return {
    // Sort
    sortField,
    sortDir,
    handleSort,
    // Filter
    search,
    setSearch,
    stateFilter,
    setStateFilter,
    employeeFilter,
    setEmployeeFilter,
    qualityTierFilter,
    setQualityTierFilter,
    enrichmentFilter,
    setEnrichmentFilter,
    showFilters,
    setShowFilters,
    // Derived
    uniqueStates,
    filteredDeals,
    sortedDeals,
    hasActiveFilters,
    clearAllFilters,
  };
};
