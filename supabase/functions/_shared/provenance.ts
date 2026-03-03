/**
 * Data Provenance System
 *
 * Defines which fields may be populated from which source type.
 * This is the SINGLE SOURCE OF TRUTH for data ownership rules.
 *
 * Three layers of enforcement:
 * 1. Extract-time: validateFieldProvenance() blocks prohibited field+source combos
 * 2. Source priority: TRANSCRIPT_PROTECTED_FIELDS prevents website overwrites
 * 3. Write-time: buildUpdateObject() in buyer-extraction.ts re-validates before DB write
 */

export type SourceType = 'platform_website' | 'pe_firm_website' | 'transcript' | 'csv' | 'manual' | 'marketplace';

// Numeric priority for each source type — higher value = more trusted.
// Used to decide whether a new extraction should overwrite an existing field.
export const SOURCE_PRIORITY: Record<SourceType, number> = {
  manual: 110,       // Admin hand-edits are highest priority
  transcript: 100,   // Direct conversations — most reliable
  csv: 90,           // Bulk imports from verified data
  marketplace: 80,   // Self-reported signup data from marketplace profiles
  platform_website: 60,  // Scraped from the operating company's website
  pe_firm_website: 60,   // Scraped from the PE firm's website
};

// Fields that may ONLY be populated from platform website or transcripts — NEVER from PE firm website
export const PLATFORM_OWNED_FIELDS = new Set([
  // Business Identity
  'company_name', 'business_summary', 'services_offered', 'business_type',
  'industry_vertical', 'revenue_model',
  // Customer Profile
  'primary_customer_size', 'customer_industries', 'customer_geographic_reach', 'target_customer_profile',
  // HQ Location — PE firm HQ is NOT the platform's HQ
  'hq_city', 'hq_state', 'hq_country', 'hq_region',
  // Operating footprint — PE firm offices are NOT platform operating locations
  'operating_locations',
]);

// Fields that may ONLY be populated from TRANSCRIPTS — NEVER from any website
// Size criteria (EBITDA/revenue ranges) must come from direct conversations,
// not websites. AI models hallucinate these values when scraping platform
// websites that have no investment criteria published.
export const TRANSCRIPT_ONLY_FIELDS = new Set([
  'num_platforms',
  // Size criteria — must come from transcripts/notes only
  'target_revenue_min', 'target_revenue_max',
  'target_ebitda_min', 'target_ebitda_max',
]);

// Fields allowed to fall back from PE firm website when platform website is unavailable
// ONLY broad geographic coverage fields — NEVER HQ or operating locations
// PE firm HQ (e.g., Dallas TX) is NOT the platform company's HQ
export const PE_FALLBACK_ALLOWED_FIELDS = new Set([
  'geographic_footprint', 'service_regions',
]);

// Fields that can be populated from either source (shared/neutral)
export const SHARED_FIELDS = new Set([
  'target_industries', 'target_services', 'target_geographies',
  'acquisition_timeline',
  'acquisition_appetite', 'acquisition_frequency',
  'recent_acquisitions', 'portfolio_companies', 'total_acquisitions',
  'thesis_summary',
  'data_last_updated', 'extraction_sources',
  'notes', 'has_fee_agreement',
]);

// Fields that are NEVER overwritten from website if they have transcript source
export const TRANSCRIPT_PROTECTED_FIELDS = [
  // Investment Thesis
  'thesis_summary',
  // Size Criteria (using actual column names)
  'target_revenue_min', 'target_revenue_max',
  'target_ebitda_min', 'target_ebitda_max',

  // Geographic Targeting
  'target_geographies',

  // Business Model Targeting
  'target_industries',
  'target_services',

  // Activity
  'acquisition_appetite',
  'acquisition_timeline',
  'acquisition_frequency',
];

// Placeholder strings to filter out from extracted values
export const PLACEHOLDER_STRINGS = new Set([
  'not specified', 'n/a', 'na', 'unknown', 'none', 'tbd', 'not available', '',
  '<unknown>', '<UNKNOWN>', 'undefined', 'null'
]);

/**
 * Looks up the highest-priority source that has written a specific field.
 * Searches the extraction_sources array for evidence records containing the field.
 * Returns the priority number, or 0 if no source has written this field.
 */
export function getFieldSourcePriority(
  fieldName: string,
  extractionSources: unknown[],
): { priority: number; sourceType: string | null } {
  let maxPriority = 0;
  let sourceType: string | null = null;

  for (const src of extractionSources) {
    // Handle the per-field source tracking record (type: 'field_sources')
    // This stores { fields: { fieldName: { source, priority, at } } }
    if (src.type === 'field_sources' && src.fields && typeof src.fields === 'object') {
      const fieldEntry = src.fields[fieldName];
      if (fieldEntry && typeof fieldEntry.priority === 'number') {
        if (fieldEntry.priority > maxPriority) {
          maxPriority = fieldEntry.priority;
          sourceType = fieldEntry.source || null;
        }
      }
      continue;
    }

    // Handle standard evidence records with fields_extracted arrays
    const fields = src.fields_extracted || src.fields || [];
    if (!Array.isArray(fields) || !fields.includes(fieldName)) continue;

    // Use explicit priority if stored, otherwise infer from source type
    let priority: number;
    if (typeof src.priority === 'number') {
      priority = src.priority;
    } else {
      const type = (src.type || src.source_type || 'platform_website') as SourceType;
      const normalizedType = normalizeSourceType(type);
      priority = SOURCE_PRIORITY[normalizedType] ?? 60;
    }

    if (priority > maxPriority) {
      maxPriority = priority;
      sourceType = src.type || src.source_type || null;
    }
  }

  return { priority: maxPriority, sourceType };
}

/**
 * Normalizes various source type strings to canonical SourceType values.
 */
function normalizeSourceType(type: string): SourceType {
  if (type === 'buyer_transcript' || type === 'transcript') return 'transcript';
  if (type === 'marketplace_profile' || type === 'marketplace_backfill' || type === 'marketplace_sync') return 'marketplace';
  if (type === 'website' || type === 'platform_website') return 'platform_website';
  if (type === 'pe_firm_website') return 'pe_firm_website';
  if (type === 'csv') return 'csv';
  if (type === 'manual') return 'manual';
  return 'platform_website'; // safe default
}

/**
 * Validates whether a field may be written from a given source type.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function validateFieldProvenance(
  fieldName: string,
  sourceType: SourceType,
): { allowed: boolean; reason?: string } {
  // Transcripts, CSV, marketplace, and manual sources can write to any field
  if (sourceType === 'transcript' || sourceType === 'csv' || sourceType === 'manual' || sourceType === 'marketplace') {
    return { allowed: true };
  }

  // PE firm website → platform-owned fields = FORBIDDEN
  if (sourceType === 'pe_firm_website' && PLATFORM_OWNED_FIELDS.has(fieldName)) {
    return {
      allowed: false,
      reason: `PROVENANCE VIOLATION: Attempted to write pe_firm_website data to platform-owned field '${fieldName}'. This is forbidden.`,
    };
  }

  // ANY website → transcript-only fields = FORBIDDEN
  // Deal structure (revenue/EBITDA ranges) can ONLY come from transcripts
  if ((sourceType === 'platform_website' || sourceType === 'pe_firm_website') && TRANSCRIPT_ONLY_FIELDS.has(fieldName)) {
    return {
      allowed: false,
      reason: `PROVENANCE VIOLATION: Attempted to write ${sourceType} data to transcript-only field '${fieldName}'. Deal structure can only come from transcripts.`,
    };
  }

  return { allowed: true };
}
