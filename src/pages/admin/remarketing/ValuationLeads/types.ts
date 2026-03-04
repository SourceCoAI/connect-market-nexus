// ─── Types ───

export interface ValuationLead {
  id: string;
  calculator_type: string;
  display_name: string | null;
  email: string | null;
  full_name: string | null;
  business_name: string | null;
  website: string | null;
  phone: string | null;
  linkedin_url: string | null;
  industry: string | null;
  region: string | null;
  location: string | null;
  revenue: number | null;
  ebitda: number | null;
  valuation_low: number | null;
  valuation_mid: number | null;
  valuation_high: number | null;
  quality_tier: string | null;
  quality_label: string | null;
  exit_timing: string | null;
  open_to_intros: boolean | null;
  cta_clicked: boolean | null;
  readiness_score: number | null;
  growth_trend: string | null;
  owner_dependency: string | null;
  locations_count: number | null;
  buyer_lane: string | null;
  revenue_model: string | null;
  lead_score: number | null;
  scoring_notes: string | null;
  pushed_to_all_deals: boolean | null;
  pushed_to_all_deals_at: string | null;
  pushed_listing_id: string | null;
  status: string | null;
  excluded: boolean | null;
  exclusion_reason: string | null;
  created_at: string;
  updated_at: string;
  lead_source: string | null;
  source_submission_id: string | null;
  synced_at: string | null;
  calculator_specific_data: Record<string, unknown> | null;
  raw_calculator_inputs: Record<string, unknown> | null;
  raw_valuation_results: Record<string, unknown> | null;
  // For deal owner display (assigned after push)
  deal_owner_id?: string | null;
  is_priority_target?: boolean | null;
  needs_buyer_search?: boolean | null;
  needs_buyer_universe?: boolean | null;
  need_to_contact_owner?: boolean | null;
  needs_owner_contact?: boolean | null;
  is_archived?: boolean | null;
  not_a_fit?: boolean | null;
  // Joined from listings (via pushed_listing_id) — populated by enrichment
  listing_description?: string | null;
}

export type SortColumn =
  | 'display_name'
  | 'website'
  | 'industry'
  | 'location'
  | 'revenue'
  | 'ebitda'
  | 'valuation'
  | 'exit_timing'
  | 'intros'
  | 'quality'
  | 'score'
  | 'created_at'
  | 'pushed'
  | 'owner'
  | 'priority';

export type SortDirection = 'asc' | 'desc';
