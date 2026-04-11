export interface NonMarketplaceUser {
  id: string; // synthetic ID: source_type:source_id
  email: string;
  name: string;
  company: string | null;
  role: string | null;
  phone: string | null;
  linkedin_url: string | null;
  mobile_phone_1: string | null;
  mobile_phone_2: string | null;
  mobile_phone_3: string | null;
  office_phone: string | null;
  source: 'connection_request' | 'inbound_lead' | 'deal';
  sources: ('connection_request' | 'inbound_lead' | 'deal')[]; // all sources this contact came from
  source_id: string; // original record ID
  firm_id: string | null;
  firm_name: string | null;
  created_at: string;

  // Aggregated metadata
  connection_requests_count: number;
  inbound_leads_count: number;
  deals_count: number;
  total_engagement_count: number;

  // Activity tracking
  last_activity_date: string | null;

  // Listings this contact has engaged with
  listing_names: string[];

  // Status tracking
  nda_status: string | null;
  fee_agreement_status: string | null;

  // Potential profile match
  potential_profile_id: string | null;
  potential_profile_name: string | null;

  // All associated records
  associated_records: {
    connection_requests: Record<string, unknown>[];
    inbound_leads: Record<string, unknown>[];
    deals: Record<string, unknown>[];
  };
}

export interface NonMarketplaceUserFilters {
  searchQuery?: string;
  sourceFilter?: 'all' | 'connection_request' | 'inbound_lead' | 'deal';
  agreementFilter?: 'all' | 'nda_signed' | 'fee_signed' | 'both_signed' | 'none_signed';
  firmFilter?: string;
  hasProfileMatch?: boolean;
  phoneFilter?: 'all' | 'needs_mobile' | 'has_mobile' | 'office_only' | 'no_phone';
}
