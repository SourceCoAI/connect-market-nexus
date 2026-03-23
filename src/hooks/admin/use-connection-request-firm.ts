import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FirmAgreement, FirmMember } from './use-firm-agreements';

export interface ConnectionRequestFirmInfo {
  firm_id: string | null;
  firm_name: string | null;
  member_count: number | null;
  fee_agreement_signed: boolean;
  nda_signed: boolean;
  nda_status: string | null;
  fee_agreement_status: string | null;
  nda_pandadoc_status: string | null;
  fee_pandadoc_status: string | null;
  firmAgreement: FirmAgreement | null;
  firmMembers: FirmMember[];
}

/**
 * Resolves the firm for a connection request by looking up the CR's user_id
 * and then calling the canonical `resolve_user_firm_id` RPC.
 *
 * This avoids trusting the potentially stale `connection_requests.firm_id` column.
 */
export function useConnectionRequestFirm(requestId: string | null) {
  return useQuery({
    queryKey: ['connection-request-firm', requestId],
    queryFn: async () => {
      if (!requestId) return null;

      // Step 1: Get user_id from the connection request
      const { data: cr, error: crError } = await supabase
        .from('connection_requests' as never)
        .select('user_id')
        .eq('id', requestId)
        .single();

      if (crError) {
        if (crError.code === 'PGRST116') return null;
        throw crError;
      }

      const userId = (cr as { user_id: string | null })?.user_id;
      if (!userId) return null;

      // Step 2: Resolve the canonical firm for this user via the DB function
      const { data: firmId, error: rpcError } = await supabase.rpc('resolve_user_firm_id', {
        p_user_id: userId,
      });

      if (rpcError) throw rpcError;
      if (!firmId) return null;

      // Step 3: Fetch the full firm_agreements record + members
      const { data: firm, error: firmError } = await supabase
        .from('firm_agreements')
        .select(`
          *,
          firm_members(
            id, user_id, member_type, lead_email, lead_name, lead_company,
            connection_request_id, inbound_lead_id, is_primary_contact, added_at,
            user:profiles(id, email, first_name, last_name, company_name, buyer_type)
          )
        `)
        .eq('id', firmId)
        .single();

      if (firmError) {
        if (firmError.code === 'PGRST116') return null;
        throw firmError;
      }

      if (!firm) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firmAny = firm as any;

      const members = ((firmAny.firm_members || []) as Record<string, unknown>[]).map(
        (m: Record<string, unknown>) => ({
          id: m.id as string,
          firm_id: firmId as string,
          user_id: m.user_id as string | null,
          member_type: (m.member_type as string) || 'marketplace_user',
          lead_email: m.lead_email as string | null,
          lead_name: m.lead_name as string | null,
          lead_company: m.lead_company as string | null,
          connection_request_id: m.connection_request_id as string | null,
          inbound_lead_id: m.inbound_lead_id as string | null,
          is_primary_contact: (m.is_primary_contact as boolean) || false,
          added_at: m.added_at as string | null,
          user: m.user || null,
        }),
      ) as FirmMember[];

      return {
        firm_id: firmAny.id,
        firm_name: firmAny.primary_company_name,
        member_count: firmAny.member_count,
        fee_agreement_signed: firmAny.fee_agreement_signed,
        nda_signed: firmAny.nda_signed,
        nda_status: firmAny.nda_status,
        fee_agreement_status: firmAny.fee_agreement_status,
        nda_pandadoc_status: firmAny.nda_pandadoc_status,
        fee_pandadoc_status: firmAny.fee_pandadoc_status,
        firmAgreement: firmAny as unknown as FirmAgreement,
        firmMembers: members,
      } as ConnectionRequestFirmInfo;
    },
    enabled: !!requestId,
    staleTime: 30000,
  });
}
