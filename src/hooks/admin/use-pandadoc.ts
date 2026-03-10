import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type PandaDocStatus = 'not_sent' | 'sent' | 'viewed' | 'signed' | 'declined';

/**
 * Hook to create a PandaDoc signing document (NDA or Fee Agreement).
 */
export function useCreatePandaDocDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      firmId,
      documentType,
      buyerEmail,
      buyerName,
      sendEmail,
    }: {
      firmId: string;
      documentType: 'nda' | 'fee_agreement';
      buyerEmail: string;
      buyerName: string;
      sendEmail: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('create-pandadoc-document', {
        body: {
          firmId,
          documentType,
          signerEmail: buyerEmail,
          signerName: buyerName,
          deliveryMode: sendEmail ? 'email' : 'embedded',
        },
      });

      if (error) throw error;
      return data as { success: boolean; documentId: string; sessionToken: string | null; embedUrl: string | null; documentType: string; deliveryMode: string };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-nda-status'] });
      queryClient.invalidateQueries({ queryKey: ['connection-request-firm'] });
      const docType = variables.documentType === 'nda' ? 'NDA' : 'Fee Agreement';
      const method = variables.sendEmail ? 'sent via email' : 'ready for signing';
      toast({
        title: `${docType} ${method}`,
        description: `Signing request ${method} to ${variables.buyerEmail}`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to create signing request',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to trigger auto-create-firm-on-approval edge function.
 */
export function useAutoCreateFirmOnApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { data, error } = await supabase.functions.invoke('auto-create-firm-on-approval', {
        body: { user_id: userId },
      });

      if (error) throw error;
      return data as {
        firm_id: string;
        firm_created: boolean;
        member_linked: boolean;
        nda_document_prepared: boolean;
        embed_url: string | null;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['firm-members'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}

/**
 * Hook to fetch NDA signing status for the current buyer.
 * Uses the canonical `get_user_firm_agreement_status` RPC
 * to deterministically resolve the correct firm.
 */
export function useBuyerNdaStatus(userId: string | undefined) {
  return useQuery({
    queryKey: ['buyer-nda-status', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase.rpc('get_user_firm_agreement_status', {
        p_user_id: userId,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.firm_id) {
        return { hasFirm: false, ndaSigned: false, embedUrl: null, firmId: null };
      }

      return {
        hasFirm: true,
        ndaSigned: row.nda_signed ?? false,
        pandadocStatus: row.nda_pandadoc_status,
        hasDocument: true,
        firmId: row.firm_id,
        embedUrl: null as string | null,
      };
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
