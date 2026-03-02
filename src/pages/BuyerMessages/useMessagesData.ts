import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAgreementStatusSync } from '@/hooks/use-agreement-status-sync';
import type { BuyerThread } from './helpers';

// Internal listing used for general inquiry threads -- not a real deal
export const GENERAL_INQUIRY_LISTING_ID = '00000000-0000-0000-0000-000000000001';

// ─── useResolvedThreadId ───
// Calls the resolve-buyer-message-thread edge function to guarantee a thread ID.
// Caches the result so it's only called once per session.

export function useResolvedThreadId() {
  return useQuery({
    queryKey: ['resolved-thread-id'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('resolve-buyer-message-thread');
      if (error) throw error;
      return data as { connection_request_id: string; source: string };
    },
    staleTime: 5 * 60_000, // Cache for 5 minutes
    retry: 2,
  });
}

// ─── useBuyerThreads ───
// Fetches the list of conversation threads for the current buyer,
// including unread counts and a realtime subscription for new messages.

export function useBuyerThreads() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Realtime subscription for new messages
  useEffect(() => {
    if (!user?.id) return undefined;
    const channel = supabase
      .channel(`buyer-threads:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'connection_messages' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['buyer-message-threads'] });
          queryClient.invalidateQueries({ queryKey: ['unread-buyer-message-counts'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return useQuery<BuyerThread[]>({
    queryKey: ['buyer-message-threads', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: requests, error: reqError } = await supabase
        .from('connection_requests')
        .select(
          `id, status, listing_id, user_message, created_at,
          last_message_at, last_message_preview, last_message_sender_role,
          listing:listings!connection_requests_listing_id_fkey(title, category)`,
        )
        .eq('user_id', user.id)
        .in('status', ['pending', 'approved', 'on_hold', 'rejected'])
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (reqError || !requests) return [];

      const requestIds = requests.map((r: Record<string, unknown>) => r.id as string);
      let unreadMsgs: Record<string, unknown>[] | null = null;
      if (requestIds.length > 0) {
        const { data } = await supabase
          .from('connection_messages')
          .select('connection_request_id')
          .in('connection_request_id', requestIds)
          .eq('is_read_by_buyer', false)
          .eq('sender_role', 'admin');
        unreadMsgs = data;
      }

      const unreadMap: Record<string, number> = {};
      (unreadMsgs || []).forEach((msg: Record<string, unknown>) => {
        const reqId = msg.connection_request_id as string;
        unreadMap[reqId] = (unreadMap[reqId] || 0) + 1;
      });

      const threads: BuyerThread[] = requests.map((req: Record<string, unknown>) => ({
        connection_request_id: req.id as string,
        deal_title: ((req.listing as Record<string, unknown>)?.title as string) || 'Untitled Deal',
        deal_category: ((req.listing as Record<string, unknown>)?.category as string) ?? undefined,
        request_status: req.status as string,
        listing_id: (req.listing_id as string) ?? '',
        last_message_body:
          (req.last_message_preview as string) || (req.user_message as string) || '',
        last_message_at: (req.last_message_at as string) || (req.created_at as string),
        last_sender_role: (req.last_message_sender_role as string) || 'buyer',
        unread_count: unreadMap[req.id as string] || 0,
      }));

      // Filter out internal general-inquiry listing so it doesn't appear as a real deal
      const realThreads = threads.filter(t => t.listing_id !== GENERAL_INQUIRY_LISTING_ID);

      return realThreads.sort((a, b) => {
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (a.unread_count === 0 && b.unread_count > 0) return 1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });
    },
    enabled: !!user?.id,
    staleTime: 15000,
  });
}

// ─── useBuyerActiveRequest ───
// Fetches the most recent active connection request for the current buyer.
// Used by GeneralChatView to determine where to send general inquiry messages.

export function useBuyerActiveRequest() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['buyer-active-request', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('connection_requests')
        .select('id')
        .eq('user_id', user.id)
        .in('status', ['approved', 'on_hold', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });
}

// ─── useFirmAgreementStatus ───
// Fetches the firm agreement status (NDA + fee agreement) for the current buyer.
// Uses deterministic firm selection: picks the firm linked to the most recent active request,
// or falls back to the most recently added firm membership.

export function useFirmAgreementStatus() {
  const { user } = useAuth();
  useAgreementStatusSync();

  return useQuery({
    queryKey: ['buyer-firm-agreement-status', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Use canonical firm resolver RPC
      const { data, error } = await supabase.rpc('get_user_firm_agreement_status', {
        p_user_id: user.id,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.firm_id) return null;

      return row;
    },
    enabled: !!user?.id,
    staleTime: 15_000,
  });
}

// ─── usePendingNotifications ───
// Fetches agreement-pending notifications for the current buyer.

export function usePendingNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['agreement-pending-notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('notification_type', 'agreement_pending')
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!user?.id,
  });
}
