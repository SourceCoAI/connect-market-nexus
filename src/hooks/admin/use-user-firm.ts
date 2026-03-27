import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UserFirmInfo {
  firm_id: string | null;
  firm_name: string | null;
  member_count: number | null;
  fee_agreement_signed: boolean;
  nda_signed: boolean;
}

/**
 * Resolves the canonical firm for a user via the DB function
 * `get_user_firm_agreement_status`, which delegates to `resolve_user_firm_id()`.
 * Resolution priority: email domain match → normalized company name match → latest firm_member.
 * Never uses connection_requests.firm_id (avoids circular dependency).
 */
export function useUserFirm(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['user-firm', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase.rpc('get_user_firm_agreement_status', {
        p_user_id: userId,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.firm_id) return null;

      return {
        firm_id: row.firm_id,
        firm_name: row.firm_name,
        member_count: null, // not returned by RPC; callers needing this can query separately
        fee_agreement_signed: row.fee_agreement_signed ?? false,
        nda_signed: row.nda_signed ?? false,
      } as UserFirmInfo;
    },
    enabled: !!userId,
    staleTime: 30000,
  });
}
