import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { GENERIC_EMAIL_DOMAINS } from '@/lib/generic-email-domains';

export interface InboundLead {
  id: string;
  name: string;
  email: string;
  company_name?: string;
  phone_number?: string;
  role?: string;
  message?: string;
  source: 'webflow' | 'manual' | 'referral' | 'cold_outreach' | 'networking' | 'linkedin' | 'email' | 'website';
  source_form_name?: string;
  mapped_to_listing_id?: string;
  mapped_to_listing_title?: string;
  mapped_at?: string;
  mapped_by?: string;
  converted_to_request_id?: string;
  converted_at?: string;
  status: 'pending' | 'mapped' | 'converted' | 'archived';
  priority_score: number;
  is_duplicate?: boolean;
  duplicate_info?: string;
  created_at: string;
  updated_at: string;
  converted_by?: string;
}

export interface CreateInboundLeadData {
  name: string;
  email: string;
  company_name?: string;
  phone_number?: string;
  role?: string;
  message?: string;
  source: 'webflow' | 'manual' | 'referral' | 'cold_outreach' | 'networking' | 'linkedin' | 'email' | 'website';
  source_form_name?: string;
}

export interface MapLeadToListingData {
  leadId: string;
  listingId: string;
  listingTitle: string;
}

export interface DuplicateCheckResult {
  exactDuplicate?: {
    requestId: string;
    userEmail: string;
  };
  sameFirmRequests?: Array<{
    requestId: string;
    userEmail: string;
    companyName: string;
  }>;
  hasDuplicates: boolean;
}

// Query hook for fetching inbound leads
export function useInboundLeadsQuery() {
  return useQuery<InboundLead[]>({
    queryKey: ['inbound-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inbound_leads')
        .select('id, name, email, company_name, phone_number, role, message, source, source_form_name, mapped_to_listing_id, mapped_to_listing_title, mapped_at, mapped_by, converted_to_request_id, converted_at, status, priority_score, is_duplicate, duplicate_info, created_at, updated_at, converted_by')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      return data as InboundLead[];
    },
  });
}

// Helper function to normalize company names for matching
const normalizeCompanyName = (companyName?: string): string => {
  if (!companyName) return '';
  return companyName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b(llc|inc|corp|ltd|limited|company|co\.?)\b/g, '')
    .trim();
};

// Helper function to extract domain from email
const getEmailDomain = (email: string): string => {
  return email.split('@')[1] || '';
};

// Enhanced scoring function
const calculateLeadScore = (lead: Partial<CreateInboundLeadData>): number => {
  let score = 0;
  
  // Role-based scoring (higher weight for PE/FO/Corp)
  const roleScores: Record<string, number> = {
    'private equity': 50,
    'family office': 50,
    'corporate': 45,
    'independent sponsor': 40,
    'search fund': 35,
    'individual': 20,
  };
  
  if (lead.role) {
    const normalizedRole = lead.role.toLowerCase();
    for (const [role, points] of Object.entries(roleScores)) {
      if (normalizedRole.includes(role)) {
        score += points;
        break;
      }
    }
  }
  
  // Email domain scoring (corporate domains get bonus)
  if (lead.email) {
    const domain = getEmailDomain(lead.email);
    if (!GENERIC_EMAIL_DOMAINS.has(domain)) {
      score += 15; // Corporate email bonus
    }
  }
  
  // Message quality scoring
  if (lead.message) {
    const messageLength = lead.message.length;
    if (messageLength > 100) score += 10;
    if (messageLength > 200) score += 5;
    
    // Bonus for professional keywords
    const professionalKeywords = ['acquisition', 'investment', 'portfolio', 'strategic', 'ebitda', 'revenue', 'valuation'];
    const messageWords = lead.message.toLowerCase();
    professionalKeywords.forEach(keyword => {
      if (messageWords.includes(keyword)) score += 3;
    });
  }
  
  // Company name bonus
  if (lead.company_name && lead.company_name.trim()) {
    score += 10;
  }
  
  return Math.min(score, 100); // Cap at 100
};

