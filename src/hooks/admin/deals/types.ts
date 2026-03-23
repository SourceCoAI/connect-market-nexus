export interface Deal {
  deal_id: string;
  title: string;
  deal_description?: string;
  deal_value: number;
  deal_priority: 'low' | 'medium' | 'high' | 'urgent';
  deal_probability: number;
  deal_expected_close_date?: string;
  deal_source: string;
  source?: string; // Aliased for convenience
  deal_created_at: string;
  deal_updated_at: string;
  deal_stage_entered_at: string;

  // Stage information
  stage_id: string;
  stage_name: string | null;
  stage_color: string;
  stage_position: number;

  // Listing information
  listing_id: string | null;
  listing_title: string;
  listing_revenue: number;
  listing_ebitda: number;
  listing_location: string;
  listing_category?: string;
  listing_real_company_name?: string;

  // Contact information
  contact_name?: string;
  contact_email?: string;
  contact_company?: string;
  contact_phone?: string;
  contact_role?: string;

  // Administrative status information
  nda_status: 'not_sent' | 'sent' | 'signed' | 'declined';
  fee_agreement_status: 'not_sent' | 'sent' | 'signed' | 'declined';
  followed_up: boolean;
  followed_up_at?: string;
  followed_up_by?: string;
  negative_followed_up: boolean;
  negative_followed_up_at?: string;
  negative_followed_up_by?: string;

  // Assignment information (Deal Owner)
  assigned_to?: string; // Deal Owner ID
  assigned_admin_name?: string;
  assigned_admin_email?: string;
  owner_assigned_at?: string;
  owner_assigned_by?: string;

  // Primary Owner info (from listing)
  primary_owner_id?: string;
  primary_owner_name?: string;
  primary_owner_email?: string;

  // Task counts
  total_tasks: number;
  pending_tasks: number;
  completed_tasks: number;
  pending_tasks_count?: number;
  completed_tasks_count?: number;

  // Activity count
  activity_count: number;
  total_activities_count?: number;
  last_activity_at?: string;

  // Enhanced buyer information (from profiles)
  buyer_id?: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_company?: string;
  buyer_type?: string;
  buyer_phone?: string;
  buyer_priority_score?: number;
  buyer_quality_score?: number | null;
  buyer_tier?: number | null;
  buyer_website?: string;

  // Real contact tracking
  last_contact_at?: string;
  last_contact_type?: 'email' | 'phone' | 'meeting' | 'note';
  next_followup_due?: string;
  followup_overdue?: boolean;

  // Connection request ID for document management
  connection_request_id?: string;

  // Company grouping
  company_deal_count?: number;
  listing_deal_count?: number; // More reliable - counts deals per listing
  buyer_connection_count?: number; // Total connection requests by this buyer

  // Remarketing bridge (when deal originated from remarketing)
  remarketing_buyer_id?: string | null;
  remarketing_score_id?: string | null;

  // Scoring & flags from listing
  deal_score?: number | null;
  is_priority_target?: boolean | null;
  needs_owner_contact?: boolean | null;
  needs_buyer_search?: boolean | null;

  // Document distribution flags
  memo_sent?: boolean;
  has_data_room?: boolean;

  // Meeting scheduled flag
  meeting_scheduled?: boolean;

  // Under LOI flag
  under_loi?: boolean;
}

export interface DealStage {
  id: string;
  name: string;
  description?: string;
  position: number;
  color: string;
  is_active: boolean;
  is_default: boolean;
  is_system_stage?: boolean;
  default_probability?: number;
  stage_type?: 'active' | 'closed_won' | 'closed_lost';
  created_at: string;
  updated_at: string;
}

/** RPC result row from get_deals_with_buyer_profiles */
// @ts-expect-error -- kept for reference; RPC schema documentation
interface _DealRpcRow {
  deal_id: string;
  deal_title: string | null;
  deal_description: string | null;
  deal_value: number | null;
  deal_priority: string | null;
  deal_probability: number | null;
  deal_expected_close_date: string | null;
  deal_source: string | null;
  deal_created_at: string;
  deal_updated_at: string;
  deal_stage_entered_at: string;
  deal_deleted_at: string | null;
  connection_request_id: string | null;
  stage_id: string | null;
  stage_name: string | null;
  stage_color: string | null;
  stage_position: number | null;
  stage_is_active: boolean | null;
  stage_is_default: boolean | null;
  stage_is_system_stage: boolean | null;
  stage_default_probability: number | null;
  stage_type: string | null;
  listing_id: string | null;
  listing_title: string | null;
  listing_revenue: number | null;
  listing_ebitda: number | null;
  listing_location: string | null;
  listing_category: string | null;
  listing_internal_company_name: string | null;
  listing_image_url: string | null;
  listing_deal_total_score: number | null;
  listing_is_priority_target: boolean | null;
  listing_needs_owner_contact: boolean | null;
  listing_needs_buyer_search: boolean | null;
  admin_id: string | null;
  admin_first_name: string | null;
  admin_last_name: string | null;
  admin_email: string | null;
  buyer_type: string | null;
  buyer_website: string | null;
  buyer_quality_score: number | null;
  buyer_tier: number | null;
  // Contact/buyer fields
  contact_name: string | null;
  contact_email: string | null;
  contact_company: string | null;
  contact_phone: string | null;
  contact_role: string | null;
  buyer_first_name: string | null;
  buyer_last_name: string | null;
  buyer_email: string | null;
  buyer_company: string | null;
  buyer_phone: string | null;
  // Status fields
  nda_status: string | null;
  fee_agreement_status: string | null;
  followed_up: boolean | null;
  followed_up_at: string | null;
  negative_followed_up: boolean | null;
  negative_followed_up_at: string | null;
  meeting_scheduled: boolean | null;
  under_loi: boolean | null;
}
