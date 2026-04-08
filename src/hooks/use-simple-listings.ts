// TODO: Phase 6 — migrate to data access layer: getActiveListings() from '@/lib/data-access'
// The fetchListings() function below uses ~30 buyer-visible columns, full-text search (fts),
// location hierarchy expansion, is_internal_deal filtering, and Tier 3 time-gating.
// getActiveListings() currently only selects LISTING_SUMMARY_SELECT (11 fields) and supports
// basic category/search/pagination. The data access function needs marketplace-specific
// column support, FTS, and location expansion before this hook can migrate.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PaginationState } from './use-simple-pagination';
import { Listing, ListingStatus } from '@/types';
import { expandLocations } from '@/lib/location-hierarchy';
import { MARKETPLACE_SAFE_COLUMNS_STRING } from '@/lib/marketplace-columns';

/**
 * For Tier 3 buyers, fetch the count of Tier 1/2 connection requests per listing.
 * Optimized: only fetches counts for listings newer than 14 days (small set),
 * and uses a lightweight select with minimal columns.
 */
async function fetchTier12RequestCounts(listingIds: string[]): Promise<Record<string, number>> {
  if (listingIds.length === 0) return {};

  // Fast path: use a single query with a join to profiles for tier filtering.
  // Only select listing_id + the joined tier — minimal data transfer.
  const { data, error } = await supabase
    .from('connection_requests')
    .select('listing_id, profiles:user_id(buyer_tier)')
    .in('listing_id', listingIds)
    .in('status', ['pending', 'approved']);

  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const row of data) {
    const tier = (row as unknown as { profiles?: { buyer_tier?: number } }).profiles?.buyer_tier;
    if (tier === 1 || tier === 2) {
      if (row.listing_id) counts[row.listing_id] = (counts[row.listing_id] || 0) + 1;
    }
  }
  return counts;
}

async function fetchListings(state: PaginationState, buyerTier?: number | null, buyerType?: string | null) {

  let query = supabase
    .from('listings')
    .select(MARKETPLACE_SAFE_COLUMNS_STRING, { count: 'exact' })
    .eq('status', 'active')
    .is('deleted_at', null)
    .eq('is_internal_deal', false); // Only show marketplace deals, not internal/research deals

  // Filter by buyer type visibility — only show listings visible to this buyer's type
  if (buyerType) {
    query = query.or(`visible_to_buyer_types.is.null,visible_to_buyer_types.cs.{${buyerType}}`);
  }

  // Apply full-text search (uses GIN-indexed tsvector column for fast ranked search)
  if (state.search) {
    query = query.textSearch('fts', state.search, { type: 'websearch', config: 'english' });
  }

  if (state.category && state.category !== 'all') {
    // Support both single category field and categories array
    query = query.or(`category.eq.${state.category},categories.cs.{${state.category}}`);
  }

  if (state.location && state.location !== 'all') {
    // Use location hierarchy expansion for better filtering
    const expandedLocations = expandLocations([state.location]);
    query = query.in('location', expandedLocations);
  }

  if (state.revenueMin !== undefined) {
    query = query.gte('revenue', state.revenueMin);
  }

  if (state.revenueMax !== undefined) {
    query = query.lte('revenue', state.revenueMax);
  }

  if (state.ebitdaMin !== undefined) {
    query = query.gte('ebitda', state.ebitdaMin);
  }

  if (state.ebitdaMax !== undefined) {
    query = query.lte('ebitda', state.ebitdaMax);
  }

  // Phase 103: For Tier 3, skip pagination — fetch all then filter client-side
  const offset = (state.page - 1) * state.perPage;
  if (buyerTier !== 3) {
    query = query.range(offset, offset + state.perPage - 1);
  } else {
    query = query.limit(200);
  }

  // Order by creation date
  query = query.order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  // Cast through unknown because the Supabase TS types can't infer column types
  // from a runtime string column list — the explicit allowlist is enforced above.
  type ListingRow = Record<string, unknown> & {
    status: string;
    metric_3_type: string | null;
    owner_notes: string | null;
    created_at: string;
    updated_at: string;
    revenue: number;
    ebitda: number;
  };
  const listings = ((data || []) as unknown as ListingRow[]).map((listing) => ({
    ...listing,
    status: listing.status as ListingStatus,
    metric_3_type: (listing.metric_3_type as 'employees' | 'custom') || 'employees',
    ownerNotes: listing.owner_notes || '',
    createdAt: listing.created_at,
    updatedAt: listing.updated_at,
    revenueFormatted: `$${((listing.revenue || 0) / 1000000).toFixed(1)}M`,
    ebitdaFormatted: `$${((listing.ebitda || 0) / 1000000).toFixed(1)}M`,
    multiples: {
      revenue: listing.ebitda > 0 ? (listing.revenue / listing.ebitda).toFixed(1) : 'N/A',
      value: listing.ebitda > 0 ? (listing.revenue / listing.ebitda).toFixed(1) : 'N/A',
    },
  })) as unknown as Listing[];

  // Tier 3 time-gate: only show deals that are 14+ days old OR have <3 Tier 1/2 requests
  if (buyerTier === 3) {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // Find listings that are newer than 14 days — these need the request-count check
    const newListingIds = listings
      .filter((l) => new Date(l.created_at) > fourteenDaysAgo)
      .map((l) => l.id);

    const tier12Counts = await fetchTier12RequestCounts(newListingIds);

    const filtered = listings.filter((listing) => {
      const createdAt = new Date(listing.created_at);
      // If 14+ days old, always show
      if (createdAt <= fourteenDaysAgo) return true;
      // If newer, only show if <3 Tier 1/2 requests
      return (tier12Counts[listing.id] || 0) < 3;
    });

    // Phase 103: Apply client-side pagination after filtering
    const paged = filtered.slice(offset, offset + state.perPage);
    return {
      listings: paged,
      totalItems: filtered.length,
    };
  }

  return {
    listings,
    totalItems: count || 0,
  };
}

async function fetchMetadata() {
  const query = supabase
    .from('listings')
    .select('category, location')
    .eq('status', 'active')
    .is('deleted_at', null)
    .eq('is_internal_deal', false); // Only show marketplace deals

  const { data: listings, error } = await query;

  if (error) {
    throw error;
  }

  const categories = [...new Set(listings?.map((l) => l.category).filter(Boolean))] as string[];
  const locations = [...new Set(listings?.map((l) => l.location).filter(Boolean))] as string[];

  return { categories, locations };
}

export function useSimpleListings(state: PaginationState, buyerTier?: number | null, buyerType?: string | null) {
  return useQuery({
    queryKey: [
      'simple-listings',
      state.page,
      state.perPage,
      state.search,
      state.category,
      state.location,
      state.revenueMin,
      state.revenueMax,
      state.ebitdaMin,
      state.ebitdaMax,
      buyerTier,
      buyerType,
    ],
    queryFn: () => {
      return fetchListings(state, buyerTier, buyerType);
    },
    staleTime: 30_000, // 30 seconds — prevents aggressive refetch on every navigation
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useListingMetadata() {
  return useQuery({
    queryKey: ['listing-metadata'],
    queryFn: fetchMetadata,
    staleTime: 300000, // 5 minutes
  });
}
