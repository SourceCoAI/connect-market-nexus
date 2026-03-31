import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export type AdminNotificationType =
  | 'task_assigned'
  | 'task_completed'
  | 'task_approved'
  | 'response_sent'
  | 'document_signing_requested'
  | 'document_completed'
  | 'remarketing_a_tier_match'
  | 'deal_assignment'
  | 'deal_reassignment'
  | 'alert_dismissed'
  | 'alert_snoozed'
  | 'document_question';

export interface AdminNotification {
  id: string;
  admin_id: string;
  notification_type: AdminNotificationType;
  title: string;
  message: string;
  is_read: boolean;
  read_at?: string;
  deal_id?: string;
  task_id?: string;
  user_id?: string;
  feedback_id?: string;
  action_url?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GroupedNotification extends AdminNotification {
  groupedCount?: number;
  groupedIds?: string[];
}

export function useAdminNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .eq('admin_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as AdminNotification[];
    },
  });

  // Real-time subscription for new notifications — filtered by admin_id
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      channel = supabase
        .channel('admin-notifications-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'admin_notifications',
            filter: `admin_id=eq.${user.id}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'admin_notifications',
            filter: `admin_id=eq.${user.id}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
          }
        )
        .subscribe();
    };

    setup();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Group notifications by deal and type
  const groupedNotifications = (query.data || []).reduce((acc, notification) => {
    // Group task_assigned notifications by deal_id
    if (notification.notification_type === 'task_assigned' && notification.deal_id) {
      const groupKey = `${notification.notification_type}-${notification.deal_id}`;
      const existing = acc.find(n => n.id === groupKey);
      
      if (existing && !notification.is_read) {
        existing.groupedCount = (existing.groupedCount || 1) + 1;
        existing.groupedIds = [...(existing.groupedIds || [existing.id]), notification.id];
        return acc;
      }
    }
    
    // Don't add if already grouped
    const isGrouped = acc.some(n => n.groupedIds?.includes(notification.id));
    if (!isGrouped) {
      // Create synthetic ID for grouped notifications
      if (notification.notification_type === 'task_assigned' && notification.deal_id && !notification.is_read) {
        acc.push({
          ...notification,
          id: `${notification.notification_type}-${notification.deal_id}`,
          groupedCount: 1,
          groupedIds: [notification.id],
        });
      } else {
        acc.push(notification);
      }
    }
    
    return acc;
  }, [] as GroupedNotification[]);

  const unreadCount = (query.data || []).filter(n => !n.is_read).length;

  return {
    notifications: groupedNotifications,
    unreadCount,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationIds: string | string[]) => {
      const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds];
      
      const { error } = await supabase
        .from('admin_notifications')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('admin_notifications')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('admin_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });
}
