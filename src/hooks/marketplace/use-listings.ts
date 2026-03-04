import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FilterOptions, Listing, ListingStatus } from '@/types';
import { withPerformanceMonitoring } from '@/lib/performance-monitor';
import { useAuth } from '@/context/AuthContext';
import { toStandardCategory, toStandardLocation } from '@/lib/standardization';

// TODO: Phase 6 — migrate to data access layer: getActiveListings() from '@/lib/data-access'
// Currently blocked because getActiveListings() selects only LISTING_SUMMARY_SELECT (11 fields),
// while the marketplace UI needs ~50 buyer-safe columns (MARKETPLACE_SAFE_COLUMNS below),
// plus is_internal_deal filtering, text search (fts), category/location standardization,
// and performance monitoring. The data access function needs to be extended to support
// the full marketplace column set and filter options before this hook can migrate.

// N02 FIX: Explicit safe columns for marketplace queries.
// SELECT * was returning all 170 columns including confidential data
// (internal_company_name, website, main_contact_*, internal_notes, etc.)
// to any authenticated buyer who opens browser DevTools.
// Only columns needed for the marketplace UI are listed here.
const MARKETPLACE_SAFE_COLUMNS = [
  'id',
  'title',
  'description',
  'description_html',
  'description_json',
  'hero_description',
  'category',
  'categories',
  'location',
  'revenue',
  'ebitda',
  'image_url',
  'status',
  'status_tag',
  'tags',
  'created_at',
  'updated_at',
  'published_at',
  'is_internal_deal',
  'deleted_at',
  'visible_to_buyer_types',
  'acquisition_type',
  'full_time_employees',
  'part_time_employees',
  'custom_metric_label',
  'custom_metric_value',
  'custom_metric_subtitle',
  'metric_3_type',
  'metric_3_custom_label',
  'metric_3_custom_value',
  'metric_3_custom_subtitle',
  'metric_4_type',
  'metric_4_custom_label',
  'metric_4_custom_value',
  'metric_4_custom_subtitle',
  'revenue_metric_subtitle',
  'ebitda_metric_subtitle',
  'custom_sections',
  'presented_by_admin_id',
  'owner_notes',
  'geographic_states',
  'services',
  'number_of_locations',
  'customer_types',
  'revenue_model',
  'business_model',
  'growth_trajectory',
].join(', ');

// Fetch listings with filters and pagination
export const useListings = (filters: FilterOptions = {}) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['listings', filters],
    queryFn: async () => {
      return withPerformanceMonitoring('marketplace-listings-query', async () => {
        // Fetching marketplace listings with filters

        // Simple auth check - must have user with verified email
        if (!user || !user.email_verified) {
          // User not authenticated or email not verified
          throw new Error('Authentication required');
        }

        // Allow admin users to always see listings, require approval for regular users
        if (!user.is_admin && user.approval_status !== 'approved') {
          // User not approved (and not admin)
          throw new Error('User approval required');
        }

        // Start building the query with explicit safe columns (N02 FIX)
        let query = supabase.from('listings').select(MARKETPLACE_SAFE_COLUMNS, { count: 'exact' });

        // Always filter to only show active, non-deleted listings in the marketplace
        query = query.eq('status', 'active').is('deleted_at', null).eq('is_internal_deal', false); // Only show marketplace deals, not internal/research deals

        // Base query: SELECT * FROM listings WHERE status = active AND deleted_at IS NULL

        // Apply filters if provided - only apply filters that have actual values
        if (filters.category) {
          // Apply standardization before querying - check both standardized and original values
          const standardizedCategory = toStandardCategory(filters.category);
          const categoryQueries = [
            `category.eq.${filters.category}`,
            `categories.cs.{${filters.category}}`,
          ];

          // If standardized version is different, also search for that
          if (standardizedCategory !== filters.category) {
            categoryQueries.push(
              `category.eq.${standardizedCategory}`,
              `categories.cs.{${standardizedCategory}}`,
            );
          }

          query = query.or(categoryQueries.join(','));
          // Added category filter with standardization
        }

        if (filters.location) {
          // Apply standardization before querying - check both standardized and original values
          const standardizedLocation = toStandardLocation(filters.location);
          const locationQueries = [`location.eq.${filters.location}`];

          // If standardized version is different, also search for that
          if (standardizedLocation !== filters.location) {
            locationQueries.push(`location.eq.${standardizedLocation}`);
          }

          query = query.or(locationQueries.join(','));
          // Added location filter with standardization
        }

        if (filters.search) {
          query = query.textSearch('fts', filters.search, { type: 'websearch', config: 'english' });
        }

        // Apply revenue filters
        if (filters.revenueMin !== undefined) {
          query = query.gte('revenue', filters.revenueMin);
          // Added revenue min filter
        }

        if (filters.revenueMax !== undefined) {
          query = query.lte('revenue', filters.revenueMax);
          // Added revenue max filter
        }

        // Apply EBITDA filters
        if (filters.ebitdaMin !== undefined) {
          query = query.gte('ebitda', filters.ebitdaMin);
          // Added EBITDA min filter
        }

        if (filters.ebitdaMax !== undefined) {
          query = query.lte('ebitda', filters.ebitdaMax);
          // Added EBITDA max filter
        }

        // Apply pagination
        const page = filters.page || 1;
        const perPage = filters.perPage || 20;
        const start = (page - 1) * perPage;
        const end = start + perPage - 1;

        query = query.order('created_at', { ascending: false }).range(start, end);

        // Added pagination

        // Execute the query
        const { data, error, count } = await query;

        if (error) {
          throw error;
        }

        // Successfully fetched listings from marketplace

        if (!data || data.length === 0) {
          // No data returned from query
          return {
            listings: [],
            totalCount: count || 0,
          };
        }

        // Transform data to include computed properties
        const listings = (data as unknown as Record<string, unknown>[])?.map(
          (item: Record<string, unknown>) => {
            const listing: Listing = {
              ...(item as unknown as Listing),
              // Ensure categories is always an array, fallback to single category
              categories:
                (item.categories as string[]) || (item.category ? [item.category as string] : []),
              // Add computed properties
              ownerNotes: (item.owner_notes as string) || '',
              createdAt: item.created_at as string,
              updatedAt: item.updated_at as string,
              // Ensure status is properly typed as ListingStatus
              status: item.status as ListingStatus,
              multiples:
                (item.revenue as number) > 0
                  ? {
                      revenue: ((item.ebitda as number) / (item.revenue as number)).toFixed(2),
                      value: '0',
                    }
                  : undefined,
              revenueFormatted: new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(item.revenue as number),
              ebitdaFormatted: new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(item.ebitda as number),
            };

            return listing;
          },
        );

        // Final result ready for marketplace

        return {
          listings: listings || [],
          totalCount: count || 0,
        };
      });
    },
    enabled: !!(
      user &&
      user.email_verified &&
      (user.approval_status === 'approved' || user.is_admin)
    ), // Remove authChecked dependency
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: 1,
    retryDelay: 1000,
  });
};

