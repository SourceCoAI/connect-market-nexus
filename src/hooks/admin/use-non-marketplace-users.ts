import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { NonMarketplaceUser } from '@/types/non-marketplace-user';

export function useNonMarketplaceUsers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['admin', 'non-marketplace-users'],
    enabled: options?.enabled !== false,
    queryFn: async () => {
      // Fetch connection requests with lead data AND firm info
      const { data: connectionRequests, error: crError } = await supabase
        .from('connection_requests')
        .select(`
          id,
          lead_email,
          lead_name,
          lead_company,
          lead_role,
          lead_phone,
          created_at,
          lead_nda_signed,
          lead_fee_agreement_signed,
          firm_id,
          listing:listings(id, title),
          firm_agreements!inner(
            id,
            primary_company_name
          )
        `)
        .not('lead_email', 'is', null);

      if (crError) throw crError;

      // Fetch inbound leads with firm info
      const { data: inboundLeads, error: ilError } = await supabase
        .from('inbound_leads')
        .select(`
          id,
          email,
          name,
          company_name,
          role,
          phone_number,
          created_at,
          firm_id,
          firm_agreements(
            id,
            primary_company_name
          )
        `);

      if (ilError) throw ilError;

      // Fetch deals with contact information AND listing title
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select(`
          id,
          title,
          contact_email,
          contact_name,
          contact_company,
          contact_role,
          contact_phone,
          created_at,
          nda_status,
          fee_agreement_status,
          listing:listings(
            id,
            title
          )
        `)
        .not('contact_email', 'is', null);

      if (dealsError) throw dealsError;

      // Fetch all profiles to check for potential matches
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name');

      if (profilesError) throw profilesError;

      type FirmRelation = { id: string; primary_company_name: string | null } | Array<{ id: string; primary_company_name: string | null }> | null;

      // Create a map of emails to aggregate data
      const emailMap = new Map<string, {
        emails: Set<string>;
        names: Set<string>;
        companies: Set<string>;
        roles: Set<string>;
        phones: Set<string>;
        firms: Set<{ id: string; name: string }>;
        sources: Set<'connection_request' | 'inbound_lead' | 'deal'>;
        listing_names: Set<string>;
        connection_requests: NonNullable<typeof connectionRequests>;
        inbound_leads: NonNullable<typeof inboundLeads>;
        deals: NonNullable<typeof deals>;
        earliest_date: string;
        latest_date: string;
      }>();

      // Process connection requests
      connectionRequests?.forEach((cr) => {
        const email = cr.lead_email?.toLowerCase();
        if (!email) return;

        if (!emailMap.has(email)) {
          emailMap.set(email, {
            emails: new Set(),
            names: new Set(),
            companies: new Set(),
            roles: new Set(),
            phones: new Set(),
            firms: new Set(),
            sources: new Set(),
            listing_names: new Set(),
            connection_requests: [],
            inbound_leads: [],
            deals: [],
            earliest_date: cr.created_at,
            latest_date: cr.created_at,
          });
        }

        const data = emailMap.get(email)!;
        if (cr.lead_email) data.emails.add(cr.lead_email);
        if (cr.lead_name) data.names.add(cr.lead_name);
        if (cr.lead_company) data.companies.add(cr.lead_company);
        if (cr.lead_role) data.roles.add(cr.lead_role);
        if (cr.lead_phone) data.phones.add(cr.lead_phone);
        data.sources.add('connection_request');

        // Extract listing name
        const crListing = cr.listing as { id: string; title: string } | null;
        if (crListing?.title) data.listing_names.add(crListing.title);

        // Extract firm info from nested relation
        const crFirmData = (cr as Record<string, unknown>).firm_agreements as FirmRelation;
        if (crFirmData && cr.firm_id) {
          const firmName = Array.isArray(crFirmData) ? crFirmData[0]?.primary_company_name : crFirmData?.primary_company_name;
          if (firmName) {
            data.firms.add({ id: cr.firm_id, name: firmName });
          }
        }

        data.connection_requests.push(cr);
        if (cr.created_at < data.earliest_date) data.earliest_date = cr.created_at;
        if (cr.created_at > data.latest_date) data.latest_date = cr.created_at;
      });

      // Process inbound leads
      inboundLeads?.forEach((il) => {
        const email = il.email?.toLowerCase();
        if (!email) return;

        if (!emailMap.has(email)) {
          emailMap.set(email, {
            emails: new Set(),
            names: new Set(),
            companies: new Set(),
            roles: new Set(),
            phones: new Set(),
            firms: new Set(),
            sources: new Set(),
            listing_names: new Set(),
            connection_requests: [],
            inbound_leads: [],
            deals: [],
            earliest_date: il.created_at,
            latest_date: il.created_at,
          });
        }

        const data = emailMap.get(email)!;
        if (il.email) data.emails.add(il.email);
        if (il.name) data.names.add(il.name);
        if (il.company_name) data.companies.add(il.company_name);
        if (il.role) data.roles.add(il.role);
        if (il.phone_number) data.phones.add(il.phone_number);
        data.sources.add('inbound_lead');

        // Extract firm info from nested relation
        const ilFirmData = (il as Record<string, unknown>).firm_agreements as FirmRelation;
        if (ilFirmData && il.firm_id) {
          const firmName = Array.isArray(ilFirmData) ? ilFirmData[0]?.primary_company_name : ilFirmData?.primary_company_name;
          if (firmName) {
            data.firms.add({ id: il.firm_id, name: firmName });
          }
        }

        data.inbound_leads.push(il);
        if (il.created_at < data.earliest_date) data.earliest_date = il.created_at;
        if (il.created_at > data.latest_date) data.latest_date = il.created_at;
      });

      // Process deals
      deals?.forEach((deal) => {
        const email = deal.contact_email?.toLowerCase();
        if (!email) return;

        if (!emailMap.has(email)) {
          emailMap.set(email, {
            emails: new Set(),
            names: new Set(),
            companies: new Set(),
            roles: new Set(),
            phones: new Set(),
            firms: new Set(),
            sources: new Set(),
            listing_names: new Set(),
            connection_requests: [],
            inbound_leads: [],
            deals: [],
            earliest_date: deal.created_at ?? new Date().toISOString(),
            latest_date: deal.created_at ?? new Date().toISOString(),
          });
        }

        const data = emailMap.get(email)!;
        if (deal.contact_email) data.emails.add(deal.contact_email);
        if (deal.contact_name) data.names.add(deal.contact_name);
        if (deal.contact_company) data.companies.add(deal.contact_company);
        if (deal.contact_role) data.roles.add(deal.contact_role);
        if (deal.contact_phone) data.phones.add(deal.contact_phone);
        data.sources.add('deal');

        // Extract listing name from deal
        const dealListing = deal.listing as { id: string; title: string } | null;
        if (dealListing?.title) data.listing_names.add(dealListing.title);
        if (deal.title) data.listing_names.add(deal.title);

        data.deals.push(deal);
        if (deal.created_at && deal.created_at < data.earliest_date) data.earliest_date = deal.created_at;
        if (deal.created_at && deal.created_at > data.latest_date) data.latest_date = deal.created_at;
      });

      // Convert to NonMarketplaceUser array
      const nonMarketplaceUsers: NonMarketplaceUser[] = [];

      emailMap.forEach((data, email) => {
        // Find potential profile match
        const profileMatch = profiles?.find((p) => p.email?.toLowerCase() === email);

        // SKIP if this email already has a registered profile - they belong in Marketplace Users tab
        if (profileMatch) return;

        // Determine primary source (most recent)
        let source: 'connection_request' | 'inbound_lead' | 'deal' = 'connection_request';
        let sourceId = '';

        if (data.deals.length > 0) {
          source = 'deal';
          sourceId = data.deals[0].id;
        } else if (data.inbound_leads.length > 0) {
          source = 'inbound_lead';
          sourceId = data.inbound_leads[0].id;
        } else if (data.connection_requests.length > 0) {
          source = 'connection_request';
          sourceId = data.connection_requests[0].id;
        }

        // Get aggregated NDA and fee agreement status
        let ndaStatus: string | null = null;
        let feeAgreementStatus: string | null = null;

        data.connection_requests.forEach((cr) => {
          if (cr.lead_nda_signed) ndaStatus = 'signed';
        });

        data.connection_requests.forEach((cr) => {
          if (cr.lead_fee_agreement_signed) feeAgreementStatus = 'signed';
        });

        data.deals.forEach((deal) => {
          if (deal.nda_status && deal.nda_status !== 'not_sent') ndaStatus = deal.nda_status;
          if (deal.fee_agreement_status && deal.fee_agreement_status !== 'not_sent') feeAgreementStatus = deal.fee_agreement_status;
        });

        const firms = Array.from(data.firms);
        const totalEngagement = data.connection_requests.length + data.inbound_leads.length + data.deals.length;

        nonMarketplaceUsers.push({
          id: `${source}:${sourceId}`,
          email,
          name: Array.from(data.names)[0] || 'Unknown',
          company: Array.from(data.companies)[0] || null,
          role: Array.from(data.roles)[0] || null,
          phone: Array.from(data.phones)[0] || null,
          source,
          sources: Array.from(data.sources),
          source_id: sourceId,
          firm_id: firms[0]?.id || null,
          firm_name: firms[0]?.name || null,
          created_at: data.earliest_date,
          connection_requests_count: data.connection_requests.length,
          inbound_leads_count: data.inbound_leads.length,
          deals_count: data.deals.length,
          total_engagement_count: totalEngagement,
          last_activity_date: data.latest_date,
          listing_names: Array.from(data.listing_names),
          nda_status: ndaStatus,
          fee_agreement_status: feeAgreementStatus,
          potential_profile_id: null,
          potential_profile_name: null,
          associated_records: {
            connection_requests: data.connection_requests,
            inbound_leads: data.inbound_leads,
            deals: data.deals,
          },
        });
      });

      // Sort by created_at descending
      return nonMarketplaceUsers.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    staleTime: 30000, // 30 seconds
  });
}
