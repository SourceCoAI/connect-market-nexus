// Remarketing Tool TypeScript Types

export interface ReMarketingBuyerUniverse {
  id: string;
  name: string;
  description: string | null;
  fit_criteria: string | null;
  size_criteria: SizeCriteria;
  geography_criteria: GeographyCriteria;
  service_criteria: ServiceCriteria;
  buyer_types_criteria: BuyerTypesCriteria;
  geography_weight: number;
  size_weight: number;
  service_weight: number;
  owner_goals_weight: number;
  scoring_behavior: ScoringBehavior;
  ma_guide_content: string | null;
  documents: DocumentReference[];
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Computed
  buyer_count?: number;
  deal_count?: number;
}

export interface SizeCriteria {
  revenue_min?: number;
  revenue_max?: number;
  min_revenue?: number | string;
  max_revenue?: number | string;
  ideal_revenue?: number | string;
  ebitda_min?: number;
  ebitda_max?: number;
  min_ebitda?: number | string;
  max_ebitda?: number | string;
  ideal_ebitda?: number | string;
  employee_min?: number;
  employee_max?: number;
  // New fields from Whispers
  locations_min?: number;
  locations_max?: number;
  min_locations?: number | string;
  max_locations?: number | string;
  total_sqft_min?: number;
  total_sqft_max?: number;
  other_notes?: string;
  notes?: string;
}

export interface GeographyCriteria {
  target_states?: string[];
  target_regions?: string[];
  exclude_states?: string[];
  excluded_regions?: string[];
  adjacency_preference?: boolean;
  // New fields from Whispers
  coverage?: 'local' | 'regional' | 'national';
  hq_requirements?: string;
  geographic_strategy?: string;
  other_notes?: string;
  notes?: string;
}

export interface ServiceCriteria {
  primary_focus?: string[];
  required_services?: string[];
  preferred_services?: string[];
  secondary_services?: string[];
  excluded_services?: string[];
  // New fields from Whispers
  business_model?: string;
  customer_profile?: string;
  notes?: string;
}

export interface BuyerTypesCriteria {
  include_pe_firms?: boolean; // private_equity buyers
  include_platforms?: boolean; // corporate buyers (legacy name kept for DB compat)
  include_strategic?: boolean; // corporate buyers (legacy alias)
  include_family_office?: boolean;
  include_independent_sponsors?: boolean;
  include_search_funds?: boolean;
  include_individual_buyers?: boolean;
}

// Nested scoring behavior sub-interfaces
export interface SizeScoringBehavior {
  strictness?: 'strict' | 'moderate' | 'lenient';
  below_minimum_behavior?: 'disqualify' | 'penalize';
  single_location_penalty?: boolean;
}

export interface ServiceScoringBehavior {
  matching_mode?: 'exact' | 'semantic';
  require_primary_focus_match?: boolean;
  excluded_services_are_dealbreakers?: boolean;
}

export interface GeographyScoringBehavior {
  strictness?: 'strict' | 'moderate' | 'lenient';
  proximity_miles?: number;
  multi_location_rule?: 'regional' | 'national';
  single_location_rule?: 'same_state' | 'adjacent' | 'regional';
  allow_national_for_attractive_deals?: boolean;
}

export interface EngagementScoringBehavior {
  weight_multiplier?: number;
  override_geography?: boolean;
  override_size?: boolean;
}

// Extended scoring behavior with all Whispers features
export interface ScoringBehavior {
  // Original basic toggles
  boost_adjacency?: boolean;
  penalize_distance?: boolean;
  require_thesis_match?: boolean;
  // Industry preset
  industry_preset?: 'collision_repair' | 'software' | 'hvac' | 'pest_control' | 'custom';

  // Geography Scoring
  geography_strictness?: 'strict' | 'moderate' | 'flexible';
  single_location_matching?: 'exact_state' | 'adjacent_states' | 'same_region';
  multi_location_matching?: 'same_region' | 'national' | 'any';
  allow_national_buyers?: boolean;

  // Size/Revenue Scoring
  size_strictness?: 'strict' | 'moderate' | 'flexible';
  below_minimum_handling?: 'disqualify' | 'penalize' | 'allow';
  penalize_single_location?: boolean;

  // Service Matching
  service_matching_mode?: 'keyword' | 'semantic' | 'hybrid';
  require_primary_focus?: boolean;
  excluded_services_dealbreaker?: boolean;

  // Engagement Overrides
  can_override_geography?: boolean;
  can_override_size?: boolean;
  engagement_weight_multiplier?: number;

  // Nested behavior objects (used by ScoringBehaviorPanel)
  size?: SizeScoringBehavior;
  services?: ServiceScoringBehavior;
  geography?: GeographyScoringBehavior;
  engagement?: EngagementScoringBehavior;
}

// Target buyer type for ranked cards
export interface TargetBuyerTypeConfig {
  id: string;
  rank: number;
  name: string;
  description: string;
  locations_min?: number;
  locations_max?: number;
  revenue_per_location?: number;
  deal_requirements?: string;
  enabled: boolean;
}

export interface DocumentReference {
  id: string;
  name: string;
  url?: string;
  path?: string;
  uploaded_at: string;
  type?: string;
  auto_generated?: boolean;
}

export type BuyerType =
  | 'private_equity'
  | 'corporate'
  | 'family_office'
  | 'independent_sponsor'
  | 'search_fund'
  | 'individual_buyer';

/** Source of the buyer_type classification */
export type BuyerTypeSource = 'ai_auto' | 'admin_manual' | 'import' | 'signup';

