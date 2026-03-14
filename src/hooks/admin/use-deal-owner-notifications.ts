import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Hook to listen for deal assignment notifications and update the UI.
 *
 * Email notifications are sent exclusively by the direct edge-function call
 * in useDealMutations.ts (notify-deal-owner-change). This Realtime listener
 * must NOT invoke edge functions because every open admin tab would fire
 * independently, causing duplicate emails (N times amplification).
 */
export function useDealOwnerNotifications() {
  useEffect(() => {
    const channel = supabase
      .channel('deal-owner-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_notifications',
          filter: 'notification_type=eq.deal_assignment'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          const notification = payload.new;
          const metadata = notification.metadata;

          if (!metadata) return;

          // UI-only: log for debugging. Email is sent by useDealMutations.ts.
          console.debug('[DealOwnerNotifications] New deal assignment notification received:', metadata.deal_id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_notifications',
          filter: 'notification_type=eq.deal_reassignment'
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          const notification = payload.new;
          const metadata = notification.metadata;

          if (!metadata || !metadata.previous_owner_email) return;

          // UI-only: log for debugging. Email is sent by useDealMutations.ts.
          console.debug('[DealOwnerNotifications] Deal reassignment notification received:', metadata.deal_id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
