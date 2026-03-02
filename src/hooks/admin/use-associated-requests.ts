import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ProfileRecord {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

interface RelatedRequestRow {
  related_request: {
    id: string;
    user_id: string | null;
    listing_id: string;
    status: string;
    created_at: string;
    lead_name: string | null;
    lead_email: string | null;
    lead_company: string | null;
    listing: { id: string; title: string; revenue: number | null; location: string | null; internal_company_name: string | null } | null;
  } | null;
  relationship_type: string;
  relationship_metadata: Record<string, unknown>;
  created_at: string;
}

interface ConnectionRequestRow {
  id: string;
  user_id: string | null;
  listing_id: string;
  status: string;
  created_at: string;
  lead_name: string | null;
  lead_email: string | null;
  lead_company: string | null;
  listing: { id: string; title: string; revenue: number | null; location: string | null; internal_company_name: string | null } | null;
}

interface DealRow {
  id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_company: string | null;
  contact_phone: string | null;
  contact_role: string | null;
  created_at: string;
  title: string | null;
  listing_id: string | null;
  listing: { id: string; title: string; revenue: number | null; location: string | null; internal_company_name: string | null } | null;
}

export interface AssociatedRequest {
  id: string;
  user_id: string | null;
  listing_id: string;
  status: string;
  created_at: string;
  lead_name: string | null;
  lead_email: string | null;
  lead_company: string | null;
  relationship_type: string;
  relationship_metadata: Record<string, unknown>;
  listing?: {
    id: string;
    title: string;
    revenue: number | null;
    location: string | null;
    internal_company_name: string | null;
  } | null;
  user?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
}

export function useAssociatedRequests(
  primaryRequestId: string | undefined,
  contactCompany: string | undefined,
  contactEmail: string | undefined
) {
  return useQuery({
    queryKey: ['associated-requests', primaryRequestId, contactCompany, contactEmail],
    queryFn: async () => {
      // If we have a connection request ID, try the association table first
      if (primaryRequestId) {
        const { data, error } = await supabase
          .from('connection_request_contacts')
          .select(`
            *,
            related_request:related_request_id(
              id,
              user_id,
              listing_id,
              status,
              created_at,
              lead_name,
              lead_email,
              lead_company,
              listing:listing_id(id, title, revenue, location, internal_company_name)
            )
          `)
          .eq('primary_request_id', primaryRequestId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // If we found associations, use them
        if (data && data.length > 0) {
          // Enrich with user profiles for proper colleague names
          const typedData = data as unknown as RelatedRequestRow[];
          const userIds = Array.from(new Set(
            typedData.map((item) => item.related_request?.user_id).filter(Boolean)
          ));

          const profileMap = new Map<string, ProfileRecord>();
          if (userIds.length > 0) {
            const { data: profs, error: profsError } = await supabase
              .from('profiles')
              .select('id,email,first_name,last_name,company')
              .in('id', userIds as string[]);
            if (profsError) throw profsError;
            (profs || []).forEach((p) => profileMap.set(p.id, p));
          }

          const associated: AssociatedRequest[] = typedData.map((item) => {
            const related = item.related_request;
            const p = related?.user_id ? profileMap.get(related.user_id) : null;
            return {
              id: related?.id || '',
              user_id: related?.user_id || null,
              listing_id: related?.listing_id || '',
              status: related?.status || 'unknown',
              created_at: related?.created_at || '',
              lead_name: related?.lead_name || null,
              lead_email: related?.lead_email || null,
              lead_company: related?.lead_company || null,
              relationship_type: item.relationship_type,
              relationship_metadata: item.relationship_metadata,
              listing: related?.listing || null,
              user: p ? { email: p.email, first_name: p.first_name, last_name: p.last_name, company: p.company } : null,
            } as AssociatedRequest;
          });

          return associated;
        }
        // If no associations found, fall through to company matching below
      }
      
      // If no connection request but we have a company, find colleagues by company name
      if (contactCompany) {
        // Step 1: Find profiles with this company
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('company', contactCompany)
          .eq('approval_status', 'approved');
        if (profilesError) throw profilesError;

        const profileIds = (profiles || []).map(p => p.id);

        // Step 2: Find connection requests from these users OR with matching lead_company
        const query = supabase
          .from('connection_requests')
          .select(`
            id,
            user_id,
            listing_id,
            status,
            created_at,
            lead_name,
            lead_email,
            lead_company,
            listing:listing_id(id, title, revenue, location, internal_company_name)
          `)
          .order('created_at', { ascending: false });

        // Add filters: either user_id in profileIds OR lead_company matches
        let crData, crError;
        if (profileIds.length > 0) {
          const result = await query.or(`user_id.in.(${profileIds.join(',')}),lead_company.eq."${contactCompany.replace(/"/g, '\\"')}"`);
          crData = result.data;
          crError = result.error;
        } else {
          const result = await query.eq('lead_company', contactCompany);
          crData = result.data;
          crError = result.error;
        }

        if (crError) throw crError;

        // Step 3: Also find manually created deals with matching contact_company
        const { data: dealsData, error: dealsError } = await supabase
          .from('deal_pipeline')
          .select(`
            id,
            contact_name,
            contact_email,
            contact_company,
            contact_phone,
            contact_role,
            created_at,
            title,
            listing_id,
            listing:listing_id(id, title, revenue, location, internal_company_name)
          `)
          .eq('contact_company', contactCompany)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (dealsError) throw dealsError;

        // Step 4: Enrich connection requests with user profiles FIRST (before filtering)
        const typedCrData = (crData || []) as unknown as ConnectionRequestRow[];
        const typedDealsData = (dealsData || []) as unknown as DealRow[];
        const userIds = Array.from(new Set(typedCrData.map((r) => r.user_id).filter(Boolean)));
        const profileMap = new Map<string, ProfileRecord>();
        if (userIds.length > 0) {
          const { data: profs, error: profsError } = await supabase
            .from('profiles')
            .select('id,email,first_name,last_name,company')
            .in('id', userIds as string[]);
          if (profsError) throw profsError;
          (profs || []).forEach((p) => profileMap.set(p.id, p));
        }

        const filteredCR = typedCrData.filter((req) => {
          if (primaryRequestId && req.id === primaryRequestId) return false;
          if (!contactEmail) return true;
          
          const reqLeadEmail = (req.lead_email || '').toLowerCase();
          const reqUserEmail = req.user_id && profileMap.get(req.user_id)?.email?.toLowerCase();
          const currentEmail = contactEmail.toLowerCase();
          
          // Exclude if EITHER the lead_email OR the user's profile email matches the current contact
          return reqLeadEmail !== currentEmail && reqUserEmail !== currentEmail;
        });

        const filteredDeals = typedDealsData.filter((deal) => {
          if (!contactEmail) return true;
          const dealEmail = (deal.contact_email || '').toLowerCase();
          return dealEmail !== contactEmail.toLowerCase();
        });

        // Map connection requests
        const associatedFromCR: AssociatedRequest[] = filteredCR.map((req) => {
          const p = req.user_id ? profileMap.get(req.user_id) : null;
          return {
            id: req.id,
            user_id: req.user_id,
            listing_id: req.listing_id,
            status: req.status,
            created_at: req.created_at,
            lead_name: req.lead_name,
            lead_email: req.lead_email,
            lead_company: req.lead_company,
            relationship_type: 'same_company',
            relationship_metadata: { company_name: contactCompany, matched_by: 'company_name' },
            listing: req.listing,
            user: p ? { email: p.email, first_name: p.first_name, last_name: p.last_name, company: p.company } : null,
          } as AssociatedRequest;
        });

        // Map manually created deals
        const associatedFromDeals: AssociatedRequest[] = filteredDeals.map((deal) => {
          return {
            id: deal.id,
            user_id: null,
            listing_id: deal.listing_id,
            status: 'manual_deal',
            created_at: deal.created_at,
            lead_name: deal.contact_name,
            lead_email: deal.contact_email,
            lead_company: deal.contact_company,
            relationship_type: 'same_company',
            relationship_metadata: { company_name: contactCompany, matched_by: 'company_name', source: 'manual_deal' },
            listing: deal.listing,
            user: null,
          } as AssociatedRequest;
        });

        // Combine and sort by created_at
        const combined = [...associatedFromCR, ...associatedFromDeals].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        return combined;
      }

      return [];
    },
    enabled: !!primaryRequestId || !!contactCompany,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
