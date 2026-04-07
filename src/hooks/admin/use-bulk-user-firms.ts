import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BulkFirmData {
  firm_id: string;
  primary_company_name: string | null;
  nda_signed: boolean | null;
  nda_signed_at: string | null;
  nda_signed_by_name: string | null;
  nda_email_sent: boolean | null;
  nda_email_sent_at: string | null;
  nda_status: string | null;
  fee_agreement_signed: boolean | null;
  fee_agreement_signed_at: string | null;
  fee_agreement_signed_by_name: string | null;
  fee_agreement_email_sent: boolean | null;
  fee_agreement_email_sent_at: string | null;
  fee_agreement_status: string | null;
}

/**
 * Batch-fetches firm data for all user IDs in a single query.
 * Replaces N individual `useUserFirm` calls with 1 join query.
 */
export function useBulkUserFirms(userIds: string[]) {
  return useQuery({
    queryKey: ['bulk-user-firms', [...userIds].sort().join(',')],
    queryFn: async (): Promise<Map<string, BulkFirmData>> => {
      if (userIds.length === 0) return new Map();

      // Query in chunks of 500 to stay under Supabase limits
      const CHUNK_SIZE = 500;
      const allRows: Array<{ user_id: string; firm_id: string }> = [];

      for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from('firm_members')
          .select('user_id, firm_id')
          .in('user_id', chunk);

        if (error) {
          console.error('[useBulkUserFirms] firm_members query error:', error);
          continue;
        }
        if (data) {
          for (const row of data) {
            if (row.user_id) allRows.push({ user_id: row.user_id, firm_id: row.firm_id });
          }
        }
      }

      if (allRows.length === 0) return new Map();

      // Get unique firm IDs
      const firmIds = [...new Set(allRows.map((r) => r.firm_id))];

      // Fetch all firm agreements in one query
      const { data: firms, error: firmsError } = await supabase
        .from('firm_agreements')
        .select(
          `id, primary_company_name,
           nda_signed, nda_signed_at, nda_signed_by_name, nda_email_sent, nda_email_sent_at, nda_status,
           fee_agreement_signed, fee_agreement_signed_at, fee_agreement_signed_by_name,
           fee_agreement_email_sent, fee_agreement_email_sent_at, fee_agreement_status`
        )
        .in('id', firmIds);

      if (firmsError || !firms) {
        console.error('[useBulkUserFirms] firm_agreements query error:', firmsError);
        return new Map();
      }

      // Build firm lookup
      const firmMap = new Map<string, (typeof firms)[0]>();
      for (const f of firms) firmMap.set(f.id, f);

      // Build user → firm data map
      const result = new Map<string, BulkFirmData>();
      for (const row of allRows) {
        if (result.has(row.user_id)) continue; // first membership wins
        const firm = firmMap.get(row.firm_id);
        if (!firm) continue;
        result.set(row.user_id, {
          firm_id: firm.id,
          primary_company_name: firm.primary_company_name,
          nda_signed: firm.nda_signed,
          nda_signed_at: firm.nda_signed_at,
          nda_signed_by_name: firm.nda_signed_by_name,
          nda_email_sent: firm.nda_email_sent,
          nda_email_sent_at: firm.nda_email_sent_at,
          nda_status: firm.nda_status,
          fee_agreement_signed: firm.fee_agreement_signed,
          fee_agreement_signed_at: firm.fee_agreement_signed_at,
          fee_agreement_signed_by_name: firm.fee_agreement_signed_by_name,
          fee_agreement_email_sent: firm.fee_agreement_email_sent,
          fee_agreement_email_sent_at: firm.fee_agreement_email_sent_at,
          fee_agreement_status: firm.fee_agreement_status,
        });
      }

      return result;
    },
    enabled: userIds.length > 0,
    staleTime: 30_000,
  });
}
