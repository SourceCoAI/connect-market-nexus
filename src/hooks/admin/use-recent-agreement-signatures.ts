import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RecentSignature {
  id: string;
  firmId: string;
  firmName: string;
  agreementType: 'nda' | 'fee_agreement';
  signedAt: string;
  signedByName?: string | null;
}

/**
 * Fetches recent NDA and Fee Agreement signatures, sorted by most recent.
 * Includes realtime subscription for immediate updates.
 */
export function useRecentAgreementSignatures(limit = 10) {
  const queryClient = useQueryClient();

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-agreement-signatures')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'firm_agreements' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['recent-agreement-signatures'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery<RecentSignature[]>({
    queryKey: ['recent-agreement-signatures', limit],
    queryFn: async () => {
      // Fetch firms with any signed agreement
      const { data: firms, error } = await supabase
        .from('firm_agreements')
        .select(
          'id, primary_company_name, nda_signed, nda_signed_at, nda_signed_by_name, fee_agreement_signed, fee_agreement_signed_at, fee_agreement_signed_by_name',
        )
        .or('nda_signed.eq.true,fee_agreement_signed.eq.true')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!firms) return [];

      const signatures: RecentSignature[] = [];

      for (const firm of firms) {
        if (firm.nda_signed && firm.nda_signed_at) {
          signatures.push({
            id: `${firm.id}-nda`,
            firmId: firm.id,
            firmName: firm.primary_company_name || 'Unknown',
            agreementType: 'nda',
            signedAt: firm.nda_signed_at,
            signedByName: firm.nda_signed_by_name,
          });
        }
        if (firm.fee_agreement_signed && firm.fee_agreement_signed_at) {
          signatures.push({
            id: `${firm.id}-fee`,
            firmId: firm.id,
            firmName: firm.primary_company_name || 'Unknown',
            agreementType: 'fee_agreement',
            signedAt: firm.fee_agreement_signed_at,
            signedByName: firm.fee_agreement_signed_by_name,
          });
        }
      }

      // Sort by most recent
      signatures.sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime());

      return signatures.slice(0, limit);
    },
    staleTime: 30_000,
  });
}
