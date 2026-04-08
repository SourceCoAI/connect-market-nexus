import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, untypedFrom } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PortalMessage {
  id: string;
  push_id: string;
  portal_org_id: string;
  sender_id: string;
  sender_type: 'admin' | 'portal_user';
  sender_name: string | null;
  message: string;
  created_at: string;
}

export interface DealMessageSummary {
  push_id: string;
  total: number;
  /** Number of messages from the "other side" that haven't been replied to */
  unread: number;
  latest_message: string | null;
  latest_sender_type: 'admin' | 'portal_user' | null;
  latest_at: string | null;
}

export function usePortalMessages(pushId: string | undefined) {
  return useQuery({
    queryKey: ['portal-messages', pushId],
    queryFn: async (): Promise<PortalMessage[]> => {
      if (!pushId) return [];
      const { data, error } = await untypedFrom('portal_deal_messages')
        .select('*')
        .eq('push_id', pushId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as PortalMessage[];
    },
    enabled: !!pushId,
    refetchInterval: 15000, // Poll every 15s for new messages
  });
}

export function usePortalMessageCount(pushId: string | undefined) {
  return useQuery({
    queryKey: ['portal-message-count', pushId],
    queryFn: async (): Promise<number> => {
      if (!pushId) return 0;
      const { count, error } = await untypedFrom('portal_deal_messages')
        .select('id', { count: 'exact', head: true })
        .eq('push_id', pushId);

      if (error) return 0;
      return count || 0;
    },
    enabled: !!pushId,
  });
}

/** Batch-fetch message summaries for all deals in a portal org.
 *  Returns per-deal: total count, unread count, latest message preview.
 *  "Unread" = messages from the other side after the viewer's last message. */
export function usePortalMessageSummaries(
  portalOrgId: string | undefined,
  viewerType: 'admin' | 'portal_user',
) {
  return useQuery({
    queryKey: ['portal-message-summaries', portalOrgId, viewerType],
    queryFn: async (): Promise<Record<string, DealMessageSummary>> => {
      if (!portalOrgId) return {};

      const { data, error } = await untypedFrom('portal_deal_messages')
        .select('id, push_id, sender_type, sender_name, message, created_at')
        .eq('portal_org_id', portalOrgId)
        .order('created_at', { ascending: true });

      if (error) return {};

      const messages = (data || []) as PortalMessage[];
      const summaries: Record<string, DealMessageSummary> = {};

      // Group by push_id
      for (const msg of messages) {
        if (!summaries[msg.push_id]) {
          summaries[msg.push_id] = {
            push_id: msg.push_id,
            total: 0,
            unread: 0,
            latest_message: null,
            latest_sender_type: null,
            latest_at: null,
          };
        }
        summaries[msg.push_id].total++;
        summaries[msg.push_id].latest_message = msg.message;
        summaries[msg.push_id].latest_sender_type = msg.sender_type;
        summaries[msg.push_id].latest_at = msg.created_at;
      }

      // Calculate unread: count trailing messages from the other side
      // (i.e., messages after the viewer's last message)
      const otherSide = viewerType === 'portal_user' ? 'admin' : 'portal_user';
      for (const pushId of Object.keys(summaries)) {
        const pushMessages = messages.filter((m) => m.push_id === pushId);
        // Find the viewer's last message timestamp
        let viewerLastAt: string | null = null;
        for (const m of pushMessages) {
          if (m.sender_type === viewerType) viewerLastAt = m.created_at;
        }
        // Count messages from the other side after viewer's last message
        let unread = 0;
        for (const m of pushMessages) {
          if (m.sender_type === otherSide) {
            if (!viewerLastAt || m.created_at > viewerLastAt) {
              unread++;
            }
          }
        }
        summaries[pushId].unread = unread;
      }

      return summaries;
    },
    enabled: !!portalOrgId,
    refetchInterval: 30000, // Poll every 30s at the list level
  });
}

export function useSendPortalMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      push_id: string;
      portal_org_id: string;
      sender_type: 'admin' | 'portal_user';
      sender_name?: string;
      message: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await untypedFrom('portal_deal_messages')
        .insert({
          push_id: input.push_id,
          portal_org_id: input.portal_org_id,
          sender_id: user.id,
          sender_type: input.sender_type,
          sender_name: input.sender_name || user.email,
          message: input.message.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await untypedFrom('portal_activity_log').insert({
        portal_org_id: input.portal_org_id,
        actor_id: user.id,
        actor_type: input.sender_type,
        action: 'message_sent',
        push_id: input.push_id,
        metadata: { actor_name: input.sender_name || user.email },
      });

      return data;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ['portal-messages', input.push_id] });
      queryClient.invalidateQueries({ queryKey: ['portal-message-count', input.push_id] });
      queryClient.invalidateQueries({ queryKey: ['portal-message-summaries', input.portal_org_id] });
    },
    onError: (err: Error) => {
      toast({ title: 'Error sending message', description: err.message, variant: 'destructive' });
    },
  });
}
