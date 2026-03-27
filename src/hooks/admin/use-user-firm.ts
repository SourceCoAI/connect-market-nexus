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

      try {
        const { data, error } = await supabase.rpc('get_user_firm_agreement_status', {
          p_user_id: userId,
        });

        if (error) {
          const msg = String(error.message ?? '').toLowerCase();
          const code = String(error.code ?? '');
          if (msg.includes('400') || msg.includes('404') || code === '400' || code === '404' || code === 'PGRST202') {
            console.warn('[useUserFirm] RPC unavailable — returning null');
            return null;
          }
          throw error;
        }

        const row = Array.isArray(data) ? data[0] : data;
        if (!row || !row.firm_id) return null;

        return {
          firm_id: row.firm_id,
          firm_name: row.firm_name,
          member_count: null,
          fee_agreement_signed: row.fee_agreement_signed ?? false,
          nda_signed: row.nda_signed ?? false,
        } as UserFirmInfo;
      } catch (err) {
        console.warn('[useUserFirm] RPC error — returning null', err);
        return null;
      }
    },
    enabled: !!userId,
    staleTime: 30000,
    retry: false,
  });
}
