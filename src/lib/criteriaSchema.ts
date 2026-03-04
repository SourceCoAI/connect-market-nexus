/**
 * Criteria Schema Utilities
 * TypeScript interfaces matching JSONB schemas for buyer_universes
 */

// ============= Size Criteria =============
export interface SizeCriteriaSchema {
  // Revenue thresholds (in dollars)
  revenue_min?: number;
  revenue_max?: number;

  // EBITDA thresholds (in dollars)
  ebitda_min?: number;
  ebitda_max?: number;

  // EBITDA multiples (separate from dollar amounts)
  ebitda_multiple_min?: number;
  ebitda_multiple_max?: number;

  // Employee counts
  employee_min?: number;
  employee_max?: number;

  // Location-based metrics
  locations_min?: number;
  locations_max?: number;
  total_sqft_min?: number;
  total_sqft_max?: number;

  // Per-location metrics
  revenue_per_location?: number;
  ebitda_per_location?: number;

  // Additional notes
  other_notes?: string;
}

// ============= Service Criteria =============
export interface ServiceCriteriaSchema {
  // PRIMARY FOCUS - CRITICAL for scoring algorithm
  primary_focus?: string[];

  // Service requirements
  required_services?: string[];
  preferred_services?: string[];
  excluded_services?: string[];

  // Business model classification
  business_model?: string;
  customer_profile?: string;

  // Additional descriptors
  specializations?: string[];
  vertical_focus?: string;
}

// ============= Geography Criteria =============
export interface GeographyCriteriaSchema {
  // Required/Preferred/Excluded regions
  target_states?: string[];
  target_regions?: string[];
  preferred_metros?: string[];
  exclude_states?: string[];

  // Coverage mode
  coverage?: 'local' | 'regional' | 'national' | 'multi-state';

  // HQ requirements
  hq_requirements?: string;
  hq_states?: string[];

  // Adjacency preferences
  adjacency_preference?: boolean;

  // Additional notes
  other_notes?: string;
}

// ============= Buyer Types Criteria =============
export interface BuyerTypeConfig {
  id: string;
  priority: number;
  name: string;
  description?: string;

  // Size thresholds for this buyer type
  locations_min?: number;
  locations_max?: number;
  revenue_threshold?: number;

  // Acquisition style
  acquisition_style?: 'platform' | 'add-on' | 'tuck-in' | 'rollup';

  // Enabled flag
  enabled: boolean;
}

export interface BuyerTypesCriteriaSchema {
  // Boolean flags for buyer type filtering
  include_pe_firms?: boolean; // private_equity buyers
  include_platforms?: boolean; // corporate buyers (legacy name kept for DB compat)
  include_strategic?: boolean; // corporate buyers (legacy alias)
  include_family_office?: boolean;
  include_independent_sponsors?: boolean;
  include_search_funds?: boolean;
  include_individual_buyers?: boolean;

  // Ranked buyer type configurations
  buyer_types?: BuyerTypeConfig[];
}

// ============= Scoring Behavior =============
export interface ScoringBehaviorSchema {
  // Industry preset
  industry_preset?:
    | 'collision_repair'
    | 'software'
    | 'hvac'
    | 'pest_control'
    | 'home_services'
    | 'custom';

  // Geography scoring
  geography_strictness?: 'strict' | 'moderate' | 'flexible';
  single_location_matching?: 'exact_state' | 'adjacent_states' | 'same_region';
  multi_location_matching?: 'same_region' | 'national' | 'any';
  allow_national_buyers?: boolean;

  // Size scoring
  size_strictness?: 'strict' | 'moderate' | 'flexible';
  below_minimum_handling?: 'disqualify' | 'penalize' | 'allow';
  penalize_single_location?: boolean;

  // Service matching
  service_matching_mode?: 'keyword' | 'semantic' | 'hybrid';
  require_primary_focus?: boolean;
  excluded_services_dealbreaker?: boolean;

  // Engagement overrides
  can_override_geography?: boolean;
  can_override_size?: boolean;
  engagement_weight_multiplier?: number;

  // Legacy toggles
  boost_adjacency?: boolean;
  penalize_distance?: boolean;
  require_thesis_match?: boolean;
}

// ============= Complete Criteria Set =============
export interface CompleteCriteriaSet {
  size_criteria: SizeCriteriaSchema;
  service_criteria: ServiceCriteriaSchema;
  geography_criteria: GeographyCriteriaSchema;
  buyer_types_criteria: BuyerTypesCriteriaSchema;
  scoring_behavior?: ScoringBehaviorSchema;
  scoring_hints?: ScoringHints;
}

export interface ScoringHints {
  geography_mode?: 'strict' | 'flexible' | 'national';
  size_importance?: 'critical' | 'important' | 'flexible';
  service_matching?: 'exact' | 'related' | 'broad';
  buyer_type_priority?: string[];
}

// ============= Parsing Utilities =============

/**
 * Parse currency string to number
 * Handles: $2.5M, $2,500,000, 2.5, 2.5M, 2500000
 */
