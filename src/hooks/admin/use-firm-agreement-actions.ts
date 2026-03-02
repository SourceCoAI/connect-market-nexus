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
 */
export function useUserFirm(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-firm', userId],
    queryFn: async () => {
      if (!userId) return null;

      // Try firm_members first
      const { data: membership, error: memErr } = await supabase
        .from('firm_members')
        .select(
          `
          firm_id,
          firm:firm_agreements!firm_members_firm_id_fkey(
            id, primary_company_name, 
            nda_signed, nda_signed_at, nda_signed_by_name, nda_email_sent, nda_email_sent_at, nda_status,
            fee_agreement_signed, fee_agreement_signed_at, fee_agreement_signed_by_name, 
            fee_agreement_email_sent, fee_agreement_email_sent_at, fee_agreement_status
          )
        `,
        )
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (memErr) throw memErr;
      const membershipData = membership as { firm_id: string; firm: AgreementResult | null } | null;
      if (membershipData?.firm) return membershipData.firm;

      const { data: profile } = await supabase
        .from('profiles')
        .select('email, company')
        .eq('id', userId)
        .maybeSingle();

      if (!profile?.email) return null;

      const domain = profile.email.split('@')[1];
      if (!domain) return null;

      const { data: firm } = await supabase
        .from('firm_agreements')
        .select(
          `
          id, primary_company_name,
          nda_signed, nda_signed_at, nda_signed_by_name, nda_email_sent, nda_email_sent_at, nda_status,
          fee_agreement_signed, fee_agreement_signed_at, fee_agreement_signed_by_name,
          fee_agreement_email_sent, fee_agreement_email_sent_at, fee_agreement_status
        `,
        )
        .or(`email_domain.eq.${domain},website_domain.eq.${domain}`)
        .limit(1)
        .maybeSingle();

      return firm || null;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
