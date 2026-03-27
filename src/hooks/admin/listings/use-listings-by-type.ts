import { supabase } from '@/integrations/supabase/client';
import { AdminListing } from '@/types/admin';
import { toast } from '@/hooks/use-toast';
import { withPerformanceMonitoring } from '@/lib/performance-monitor';
import { useAuth } from '@/contexts/AuthContext';
import { useTabAwareQuery } from '@/hooks/use-tab-aware-query';

export type ListingType = 'marketplace' | 'research' | 'all';

/**
 * Hook for fetching admin listings filtered by type:
 * - marketplace: Public-facing listings (is_internal_deal = false, has image)
 * - research: Remarketing deals (is_internal_deal = true, no image - data-focused)
 */
export function useListingsByType(
  type: ListingType,
  status?: 'active' | 'inactive' | 'archived' | 'all',
) {
  const { user, authChecked } = useAuth();

  const cachedAuthState = (() => {
    try {
      const cached = localStorage.getItem('user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  })();

  const isAdminUser = user?.is_admin === true || cachedAuthState?.is_admin === true;
  const shouldEnable = (authChecked || cachedAuthState) && isAdminUser;

  return useTabAwareQuery(
    ['admin-listings', type, status],
    async () => {
      return withPerformanceMonitoring(`admin-listings-${type}-query`, async () => {
        try {
          if (!isAdminUser) {
            throw new Error('Admin authentication required');
          }

          let query = supabase
            .from('listings')
            .select(
              'id, title, description, category, categories, status, revenue, ebitda, image_url, is_internal_deal, created_at, updated_at, location, internal_company_name, deal_owner_id',
            )
            .is('deleted_at', null);

          // Filter by listing type with different image conditions
          if (type === 'marketplace') {
            // Marketplace: public-facing with images
            query = query
              .eq('is_internal_deal', false)
              .not('image_url', 'is', null)
              .neq('image_url', '');
          } else {
            // Research: internal deals without images (remarketing deals)
            query = query.eq('is_internal_deal', true);
          }

          // Apply status filter if provided
          if (status && status !== 'all') {
            query = query.eq('status', status);
          }

          const { data, error } = await query.order('created_at', { ascending: false });

          if (error) {
            throw error;
          }

          const mappedData = data?.map((listing) => ({
            ...listing,
            categories: listing.categories || (listing.category ? [listing.category] : []),
          }));

          return mappedData as unknown as AdminListing[];
        } catch (error: unknown) {
          toast({
            variant: 'destructive',
            title: 'Error fetching listings',
            description: (error as Error).message,
          });
          return [];
        }
      });
    },
    {
      enabled: shouldEnable,
      staleTime: 1000 * 60 * 2,
      retry: (failureCount, error) => {
        if (error?.message?.includes('Admin authentication')) {
          return false;
        }
        return failureCount < 2;
      },
    },
  );
}

/**
 * Hook to get counts for both listing types
 */
export function useListingTypeCounts() {
  const { user, authChecked } = useAuth();

  const cachedAuthState = (() => {
    try {
      const cached = localStorage.getItem('user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  })();

  const isAdminUser = user?.is_admin === true || cachedAuthState?.is_admin === true;
  const shouldEnable = (authChecked || cachedAuthState) && isAdminUser;

  return useTabAwareQuery(
    ['admin-listings-counts'],
    async () => {
      if (!isAdminUser) {
        return { marketplace: 0, research: 0 };
      }

      const [marketplaceResult, researchResult] = await Promise.all([
        // Marketplace: public-facing with images
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .not('image_url', 'is', null)
          .neq('image_url', '')
          .eq('is_internal_deal', false),
        // Research: internal deals without images (remarketing)
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq('is_internal_deal', true),
      ]);

      return {
        marketplace: marketplaceResult.count || 0,
        research: researchResult.count || 0,
      };
    },
    {
      enabled: shouldEnable,
      staleTime: 1000 * 60 * 2,
    },
  );
}
