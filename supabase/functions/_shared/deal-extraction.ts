/**
 * Deal Extraction Module
 *
 * Contains all deal-specific extraction logic:
 * - Valid listing column whitelist
 * - Financial field blocking (website scraping policy)
 * - AI prompt + tool schema for deal intelligence extraction
 * - Address validation and cleaning
 * - Location count extraction (regex fallback)
 * - LinkedIn URL validation
 * - Transcript-to-listing field mapping
 *
 * This module is imported by enrich-deal/index.ts (the orchestrator).
 * All functions are pure — no DB writes, no side effects.
 */

import { normalizeState } from './geography.ts';

// ============================================================================
// CONFIGURATION
// ============================================================================

export const DEAL_SCRAPE_TIMEOUT_MS = 30000; // 30 seconds per page
export const DEAL_AI_TIMEOUT_MS = 45000; // 45 seconds
export const DEAL_MIN_CONTENT_LENGTH = 200; // Minimum chars to proceed with AI (aligned with buyer enrichment)

export const DEAL_AI_RETRY_CONFIG = {
  maxRetries: 3,
  delays: [2000, 5000, 10000], // exponential backoff
};

// ============================================================================
// COLUMN WHITELIST
// ============================================================================

// Only allow updates to real listings columns (prevents schema-cache 500s)
// NOTE: 'location' is intentionally excluded - it's for marketplace anonymity
export const VALID_LISTING_UPDATE_KEYS = new Set([
  'internal_company_name', // extracted company name
  'title', // fallback if internal_company_name not set
  'executive_summary',
  'services',
  'service_mix',
  'industry',
  'geographic_states',
  'number_of_locations',
  // Structured address fields (for remarketing accuracy)
  'street_address',
  'address_city',
  'address_state',
  'address_zip',
  'address_country',
  'address', // legacy full address field
  'founded_year',
  'full_time_employees',
  'part_time_employees',
  'website',
  'customer_types',
  'end_market_description',
  'customer_concentration',
  'customer_geography',
  'owner_goals',
  'ownership_structure',
  'transition_preferences',
  'special_requirements',
  'timeline_notes',
  'key_risks',
  'technology_systems',
  'real_estate_info',
  'growth_trajectory',
  'key_quotes',
  'main_contact_name',
  'main_contact_email',
  'main_contact_phone',
  // LinkedIn data from Apify
  'linkedin_employee_count',
  'linkedin_employee_range',
  'linkedin_url', // Extracted from website or entered manually
  // Financial tracking fields per spec
  'revenue',
  'ebitda',
  'revenue_is_inferred',
  'revenue_source_quote',
  'ebitda_margin',
  'ebitda_is_inferred',
  'ebitda_source_quote',
  'financial_notes',
  'financial_followup_questions',
  'asking_price',
]);

// Financial data must NEVER come from website scraping — only from transcripts or manual entry
export const FINANCIAL_FIELDS_BLOCKED_FROM_WEBSITES = [
  'revenue',
  'revenue_value',
  'revenue_is_inferred',
  'revenue_source_quote',
  'ebitda',
  'ebitda_amount',
  'ebitda_margin',
  'ebitda_margin_percentage',
  'ebitda_is_inferred',
  'ebitda_source_quote',
  'financial_notes',
  'financial_followup_questions',
  'asking_price',
];

// Numeric columns that need special sanitization (LLM often returns prose for these)
export const NUMERIC_LISTING_FIELDS = new Set([
  'revenue',
  'ebitda',
  'ebitda_margin',
  'number_of_locations',
  'full_time_employees',
  'founded_year',
  'linkedin_employee_count',
  'part_time_employees',
  'team_page_employee_count',
  'customer_concentration', // numeric column — LLM often returns prose
  'asking_price',
]);

