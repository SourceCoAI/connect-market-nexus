/**
 * Buyer Extraction Module
 *
 * Contains all buyer-specific extraction logic:
 * - AI prompt definitions (4 prompts) and extraction functions
 * - Geography and PE intelligence validation
 * - Field update building with provenance enforcement
 * - State code normalization and region mapping
 * - Data completeness calculation
 *
 * This module is imported by enrich-buyer/index.ts (the orchestrator).
 * All functions are pure or take explicit dependencies — no module-level mutable state.
 */

import { callGeminiWithTool, type RateLimitConfig } from "./ai-providers.ts";
import {
  type SourceType,
  TRANSCRIPT_PROTECTED_FIELDS,
  PLACEHOLDER_STRINGS,
  SOURCE_PRIORITY,
  validateFieldProvenance,
  getFieldSourcePriority,
} from "./provenance.ts";
import { normalizeState, VALID_US_STATE_CODES } from "./geography.ts";

// ============================================================================
// CONFIGURATION
// ============================================================================

export const BUYER_AI_CONFIG = {
  model: 'gemini-2.0-flash',
  max_tokens: 4096,
  temperature: 0, // Deterministic extraction
};

export const BUYER_MIN_CONTENT_LENGTH = 200;
export const BUYER_SCRAPE_TIMEOUT_MS = 30000; // 30s — aligned with deal scraping timeout
export const BUYER_AI_TIMEOUT_MS = 30000;

// Max parallel Gemini calls per buyer
export const BUYER_AI_CONCURRENCY = 3;

// ============================================================================
// STATE CODE CONSTANTS (delegated to canonical geography.ts)
// ============================================================================

// Re-export VALID_US_STATE_CODES under the name callers expect
export const VALID_STATE_CODES = VALID_US_STATE_CODES;

export const REGION_MAP: Record<string, string> = {
  'CT': 'Northeast', 'ME': 'Northeast', 'MA': 'Northeast', 'NH': 'Northeast',
  'RI': 'Northeast', 'VT': 'Northeast', 'NJ': 'Northeast', 'NY': 'Northeast', 'PA': 'Northeast',
  'IL': 'Midwest', 'IN': 'Midwest', 'MI': 'Midwest', 'OH': 'Midwest', 'WI': 'Midwest',
  'IA': 'Midwest', 'KS': 'Midwest', 'MN': 'Midwest', 'MO': 'Midwest',
  'NE': 'Midwest', 'ND': 'Midwest', 'SD': 'Midwest',
  'DE': 'South', 'FL': 'South', 'GA': 'South', 'MD': 'South', 'NC': 'South',
  'SC': 'South', 'VA': 'South', 'DC': 'South', 'WV': 'South',
  'AL': 'South', 'KY': 'South', 'MS': 'South', 'TN': 'South',
  'AR': 'South', 'LA': 'South', 'OK': 'South', 'TX': 'South',
  'AZ': 'West', 'CO': 'West', 'ID': 'West', 'MT': 'West', 'NV': 'West',
  'NM': 'West', 'UT': 'West', 'WY': 'West',
  'AK': 'West', 'CA': 'West', 'HI': 'West', 'OR': 'West', 'WA': 'West',
};

// ============================================================================
// COLUMN & FIELD CONSTANTS
// ============================================================================

// Valid columns in remarketing_buyers table (verified against actual schema)
// Removed 12 dead/overengineered fields: specialized_focus, strategic_priorities,
// revenue_sweet_spot, ebitda_sweet_spot, deal_preferences, deal_breakers, key_quotes,
// employee_range, detected_email_pattern, contact_discovery_status, last_contact_discovery_at, scores_stale_since
export const VALID_BUYER_COLUMNS = new Set([
  'company_name', 'company_website', 'platform_website', 'pe_firm_name', 'pe_firm_website',
  'business_summary', 'thesis_summary', 'buyer_type',
  'hq_city', 'hq_state', 'hq_country', 'hq_region',
  'geographic_footprint', 'service_regions', 'operating_locations', 'number_of_locations',
  'primary_customer_size', 'customer_geographic_reach', 'customer_industries', 'target_customer_profile',
  'target_revenue_min', 'target_revenue_max',
  'target_ebitda_min', 'target_ebitda_max',
  'target_services', 'target_industries', 'target_geographies',
  'acquisition_timeline', 'acquisition_appetite', 'acquisition_frequency',
  'recent_acquisitions', 'portfolio_companies', 'total_acquisitions', 'num_platforms',
  'industry_vertical',
  'data_last_updated', 'extraction_sources',
  'notes', 'has_fee_agreement',
  'services_offered', 'business_type', 'revenue_model',
  'marketplace_firm_id',
]);

