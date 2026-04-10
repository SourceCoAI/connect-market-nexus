import { supabase } from '@/integrations/supabase/client';
import { AdminListing } from '@/types/admin';
import { useAuth } from '@/contexts/AuthContext';
import { useTabAwareQuery } from '@/hooks/use-tab-aware-query';

/**
 * Fetches a FULL listing record by ID for the admin editor.
 * Unlike the list query which fetches summary columns,
 * this fetches all columns needed by ImprovedListingEditor.
 */
export function useAdminListingDetail(listingId: string | null) {
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
  const shouldEnable = !!(listingId && (authChecked || cachedAuthState) && isAdminUser);

  return useTabAwareQuery(
    ['admin-listing-detail', listingId],
    async () => {
      if (!listingId) return null;

      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', listingId)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      // Normalize categories
      const listing = {
        ...data,
        categories: data.categories || (data.category ? [data.category] : []),
      };

      return listing as unknown as AdminListing;
    },
    {
      enabled: shouldEnable,
      staleTime: 0, // Always refetch to get latest
    },
  );
}
