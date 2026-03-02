import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Realtime sync hook for firm_agreements changes.
 * Subscribes to firm_agreements updates and invalidates all related query keys
 * across buyer and admin screens.
 */
export function useAgreementStatusSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`agreement-sync:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'firm_agreements' },
        () => {
          invalidateAgreementQueries(queryClient, user.id);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}

/**
 * Invalidate all agreement-related query keys with staggered timing.
 * Called after signing confirmation and on realtime updates.
 */
export function invalidateAgreementQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  userId?: string,
) {
  const keys = [
    ['buyer-firm-agreement-status'],
    ['my-agreement-status'],
    ['buyer-nda-status'],
    ['agreement-pending-notifications'],
    ['user-notifications'],
    ['buyer-message-threads'],
    ['connection-messages'],
    ['buyer-signed-documents'],
    ['firm-agreements'],
    ['inbox-threads'],
    ['admin-document-tracking'],
    ['recent-agreement-signatures'],
    ['connection-request-firm'],
  ];

  // Immediate invalidation
  keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));

  // Staggered re-invalidation at 2s and 5s
  setTimeout(() => {
    keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  }, 2000);

  setTimeout(() => {
    keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  }, 5000);
}
