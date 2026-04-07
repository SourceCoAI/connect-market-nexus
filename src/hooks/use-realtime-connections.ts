
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export function useRealtimeConnections() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Phase 86: Only subscribe to this user's connection requests (not all users')
    // Admins still get INSERT events for the admin table, but no buyer toasts.
    const updateFilter = user?.id ? `user_id=eq.${user.id}` : undefined;

    const channel = supabase
      .channel('connection-requests-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_requests',
        },
        (_payload) => {
          // Invalidate all connection-related queries
          queryClient.invalidateQueries({ queryKey: ['connection-status'] });
          queryClient.invalidateQueries({ queryKey: ['user-connection-requests'] });
          queryClient.invalidateQueries({ queryKey: ['admin-connection-requests'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'connection_requests',
          // Phase 86: Only listen to updates for this buyer's own requests
          ...(updateFilter ? { filter: updateFilter } : {}),
        },
        (payload) => {
          // Phase 86: Only show toasts for non-admin users (buyers)
          if (!isAdmin && payload.old?.status !== payload.new?.status) {
            const newStatus = payload.new.status;
            if (newStatus === 'approved') {
              toast({
                title: 'Connection Approved! ✅',
                description: 'Your connection request has been approved.',
              });
            } else if (newStatus === 'rejected') {
              toast({
                title: 'Connection Update',
                description: 'Your connection request status has been updated.',
                variant: 'destructive',
              });
            }
          }

          // Invalidate all connection-related queries
          queryClient.invalidateQueries({ queryKey: ['connection-status'] });
          queryClient.invalidateQueries({ queryKey: ['user-connection-requests'] });
          queryClient.invalidateQueries({ queryKey: ['admin-connection-requests'] });
          queryClient.invalidateQueries({ queryKey: ['user-notifications'] });
        },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
      setIsConnected(false);
    };
  }, [queryClient, user?.id, isAdmin]);

  return { isConnected };
}