// Placeholder values to reject from any field
export const WEBSITE_PLACEHOLDERS = [
  '<unknown>',
  'unknown',
  'n/a',
  'none',
  'null',
  'not found',
  'not specified',
  'not provided',
  'no.com',
  'test.com',
  'example.com',
  'www.test.com',
  'www.example.com',
];
export const ADDRESS_PLACEHOLDERS = [
  'not found',
  'n/a',
  'unknown',
  'none',
  'null',
  'undefined',
  'tbd',
  'not available',
  'not specified',
];

// ============================================================================
// AI PROMPT + TOOL SCHEMA
// ============================================================================

export const DEAL_SYSTEM_PROMPT = `You are a SENIOR M&A analyst conducting deep due diligence on an acquisition target. Extract EVERY piece of intelligence from this website content. Be EXHAUSTIVE — capture every detail, no matter how minor. Your output directly drives buyer matching and deal scoring.

CRITICAL - COMPANY NAME EXTRACTION:
- Extract the REAL company name from the website (look in header, logo, footer, about page, legal notices)
- The company name should be the actual business name, NOT a generic description
- Examples of GOOD names: "Acme Plumbing Inc.", "Johnson HVAC Services", "Precision Solar LLC"
- Examples of BAD names: "Performance Marketing Agency", "Home Services Company", "Leading Provider"
- If you find a generic placeholder title, look harder for the real company name

CRITICAL - ADDRESS EXTRACTION (HIGHEST PRIORITY):
You MUST extract a physical address. This is required for deal matching. Search AGGRESSIVELY for address information.

WHERE TO FIND ADDRESS (search ALL of these):
1. **Footer** - Most common location, look for city/state near copyright or contact info
2. **Contact page** - "Contact Us", "Locations", "Get in Touch" sections
3. **About page** - "About Us", "Our Story", company history sections
4. **Header** - Sometimes addresses appear in top navigation
5. **Google Maps embed** - Look for embedded map with address
6. **Phone numbers** - Area codes can indicate location (e.g., 214 = Dallas, TX)
7. **Service area mentions** - "Serving the Dallas-Fort Worth area", "Based in Chicago"
8. **License/certification info** - Often includes state (e.g., "Licensed in Texas")
9. **Job postings** - Often mention office location
10. **Press releases** - Often include headquarters location
11. **Copyright notices** - May include city/state

EXTRACT INTO STRUCTURED COMPONENTS:
- street_address: Just the street number and name (e.g., "123 Main Street")
- address_city: City name ONLY (e.g., "Dallas", "Chicago", "Phoenix")
- address_state: 2-letter US state code ONLY (e.g., "TX", "IL", "AZ")
- address_zip: 5-digit ZIP code (e.g., "75201")
- address_country: Country code, default "US"

INFERENCE RULES (if explicit address not found):
- If you see "Serving Dallas-Fort Worth" → address_city: "Dallas", address_state: "TX"
- If you see "Chicago-based" → address_city: "Chicago", address_state: "IL"
- If you see "Headquartered in Phoenix, Arizona" → address_city: "Phoenix", address_state: "AZ"
- If you see a phone area code, infer the city/state from it
- If you see state licensing info, use that state

DO NOT extract vague regions like "Midwest", "Southeast", "Texas area" for address fields.
The address_city and address_state fields must be specific - a real city name and 2-letter state code.

DEPTH REQUIREMENTS — Every field must be DETAILED and CONTEXTUAL:

1. **Executive Summary** (5-8 sentences MINIMUM): Write a PE-investor-grade overview. This is the MOST IMPORTANT field. MUST include: what the company does, business model (how it makes money — B2B/B2C/mixed, recurring/project-based, contract/transactional), approximate size indicators (locations, years in business, employee count), geographic footprint, competitive advantages (certifications, preferred vendor status, proprietary processes, awards, customer lock-in, market position), customer base quality, and why this is an attractive acquisition target. Use specific facts from the website, not vague language. Every sentence should contain at least one concrete detail. Lead with the most compelling aspect.

2. **Service Mix** (2-4 sentences): Don't just list services — describe the revenue model. Include residential vs commercial split if visible, recurring vs project-based work, how services interrelate, and any specializations or certifications that create competitive moats.

3. **Customer Types** (1-2 sentences): Don't just say "residential and commercial" — describe the customer segments with detail. E.g., "Primarily serves property management companies (60%+) and commercial building owners, with a growing residential segment through insurance restoration referrals."

4. **Key Quotes** (up to 10): Extract verbatim quotes from the website — testimonials, taglines, mission statements, or any revealing text that captures the company's positioning or value proposition.`;

