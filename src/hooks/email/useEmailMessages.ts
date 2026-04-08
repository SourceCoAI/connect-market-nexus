/**
 * Hook for fetching and managing email messages for a contact or deal.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { EmailMessage, EmailThread, SendEmailRequest } from '@/types/email';

const PAGE_SIZE = 20;

export function useEmailMessages(contactId: string | undefined) {
  const { user } = useAuth();

  return useInfiniteQuery({
    queryKey: ['email', 'messages', contactId],
    queryFn: async ({ pageParam = 0 }): Promise<EmailMessage[]> => {
      if (!contactId) return [];

      const { data, error } = await (supabase as any)
        .from('email_messages')
        .select('*')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (lastPage: EmailMessage[], allPages: EmailMessage[][]) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
    initialPageParam: 0,
    enabled: !!contactId && !!user?.id,
  });
}

export function useEmailThreads(contactId: string | undefined, additionalContactIds?: string[]) {
  const { user } = useAuth();
  const allContactIds = contactId
    ? [contactId, ...(additionalContactIds || [])]
    : [];

  return useQuery({
    queryKey: ['email', 'threads', ...allContactIds],
    queryFn: async (): Promise<EmailThread[]> => {
      if (allContactIds.length === 0) return [];

      // Use .in() for multiple contacts, .eq() for single
      let query = (supabase as any)
        .from('email_messages')
        .select('*')
        .order('sent_at', { ascending: false });

      if (allContactIds.length === 1) {
        query = query.eq('contact_id', allContactIds[0]);
      } else {
        query = query.in('contact_id', allContactIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Group by conversation ID into threads
      const threadMap = new Map<string, EmailMessage[]>();
      for (const msg of data as EmailMessage[]) {
        const key = msg.microsoft_conversation_id || msg.id;
        if (!threadMap.has(key)) {
          threadMap.set(key, []);
        }
        threadMap.get(key)!.push(msg);
      }

      // Convert to thread objects
      const threads: EmailThread[] = [];
      for (const [conversationId, messages] of threadMap) {
        // Sort messages within thread by date ascending
        messages.sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
        const lastMessage = messages[messages.length - 1];
        const allParticipants = new Set<string>();
        for (const m of messages) {
          allParticipants.add(m.from_address);
          m.to_addresses.forEach((a) => allParticipants.add(a));
        }

        threads.push({
          conversationId,
          subject: messages[0].subject || '(No subject)',
          lastMessageAt: lastMessage.sent_at,
          messageCount: messages.length,
          lastPreview: (lastMessage.body_text || lastMessage.body_html || '').slice(0, 100),
          participants: Array.from(allParticipants),
          messages,
        });
      }

      // Sort threads by last message date descending
      threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
      return threads;
    },
    enabled: !!contactId && !!user?.id,
  });
}

export function useDealEmailActivity(dealId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['email', 'deal-activity', dealId],
    queryFn: async (): Promise<EmailMessage[]> => {
      if (!dealId) return [];

      const { data, error } = await (supabase as any)
        .from('email_messages')
        .select('*')
        .eq('deal_id', dealId)
        .order('sent_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!dealId && !!user?.id,
  });
}

export function useSendEmail() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: SendEmailRequest) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const resp = await supabase.functions.invoke('outlook-send-email', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: request,
      });

      if (resp.error) throw new Error(resp.error.message || 'Failed to send email');
      return resp.data?.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['email', 'messages', variables.contactId] });
      queryClient.invalidateQueries({ queryKey: ['email', 'threads', variables.contactId] });
      if (variables.dealId) {
        queryClient.invalidateQueries({ queryKey: ['email', 'deal-activity', variables.dealId] });
      }
      toast({
        title: 'Email Sent',
        description: 'Your email has been sent successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Send Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useLogEmailAccess() {
  return useMutation({
    mutationFn: async ({ emailMessageId, action }: { emailMessageId: string; action: 'viewed' | 'sent' | 'replied' }) => {
      const { error } = await (supabase as any)
        .from('email_access_log')
        .insert({
          sourceco_user_id: (await supabase.auth.getUser()).data.user?.id,
          email_message_id: emailMessageId,
          action,
        });

      if (error) throw error;
    },
  });
}
