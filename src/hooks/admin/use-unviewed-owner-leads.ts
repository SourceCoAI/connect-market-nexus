import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

// TODO: Phase 6 — migrate admin_view_state read to data access layer: getAdminLastViewed() from '@/lib/data-access'
// The first query (.from('admin_view_state')) maps to getAdminLastViewed(adminId, 'owner_leads').
// The second query (.from('inbound_leads') count) has no data access equivalent yet.
export function useUnviewedOwnerLeads() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['unviewed-owner-leads-count'],
    queryFn: async () => {
      if (!user?.id) return 0;

      // Get the admin's last viewed timestamp
      const { data: viewData, error: viewDataError } = await supabase
        .from('admin_view_state')
        .select('last_viewed_at')
        .eq('admin_id', user.id)
        .eq('view_type', 'owner_leads')
        .maybeSingle();
      if (viewDataError) throw viewDataError;

      const lastViewedAt = viewData?.last_viewed_at;

      // Count owner leads created after last view
      let queryBuilder = supabase
        .from('inbound_leads')
        .select('id', { count: 'exact', head: true })
        .eq('lead_type', 'owner');

      if (lastViewedAt) {
        queryBuilder = queryBuilder.gt('created_at', lastViewedAt);
      }

      const { count, error } = await queryBuilder;

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  // Set up real-time subscription for new owner leads
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('owner-leads-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbound_leads',
          filter: 'lead_type=eq.owner',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['unviewed-owner-leads-count'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return {
    unviewedCount: query.data || 0,
    isLoading: query.isLoading,
  };
}
