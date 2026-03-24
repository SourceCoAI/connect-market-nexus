export interface MatchToolLead {
  id: string;
  website: string;
  business_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  revenue: string | null;
  profit: string | null;
  timeline: string | null;
  submission_stage: string;
  industry: string | null;
  location: string | null;
  raw_inputs: Record<string, unknown> | null;
  status: string;
  excluded: boolean | null;
  not_a_fit: boolean | null;
  exclusion_reason: string | null;
  pushed_to_all_deals: boolean | null;
  pushed_to_all_deals_at: string | null;
  pushed_listing_id: string | null;
  deal_owner_id: string | null;
  quality_tier: string | null;
  lead_score: number | null;
  scoring_notes: string | null;
  submission_count: number | null;
  created_at: string;
  updated_at: string;
}

export type MatchToolSortColumn =
  | 'website'
  | 'full_name'
  | 'revenue'
  | 'submission_stage'
  | 'status'
  | 'created_at'
  | 'pushed';