// Map AI-extracted field names to actual database columns
export const FIELD_TO_COLUMN_MAP: Record<string, string> = {
  'platform_company_name': 'company_name',
  'min_revenue': 'target_revenue_min',
  'max_revenue': 'target_revenue_max',
  'min_ebitda': 'target_ebitda_min',
  'max_ebitda': 'target_ebitda_max',
};

// Location page patterns for discovery
// Ordered by specificity — more specific patterns first for better matching
// Location page patterns for discovery
// Ordered by specificity — more specific patterns first for better matching
// NOTE: /about and /contact removed — they match virtually every website and
// waste scraping slots on pages that rarely contain location data.
export const LOCATION_PATTERNS = [
  // Core location patterns
  '/locations',
  '/our-locations',
  '/all-locations',
  '/store-locator',
  '/store-finder',
  '/find-a-store',
  '/find-a-location',
  '/find-location',
  '/find-us',
  '/stores',
  '/our-stores',
  '/branches',
  '/offices',
  '/our-offices',
  // Service area patterns
  '/service-areas',
  '/service-area',
  '/coverage',
  '/coverage-area',
  '/coverage-areas',
  '/where-we-work',
  '/territories',
  '/service-territory',
  '/markets',
  // Auto / tire / repair verticals
  '/tire-shops',
  '/service-centers',
  '/auto-repair',
  '/shop-locations',
  // Healthcare verticals
  '/clinics',
  '/centers',
  '/practices',
  '/patient-care',
  // Retail / showroom
  '/showrooms',
  '/outlets',
  // Logistics / distribution
  '/warehouses',
  '/distribution-centers',
  '/facilities',
  // Franchise / network
  '/directory',
  '/network',
  '/franchises',
  '/dealer-locator',
  '/dealers',
  // About-us kept only as low-priority fallback (filtered to last when scoring)
  '/about-us',
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function normalizeStateCode(value: string): string {
  // Delegate to canonical normalizeState; fall back to trimmed input if unrecognized
  // (preserves original behavior: callers filter via VALID_STATE_CODES.has())
  return normalizeState(value) || value.trim();
}

export function getRegionFromState(stateCode: string): string | null {
  return REGION_MAP[stateCode] || null;
}

// ============================================================================
// PROMPT 1: BUSINESS OVERVIEW & SERVICES
// ============================================================================

export const PROMPT_1_BUSINESS = {
  name: 'extract_business_overview',
  description: 'Extract business overview from website content',
  input_schema: {
    type: 'object',
    properties: {
      company_name: { type: 'string', description: 'Official company name as stated on website' },
      services_offered: { type: 'string', description: "Detailed description of the services offered. Write as a natural prose paragraph covering: what specific services they provide, revenue mix between service lines if mentioned, whether residential vs commercial, and any specializations. NOT a list — write 2-4 sentences." },
      business_summary: { type: 'string', description: '2-3 sentence overview of what the company does operationally' },
      business_type: { type: 'string', enum: ['Service Provider', 'Distributor', 'Manufacturer', 'Retailer', 'Software', 'Other'] },
      industry_vertical: { type: 'string', description: "Industry category (e.g., 'Home Services - HVAC')" },
      revenue_model: { type: 'string', description: 'Detailed description of how the company generates revenue — include contract types, customer payment models, recurring vs project-based work, franchise fees if applicable. Write 1-3 sentences.' },
    },
  },
};

export const PROMPT_1_SYSTEM = `You are an M&A research analyst extracting PLATFORM COMPANY (operating company) information from its website for due diligence purposes.

CRITICAL DATA PROVENANCE RULE:
- You are analyzing the PLATFORM/OPERATING COMPANY website ONLY.
- Extract information about THIS company's operations, services, and business model.
- Do NOT use, reference, or infer any information from a PE firm, investment firm, or parent company.
- If the website content describes the PE firm's investment strategy instead of the operating company, return null for ALL fields.

Extract ONLY information that is explicitly stated in the content.
Do NOT infer, guess, or hallucinate any information.
If a field cannot be determined from the content, return null.

IMPORTANT for services_offered: Do NOT return a JSON array or bracketed list. Write a natural prose description of 2-4 sentences covering the service mix, any revenue breakdowns mentioned, and specializations. Example: "The company provides residential and commercial HVAC installation, repair, and maintenance services. They specialize in energy-efficient systems and offer 24/7 emergency service. Approximately 70% of revenue comes from residential customers."

IMPORTANT for revenue_model: Describe how money flows in 1-3 sentences. Include contract types, recurring vs one-time, franchise model if applicable.`;

// ============================================================================
// PROMPT 2: CUSTOMER PROFILE
// ============================================================================

export const PROMPT_2_CUSTOMER = {
  name: 'extract_customer_profile',
  description: 'Extract customer profile from website content',
  input_schema: {
    type: 'object',
    properties: {
      primary_customer_size: { type: 'string', description: "Target customer size (e.g., 'Residential homeowners', 'Mid-market businesses')" },
      customer_industries: { type: 'array', items: { type: 'string' }, description: "Industries served (e.g., ['Residential', 'Commercial', 'Industrial'])" },
      customer_geographic_reach: { type: 'string', description: "Geographic scope of customers (e.g., 'Southeast US', 'National')" },
      target_customer_profile: { type: 'string', description: 'Ideal customer description' },
    },
  },
};

export const PROMPT_2_SYSTEM = `You are an M&A research analyst extracting PLATFORM COMPANY (operating company) customer profile information from its website.

CRITICAL DATA PROVENANCE RULE:
- You are analyzing the PLATFORM/OPERATING COMPANY website ONLY.
- Extract information about THIS company's customers, not the PE firm's portfolio or investment targets.
- If the website describes PE firm investment criteria instead of the company's customers, return null for ALL fields.

Extract ONLY information that is explicitly stated in the content.
Do NOT infer, guess, or hallucinate any information.`;

// ============================================================================
// PROMPT 3a: GEOGRAPHIC FOOTPRINT
// ============================================================================

export const PROMPT_3A_GEOGRAPHY = {
  name: 'extract_geography',
  description: 'Extract geographic information from website content',
  input_schema: {
    type: 'object',
    properties: {
      hq_city: { type: 'string' },
      hq_state: { type: 'string', description: '2-letter US state code (e.g., TX not Texas)' },
      hq_country: { type: 'string', default: 'USA' },
      geographic_footprint: { type: 'array', items: { type: 'string' }, description: 'Array of 2-letter state codes where company operates, has offices, or provides services. Include states from office addresses, service area lists, explicitly named states, and cities with known states.' },
      service_regions: { type: 'array', items: { type: 'string' }, description: 'All states where company provides services or has customers, as 2-letter codes. Superset of geographic_footprint.' },
      operating_locations: { type: 'array', items: { type: 'string' }, description: 'REQUIRED: Every physical office, branch, store, or location mentioned on the website as "City, ST" (e.g., "Dallas, TX", "Atlanta, GA"). Extract from addresses, location lists, footer, contact pages, and branch directories. This is a critical field — extract aggressively.' },
      number_of_locations: { type: 'integer', description: 'Total number of physical locations/stores/branches/offices. Extract from explicit mentions like "100+ locations", "serving 50 markets", or count from location directory pages. If not explicitly stated, count the operating_locations extracted.' },
    },
  },
};

export const PROMPT_3A_SYSTEM = `You are an M&A research analyst extracting geographic coverage from a company website.

EXTRACTION RULES:
1. Extract ALL states where the company operates, has offices, or provides services
2. Include states from:
   - Office/location addresses (e.g., "123 Main St, Atlanta, GA" → GA)
   - Service area descriptions (e.g., "Serving Minnesota, Wisconsin, and Iowa" → MN, WI, IA)
   - Named state lists (e.g., "Operating in FL, GA, and AL" → FL, GA, AL)
   - City mentions with known states (e.g., "serving Dallas and Houston" → TX)
   - "Locations" or "Branches" pages listing cities
   - Footer addresses or contact pages
3. geographic_footprint = states with physical presence (offices, branches, stores)
4. service_regions = ALL states where company provides services, has customers, or claims coverage.
   IMPORTANT: Expand regional language into state codes:
   - "Tri-State" or "Tristate" → NY, NJ, CT
   - "New England" → MA, CT, RI, VT, NH, ME
   - "Northeast" → CT, ME, MA, NH, RI, VT, NJ, NY, PA
   - "Mid-Atlantic" → NJ, NY, PA, DE, MD, VA, DC
   - "East Coast" → ME, NH, MA, RI, CT, NY, NJ, DE, MD, VA, NC, SC, GA, FL
   - "Southeast" → FL, GA, AL, SC, NC, TN, MS, LA, AR, KY, VA, WV
   - "Midwest" → IL, IN, MI, OH, WI, IA, KS, MN, MO, NE, ND, SD
   - "Southwest" → AZ, NM, TX, OK
   - "West" or "West Coast" → CA, OR, WA
   - "Pacific Northwest" or "PNW" → WA, OR, ID
   - "Mountain West" → CO, MT, ID, WY, UT, NV
   - "Gulf Coast" → TX, LA, MS, AL, FL
   - "Great Lakes" → MI, OH, WI, IL, IN, MN
   - "Sun Belt" → FL, GA, TX, AZ, NV, SC, NC, TN, AL
   - "National" or "Nationwide" → set service_regions to ALL 50 state codes
5. operating_locations = CRITICAL FIELD: every "City, ST" pair found anywhere on the site.
   Example: ["Dallas, TX", "Atlanta, GA", "Chicago, IL", "Tampa, FL"]
6. number_of_locations = Total location count. Extract from explicit mentions like "100+ locations",
   "50 stores nationwide", "serving 35 markets". If not explicitly stated, set to the count of
   operating_locations extracted. This ensures the location count is always populated.
7. hq_state MUST be a 2-letter code (e.g., TX not Texas)
8. hq_city MUST be a real city name (not a region like "West Coast")

IMPORTANT FOR M&A BUYERS:
- PE firms and platform companies often describe coverage using regional language.
  "We serve the Southeast and Mid-Atlantic" is VALID — expand into service_regions state codes.
- "National coverage" → service_regions should contain all 50 state codes.
- geographic_footprint stays strict (physical presence only).
- service_regions should be BROAD and inclusive — it's better to over-include than miss states.

DO NOT:
- Guess states based on industry norms alone
- Return full state names — always use 2-letter codes
- Use region names as hq_city (e.g., "West Coast" is NOT a city)

Return 2-letter state codes (e.g., MN not Minnesota).`;

// ============================================================================
// PROMPT 3b: COMBINED PE INTELLIGENCE (Acquisitions + Activity + Portfolio)
// ============================================================================

export const PROMPT_3B_PE_INTELLIGENCE = {
  name: 'extract_pe_intelligence',
  description: 'Extract PE firm identity, acquisition history, activity, and portfolio from website content',
  input_schema: {
    type: 'object',
    properties: {
      // PE Firm Identity
      pe_firm_name: { type: 'string', description: 'Official name of the PE / investment firm as stated on the website' },
      buyer_type: { type: 'string', enum: ['private_equity', 'corporate', 'family_office', 'independent_sponsor', 'search_fund', 'individual_buyer'], description: "Classify this buyer: 'private_equity' (PE fund), 'corporate' (strategic/operating company including PE-backed platforms), 'family_office', 'independent_sponsor', 'search_fund', or 'individual_buyer'" },
      // Acquisition History
      recent_acquisitions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            company_name: { type: 'string' },
            date: { type: 'string', description: 'YYYY-MM or YYYY-Q# format' },
            location: { type: 'string' },
          },
        },
      },
      total_acquisitions: { type: 'integer', description: 'Total number of acquisitions mentioned' },
      acquisition_frequency: { type: 'string', description: "e.g., '2-3 per year', 'Monthly'" },
      // PE Activity (NO THESIS - thesis ONLY from transcripts)
      target_industries: { type: 'array', items: { type: 'string' }, description: 'Industries the PE firm focuses on' },
      target_services: { type: 'array', items: { type: 'string' }, description: 'Service types of interest' },
      acquisition_appetite: { type: 'string', description: "Activity level, e.g., 'Very Active - 15-20 deals annually'" },
      // Portfolio
      portfolio_companies: { type: 'array', items: { type: 'string' }, description: 'List of portfolio company names' },
      num_platforms: { type: 'integer', description: 'Number of platform investments' },
    },
  },
};

