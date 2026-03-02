import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ─── useSendDocumentQuestion ───
// Sends a document-related question (NDA or fee agreement) as a message
// and notifies the admin via an edge function.

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

      const { data: activeRequest } = await supabase
        .from('connection_requests')
        .select('id')
        .eq('user_id', userId)
        .in('status', ['approved', 'on_hold', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { OZ_ADMIN_ID } = await import('@/constants');

      if (activeRequest) {
        const { error } = await supabase.from('connection_messages').insert({
          connection_request_id: activeRequest.id,
          sender_id: userId,
          body: messageBody,
          sender_role: 'buyer',
        });
        if (error) throw error;
      } else {
        console.warn('No active connection request found for document question');
      }

      await supabase.functions.invoke('notify-admin-document-question', {
        body: {
          admin_id: OZ_ADMIN_ID,
          user_id: userId,
          document_type: docLabel,
          question,
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Question Sent', description: 'Our team will review and respond shortly.' });
      queryClient.invalidateQueries({ queryKey: ['buyer-message-threads'] });
      queryClient.invalidateQueries({ queryKey: ['connection-messages'] });
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
// Downloads a document (NDA or fee agreement) by fetching its URL from the edge function.
// Returns a helper that can be called with the document info.

export function useDownloadDocument() {
  const { toast } = useToast();

  const download = async ({
    documentUrl,
    draftUrl,
    documentType,
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

    try {
      const { data, error } = await supabase.functions.invoke(
        'get-document-download',
        { body: { document_type: documentType } },
      );

      if (error) {
        toast({
          title: 'Download Failed',
          description: 'Could not retrieve document.',
          variant: 'destructive',
        });
        return;
      }

      if (data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        toast({
          title: 'Not Available',
          description: 'Document is not yet available for download.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Download Failed',
        description: 'Something went wrong.',
        variant: 'destructive',
      });
    }
  };

  return download;
}