export function buildDealUserPrompt(dealTitle: string, websiteContent: string): string {
  return `Analyze this website content from "${dealTitle || 'Unknown Company'}" and extract DEEP business intelligence. This data drives M&A buyer matching — every detail matters.

IMPORTANT: You MUST find and extract the company's physical location (city and state). Look in the footer, contact page, about page, service area mentions, phone area codes, or any other location hints. This is required for deal matching.

DEPTH REQUIREMENTS:
- Executive summary: Write 5-8 rich sentences a PE investor can scan in 60 seconds. Include what they do, how they make money (business model), where they operate, competitive advantages (certifications, preferred vendor status, awards, proprietary processes), customer base, and why a buyer would want them. Every sentence must contain a specific fact.
- Service mix: Describe the full service portfolio with context — don't just list services. Explain how they fit together, what drives revenue, residential vs commercial mix.
- Customer types: Be specific about segments — not just "commercial" but what KIND of commercial customers.
- Key quotes: Extract up to 10 verbatim quotes — testimonials, taglines, mission statements, or any revealing text.

IMPORTANT:
- Do NOT extract any financial information (revenue, EBITDA, margins, etc.) from websites. Financial data may ONLY come from transcripts or manual entry.
- Do NOT extract owner goals, transition preferences, or deal-related information from websites.

LOCATION COUNT RULES:
- Count ALL physical locations: offices, branches, shops, stores, facilities
- Look for patterns: "X locations", "operate out of X", "facilities in"
- Count individual location mentions if total not stated
- Single location business = 1

Website Content:
${websiteContent.substring(0, 50000)}

Extract all available business information using the provided tool. Be EXHAUSTIVE — capture every detail. The address_city and address_state fields are REQUIRED.`;
}

export const DEAL_TOOL_SCHEMA = {
  type: 'function',
  function: {
    name: 'extract_deal_intelligence',
    description: 'Extract business intelligence from website content for M&A deal matching',
    parameters: {
      type: 'object',
      properties: {
        // Company identity
        internal_company_name: {
          type: 'string',
          description:
            'The REAL company name extracted from the website (from logo, header, footer, legal notices). Must be an actual business name, NOT a generic description like "Marketing Agency" or "Home Services Company".',
        },
        industry: {
          type: 'string',
          description:
            'REQUIRED. Primary industry classification. Be specific but concise (2-4 words). Examples: "HVAC Services", "Commercial Plumbing", "IT Managed Services", "Residential Landscaping", "Environmental Remediation", "Healthcare Staffing", "Commercial Cleaning", "Electrical Contracting".',
        },
        website: {
          type: 'string',
          description:
            'Canonical website URL if different from the scraped URL (e.g., redirected domain)',
        },
        linkedin_url: {
          type: 'string',
          description: 'LinkedIn company page URL if found on the website',
        },
        // Summary & services
        executive_summary: {
          type: 'string',
          description:
            'A 5-8 sentence PE-investor-grade summary. This is the MOST IMPORTANT field. Include: what the company does, business model (how it makes money — B2B/B2C, recurring/project-based), size indicators (locations, years, employees), geographic footprint, competitive advantages (certifications, preferred vendor status, proprietary processes, market position, awards), customer base quality, and acquisition attractiveness. Every sentence must contain a specific fact or detail.',
        },
        services: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of EVERY distinct service/product offered. Be specific: "fire restoration" not just "restoration". Use lowercase except proper nouns.',
        },
        service_mix: {
          type: 'string',
          description:
            'Detailed 2-4 sentence description of the full service portfolio. Include how services interrelate, residential vs commercial split, recurring vs project-based, specializations, and certifications.',
        },
        // Location & geography
        location: {
          type: 'string',
          description: 'Primary location in "City, ST" format (e.g., "Dallas, TX", "Chicago, IL")',
        },
        geographic_states: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Two-letter US state codes where the company has CONFIRMED physical presence or operations. Only include states explicitly mentioned. (e.g., ["CA", "TX"])',
        },
        number_of_locations: {
          type: 'number',
          description: 'Number of physical locations/offices/branches',
        },
        street_address: {
          type: 'string',
          description:
            'Street address only (e.g., "123 Main Street"). Do NOT include city/state/zip. Null if not found.',
        },
        address_city: {
          type: 'string',
          description: 'City name only (e.g., "Dallas", "Los Angeles").',
        },
        address_state: {
          type: 'string',
          description:
            '2-letter US state code (e.g., "TX", "CA") or Canadian province code (e.g., "ON", "BC").',
        },
        address_zip: {
          type: 'string',
          description: 'ZIP code (e.g., "75201", "90210")',
        },
        address_country: {
          type: 'string',
          description: 'Country code, typically "US" or "CA"',
        },
        // Customers
        customer_types: {
          type: 'string',
          description:
            'Detailed 1-2 sentence description of customer segments. Be specific — not just "commercial" but what KIND of customers.',
        },
        customer_geography: {
          type: 'string',
          description:
            'Service radius, coverage area, or where customers are located (e.g., "50-mile radius around Indianapolis", "All of southern Indiana and Louisville metro")',
        },
        // Quotes & evidence
        key_quotes: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Up to 10 verbatim quotes from the website — testimonials, taglines, mission statements, or any text that reveals the company's positioning, reputation, or value proposition.",
        },
      },
      required: ['industry'],
    },
  },
};