export const PROMPT_3B_SYSTEM = `You are an M&A research analyst extracting PE firm intelligence from website content.

Extract FOUR categories of information:
1. FIRM IDENTITY: The PE firm's official name and buyer classification
2. ACQUISITION HISTORY: Recent deals, total count, frequency
3. INVESTMENT FOCUS: Target industries, services, and activity level
4. PORTFOLIO: Current and past portfolio company names

For buyer_type classification:
- "private_equity": Traditional private equity fund (e.g., "XYZ Capital Partners")
- "corporate": Corporate/strategic acquirer, including PE-backed operating platforms doing add-ons
- "family_office": Family office investor
- "independent_sponsor": Independent or fundless sponsor
- "search_fund": Search fund or entrepreneur through acquisition
- "individual_buyer": Individual or private buyer

CRITICAL: Do NOT extract investment thesis, strategic priorities, or thesis confidence.
These fields MUST come from direct conversations with the platform company, not websites.

Extract ONLY information that is explicitly stated in the content.
Do NOT infer or guess any information.`;

// ============================================================================
// EXTRACTION FUNCTIONS (call Gemini via shared helper)
// ============================================================================

/** AI extraction result type */
export interface AIExtractionResult {
  data: Record<string, unknown> | null;
  error?: { code: string; message: string };
  usage?: { inputTokens: number; outputTokens: number };
}

