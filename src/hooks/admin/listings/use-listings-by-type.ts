import { supabase } from '@/integrations/supabase/client';
import { AdminListing } from '@/types/admin';
import { toast } from '@/hooks/use-toast';
import { withPerformanceMonitoring } from '@/lib/performance-monitor';
import { useAuth } from '@/contexts/AuthContext';
import { useTabAwareQuery } from '@/hooks/use-tab-aware-query';

export type ListingType = 'ready_to_publish' | 'live' | 'internal' | 'all';

/**
 * Hook for fetching admin listings filtered by type:
 * - ready_to_publish: Marketplace listings not yet published (is_internal_deal=false, published_at IS NULL)
 * - live: Published marketplace listings (is_internal_deal=false, published_at IS NOT NULL)
 * - internal: Remarketing deals (is_internal_deal=true)
 * - all: Everything
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
              'id, title, description, category, categories, status, revenue, ebitda, image_url, is_internal_deal, created_at, updated_at, location, internal_company_name, deal_owner_id, published_at',
            )
            .is('deleted_at', null);

          // Filter by listing type
          if (type === 'ready_to_publish') {
            query = query.eq('is_internal_deal', false).is('published_at', null);
          } else if (type === 'live') {
            query = query.eq('is_internal_deal', false).not('published_at', 'is', null);
          } else if (type === 'internal') {
            query = query.eq('is_internal_deal', true);
          }
          // type === 'all': no additional filter

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
 * Hook to get counts for listing types
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
        return { ready_to_publish: 0, live: 0, internal: 0 };
      }

      const [readyResult, liveResult, internalResult] = await Promise.all([
        // Ready to publish: marketplace listings not yet published
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq('is_internal_deal', false)
          .is('published_at', null),
        // Live: published marketplace listings
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq('is_internal_deal', false)
          .not('published_at', 'is', null),
        // Internal: remarketing deals
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq('is_internal_deal', true),
      ]);

      return {
        ready_to_publish: readyResult.count || 0,
        live: liveResult.count || 0,
        internal: internalResult.count || 0,
      };
    },
    {
      enabled: shouldEnable,
      staleTime: 1000 * 60 * 2,
    },
  );
}
