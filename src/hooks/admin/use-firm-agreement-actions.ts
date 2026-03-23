import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

/**
 * Unified hook for updating NDA/Fee agreements at the FIRM level.
 * Resolves user → firm automatically via firm_members or email domain.
 * Falls back to creating a new firm if none found.
 */

interface UpdateAgreementParams {
  userId: string;
  agreementType: 'nda' | 'fee_agreement';
  action: 'sign' | 'unsign' | 'email_sent' | 'email_unsent';
  adminNotes?: string;
}

interface AgreementResult {
  success: boolean;
  firm_id: string;
  firm_name: string;
  action: string;
  agreement_type: string;
  user_name: string;
}

export function useUpdateAgreementViaUser() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, agreementType, action, adminNotes }: UpdateAgreementParams) => {
      const { data, error } = await supabase.rpc('update_agreement_via_user', {
        p_user_id: userId,
        p_agreement_type: agreementType,
        p_action: action,
        p_admin_notes: adminNotes || undefined,
      });

      if (error) throw error;
      return data as unknown as AgreementResult;
    },
    onSuccess: (data) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['connection-request-details'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal-activities'] });
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['firm-members'] });
      queryClient.invalidateQueries({ queryKey: ['my-agreement-status'] });
      queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });

      const typeLabel = data.agreement_type === 'nda' ? 'NDA' : 'Fee Agreement';
      const actionLabel = (() => {
        switch (data.action) {
          case 'sign':
            return 'marked as signed';
          case 'unsign':
            return 'revoked';
          case 'email_sent':
            return 'email marked as sent';
          case 'email_unsent':
            return 'email marked as not sent';
          default:
            return 'updated';
        }
      })();

      toast({
        title: `${typeLabel} ${actionLabel}`,
        description: `Applied to firm: ${data.firm_name}`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error?.message || 'Could not update agreement status',
      });
    },
  });
}

/**
 * Fetch the firm a user belongs to (for display in toggle UI).
 * Uses the canonical `resolve_user_firm_id` RPC to find the firm,
 * then fetches the full firm_agreements record.
 *
 * Resolution priority (inside the RPC):
 *   email domain match → normalized company name match → latest firm_member.
 */
export function useUserFirm(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-firm', userId],
    queryFn: async () => {
      if (!userId) return null;

      // Step 1: Resolve firm via canonical RPC
      const { data: firmId, error: rpcError } = await supabase.rpc('resolve_user_firm_id', {
        p_user_id: userId,
      });

      if (rpcError) throw rpcError;
      if (!firmId) return null;

      // Step 2: Fetch firm details
      const { data: firm, error: firmError } = await supabase
        .from('firm_agreements')
        .select(
          `
          id, primary_company_name, 
          nda_signed, nda_signed_at, nda_signed_by_name, nda_email_sent, nda_email_sent_at, nda_status,
          fee_agreement_signed, fee_agreement_signed_at, fee_agreement_signed_by_name, 
          fee_agreement_email_sent, fee_agreement_email_sent_at, fee_agreement_status
        `,
        )
        .eq('id', firmId)
        .maybeSingle();

      if (firmError) throw firmError;
      return firm || null;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