/** Internal helper: call Gemini and normalize the usage format */
async function callBuyerGemini(
  systemPrompt: string,
  userPrompt: string,
  tool: { name: string; description: string; input_schema: Record<string, unknown> },
  geminiApiKey: string,
  rateLimitConfig?: RateLimitConfig,
): Promise<AIExtractionResult> {
  const result = await callGeminiWithTool(
    systemPrompt, userPrompt, tool, geminiApiKey,
    BUYER_AI_CONFIG.model, BUYER_AI_TIMEOUT_MS, BUYER_AI_CONFIG.max_tokens,
    rateLimitConfig
  );

  if (result.usage) {
    return {
      data: result.data,
      error: result.error,
      usage: { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens },
    };
  }
  return result as AIExtractionResult;
}

export async function extractBusinessOverview(
  content: string, geminiApiKey: string, rateLimitConfig?: RateLimitConfig
): Promise<AIExtractionResult> {
  console.log('Running Prompt 1: Business Overview & Services');
  const userPrompt = `Website Content:\n\n${content.substring(0, 50000)}\n\nExtract the business overview information from this company website.`;
  return await callBuyerGemini(PROMPT_1_SYSTEM, userPrompt, PROMPT_1_BUSINESS, geminiApiKey, rateLimitConfig);
}