// TODO: Phase 6 — migrate to data access layer: getListingById() from '@/lib/data-access'
// Currently blocked because getListingById() uses LISTING_DETAIL_SELECT (16 fields)
// while this hook uses MARKETPLACE_SAFE_COLUMNS (~50 buyer-safe fields) and includes
// is_internal_deal filtering. The data access function needs a marketplace-specific variant.

// Get a single listing by ID
export const useListing = (id: string | undefined) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['listing', id],
    queryFn: async () => {
      if (!id) return null;

      return withPerformanceMonitoring('single-listing-query', async () => {
        // Fetching single listing

        // Simple auth check for single listings
        if (!user || !user.email_verified) {
          throw new Error('Authentication required for single listing');
        }

        // N02 FIX: Use explicit safe columns instead of SELECT *
        const { data, error } = await supabase
          .from('listings')
          .select(MARKETPLACE_SAFE_COLUMNS)
          .eq('id', id)
          .is('deleted_at', null)
          .eq('is_internal_deal', false)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          // No non-deleted listing found
          return null;
        }

        // Successfully fetched listing

        // Transform to Listing type with computed properties
        const d = data as unknown as Record<string, unknown> & {
          categories?: string[];
          category?: string;
          metric_3_type?: string;
          owner_notes?: string;
          created_at: string;
          updated_at: string;
          status: string;
          revenue: number;
          ebitda: number;
        };
        const listing = {
          ...d,
          categories: d.categories || (d.category ? [d.category] : []),
          metric_3_type: (d.metric_3_type as 'employees' | 'custom') || 'employees',
          ownerNotes: d.owner_notes || '',
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          status: d.status as ListingStatus,
          multiples:
            d.revenue > 0
              ? {
                  revenue: (d.ebitda / d.revenue).toFixed(2),
                  value: '0',
                }
              : undefined,
          revenueFormatted: new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(d.revenue),
          ebitdaFormatted: new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(d.ebitda),
        };

        return listing as Listing;
      });
    },
    enabled: !!(
      id &&
      user &&
      user.email_verified &&
      (user.approval_status === 'approved' || user.is_admin)
    ), // Remove authChecked dependency
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};

// Get listing metadata for filters (categories, locations) using standardized constants
export const useListingMetadata = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['listing-metadata'],
    queryFn: async () => {
      return withPerformanceMonitoring('listing-metadata-query', async () => {
        try {
          // Use standardized constants directly for consistent filtering
          // This ensures all filter options are always available and properly standardized
          const { STANDARDIZED_CATEGORIES, STANDARDIZED_LOCATIONS } =
            await import('@/lib/financial-parser');

          return {
            categories: STANDARDIZED_CATEGORIES,
            locations: STANDARDIZED_LOCATIONS,
          };
        } catch (error: unknown) {
          console.error('💥 Error in useListingMetadata:', error);
          // Fallback to hardcoded arrays if import fails
          return {
            categories: [
              'Technology',
              'Healthcare',
              'Manufacturing',
              'Retail',
              'Financial Services',
            ],
            locations: ['United States', 'Canada', 'United Kingdom', 'Germany', 'France'],
          };
        }
      });
    },
    enabled: !!(
      user &&
      user.email_verified &&
      (user.approval_status === 'approved' || user.is_admin)
    ),
    staleTime: 1000 * 60 * 60, // 1 hour - these are static constants
    refetchOnWindowFocus: false,
    retry: 1,
  });
};