// ============================================================================
// POST-EXTRACTION VALIDATORS
// ============================================================================

// Valid US state and Canadian province codes
const US_STATE_CODES = new Set([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
  'PR',
]);
const CA_PROVINCE_CODES = new Set([
  'AB',
  'BC',
  'MB',
  'NB',
  'NL',
  'NS',
  'NT',
  'NU',
  'ON',
  'PE',
  'QC',
  'SK',
  'YT',
]);

/**
 * Strip financial fields from website-extracted data.
 * Financial data must NEVER come from website scraping.
 */
export function stripFinancialFields(extracted: Record<string, unknown>): void {
  for (const field of FINANCIAL_FIELDS_BLOCKED_FROM_WEBSITES) {
    if (extracted[field] !== undefined) {
      console.log(`FINANCIAL SCRAPING BLOCKED: Stripping '${field}' from website-extracted data`);
      delete extracted[field];
    }
  }
}

/**
 * Remove any keys not in VALID_LISTING_UPDATE_KEYS and the 'location' field.
 */
export function filterToValidKeys(extracted: Record<string, unknown>): void {
  for (const key of Object.keys(extracted)) {
    if (!VALID_LISTING_UPDATE_KEYS.has(key)) {
      delete extracted[key];
    }
  }
  // 'location' is for marketplace anonymity — never update from enrichment
  delete extracted.location;
}

/**
 * Validate and normalize address_state to 2-letter code.
 * Returns true if valid, false if rejected.
 */
export function validateAddressState(extracted: Record<string, unknown>): void {
  if (!extracted.address_state) return;

  const normalized = normalizeState(String(extracted.address_state));
  if (normalized && (US_STATE_CODES.has(normalized) || CA_PROVINCE_CODES.has(normalized))) {
    extracted.address_state = normalized;
  } else {
    console.log(`Rejecting invalid address_state: "${extracted.address_state}"`);
    delete extracted.address_state;
  }
}

/**
 * Validate address_zip (US 5-digit or Canadian postal code).
 */
export function validateAddressZip(extracted: Record<string, unknown>): void {
  if (!extracted.address_zip) return;

  const zipStr = String(extracted.address_zip).trim();
  const usZipPattern = /^\d{5}(-\d{4})?$/;
  const caPostalPattern = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;
  if (!usZipPattern.test(zipStr) && !caPostalPattern.test(zipStr)) {
    console.log(`Rejecting invalid address_zip: "${extracted.address_zip}"`);
    delete extracted.address_zip;
  } else {
    extracted.address_zip = zipStr;
  }
}

