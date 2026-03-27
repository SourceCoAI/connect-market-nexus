import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Buyer-facing hook: checks the current user's firm-level agreement coverage.
 * Uses the get_my_agreement_status() RPC which resolves domain matching,
 * PE firm inheritance, and generic domain blocking automatically.
 */
export interface AgreementCoverage {
  nda_covered: boolean;
  nda_status: string;
  nda_coverage_source: string;   // 'direct' | 'domain_match' | 'pe_parent' | 'not_covered'
  nda_firm_name: string | null;
  nda_parent_firm_name: string | null;
  fee_covered: boolean;
  fee_status: string;
  fee_coverage_source: string;
  fee_firm_name: string | null;
  fee_parent_firm_name: string | null;
}

const SAFE_DEFAULT_COVERAGE: AgreementCoverage = {
  nda_covered: false,
  nda_status: 'not_started',
  nda_coverage_source: 'not_covered',
  nda_firm_name: null,
  nda_parent_firm_name: null,
  fee_covered: false,
  fee_status: 'not_started',
  fee_coverage_source: 'not_covered',
  fee_firm_name: null,
  fee_parent_firm_name: null,
};

function isRpcMissing(error: unknown): boolean {
  const msg = String((error as Record<string, unknown>)?.message ?? error).toLowerCase();
  const code = String((error as Record<string, unknown>)?.code ?? '');
  return msg.includes('404') || msg.includes('not found') || code === '404' || code === 'PGRST202';
}

export function useMyAgreementStatus(enabled = true) {
  return useQuery({
    queryKey: ['my-agreement-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_agreement_status');

      if (error) {
        // If the RPC doesn't exist, return safe defaults so gates activate
        if (isRpcMissing(error)) {
          console.warn('[agreement-status] get_my_agreement_status RPC not found — returning safe defaults (gates will activate)');
          return SAFE_DEFAULT_COVERAGE;
        }
        throw error;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return SAFE_DEFAULT_COVERAGE;

      return row as AgreementCoverage;
    },
    staleTime: 30_000,
    retry: (count, error) => {
      if (isRpcMissing(error)) return false;
      return count < 2;
    },
    enabled,
  });
}

/**
 * Admin-facing hook: check agreement coverage for any email.
 * Uses the check_agreement_coverage() RPC.
 */
export interface EmailCoverageResult {
  is_covered: boolean;
  coverage_source: string;
  firm_id: string | null;
  firm_name: string | null;
  agreement_status: string;
  signed_by_name: string | null;
  signed_at: string | null;
  parent_firm_name: string | null;
  expires_at: string | null;
}

export function useCheckEmailCoverage(email: string | null, agreementType: 'nda' | 'fee_agreement' = 'nda') {
  return useQuery({
    queryKey: ['check-email-coverage', email, agreementType],
    queryFn: async () => {
      if (!email) return null;
      const { data, error } = await supabase.rpc('check_agreement_coverage', {
        p_email: email,
        p_agreement_type: agreementType,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      return (row || null) as EmailCoverageResult | null;
    },
    enabled: !!email,
    staleTime: 30_000,
  });
}