export function parseCurrency(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  if (typeof value === 'number') return value;

  // Remove currency symbols and commas
  let cleaned = value
    .toString()
    .replace(/[$,\s]/g, '')
    .trim();

  // Handle M/MM for millions
  if (/m{1,2}$/i.test(cleaned)) {
    cleaned = cleaned.replace(/m{1,2}$/i, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num * 1_000_000;
  }

  // Handle K for thousands
  if (/k$/i.test(cleaned)) {
    cleaned = cleaned.replace(/k$/i, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num * 1_000;
  }

  // Handle B for billions
  if (/b$/i.test(cleaned)) {
    cleaned = cleaned.replace(/b$/i, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num * 1_000_000_000;
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/**
 * Format number as currency string
 */
export function formatCurrency(value: number | undefined, compact = true): string {
  if (value === undefined || value === null) return '';

  if (compact) {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Parse string array from various formats
 * Handles: "CA, TX, FL", ["CA", "TX", "FL"], "California; Texas; Florida"
 */
export function parseStringArray(value: string | string[] | undefined): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter(Boolean).map((s) => s.trim());
  }

  // Split by common delimiters
  return value
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse number or return undefined
 */
export function parseNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  if (typeof value === 'number') return value;

  const num = parseFloat(value.toString().replace(/[,\s]/g, ''));
  return isNaN(num) ? undefined : num;
}

/**
 * Check if a value is a placeholder (e.g., [X], $[X]M, [VALUE])
 */
export function isPlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  return /\[[^\]]*\]|\[X\]|\[VALUE\]|\[TBD\]|\[RANGE\]/i.test(value);
}

/**
 * Remove placeholder patterns from text
 */
export function cleanPlaceholders(text: string): string {
  return text
    .replace(/\$?\[X\]/gi, '')
    .replace(/\[[A-Z_]+\]/gi, '')
    .replace(/\$?\d*\s*-\s*\$?\[X\]/gi, '')
    .replace(/\[TBD\]/gi, '')
    .replace(/\[VALUE\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if EBITDA value is a multiple (e.g., 3x-5x) vs dollar amount
 */
export function isEbitdaMultiple(value: string | number | undefined): boolean {
  if (value === undefined || value === null) return false;

  const str = value.toString().toLowerCase();

  // Direct multiple indicators
  if (/\dx/i.test(str)) return true;
  if (str.includes('times') || str.includes('multiple')) return true;

  // Small numbers without currency likely multiples
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (!isNaN(num) && num > 0 && num < 20 && !str.includes('$') && !str.includes('m')) {
    return true;
  }

  return false;
}

/**
 * Separate EBITDA multiples from dollar amounts
 */
export function separateEbitdaMultiples(criteria: Partial<SizeCriteriaSchema>): SizeCriteriaSchema {
  const result = { ...criteria };

  // Check if ebitda_min looks like a multiple
  if (result.ebitda_min !== undefined) {
    const val = result.ebitda_min;
    if (val > 0 && val < 20) {
      result.ebitda_multiple_min = val;
      result.ebitda_min = undefined;
    }
  }

  // Check if ebitda_max looks like a multiple
  if (result.ebitda_max !== undefined) {
    const val = result.ebitda_max;
    if (val > 0 && val < 20) {
      result.ebitda_multiple_max = val;
      result.ebitda_max = undefined;
    }
  }

  return result as SizeCriteriaSchema;
}

// ============= Region Mappings =============

export const US_REGIONS: Record<string, string[]> = {
  Southeast: [
    'Florida',
    'Georgia',
    'Alabama',
    'South Carolina',
    'North Carolina',
    'Tennessee',
    'Mississippi',
    'Louisiana',
    'Kentucky',
    'Virginia',
  ],
  Northeast: [
    'New York',
    'New Jersey',
    'Pennsylvania',
    'Massachusetts',
    'Connecticut',
    'Maine',
    'New Hampshire',
    'Vermont',
    'Rhode Island',
    'Delaware',
    'Maryland',
  ],
  Midwest: [
    'Illinois',
    'Ohio',
    'Michigan',
    'Indiana',
    'Wisconsin',
    'Minnesota',
    'Iowa',
    'Missouri',
    'Kansas',
    'Nebraska',
    'North Dakota',
    'South Dakota',
  ],
  Southwest: ['Texas', 'Arizona', 'New Mexico', 'Oklahoma', 'Nevada'],
  'West Coast': ['California', 'Oregon', 'Washington'],
  Mountain: ['Colorado', 'Utah', 'Idaho', 'Montana', 'Wyoming'],
};

export const STATE_TO_REGION: Record<string, string> = {};
Object.entries(US_REGIONS).forEach(([region, states]) => {
  states.forEach((state) => {
    STATE_TO_REGION[state] = region;
  });
});

/**
 * Get adjacent states for a given state
 */
export const ADJACENT_STATES: Record<string, string[]> = {
  California: ['Oregon', 'Nevada', 'Arizona'],
  Texas: ['New Mexico', 'Oklahoma', 'Arkansas', 'Louisiana'],
  Florida: ['Georgia', 'Alabama'],
  'New York': ['New Jersey', 'Pennsylvania', 'Connecticut', 'Massachusetts', 'Vermont'],
  // ... Add more as needed
};