export type ScoreTier = 'A' | 'B' | 'C' | 'D' | 'F';
export type ScoreStatus = 'pending' | 'approved' | 'passed' | 'hidden';

/** Canonical buyer type options for dropdowns and forms */
export const REMARKETING_BUYER_TYPE_OPTIONS: { value: BuyerType; label: string }[] = [
  { value: 'private_equity', label: 'Private Equity' },
  { value: 'corporate', label: 'Corporate / Strategic' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'independent_sponsor', label: 'Independent Sponsor' },
  { value: 'search_fund', label: 'Search Fund' },
  { value: 'individual_buyer', label: 'Individual Buyer' },
];

export interface ReMarketingBuyer {
  id: string;
  universe_id: string | null;
  company_name: string;
  company_website: string | null;
  buyer_type: BuyerType | null;
  thesis_summary: string | null;
  target_revenue_min: number | null;
  target_revenue_max: number | null;
  target_ebitda_min: number | null;
  target_ebitda_max: number | null;
  target_geographies: string[];
  target_services: string[];
  target_industries: string[];
  geographic_footprint: string[];
  recent_acquisitions: AcquisitionRecord[];
  portfolio_companies: PortfolioCompany[];
  extraction_sources: ExtractionSource[];
  data_last_updated: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  // Whispers parity fields
  pe_firm_name?: string | null;
  pe_firm_website?: string | null;
  email_domain?: string | null;
  has_fee_agreement?: boolean;
  hq_city?: string | null;
  hq_state?: string | null;
  acquisition_timeline?: string | null;
  acquisition_appetite?: string | null;
  total_acquisitions?: number;
  // Classification metadata
  buyer_type_confidence?: number | null;
  buyer_type_reasoning?: string | null;
  buyer_type_source?: BuyerTypeSource | null;
  buyer_type_needs_review?: boolean;
  buyer_type_classified_at?: string | null;
  buyer_type_ai_recommendation?: BuyerType | null;
  // PE backing (separate from buyer_type)
  is_pe_backed?: boolean;
  pe_firm_id?: string | null;
  // Relations
  contacts?: ReMarketingBuyerContact[];
  universe?: ReMarketingBuyerUniverse;
}

export interface AcquisitionRecord {
  company_name: string;
  date?: string;
  revenue?: number;
  location?: string;
  services?: string[];
}

export interface PortfolioCompany {
  name: string;
  website?: string;
  revenue?: number;
  locations?: string[];
  services?: string[];
}

export interface ExtractionSource {
  type: 'website' | 'transcript' | 'csv' | 'manual';
  url?: string;
  extracted_at: string;
  fields_extracted: string[];
}

export interface ReMarketingBuyerContact {
  id: string;
  buyer_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  linkedin_url: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReMarketingScore {
  id: string;
  listing_id: string;
  buyer_id: string;
  universe_id: string | null;
  composite_score: number;
  geography_score: number;
  size_score: number;
  service_score: number;
  owner_goals_score: number;
  size_multiplier: number | null;
  service_multiplier: number | null;
  geography_mode_factor: number | null;
  thesis_alignment_bonus: number | null;
  data_quality_bonus: number | null;
  learning_penalty: number | null;
  is_disqualified: boolean | null;
  disqualification_reason: string | null;
  needs_review: boolean | null;
  tier: ScoreTier | null;
  fit_reasoning: string | null;
  status: ScoreStatus;
  pass_reason: string | null;
  pass_category: string | null;
  human_override_score: number | null;
  scored_by: string | null;
  scored_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  buyer?: ReMarketingBuyer;
  listing?: {
    id: string;
    title: string;
    revenue?: number;
    ebitda?: number;
    location?: string;
  };
}

// Score breakdown for UI display
export interface ScoreBreakdown {
  geography: number;
  size: number;
  service: number;
  ownerGoals: number;
  composite: number;
  tier: ScoreTier;
}

export interface ReferralSubmission {
  id: string;
  referral_partner_id: string;
  company_name: string;
  website: string | null;
  industry: string | null;
  revenue: number | null;
  ebitda: number | null;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  listing_id: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  // Joined relations
  referral_partners?: { id: string; name: string; company: string | null };
}

// ─── Global Activity Queue ──────────────────────────────────────────

export type GlobalActivityOperationType =
  | 'deal_enrichment'
  | 'buyer_enrichment'
  | 'guide_generation'
  | 'buyer_scoring'
  | 'criteria_extraction'
  | 'buyer_universe_generation';

export type GlobalActivityClassification = 'major' | 'minor';

export type { GlobalActivityStatus } from './status-enums';

export interface GlobalActivityErrorEntry {
  itemId: string;
  error: string;
  timestamp: string;
}

export interface GlobalActivityQueueItem {
  id: string;
  operation_type: GlobalActivityOperationType;
  classification: GlobalActivityClassification;
  status: GlobalActivityStatus;
  total_items: number;
  completed_items: number;
  failed_items: number;
  context_json: Record<string, unknown>;
  error_log: GlobalActivityErrorEntry[];
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  queued_at: string;
  created_at: string;
  description: string | null;
  // Joined from profiles
  profiles?: { full_name: string | null; email: string | null } | null;
}

export const OPERATION_TYPE_LABELS: Record<GlobalActivityOperationType, string> = {
  deal_enrichment: 'Deal Enrichment',
  buyer_enrichment: 'Buyer Enrichment',
  guide_generation: 'Industry Guide Generation',
  buyer_scoring: 'Buyer-Deal Scoring',
  criteria_extraction: 'Criteria Extraction',
  buyer_universe_generation: 'Buyer Universe Generation',
};
