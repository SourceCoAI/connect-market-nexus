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
    refetchInterval: 30000, // Poll every 30s for new messages
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
    },
    onError: (err: Error) => {
      toast({ title: 'Error sending message', description: err.message, variant: 'destructive' });
    },
  });
}
