/**
 * Firm Agreements query hooks — all useQuery hooks
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FirmAgreement, FirmMember, AgreementAuditEntry } from './use-firm-agreements';

// ─── Firm Agreements List ───

export function useFirmAgreements() {
  return useQuery({
    queryKey: ['firm-agreements'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('firm_agreements')
        .select(
          `
          *,
          firm_members(
            id,
            user:profiles(
              id,
              first_name,
              last_name,
              email
            )
          )
        `,
        )
        .order('primary_company_name');

      if (error) throw error;

      const firms = data || [];
      if (firms.length === 0) return [] as FirmAgreement[];

      const firmIds = firms.map((f) => f.id);

      // Batch-fetch stats: 2-3 queries total instead of 4*N
      const [leadsRes, requestsRes] = await Promise.all([
        supabase.from('inbound_leads').select('firm_id').in('firm_id', firmIds),
        supabase.from('connection_requests').select('id, firm_id').in('firm_id', firmIds),
      ]);

      // Count leads per firm
      const leadCounts: Record<string, number> = {};
      (leadsRes.data || []).forEach((l: { firm_id: string | null }) => {
        if (l.firm_id) leadCounts[l.firm_id] = (leadCounts[l.firm_id] || 0) + 1;
      });

      // Count requests per firm & collect request IDs for deal lookup
      const requestCounts: Record<string, number> = {};
      const requestToFirm: Record<string, string> = {};
      (requestsRes.data || []).forEach((r: { id: string; firm_id: string | null }) => {
        if (r.firm_id) {
          requestCounts[r.firm_id] = (requestCounts[r.firm_id] || 0) + 1;
          requestToFirm[r.id] = r.firm_id;
        }
      });

      // Count deals per firm via connection_request_id
      const dealCounts: Record<string, number> = {};
      const allRequestIds = Object.keys(requestToFirm);
      if (allRequestIds.length > 0) {
        const { data: dealsData, error: dealsDataError } = await supabase
          .from('deal_pipeline')
          .select('connection_request_id')
          .in('connection_request_id', allRequestIds);
        if (dealsDataError) throw dealsDataError;

        (dealsData || []).forEach((d: { connection_request_id: string | null }) => {
          const firmId = d.connection_request_id
            ? requestToFirm[d.connection_request_id]
            : undefined;
          if (firmId) {
            dealCounts[firmId] = (dealCounts[firmId] || 0) + 1;
          }
        });
      }

      return firms.map((firm) => ({
        ...firm,
        lead_count: leadCounts[firm.id] || 0,
        request_count: requestCounts[firm.id] || 0,
        deal_count: dealCounts[firm.id] || 0,
      })) as FirmAgreement[];
    },
  });
}

// ─── Firm Members ───

export function useFirmMembers(firmId: string | null) {
  return useQuery({
    queryKey: ['firm-members', firmId],
    queryFn: async () => {
      if (!firmId) return [];

      const { data, error } = await supabase
        .from('firm_members')
        .select(
          `
          *,
          user:profiles(
            id,
            email,
            first_name,
            last_name,
            company_name,
            buyer_type
          )
        `,
        )
        .eq('firm_id', firmId)
        .order('member_type', { ascending: false })
        .order('is_primary_contact', { ascending: false });

      if (error) throw error;
      return data as FirmMember[];
    },
    enabled: !!firmId,
  });
}

// ─── All Firm Members (for global search) ───

export function useAllFirmMembersForSearch() {
  return useQuery({
    queryKey: ['firm-members-search'],
    queryFn: async () => {
      const { data, error } = await supabase.from('firm_members').select(`
          firm_id,
          user:profiles(
            id,
            first_name,
            last_name,
            email,
            buyer_type
          )
        `);

      if (error) throw error;
      return (data || []) as Array<{
        firm_id: string;
        user: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          buyer_type: string | null;
        } | null;
      }>;
    },
    staleTime: 60_000,
  });
}

// ─── Agreement Audit Log ───

export function useAgreementAuditLog(firmId: string | null) {
  return useQuery({
    queryKey: ['agreement-audit-log', firmId],
    queryFn: async () => {
      if (!firmId) return [];
      const { data, error } = await supabase
        .from('agreement_audit_log')
        .select('*')
        .eq('firm_id', firmId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AgreementAuditEntry[];
    },
    enabled: !!firmId,
  });
}

// ─── Domain Aliases ───

export function useFirmDomainAliases(firmId: string | null) {
  return useQuery({
    queryKey: ['firm-domain-aliases', firmId],
    queryFn: async () => {
      if (!firmId) return [];
      const { data, error } = await supabase
        .from('firm_domain_aliases')
        .select('*')
        .eq('firm_id', firmId)
        .order('is_primary', { ascending: false });

      if (error) throw error;
      return data as Array<{
        id: string;
        firm_id: string;
        domain: string;
        is_primary: boolean;
        created_at: string;
      }>;
    },
    enabled: !!firmId,
  });
}
