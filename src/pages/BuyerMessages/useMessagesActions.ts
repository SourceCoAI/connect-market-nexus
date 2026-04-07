import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ─── resolveThreadId ───
async function resolveThreadId(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('resolve-buyer-message-thread');
  if (error) throw new Error('Failed to resolve message thread');
  return data?.connection_request_id;
}

// ─── useSendDocumentQuestion ───
export function useSendDocumentQuestion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      documentType,
      question,
      userId,
    }: {
      documentType: 'nda' | 'fee_agreement';
      question: string;
      userId: string;
    }) => {
      const docLabel = documentType === 'nda' ? 'NDA' : 'Fee Agreement';
      const messageBody = `\u{1F4C4} Question about ${docLabel}:\n\n${question}`;

      const threadId = await resolveThreadId();

      const { error } = await supabase.from('connection_messages').insert({
        connection_request_id: threadId,
        sender_id: userId,
        body: messageBody,
        sender_role: 'buyer',
      });
      if (error) throw error;

      const { OZ_ADMIN_ID } = await import('@/constants');
      supabase.functions.invoke('notify-admin-document-question', {
        body: {
          admin_id: OZ_ADMIN_ID,
          user_id: userId,
          document_type: docLabel,
          question,
          connection_request_id: threadId,
        },
      }).catch((err) => console.warn('Admin notification failed:', err));
    },
    onSuccess: () => {
      toast({ title: 'Question Sent', description: 'Our team will review and respond shortly.' });
      queryClient.invalidateQueries({ queryKey: ['buyer-message-threads'] });
      queryClient.invalidateQueries({ queryKey: ['connection-messages'] });
      queryClient.invalidateQueries({ queryKey: ['resolved-thread-id'] });
    },
    onError: () => {
      toast({
        title: 'Failed to Send',
        description: 'Please try again or contact support.',
        variant: 'destructive',
      });
    },
  });
}

// ─── useDownloadDocument ───
// Downloads a document using stored URLs (no edge function dependency).
export function useDownloadDocument() {
  const { toast } = useToast();

  const download = async ({
    documentUrl,
    draftUrl,
    documentType: _documentType,
  }: {
    documentUrl: string | null;
    draftUrl: string | null;
    documentType: 'nda' | 'fee_agreement';
  }) => {
    const cachedUrl = documentUrl || draftUrl;
    if (cachedUrl && cachedUrl.startsWith('https://')) {
      window.open(cachedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // No URL available — inform the user
    toast({
      title: 'Not Available',
      description: 'Document is not yet available for download. Contact support@sourcecodeals.com for a copy.',
      variant: 'destructive',
    });
  };

  return download;
}
