/**
 * Buyer Type Definitions — Single Source of Truth (Edge Functions)
 *
 * This module defines the canonical 6-type buyer taxonomy used throughout
 * the SourceCo platform. All edge functions should import from here rather
 * than defining their own buyer type lists.
 *
 * Canonical DB values:
 *   private_equity, corporate, family_office, search_fund,
 *   independent_sponsor, individual_buyer
 *
 * UI modifier (NOT a DB value):
 *   is_pe_backed = true on a 'corporate' buyer renders as "Platform Co."
 */

// ── Canonical buyer types ────────────────────────────────────────────

export const CANONICAL_BUYER_TYPES = [
  'private_equity',
  'corporate',
  'family_office',
  'search_fund',
  'independent_sponsor',
  'individual_buyer',
] as const;

export type CanonicalBuyerType = (typeof CANONICAL_BUYER_TYPES)[number];

export const VALID_BUYER_TYPES = new Set<string>(CANONICAL_BUYER_TYPES);

// ── Human-readable labels ────────────────────────────────────────────

export const BUYER_TYPE_LABELS: Record<CanonicalBuyerType, string> = {
  private_equity: 'Private Equity',
  corporate: 'Corporate / Strategic',
  family_office: 'Family Office',
  search_fund: 'Search Fund',
  independent_sponsor: 'Independent Sponsor',
  individual_buyer: 'Individual Buyer',
};

// ── Detailed definitions (for AI prompts, documentation) ─────────────

export const BUYER_TYPE_DEFINITIONS: Record<CanonicalBuyerType, string> = {
  private_equity:
    'Formal PE fund with committed LP capital deployed through a fund structure (Fund I/II/III). ' +
    'Partners managing fund capital with defined hold periods and investment theses. ' +
    'Company name often ends in Capital, Partners, Equity, Investments, Growth. ' +
    'No products or services sold — the business IS investing.',
  corporate:
    'Operating company with its own revenue, employees, products/services. ' +
    'Acquires using balance sheet capital. No fund structure. ' +
    'Includes PE-backed platform companies doing add-on acquisitions (marked is_pe_backed=true). ' +
    'A dental rollup, MSP, manufacturer, services company doing acquisitions — all corporate.',
  family_office:
    'Manages wealth for a single family. Direct investor with no LP fund structure. ' +
    'Often has a family surname in the name. May mention multi-generational or long-term hold.',
  search_fund:
    'Individual or small team using the Entrepreneurship Through Acquisition (ETA) model. ' +
    'Searching for their first acquisition to operate post-close. ' +
    'Often MBA graduate. SBA financing common.',
  independent_sponsor:
    'Deal-by-deal operator. No committed fund capital. ' +
    'Raises equity per transaction from LPs or family offices. ' +
    'Has operational experience and a track record but no standing fund.',
  individual_buyer:
    'A high-net-worth individual using personal wealth to acquire a company. ' +
    'No fund, no entity, no LP backing, no search fund structure. ' +
    'Pure personal acquisition.',
};

// ── Classification rules (for AI prompts) ────────────────────────────

export const CLASSIFICATION_RULES = {
  PLATFORM_COMPANY_RULE:
    'If pe_firm_name or parent_pe_firm is set (non-empty), the buyer is ALWAYS ' +
    'classified as "corporate" with is_pe_backed=true. NEVER classify a company ' +
    'with pe_firm_name set as "private_equity". The company is the platform, not the PE firm.',

  OPERATING_COMPANY_RULE:
    'If the company has real operations, revenue, and customers — it is "corporate", ' +
    'not "private_equity". Only classify as "private_equity" if there is clear evidence ' +
    'of LP capital being deployed through a fund structure.',

  IS_PE_BACKED_RULES: [
    'private_equity → always is_pe_backed = false (a PE firm is not itself PE-backed)',
    'corporate with pe_firm_name set → is_pe_backed = true',
    'all other types → is_pe_backed = false unless explicit evidence of PE ownership',
  ],

  PE_BACKED_SECONDARY_CHECK:
    'If classified as "corporate", check if owned by PE: look for ' +
    '"backed by [firm]", "portfolio company of", "a [firm] company", ' +
    'PE firm listed as parent/owner.',
};