/**
 * Clean address_city — AI sometimes puts full address in city field.
 * Extracts just the city name, and may populate street_address as a side effect.
 */
export function cleanAddressCity(extracted: Record<string, unknown>): void {
  if (!extracted.address_city) return;

  let cityStr = String(extracted.address_city).trim();

  // Pattern 1: Full address with comma-separated city,state,zip at end
  // e.g., "123 Main St, Dallas, TX 75201"
  const fullAddressPattern = /^(.+?),\s*([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5})?$/;
  const fullMatch = cityStr.match(fullAddressPattern);
  if (fullMatch) {
    cityStr = fullMatch[2].trim();
    if (!extracted.street_address && fullMatch[1]) {
      extracted.street_address = fullMatch[1].trim();
    }
    console.log(`Extracted city "${cityStr}" from full address, street: "${fullMatch[1]}"`);
  }

  // Pattern 2: Street address followed by city name without proper separators
  if (!fullMatch) {
    const streetIndicators =
      /(St\.?|Street|Ave\.?|Avenue|Rd\.?|Road|Dr\.?|Drive|Blvd\.?|Boulevard|Ln\.?|Lane|Way|Ct\.?|Court|Pkwy\.?|Parkway|Pl\.?|Place|Cir\.?|Circle|Park)\s+/i;
    const streetMatch = cityStr.match(streetIndicators);
    if (streetMatch && streetMatch.index !== undefined) {
      const lastStreetIndex = cityStr.lastIndexOf(streetMatch[0]);
      if (lastStreetIndex > 0) {
        const afterStreet = cityStr.substring(lastStreetIndex + streetMatch[0].length).trim();
        const cleanedCity = afterStreet.replace(/,?\s*[A-Z]{2}\s*(\d{5})?$/, '').trim();

        if (cleanedCity.length > 0 && cleanedCity.length < 50 && !/\d/.test(cleanedCity)) {
          if (!extracted.street_address) {
            extracted.street_address = cityStr
              .substring(0, lastStreetIndex + streetMatch[0].length - 1)
              .trim();
          }
          cityStr = cleanedCity;
          console.log(
            `Parsed city "${cityStr}" from combined address, street: "${extracted.street_address}"`,
          );
        }
      }
    }
  }

  // Pattern 3: Simple trailing ", ST" pattern
  cityStr = cityStr.replace(/,\s*[A-Z]{2}$/, '').trim();

  // Pattern 4: Remove trailing ZIP code
  cityStr = cityStr.replace(/\s+\d{5}(-\d{4})?$/, '').trim();

  // Reject placeholder values
  if (
    cityStr.length > 0 &&
    cityStr.length < 50 &&
    !ADDRESS_PLACEHOLDERS.includes(cityStr.toLowerCase())
  ) {
    extracted.address_city = cityStr;
  } else {
    console.log(`Rejecting invalid/placeholder address_city: "${extracted.address_city}"`);
    delete extracted.address_city;
  }
}

/**
 * Clean street_address — reject placeholder values.
 */
export function cleanStreetAddress(extracted: Record<string, unknown>): void {
  if (!extracted.street_address) return;

  const streetStr = String(extracted.street_address).trim();
  if (streetStr.length > 0 && !ADDRESS_PLACEHOLDERS.includes(streetStr.toLowerCase())) {
    extracted.street_address = streetStr;
  } else {
    console.log(`Rejecting placeholder street_address: "${extracted.street_address}"`);
    delete extracted.street_address;
  }
}

/**
 * Default address_country to US if we have other address fields.
 */
export function defaultAddressCountry(extracted: Record<string, unknown>): void {
  if ((extracted.address_city || extracted.address_state) && !extracted.address_country) {
    extracted.address_country = 'US';
  }
}

