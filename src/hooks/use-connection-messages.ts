/**
 * Hooks for in-platform connection request messaging.
 * Supports both admin and buyer sides.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export interface ConnectionMessage {
  id: string;
  connection_request_id: string;
  sender_id: string;
  sender_role: 'admin' | 'buyer';
  body: string;
  message_type: 'message' | 'decision' | 'system';
  is_read_by_buyer: boolean;
  is_read_by_admin: boolean;
  created_at: string;
  // Joined
  sender?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
}

// ─── Fetch messages for a single request ───

export function useConnectionMessages(connectionRequestId: string | undefined) {
  const queryClient = useQueryClient();

  // Subscribe to realtime inserts
  useEffect(() => {
    if (!connectionRequestId) return;

    const channel = supabase
      .channel(`messages:${connectionRequestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_messages',
          filter: `connection_request_id=eq.${connectionRequestId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ['connection-messages', connectionRequestId],
          });
          queryClient.invalidateQueries({ queryKey: ['unread-message-counts'] });
          queryClient.invalidateQueries({ queryKey: ['unread-buyer-message-counts'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'connection_messages',
          filter: `connection_request_id=eq.${connectionRequestId}`,
        },
        () => {
          // Re-fetch when messages are updated (e.g. read receipts change)
          queryClient.invalidateQueries({
            queryKey: ['connection-messages', connectionRequestId],
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [connectionRequestId, queryClient]);

  return useQuery({
    queryKey: ['connection-messages', connectionRequestId],
    queryFn: async () => {
      if (!connectionRequestId) return [];
      const { data, error } = await supabase
        .from('connection_messages' as never)
        .select(
          `
          *,
          sender:profiles!connection_messages_sender_id_fkey(first_name, last_name, email)
        `,
        )
        .eq('connection_request_id', connectionRequestId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as ConnectionMessage[];
    },
    enabled: !!connectionRequestId,
  });
}

// ─── Send a message ───

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      connection_request_id: string;
      body: string;
      sender_role: 'admin' | 'buyer';
      message_type?: 'message' | 'decision' | 'system';
    }) => {
      // Prevent empty messages
      if (!params.body || !params.body.trim()) {
        throw new Error('Message cannot be empty');
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('connection_messages' as never)
        .insert({
          connection_request_id: params.connection_request_id,
          sender_id: user.id,
          sender_role: params.sender_role,
          body: params.body,
          message_type: params.message_type || 'message',
          is_read_by_admin: params.sender_role === 'admin',
          is_read_by_buyer: params.sender_role === 'buyer',
        } as never)
        .select()
        .single();

      if (error) throw error;

      // Send email notification to the other party.
      // Fire-and-forget: don't block the UI on email delivery.
      if (params.sender_role === 'admin') {
        // Resolve admin's full name, buyer name, and deal title for emails
        let adminFullName = user?.email?.split('@')[0] || 'Admin';
        let buyerName = 'Buyer';
        let dealTitle = 'General';

        try {
          // Get admin profile name
          const { data: adminProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
            .single();
          if (adminProfile) {
            const name = `${adminProfile.first_name || ''} ${adminProfile.last_name || ''}`.trim();
            if (name) adminFullName = name;
          }
          // Fallback to static admin profiles map
          if (adminFullName === user?.email?.split('@')[0]) {
            const { getAdminProfile } = await import('@/lib/admin-profiles');
            const staticProfile = getAdminProfile(user.email || '');
            if (staticProfile?.name) adminFullName = staticProfile.name;
          }

          // Get buyer name and deal title from connection request
          const { data: connReq } = await supabase
            .from('connection_requests')
            .select('user_id, listing_id')
            .eq('id', params.connection_request_id)
            .single();
          if (connReq) {
            const { data: buyerProfile } = await supabase
              .from('profiles')
              .select('first_name, last_name, email')
              .eq('id', connReq.user_id as string)
              .single();
            if (buyerProfile) {
              const bName = `${buyerProfile.first_name || ''} ${buyerProfile.last_name || ''}`.trim();
              buyerName = bName || buyerProfile.email || 'Buyer';
            }
            if (connReq.listing_id) {
              const { data: listing } = await supabase
                .from('listings')
                .select('title')
                .eq('id', connReq.listing_id)
                .single();
              if (listing?.title) dealTitle = listing.title;
            }
          }
        } catch (e) {
          console.warn('Failed to resolve email context names:', e);
        }

        supabase.functions
          .invoke('notify-buyer-new-message', {
            body: {
              connection_request_id: params.connection_request_id,
              message_preview: params.body.substring(0, 200),
              admin_name: adminFullName,
            },
          })
          .then(({ error: fnError }) => {
            if (fnError) {
              console.error('Failed to send buyer message notification email:', fnError);
            }
          })
          .catch((err: unknown) => {
            console.error('Error invoking notify-buyer-new-message:', err);
          });

        // Notify support inbox so other admins see the reply
        supabase.functions
          .invoke('notify-support-inbox', {
            body: {
              type: 'admin_reply',
              buyerName,
              adminName: adminFullName,
              dealTitle,
              messagePreview: params.body.substring(0, 200),
            },
          })
          .catch((err: unknown) => console.warn('notify-support-inbox error:', err));
      } else {
        // Buyer sent a message — notify support inbox
        supabase.functions
          .invoke('notify-support-inbox', {
            body: {
              type: 'new_message',
              buyerName: user?.email || 'Buyer',
              buyerEmail: user?.email,
              messagePreview: params.body.substring(0, 200),
            },
          })
          .catch((err: unknown) => console.warn('notify-support-inbox error:', err));
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['connection-messages', variables.connection_request_id],
      });
      queryClient.invalidateQueries({ queryKey: ['unread-message-counts'] });
      queryClient.invalidateQueries({ queryKey: ['unread-buyer-message-counts'] });
      queryClient.invalidateQueries({ queryKey: ['message-center-threads'] });
    },
  });
}

// ─── Mark messages as read (admin side) ───

export function useMarkMessagesReadByAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionRequestId: string) => {
      const { error } = await supabase
        .from('connection_messages' as never)
        .update({ is_read_by_admin: true } as never)
        .eq('connection_request_id', connectionRequestId)
        .eq('is_read_by_admin', false);

      if (error) throw error;
    },
    onSuccess: (_, connectionRequestId) => {
      queryClient.invalidateQueries({
        queryKey: ['connection-messages', connectionRequestId],
      });
      queryClient.invalidateQueries({ queryKey: ['unread-message-counts'] });
      queryClient.invalidateQueries({ queryKey: ['message-center-threads'] });
    },
  });
}

// ─── Mark messages as read (buyer side) ───

export function useMarkMessagesReadByBuyer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionRequestId: string) => {
      const { error } = await supabase
        .from('connection_messages' as never)
        .update({ is_read_by_buyer: true } as never)
        .eq('connection_request_id', connectionRequestId)
        .eq('is_read_by_buyer', false);

      if (error) throw error;
    },
    onSuccess: (_, connectionRequestId) => {
      queryClient.invalidateQueries({
        queryKey: ['connection-messages', connectionRequestId],
      });
      queryClient.invalidateQueries({ queryKey: ['unread-message-counts'] });
      queryClient.invalidateQueries({ queryKey: ['unread-buyer-message-counts'] });
    },
  });
}

// ─── Unread counts (admin side — used for sidebar badge + request card indicator) ───

export function useUnreadMessageCounts() {
  return useQuery({
    queryKey: ['unread-message-counts'],
    queryFn: async () => {
      // Fetch all unread-by-admin messages grouped by request
      const { data, error } = await supabase
        .from('connection_messages' as never)
        .select('connection_request_id')
        .eq('is_read_by_admin', false)
        .eq('sender_role', 'buyer');

      if (error) throw error;

      const byRequest: Record<string, number> = {};
      let total = 0;
      ((data || []) as Array<{ connection_request_id: string }>).forEach((row) => {
        byRequest[row.connection_request_id] = (byRequest[row.connection_request_id] || 0) + 1;
        total++;
      });

      return { byRequest, total };
    },
    staleTime: 30000,
  });
}

// ─── Unread counts (buyer side — used for My Requests badges) ───

export function useUnreadBuyerMessageCounts() {
  return useQuery({
    queryKey: ['unread-buyer-message-counts'],
    queryFn: async () => {
      // First get the current user's connection request IDs
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { byRequest: {} as Record<string, number>, total: 0 };

      const GENERAL_INQUIRY_LISTING_ID = '00000000-0000-0000-0000-000000000001';

      const { data: requests } = await supabase
        .from('connection_requests')
        .select('id, listing_id, last_message_sender_role, last_message_at')
        .eq('user_id', user.id);

      const requestIds = (requests || []).map((r) => r.id);
      if (requestIds.length === 0) return { byRequest: {} as Record<string, number>, total: 0, dealTotal: 0, messagesTotal: 0 };

      // Build a map of request_id -> listing_id
      const requestListingMap: Record<string, string | null> = {};
      (requests || []).forEach((r) => { requestListingMap[r.id] = r.listing_id; });

      const { data, error } = await supabase
        .from('connection_messages' as never)
        .select('connection_request_id')
        .eq('is_read_by_buyer', false)
        .eq('sender_role', 'admin')
        .not('message_type', 'in', '("decision","system")')
        .in('connection_request_id', requestIds);

      if (error) throw error;

      const byRequest: Record<string, number> = {};
      let total = 0;
      let dealTotal = 0;
      let messagesTotal = 0;
      ((data || []) as Array<{ connection_request_id: string }>).forEach((row) => {
        byRequest[row.connection_request_id] = (byRequest[row.connection_request_id] || 0) + 1;
        total++;
        const listingId = requestListingMap[row.connection_request_id];
        if (listingId === GENERAL_INQUIRY_LISTING_ID) {
          messagesTotal++;
        } else {
          dealTotal++;
        }
      });

      return { byRequest, total, dealTotal, messagesTotal };
    },
    staleTime: 30000,
  });
}

// ─── Message Center thread list (admin) ───

export interface MessageThread {
  connection_request_id: string;
  buyer_name: string;
  buyer_company: string | null;
  buyer_email: string | null;
  deal_title: string | null;
  request_status: string;
  last_message_body: string;
  last_message_at: string;
  last_sender_role: string;
  unread_count: number;
}

export function useMessageCenterThreads() {
  return useQuery({
    queryKey: ['message-center-threads'],
    queryFn: async () => {
      // Fetch all messages with request + buyer + listing info
      const { data: messages, error } = await supabase
        .from('connection_messages' as never)
        .select(
          `
          id, connection_request_id, sender_role, body, message_type,
          is_read_by_admin, created_at,
          request:connection_requests!inner(
            id, status, user_id, listing_id,
            user:profiles!connection_requests_user_id_profiles_fkey(first_name, last_name, email, company),
            listing:listings!connection_requests_listing_id_fkey(title)
          )
        `,
        )
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) throw error;

      // Group by connection_request_id and build thread summaries
      const threadMap = new Map<string, MessageThread>();

      interface ThreadMessageRow {
        id: string;
        connection_request_id: string;
        sender_role: string;
        body: string;
        message_type: string;
        is_read_by_admin: boolean;
        created_at: string;
        request?: {
          id: string;
          status: string;
          user_id: string | null;
          listing_id: string;
          user?: {
            first_name: string | null;
            last_name: string | null;
            email: string | null;
            company: string | null;
          } | null;
          listing?: { title: string | null } | null;
        } | null;
      }
      ((messages || []) as ThreadMessageRow[]).forEach((msg) => {
        const reqId = msg.connection_request_id;
        const req = msg.request;
        const user = req?.user;

        if (!threadMap.has(reqId)) {
          threadMap.set(reqId, {
            connection_request_id: reqId,
            buyer_name: user
              ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
              : 'Unknown',
            buyer_company: user?.company || null,
            buyer_email: user?.email || null,
            deal_title: req?.listing?.title || null,
            request_status: req?.status || 'pending',
            last_message_body: msg.body,
            last_message_at: msg.created_at,
            last_sender_role: msg.sender_role,
            unread_count: 0,
          });
        }

        // Count unread (buyer messages not read by admin)
        if (msg.sender_role === 'buyer' && !msg.is_read_by_admin) {
          const thread = threadMap.get(reqId)!;
          thread.unread_count++;
        }
      });

      // Sort: unread first, then by last message time
      return Array.from(threadMap.values()).sort((a, b) => {
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (a.unread_count === 0 && b.unread_count > 0) return 1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });
    },
    staleTime: 30000,
  });
}
