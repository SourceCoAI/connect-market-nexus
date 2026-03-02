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
  nda_docuseal_status: string | null;
  fee_docuseal_status: string | null;
  firmAgreement: FirmAgreement | null;
  firmMembers: FirmMember[];
}

export function useConnectionRequestFirm(requestId: string | null) {
  return useQuery({
    queryKey: ['connection-request-firm', requestId],
    queryFn: async () => {
      if (!requestId) return null;

      const { data, error } = await supabase
        .from('connection_requests' as never)
        .select(`
          firm_id,
          firm:firm_agreements!connection_requests_firm_id_fkey (
            *,
            firm_members(
              id, user_id, member_type, lead_email, lead_name, lead_company,
              connection_request_id, inbound_lead_id, is_primary_contact, added_at,
              user:profiles(id, email, first_name, last_name, company_name, buyer_type)
            )
          )
        `)
        .eq('id', requestId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      if (!data) return null;
      
      const firmData = data as { firm_id: string | null; firm: any | any[] | null };
      if (!firmData.firm) return null;

      const firm = Array.isArray(firmData.firm) ? firmData.firm[0] : firmData.firm;

      const members: FirmMember[] = (firm.firm_members || []).map((m: any) => ({
        id: m.id,
        firm_id: firm.id,
        user_id: m.user_id,
        member_type: m.member_type || 'marketplace_user',
        lead_email: m.lead_email,
        lead_name: m.lead_name,
        lead_company: m.lead_company,
        connection_request_id: m.connection_request_id,
        inbound_lead_id: m.inbound_lead_id,
        is_primary_contact: m.is_primary_contact || false,
        added_at: m.added_at,
        user: m.user || null,
      }));

      return {
        firm_id: firm.id,
        firm_name: firm.primary_company_name,
        member_count: firm.member_count,
        fee_agreement_signed: firm.fee_agreement_signed,
        nda_signed: firm.nda_signed,
        nda_status: firm.nda_status,
        fee_agreement_status: firm.fee_agreement_status,
        nda_docuseal_status: firm.nda_docuseal_status,
        fee_docuseal_status: firm.fee_docuseal_status,
        firmAgreement: firm as unknown as FirmAgreement,
        firmMembers: members,
      } as ConnectionRequestFirmInfo;
    },
    enabled: !!requestId,
    staleTime: 30000,
  });
}
