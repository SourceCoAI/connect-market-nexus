import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useEffect } from 'react';

// TODO: Phase 6 — migrate admin_view_state read to data access layer: getAdminLastViewed() from '@/lib/data-access'
// The first query (.from('admin_view_state')) maps directly to getAdminLastViewed(adminId, 'connection_requests').
// The second query (.from('connection_requests') count) has no data access equivalent yet.
export function useUnviewedConnectionRequests() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['unviewed-connection-requests-count'],
    queryFn: async () => {
      if (!user?.id) return 0;

      // Get the admin's last viewed timestamp
      const { data: viewData, error: viewDataError } = await supabase
        .from('admin_view_state')
        .select('last_viewed_at')
        .eq('admin_id', user.id)
        .eq('view_type', 'connection_requests')
        .maybeSingle();
      if (viewDataError) throw viewDataError;

      const lastViewedAt = viewData?.last_viewed_at;

      // If never viewed, count all requests
      // If viewed before, count requests created after that timestamp
      let query = supabase
        .from('connection_requests')
        .select('id', { count: 'exact', head: true });

      if (lastViewedAt) {
        query = query.gt('created_at', lastViewedAt);
      }

      const { count, error } = await query;

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
    staleTime: 30000, // 30 seconds
  });

  // Set up real-time subscription for new connection requests
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('connection-requests-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_requests',
        },
        () => {
          // Invalidate the query to refetch the count
          query.refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    unviewedCount: query.data || 0,
    isLoading: query.isLoading,
  };
}