export async function extractCustomerProfile(
  content: string, geminiApiKey: string, rateLimitConfig?: RateLimitConfig
): Promise<AIExtractionResult> {
  console.log('Running Prompt 2: Customer Profile');
  const userPrompt = `Website Content:\n\n${content.substring(0, 50000)}\n\nExtract the customer profile information from this company website.`;
  return await callBuyerGemini(PROMPT_2_SYSTEM, userPrompt, PROMPT_2_CUSTOMER, geminiApiKey, rateLimitConfig);
}

export async function extractGeography(
  content: string, geminiApiKey: string, rateLimitConfig?: RateLimitConfig
): Promise<AIExtractionResult> {
  console.log(`Running Prompt 3a: Geographic Footprint (${content.length} chars input)`);
  // Geography gets a higher content limit (100k) because location pages can be very large
  // for multi-location businesses (hundreds of branch addresses)
  const userPrompt = `Website Content:\n\n${content.substring(0, 100000)}\n\nExtract geographic coverage information. Include states from addresses, service area descriptions, location pages, contact info, and any explicitly named states or cities where the company operates or serves customers. For each city found, add it to operating_locations as "City, ST" format. Always use 2-letter state codes. Pay special attention to any "LOCATION/BRANCH PAGES" sections — these contain the most accurate location data.`;
  return await callBuyerGemini(PROMPT_3A_SYSTEM, userPrompt, PROMPT_3A_GEOGRAPHY, geminiApiKey, rateLimitConfig);
}