// Query hook for checking duplicates when mapping
export function useCheckDuplicates() {
  return async (leadEmail: string, leadCompany: string, listingId: string): Promise<DuplicateCheckResult> => {
    try {
      const { data: existingRequests, error } = await supabase
        .from('connection_requests')
        .select(`
          id,
          user_id,
          profiles!inner(email, company)
        `)
        .eq('listing_id', listingId);

      if (error) throw error;

      const normalizedLeadCompany = normalizeCompanyName(leadCompany);
      const leadDomain = getEmailDomain(leadEmail);
      
      let exactDuplicate;
      const sameFirmRequests = [];

      for (const request of existingRequests || []) {
        const profile = (request as Record<string, unknown>).profiles as { email: string; company: string | null };
        
        // Check for exact email match (case-insensitive)
        if (profile.email && profile.email.toLowerCase() === leadEmail.toLowerCase()) {
          exactDuplicate = {
            requestId: request.id,
            userEmail: profile.email
          };
          continue;
        }
        
        // Check for same company/domain
        const normalizedExistingCompany = normalizeCompanyName(profile.company ?? undefined);
        const existingDomain = getEmailDomain(profile.email);
        
        const isSameFirm = (
          (normalizedLeadCompany && normalizedExistingCompany && normalizedLeadCompany === normalizedExistingCompany) ||
          (leadDomain && existingDomain && leadDomain === existingDomain && !GENERIC_EMAIL_DOMAINS.has(leadDomain))
        );
        
        if (isSameFirm) {
          sameFirmRequests.push({
            requestId: request.id,
            userEmail: profile.email,
            companyName: profile.company || 'Unknown'
          });
        }
      }

      return {
        exactDuplicate,
        sameFirmRequests,
        hasDuplicates: !!exactDuplicate || sameFirmRequests.length > 0
      };
      
    } catch (error) {
      return { hasDuplicates: false };
    }
  };
}

// Mutation hook for creating inbound leads with enhanced scoring
export function useCreateInboundLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadData: CreateInboundLeadData) => {
      // Calculate enhanced priority score
      const priority_score = calculateLeadScore(leadData);
      
      const { data, error } = await supabase
        .from('inbound_leads')
        .insert([{ ...leadData, priority_score }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbound-leads'] });
      toast({
        title: "Lead created",
        description: "Inbound lead has been successfully created",
      });
    },
    onError: (_error) => {
      toast({
        variant: "destructive",
        title: "Failed to create lead",
        description: "Could not create the inbound lead",
      });
    },
  });
}

// Mutation hook for mapping lead to listing with duplicate checking
export function useMapLeadToListing() {
  const queryClient = useQueryClient();
  const checkDuplicates = useCheckDuplicates();

  return useMutation({
    mutationFn: async ({ leadId, listingId, listingTitle, skipDuplicateCheck = false }: MapLeadToListingData & { skipDuplicateCheck?: boolean }) => {
      // Get current admin user ID
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Authentication required');

      // Get lead data for duplicate checking
      if (!skipDuplicateCheck) {
        const { data: leadData, error: leadError } = await supabase
          .from('inbound_leads')
          .select('email, company_name')
          .eq('id', leadId)
          .single();
          
        if (leadError) throw leadError;
        
        const duplicateResult = await checkDuplicates(leadData.email, leadData.company_name || '', listingId);
        
        if (duplicateResult.hasDuplicates) {
          // Return the duplicate result for UI handling
          throw { isDuplicateError: true, duplicateResult, leadData };
        }
      }

      const { data, error } = await supabase
        .from('inbound_leads')
        .update({
          mapped_to_listing_id: listingId,
          mapped_to_listing_title: listingTitle,
          mapped_at: new Date().toISOString(),
          mapped_by: user.id,
          status: 'mapped',
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbound-leads'] });
      toast({
        title: "Lead mapped",
        description: "Lead has been successfully mapped to listing",
      });
    },
    onError: (_error) => {
      toast({
        variant: "destructive",
        title: "Failed to map lead",
        description: "Could not map the lead to listing",
      });
    },
  });
}

// Mutation hook for converting lead to connection request
export function useConvertLeadToRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      // Get the lead to extract the listing ID
      const { data: lead, error: leadError } = await supabase
        .from('inbound_leads')
        .select('mapped_to_listing_id')
        .eq('id', leadId)
        .single();

      if (leadError || !lead?.mapped_to_listing_id) {
        throw new Error('Lead must be mapped to a listing before conversion');
      }

      // Use the new RPC function to handle conversion and merging
      const { data: requestId, error } = await supabase.rpc('convert_inbound_lead_to_request', {
        p_lead_id: leadId,
        p_listing_id: lead.mapped_to_listing_id
      });

      if (error) throw error;

      return { id: requestId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbound-leads'] });
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      toast({
        title: 'Lead converted',
        description: 'Lead has been successfully converted to a connection request',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to convert lead',
        description: error instanceof Error ? error.message : 'Could not convert the lead to connection request',
      });
    },
  });
}

// Mutation hook for archiving leads
export function useArchiveInboundLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase
        .from('inbound_leads')
        .update({
          status: 'archived',
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbound-leads'] });
      toast({
        title: "Lead archived",
        description: "Lead has been archived",
      });
    },
    onError: (_error) => {
      toast({
        variant: "destructive",
        title: "Failed to archive lead",
        description: "Could not archive the lead",
      });
    },
  });
}