// ── Normalization map (all known variants → canonical) ───────────────

export const BUYER_TYPE_NORMALIZATION_MAP: Record<string, CanonicalBuyerType> = {
  // Canonical (pass-through)
  private_equity: 'private_equity',
  corporate: 'corporate',
  family_office: 'family_office',
  search_fund: 'search_fund',
  independent_sponsor: 'independent_sponsor',
  individual_buyer: 'individual_buyer',
  // Legacy remarketing values
  pe_firm: 'private_equity',
  strategic: 'corporate',
  platform: 'corporate',
  other: 'corporate',
  // Marketplace camelCase values
  privateequity: 'private_equity',
  privatequity: 'private_equity',
  familyoffice: 'family_office',
  searchfund: 'search_fund',
  independentsponsor: 'independent_sponsor',
  businessowner: 'corporate',
  advisor: 'corporate',
  individual: 'individual_buyer',
};

/**
 * Normalize any buyer type string to a canonical value.
 * Returns 'corporate' as the safe default if the value is unknown.
 */
export function normalizeBuyerType(raw: string | null | undefined): CanonicalBuyerType {
  if (!raw) return 'corporate';
  const key = raw.trim().toLowerCase();
  return BUYER_TYPE_NORMALIZATION_MAP[key] ?? 'corporate';
}

/**
 * Validate that a string is a canonical buyer type.
 */
export function isValidBuyerType(value: string): value is CanonicalBuyerType {
  return VALID_BUYER_TYPES.has(value);
}

// ── Build the AI system prompt from definitions ──────────────────────

export function buildClassificationSystemPrompt(): string {
  const typeDescriptions = CANONICAL_BUYER_TYPES.map(
    (type, i) => `${i + 1}. ${type} - ${BUYER_TYPE_DEFINITIONS[type]}`,
  ).join('\n');

  return `You are a senior M&A analyst at a lower-middle market investment bank. Classify buyers into exactly one of six categories.

THE SIX VALID TYPES:
${typeDescriptions}

CRITICAL RULE #1 (Platform Company Rule): ${CLASSIFICATION_RULES.PLATFORM_COMPANY_RULE}

CRITICAL RULE #2 (Operating Company Rule): ${CLASSIFICATION_RULES.OPERATING_COMPANY_RULE}

RULE #3 (is_pe_backed): You MUST always explicitly set is_pe_backed for every buyer.
${CLASSIFICATION_RULES.IS_PE_BACKED_RULES.map((r) => `- ${r}`).join('\n')}

SECONDARY CHECK: ${CLASSIFICATION_RULES.PE_BACKED_SECONDARY_CHECK}

DECISION TREE (follow in order):
1. Does the company have pe_firm_name set? → corporate, is_pe_backed=true (Platform Company Rule)
2. Is this a formal PE fund with LP capital and fund structure? → private_equity
3. Is this an individual with no entity buying with personal wealth? → individual_buyer
4. Is this a single-family wealth vehicle doing direct investments? → family_office
5. Is this a searcher looking for first acquisition (ETA model)? → search_fund
6. Is this a deal-by-deal sponsor raising per-transaction? → independent_sponsor
7. Default: Does the company have operations, revenue, customers? → corporate

For each company, respond with a JSON object:
{ "id": "the_id", "type": "one_of_six", "confidence": 0-100, "reasoning": "1-2 sentences", "is_pe_backed": true/false, "pe_firm_name": "Name or null" }

Return a JSON array of these objects. Return ONLY the JSON array. No markdown, no explanation.`;
}