/**
 * Extract location count from website content via regex when AI didn't find it.
 */
export function extractLocationCount(
  extracted: Record<string, unknown>,
  websiteContent: string,
): void {
  if (extracted.number_of_locations) return;

  const locationPatterns = [
    /(\d+)\s+(?:staffed\s+)?locations?/i,
    /(\d+)\s+offices?/i,
    /(\d+)\s+branches?/i,
    /(\d+)\s+stores?/i,
    /(\d+)\s+shops?/i,
    /(\d+)\s+facilities/i,
    /operate\s+out\s+of\s+(\d+)/i,
    /(\d+)\s+sites?\s+across/i,
  ];

  for (const pattern of locationPatterns) {
    const match = websiteContent.match(pattern);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count > 0 && count < 1000) {
        extracted.number_of_locations = count;
        console.log(`Extracted location count via regex: ${count}`);
        return;
      }
    }
  }

  // Fallback: "multiple locations" → estimate 3
  if (/multiple\s+locations?/i.test(websiteContent)) {
    extracted.number_of_locations = 3;
    console.log('Inferred multiple locations as 3');
  } else if (/several\s+locations?/i.test(websiteContent)) {
    extracted.number_of_locations = 4;
    console.log('Inferred several locations as 4');
  }
}

/**
 * Validate and normalize linkedin_url — must be a DIRECT linkedin.com/company/ URL.
 */
export function validateLinkedInUrl(extracted: Record<string, unknown>): void {
  if (!extracted.linkedin_url) return;

  const linkedinUrlStr = String(extracted.linkedin_url).trim();
  const linkedinCompanyPattern = /^https?:\/\/(www\.)?linkedin\.com\/company\/[a-zA-Z0-9_-]+\/?$/;
  if (linkedinCompanyPattern.test(linkedinUrlStr)) {
    const match = linkedinUrlStr.match(/linkedin\.com\/company\/([^/?]+)/);
    if (match) {
      extracted.linkedin_url = `https://www.linkedin.com/company/${match[1]}`;
      console.log(`Validated LinkedIn URL: ${extracted.linkedin_url}`);
    }
  } else {
    console.log(`Rejecting non-direct LinkedIn URL: "${linkedinUrlStr}"`);
    delete extracted.linkedin_url;
  }
}

/**
 * Run all post-extraction validations on extracted deal data.
 * Modifies the extracted object in-place.
 */
export function validateDealExtraction(
  extracted: Record<string, unknown>,
  websiteContent: string,
): void {
  stripFinancialFields(extracted);
  filterToValidKeys(extracted);
  validateAddressState(extracted);
  validateAddressZip(extracted);
  cleanAddressCity(extracted);
  cleanStreetAddress(extracted);
  defaultAddressCountry(extracted);
  extractLocationCount(extracted, websiteContent);
  validateLinkedInUrl(extracted);
}

// ============================================================================
// TRANSCRIPT → LISTING FIELD MAPPING
// ============================================================================

// Placeholder strings shared across transcript processing
export const TRANSCRIPT_PLACEHOLDER_STRINGS = new Set([
  'unknown',
  '<unknown>',
  'n/a',
  'na',
  'not specified',
  'not provided',
  'none',
  'null',
  '-',
  '—',
]);

// Patterns that match verbose AI placeholder responses like "Not discussed on this call."
const PLACEHOLDER_PATTERNS = [
  /^not\s+discussed/i,
  /^not\s+mentioned/i,
  /^not\s+provided/i,
  /^not\s+specified/i,
  /^not\s+disclosed/i,
  /^not\s+available/i,
  /^no\s+(additional\s+)?information/i,
  /^no\s+(additional\s+)?context/i,
  /^no\s+(additional\s+)?(financial\s+)?data/i,
  /not\s+discussed\s+on\s+this\s+call/i,
  /not\s+discussed\s+in\s+this\s+(call|transcript|meeting)/i,
  /not\s+mentioned\s+(on|in)\s+this/i,
  /recommend\s+follow[- ]?up/i,
];

