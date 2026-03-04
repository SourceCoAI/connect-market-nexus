import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useEffect } from 'react';

// TODO: Phase 6 — migrate admin_view_state read to data access layer: getAdminLastViewed() from '@/lib/data-access'
// The first query (.from('admin_view_state')) maps to getAdminLastViewed(adminId, 'deal_sourcing').
// The second query (.from('deal_sourcing_requests') count) has no data access equivalent yet.
export function useUnviewedDealSourcingCount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['unviewed-deal-sourcing-count'],
    queryFn: async () => {
      if (!user?.id) return 0;

      // Get admin's last viewed timestamp
      const { data: viewData, error: viewDataError } = await supabase
        .from('admin_view_state')
        .select('last_viewed_at')
        .eq('admin_id', user.id)
        .eq('view_type', 'deal_sourcing')
        .maybeSingle();
      if (viewDataError) throw viewDataError;

      const lastViewed = viewData?.last_viewed_at || '1970-01-01';

      // Count requests created after last viewed
      const { count, error } = await supabase
        .from('deal_sourcing_requests')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', lastViewed);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  // Real-time subscription for new requests
  useEffect(() => {
    const channel = supabase
      .channel('deal-sourcing-new-requests')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'deal_sourcing_requests',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['unviewed-deal-sourcing-count'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    unviewedCount: query.data || 0,
    isLoading: query.isLoading,
  };
}
