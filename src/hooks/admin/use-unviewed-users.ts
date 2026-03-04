import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useEffect } from 'react';

// TODO: Phase 6 — migrate admin_view_state read to data access layer: getAdminLastViewed() from '@/lib/data-access'
// The first query (.from('admin_view_state')) maps directly to getAdminLastViewed(adminId, 'users').
// The second query (.from('profiles') count) has no data access equivalent yet — needs a
// getProfileCount() or similar function before full migration.
export function useUnviewedUsers() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['unviewed-users-count'],
    queryFn: async () => {
      if (!user?.id) return 0;

      // Get the admin's last viewed timestamp
      const { data: viewData, error: viewDataError } = await supabase
        .from('admin_view_state')
        .select('last_viewed_at')
        .eq('admin_id', user.id)
        .eq('view_type', 'users')
        .maybeSingle();
      if (viewDataError) throw viewDataError;

      const lastViewedAt = viewData?.last_viewed_at;

      // If never viewed, count all users (excluding deleted and current admin)
      // If viewed before, count users created after that timestamp
      let query = supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .neq('id', user.id);

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

  // Set up real-time subscription for new user registrations
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('profiles-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profiles',
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