/**
 * Check if a value is a placeholder that should be rejected.
 * Catches both exact matches (e.g. "n/a") and verbose AI patterns
 * (e.g. "Not discussed on this call.", "Ownership structure not discussed on this call.").
 */
export function isPlaceholder(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const raw = v.trim().toLowerCase();
  const normalized = raw.replace(/^<|>$/g, '').trim();
  if (
    raw.length === 0 ||
    TRANSCRIPT_PLACEHOLDER_STRINGS.has(raw) ||
    TRANSCRIPT_PLACEHOLDER_STRINGS.has(normalized)
  ) {
    return true;
  }
  // Check verbose patterns — strip leading field name prefix like "Ownership structure "
  // before matching, since the AI often echoes the field name.
  return PLACEHOLDER_PATTERNS.some((p) => p.test(raw));
}

/**
 * Convert a value to a finite number, or undefined.
 */
export function toFiniteNumber(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    if (isPlaceholder(v)) return undefined;
    const cleaned = v.replace(/[$,]/g, '').trim();
    const pct = cleaned.endsWith('%') ? cleaned.slice(0, -1).trim() : cleaned;
    const n = Number(pct);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Map transcript extracted_data to flat listing columns.
 * @param extracted - The extracted_data from deal_transcripts
 * @param listingKeys - Set of known listing column names
 * @returns Flat key-value pairs ready for listing update
 */
export function mapTranscriptToListing(
  extracted: Record<string, unknown>,
  listingKeys: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // Structured revenue
  {
    const revenue = extracted?.revenue as Record<string, unknown> | undefined;
    const revenueValue = toFiniteNumber(revenue?.value);
    if (revenueValue != null) {
      out.revenue = revenueValue;
      out.revenue_is_inferred = !!revenue?.is_inferred;
      if (revenue?.source_quote) out.revenue_source_quote = revenue.source_quote;
    }
  }

  // Structured EBITDA
  {
    const ebitda = extracted?.ebitda as Record<string, unknown> | undefined;
    const ebitdaAmount = toFiniteNumber(ebitda?.amount);
    if (ebitdaAmount != null) out.ebitda = ebitdaAmount;

    const marginPct = toFiniteNumber(ebitda?.margin_percentage);
    if (marginPct != null) {
      if (marginPct > 0 && marginPct <= 100) {
        out.ebitda_margin = marginPct / 100;
      } else {
        console.warn(`Rejecting out-of-range ebitda_margin_percentage: ${marginPct}% (must be 0-100)`);
      }
    }

    if (ebitda) out.ebitda_is_inferred = !!ebitda.is_inferred;
    if (ebitda?.source_quote) out.ebitda_source_quote = ebitda.source_quote;
  }

  // Common fields
  if (Array.isArray(extracted?.geographic_states) && extracted.geographic_states.length)
    out.geographic_states = extracted.geographic_states;

  {
    const n = toFiniteNumber(extracted?.number_of_locations);
    if (n != null) out.number_of_locations = n;
  }
  if (extracted?.service_mix) out.service_mix = extracted.service_mix;
  if (extracted?.industry) out.industry = extracted.industry;

  if (extracted?.owner_goals) out.owner_goals = extracted.owner_goals;
  if (extracted?.transition_preferences)
    out.transition_preferences = extracted.transition_preferences;
  if (extracted?.timeline_notes) out.timeline_notes = extracted.timeline_notes;

  if (extracted?.customer_types) out.customer_types = extracted.customer_types;
  // customer_concentration: DB is NUMERIC but LLM often returns text.
  if (extracted?.customer_concentration) {
    const concText = String(extracted.customer_concentration);
    const pctMatch = concText.match(/(\d{1,3})(?:\s*%|\s*percent)/i);
    if (pctMatch) {
      const n = Number(pctMatch[1]);
      if (Number.isFinite(n) && n > 0 && n <= 100) out.customer_concentration = n;
    }
    if (out.customer_types) {
      out.customer_types += '\n\nCustomer Concentration: ' + concText;
    } else {
      out.customer_types = 'Customer Concentration: ' + concText;
    }
  }
  if (extracted?.customer_geography) out.customer_geography = extracted.customer_geography;

  if (extracted?.executive_summary) out.executive_summary = extracted.executive_summary;
  if (extracted?.growth_trajectory) out.growth_trajectory = extracted.growth_trajectory;

  if (Array.isArray(extracted?.key_quotes) && extracted.key_quotes.length)
    out.key_quotes = extracted.key_quotes;
  if (extracted?.financial_notes) out.financial_notes = extracted.financial_notes;

  if (extracted?.main_contact_name) out.main_contact_name = extracted.main_contact_name;
  if (extracted?.main_contact_email) out.main_contact_email = extracted.main_contact_email;
  if (extracted?.main_contact_phone) out.main_contact_phone = extracted.main_contact_phone;

  if (extracted?.ownership_structure) out.ownership_structure = extracted.ownership_structure;
  if (Array.isArray(extracted?.services) && extracted.services.length)
    out.services = extracted.services;
  if (extracted?.website) out.website = extracted.website;
  if (extracted?.location) out.location = extracted.location;

  // Additional enrichment fields from transcript extraction
  {
    const askingPrice = toFiniteNumber(extracted?.asking_price);
    if (askingPrice != null) out.asking_price = askingPrice;
  }
  {
    const fte = toFiniteNumber(extracted?.full_time_employees);
    if (fte != null) out.full_time_employees = fte;
  }
  {
    const pte = toFiniteNumber(extracted?.part_time_employees);
    if (pte != null) out.part_time_employees = pte;
  }
  {
    const fy = toFiniteNumber(extracted?.founded_year);
    if (fy != null && fy > 1800 && fy <= new Date().getFullYear()) out.founded_year = fy;
  }
  if (extracted?.key_risks) out.key_risks = extracted.key_risks;
  if (extracted?.technology_systems) out.technology_systems = extracted.technology_systems;
  if (extracted?.real_estate_info) out.real_estate_info = extracted.real_estate_info;
  if (extracted?.special_requirements) out.special_requirements = extracted.special_requirements;
  if (extracted?.end_market_description)
    out.end_market_description = extracted.end_market_description;
  if (
    Array.isArray(extracted?.financial_followup_questions) &&
    extracted.financial_followup_questions.length
  )
    out.financial_followup_questions = extracted.financial_followup_questions;

  // Filter to known listing columns (defensive)
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(out)) {
    if (listingKeys.has(k)) filtered[k] = v;
  }
  return filtered;
}