export async function extractPEIntelligence(
  content: string, geminiApiKey: string, rateLimitConfig?: RateLimitConfig
): Promise<AIExtractionResult> {
  console.log('Running Prompt 3b: Combined PE Intelligence (Acquisitions + Activity + Portfolio)');
  const userPrompt = `Website Content:\n\n${content.substring(0, 50000)}\n\nExtract the PE firm name, classify the buyer type, and extract acquisition history, investment focus areas, and portfolio companies. Do NOT extract thesis, strategic priorities, thesis confidence, or size criteria (EBITDA/revenue ranges).`;
  return await callBuyerGemini(PROMPT_3B_SYSTEM, userPrompt, PROMPT_3B_PE_INTELLIGENCE, geminiApiKey, rateLimitConfig);
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export function validateGeography(extracted: AIExtractionResult): AIExtractionResult {
  if (!extracted?.data) return extracted;
  const data = extracted.data;

  // Anti-hallucination check — only flag if service_regions is suspiciously large
  // with NO supporting evidence (no footprint, no operating locations, no HQ)
  const hasAnyGeoEvidence = (data.geographic_footprint?.length || 0) > 0 ||
    (data.operating_locations?.length || 0) > 0 ||
    data.hq_state;

  if (data.service_regions?.length > 30 && !hasAnyGeoEvidence) {
    console.warn('Possible hallucination in service_regions - no supporting evidence, reverting');
    data.service_regions = [];
  }

  // Normalize state codes
  if (data.geographic_footprint) {
    data.geographic_footprint = data.geographic_footprint
      .map((s: string) => normalizeStateCode(s))
      .filter((s: string) => VALID_STATE_CODES.has(s));
  }

  if (data.service_regions) {
    data.service_regions = data.service_regions
      .map((s: string) => normalizeStateCode(s))
      .filter((s: string) => VALID_STATE_CODES.has(s));
  }

  // Normalize and deduplicate operating_locations — extract state codes from "City, ST" entries
  if (data.operating_locations && Array.isArray(data.operating_locations)) {
    const locStates: string[] = [];
    const seenNormalized = new Set<string>();
    const deduplicated: string[] = [];

    for (const loc of data.operating_locations) {
      if (typeof loc !== 'string') continue;

      // Normalize to "City, ST" format: trim, normalize whitespace, fix missing space after comma
      let normalized = loc.trim().replace(/\s+/g, ' ');
      // Fix "Dallas,TX" → "Dallas, TX"
      normalized = normalized.replace(/,([A-Za-z])/g, ', $1');

      // Extract and normalize state code
      const stateMatch = normalized.match(/,\s*([A-Za-z]{2})\s*$/);
      if (stateMatch) {
        const code = stateMatch[1].toUpperCase();
        if (VALID_STATE_CODES.has(code)) {
          locStates.push(code);
          // Rebuild as canonical "City, ST" (proper case state code)
          const city = normalized.substring(0, normalized.lastIndexOf(',')).trim();
          normalized = `${city}, ${code}`;
        }
      }

      // Strip trailing ", USA" or ", US" suffixes for dedup
      const forDedup = normalized.replace(/,\s*(USA|US)\s*$/i, '');

      // Case-insensitive deduplication
      const key = forDedup.toLowerCase();
      if (!seenNormalized.has(key)) {
        seenNormalized.add(key);
        deduplicated.push(forDedup);
      }
    }

    const beforeCount = data.operating_locations.length;
    data.operating_locations = deduplicated;
    if (beforeCount !== deduplicated.length) {
      console.log(`Deduplicated operating_locations: ${beforeCount} → ${deduplicated.length}`);
    }

    // Merge operating_locations states into geographic_footprint
    if (locStates.length > 0) {
      if (!data.geographic_footprint) data.geographic_footprint = [];
      for (const s of locStates) {
        if (!data.geographic_footprint.includes(s)) data.geographic_footprint.push(s);
      }
      console.log(`Added ${locStates.length} states from operating_locations to geographic_footprint`);
    }
  }

  // If geographic_footprint is empty but service_regions has data, promote service_regions
  if ((!data.geographic_footprint || data.geographic_footprint.length === 0) && data.service_regions?.length > 0) {
    console.log('Promoting service_regions to geographic_footprint (footprint was empty)');
    data.geographic_footprint = [...data.service_regions];
  }

  if (data.hq_state) {
    data.hq_state = normalizeStateCode(data.hq_state);
    if (VALID_STATE_CODES.has(data.hq_state)) {
      data.hq_region = getRegionFromState(data.hq_state);
      // Also ensure hq_state is in geographic_footprint
      if (!data.geographic_footprint) data.geographic_footprint = [];
      if (!data.geographic_footprint.includes(data.hq_state)) {
        data.geographic_footprint.push(data.hq_state);
      }
      // Also add HQ to operating_locations if not present
      if (data.hq_city) {
        const hqLoc = `${data.hq_city}, ${data.hq_state}`;
        if (!data.operating_locations) data.operating_locations = [];
        if (!data.operating_locations.some((l: string) => l.toLowerCase() === hqLoc.toLowerCase())) {
          data.operating_locations.push(hqLoc);
        }
      }
    }
  }

  // Auto-compute number_of_locations from operating_locations if not explicitly extracted
  // Use the AI-extracted count if it's higher (it may know the total from "100+ locations" text)
  const extractedCount = typeof data.number_of_locations === 'number' ? data.number_of_locations : 0;
  const actualCount = Array.isArray(data.operating_locations) ? data.operating_locations.length : 0;
  if (actualCount > 0 || extractedCount > 0) {
    data.number_of_locations = Math.max(extractedCount, actualCount);
    console.log(`Location count: extracted=${extractedCount}, actual=${actualCount}, using=${data.number_of_locations}`);
  }

  return { ...extracted, data };
}

// ============================================================================
// FIELD UPDATE LOGIC
// ============================================================================

/**
 * Determines if a new value should overwrite an existing value.
 * Uses a numeric priority system: higher-priority sources always win.
 *
 * Priority levels (from SOURCE_PRIORITY):
 *   manual=110 > transcript=100 > csv=90 > marketplace=80 > website=60
 *
 * Logic:
 * 1. Empty existing value → always overwrite (any source can fill gaps)
 * 2. Existing field has known source → compare priorities numerically
 * 3. Transcript-protected fields get extra guard for backward compatibility
 */
export function shouldOverwrite(
  fieldName: string,
  existingValue: unknown,
  newValue: unknown,
  hasTranscriptSource: boolean,
  existingSources: unknown[],
  newSourceType: SourceType = 'platform_website'
): boolean {
  // Existing value is empty/null → always overwrite (fill gaps from any source)
  const existingIsEmpty = existingValue === null || existingValue === undefined || existingValue === '' ||
    (Array.isArray(existingValue) && existingValue.length === 0);
  if (existingIsEmpty) return true;

  // PRIORITY-BASED: Look up the existing field's highest-priority source
  const existing = getFieldSourcePriority(fieldName, existingSources);
  const newPriority = SOURCE_PRIORITY[newSourceType] ?? 60;

  if (existing.priority > 0 && existing.priority > newPriority) {
    console.log(`🛡️ PRIORITY: Skipping ${fieldName} — existing source "${existing.sourceType}" (priority ${existing.priority}) > new source "${newSourceType}" (priority ${newPriority})`);
    return false;
  }

  // BACKWARD COMPAT: Transcript-protected fields guard
  // Even if we can't find per-field source records, protect transcript fields
  // when the buyer has ANY transcript source (broad protection)
  if (TRANSCRIPT_PROTECTED_FIELDS.includes(fieldName) && hasTranscriptSource) {
    if (newSourceType === 'platform_website' || newSourceType === 'pe_firm_website') {
      console.log(`🛡️ PROTECTED FIELD: Skipping ${fieldName} — transcript-protected and buyer has transcript data`);
      return false;
    }
  }

  // New value checks — only overwrite with substantive data
  if (typeof newValue === 'string') {
    return newValue.trim().length > 0;
  }
  if (Array.isArray(newValue)) {
    return newValue.length > 0;
  }
  // For numbers: equal-priority sources don't overwrite existing numbers
  if (typeof newValue === 'number' && existing.priority >= newPriority) {
    return false;
  }

  return true;
}

/**
 * Build the database update object from extracted data.
 * Applies provenance validation, source priority, normalization, and completeness scoring.
 */
export function buildBuyerUpdateObject(
  buyer: Record<string, unknown>,
  extractedData: Record<string, unknown>,
  hasTranscriptSource: boolean,
  existingSources: unknown[],
  evidenceRecords: unknown[],
  fieldSourceMap: Record<string, SourceType> = {},
): Record<string, unknown> {
  const timestamp = new Date().toISOString();

  // Build per-field source tracking: merge existing field_sources with new ones
  const existingFieldSources: Record<string, { source: string; priority: number; at: string }> =
    (existingSources.find((s) => (s as Record<string, unknown>).type === 'field_sources') as Record<string, unknown> | undefined)?.fields as Record<string, { source: string; priority: number; at: string }> || {};
  const fieldSources = { ...existingFieldSources };

  const updateData: Record<string, unknown> = {
    data_last_updated: timestamp,
    // extraction_sources is finalized at the end after field_sources are computed
  };

  let fieldsUpdated = 0;

  for (const [rawField, value] of Object.entries(extractedData)) {
    if (value === null || value === undefined) continue;

    // Remap extracted field names to actual database columns
    const field = FIELD_TO_COLUMN_MAP[rawField] || rawField;

    // Check if valid column
    if (!VALID_BUYER_COLUMNS.has(field)) {
      console.warn(`Skipping non-existent column: ${rawField} (mapped to: ${field})`);
      continue;
    }

    // WRITE-TIME PROVENANCE ENFORCEMENT (second layer — belt AND suspenders)
    const fieldSource = fieldSourceMap[field];
    if (fieldSource) {
      const validation = validateFieldProvenance(field, fieldSource);
      if (!validation.allowed) {
        console.error(`🚫 WRITE-TIME BLOCK: ${validation.reason}`);
        continue;
      }
    }

    // Skip placeholder values
    if (typeof value === 'string' && PLACEHOLDER_STRINGS.has(value.toLowerCase())) continue;

    // Check overwrite rules — pass the source type so we can enforce transcript > website
    const sourceType = fieldSourceMap[field] || 'platform_website';
    if (!shouldOverwrite(field, buyer[field], value, hasTranscriptSource, existingSources, sourceType)) {
      continue;
    }

    // Track per-field source + priority
    const recordFieldSource = () => {
      const priority = SOURCE_PRIORITY[sourceType] ?? 60;
      fieldSources[field] = { source: sourceType, priority, at: timestamp };
    };

    // Handle state code normalization for geographic fields
    if (field === 'hq_state') {
      const normalized = normalizeStateCode(value);
      if (VALID_STATE_CODES.has(normalized)) {
        updateData[field] = normalized;
        fieldsUpdated++;
        recordFieldSource();
      }
      continue;
    }

    // Normalize buyer_type to match the database CHECK constraint.
    // AI extraction uses canonical values (private_equity, corporate, individual_buyer)
    // but the DB constraint may use legacy values (pe_firm, strategic, other) if the
    // buyer_classification_taxonomy migration hasn't been applied yet.
    // This map ensures compatibility with BOTH old and new constraints.
    if (field === 'buyer_type' && typeof value === 'string') {
      const BUYER_TYPE_NORMALIZE: Record<string, string> = {
        'private_equity': 'private_equity',
        'corporate': 'corporate',
        'family_office': 'family_office',
        'independent_sponsor': 'independent_sponsor',
        'search_fund': 'search_fund',
        'individual_buyer': 'individual_buyer',
        // Legacy values — accept if already in old format
        'pe_firm': 'private_equity',
        'platform': 'corporate',
        'strategic': 'corporate',
        'other': 'individual_buyer',
      };
      const normalized = BUYER_TYPE_NORMALIZE[value.toLowerCase().trim()];
      if (normalized) {
        updateData[field] = normalized;
        fieldsUpdated++;
        recordFieldSource();
      } else {
        console.warn(`Skipping unknown buyer_type: "${value}"`);
      }
      continue;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      let normalized = value
        .filter(v => v && typeof v === 'string')
        .map(v => v.trim())
        .filter(v => v && !PLACEHOLDER_STRINGS.has(v.toLowerCase()));

      // Normalize state codes for geographic fields
      if (field === 'geographic_footprint' || field === 'service_regions' || field === 'target_geographies') {
        normalized = normalized
          .map(v => normalizeStateCode(v))
          .filter(v => VALID_STATE_CODES.has(v));
      }

      if (normalized.length > 0) {
        // MERGE geographic arrays with existing values instead of overwriting.
        // This prevents data loss when a re-enrichment scrapes fewer location pages
        // (e.g. due to rate limits or different pages being discovered).
        const MERGE_FIELDS = new Set(['operating_locations', 'geographic_footprint', 'service_regions']);
        if (MERGE_FIELDS.has(field) && Array.isArray(buyer[field]) && (buyer[field] as string[]).length > 0) {
          const existing = buyer[field] as string[];
          const isStateCodes = field === 'geographic_footprint' || field === 'service_regions';
          const seen = new Set(existing.map(v => isStateCodes ? v.toUpperCase() : v.toLowerCase()));
          for (const item of normalized) {
            const key = isStateCodes ? item.toUpperCase() : item.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              existing.push(item);
            }
          }
          const unique = [...new Set(existing)];
          updateData[field] = unique;
          console.log(`Merged ${field}: ${(buyer[field] as string[]).length} existing + ${normalized.length} new → ${unique.length} total`);
        } else {
          const unique = [...new Set(normalized)];
          updateData[field] = unique;
        }
        fieldsUpdated++;
        recordFieldSource();
      }
      continue;
    }

    // Normalize services_offered: if it looks like a JSON array, convert to prose
    if (field === 'services_offered' && typeof value === 'string') {
      let cleanValue = value.trim();
      if (cleanValue.startsWith('[')) {
        try {
          const parsed = JSON.parse(cleanValue);
          if (Array.isArray(parsed)) {
            cleanValue = parsed.join(', ');
          }
        } catch {
          // Not valid JSON, strip brackets
          cleanValue = cleanValue.replace(/^\[|\]$/g, '').replace(/"/g, '');
        }
      }
      updateData[field] = cleanValue;
      fieldsUpdated++;
      recordFieldSource();
      continue;
    }

    // Coerce integer columns — AI may return strings ("5") or floats (5.0)
    const INTEGER_COLUMNS = new Set([
      'number_of_locations', 'total_acquisitions', 'num_platforms',
      'target_revenue_min', 'target_revenue_max', 'target_ebitda_min', 'target_ebitda_max',
    ]);
    if (INTEGER_COLUMNS.has(field)) {
      const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
      if (Number.isFinite(num)) {
        updateData[field] = Math.round(num);
        fieldsUpdated++;
        recordFieldSource();
      } else {
        console.warn(`Skipping ${field}: non-numeric value "${value}"`);
      }
      continue;
    }

    // Handle strings and other values
    updateData[field] = value;
    fieldsUpdated++;
    recordFieldSource();
  }

  // Finalize extraction_sources: merge evidence records + per-field source tracking.
  // On re-enrichment, REPLACE old website evidence records (same source_type) with
  // fresh ones instead of accumulating duplicates. This prevents the JSONB from
  // growing unbounded across multiple re-enrichment runs.
  const newSourceTypes = new Set(
    evidenceRecords
      .map((r) => (r as Record<string, unknown>).source_type as string)
      .filter(Boolean),
  );
  const baseEntries = existingSources.filter((s) => {
    const entry = s as Record<string, unknown>;
    // Always remove old field_sources (will be replaced below)
    if (entry.type === 'field_sources') return false;
    // Remove old website evidence records that are being replaced by new ones
    if (entry.type === 'website' && newSourceTypes.has(entry.source_type as string)) return false;
    return true;
  });
  baseEntries.push(...evidenceRecords);
  baseEntries.push({ type: 'field_sources', fields: fieldSources });
  updateData.extraction_sources = baseEntries;

  console.log(`Built update with ${fieldsUpdated} field changes`);
  return updateData;
}