/**
 * Sanitize update payload — remove invalid numeric fields and placeholder strings.
 * Returns sanitized copy of the updates object.
 */
export function sanitizeListingUpdates(updates: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...updates };
  const removed: Array<{ key: string; value: unknown }> = [];
  const removedPlaceholders: Array<{ key: string; value: unknown }> = [];

  for (const [k, v] of Object.entries(sanitized)) {
    if (!NUMERIC_LISTING_FIELDS.has(k)) continue;

    // Coerce numeric strings
    if (typeof v === 'string') {
      const cleaned = v.replace(/[$,]/g, '').trim();
      const n = Number(cleaned);
      if (Number.isFinite(n)) {
        sanitized[k] = n;
        continue;
      }
    }

    if (typeof v !== 'number' || !Number.isFinite(v)) {
      removed.push({ key: k, value: v });
      delete sanitized[k];
    }
  }

  // Strip placeholder strings from ANY field
  for (const [k, v] of Object.entries(sanitized)) {
    if (typeof v === 'string' && isPlaceholder(v)) {
      removedPlaceholders.push({ key: k, value: v });
      delete sanitized[k];
    }
  }

  if (removed.length > 0) {
    console.warn('[Transcripts] Removed invalid numeric fields from updates:', removed);
  }
  if (removedPlaceholders.length > 0) {
    console.warn(
      '[Transcripts] Removed placeholder string fields from updates:',
      removedPlaceholders,
    );
  }

  return sanitized;
}
