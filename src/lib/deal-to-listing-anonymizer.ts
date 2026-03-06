/**
 * Utility for transforming deal data into anonymized marketplace listing data.
 * Strips company names, contact info, website domains, and other identifying
 * information from text fields while mapping deal fields to listing fields.
 *
 * Content sections (custom_sections) are populated by the lead memo generator
 * (generate-lead-memo edge function), NOT by this module. This module only
 * handles the structural/metadata anonymization for initial listing creation.
 */

// State-to-Region mapping is defined further down alongside STATE_ABBREV_TO_REGION + STATE_NAME_TO_REGION.

export interface DealData {
  id: string;
  title: string | null;
  internal_company_name: string | null;
  executive_summary: string | null;
  description: string | null;
  revenue: number | null;
  ebitda: number | null;
  ebitda_margin?: number | null;
  location: string | null;
  address_state: string | null;
  address_city: string | null;
  category: string | null;
  industry: string | null;
  // DB stores as text (string), but may also arrive as string[] from other sources
  service_mix: string | string[] | null;
  services?: string[] | null;
  website: string | null;
  full_time_employees: number | null;
  linkedin_employee_count: number | null;
  main_contact_name: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;
  main_contact_title: string | null;
  geographic_states: string[] | null;
  internal_deal_memo_link: string | null;
  // Enrichment fields
  customer_geography?: string | null;
  customer_types?: string | null;
  business_model?: string | null;
  revenue_model?: string | null;
  end_market_description?: string | null;
  competitive_position?: string | null;
  ownership_structure?: string | null;
  seller_motivation?: string | null;
  owner_goals?: string | null;
  transition_preferences?: string | null;
  // DB stores as Json, but expected to be string[] at runtime
  growth_drivers?: unknown[] | string[] | null;
  investment_thesis?: string | null;
  founded_year?: number | null;
  number_of_locations?: number | null;
}

/**
 * Safely coerce a value that may be a string, string[], or null into a string[].
 * Handles DB columns like service_mix (text) that the code treats as arrays.
 */
function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  if (typeof value === 'string') {
    return value
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

export interface AnonymizedListingData {
  title: string;
  description: string;
  hero_description: string;
  categories: string[];
  location: string;
  revenue: number;
  ebitda: number;
  ebitda_margin: number | null;
  full_time_employees: number;
  internal_company_name: string;
  internal_notes: string;
  company_website: string;
  // Custom metrics (GAP 6)
  metric_3_type: 'employees' | 'custom';
  metric_3_custom_label: string;
  metric_3_custom_value: string;
  metric_3_custom_subtitle: string;
  metric_4_type: 'ebitda_margin' | 'custom';
  metric_4_custom_label: string;
  metric_4_custom_value: string;
  metric_4_custom_subtitle: string;
  // Structured contact fields (from deal)
  main_contact_first_name: string;
  main_contact_last_name: string;
  main_contact_email: string;
  main_contact_phone: string;
  // Deal detail fields carried to listing
  services: string[];
  service_mix: string;
  geographic_states: string[];
}

/**
 * Build a list of identifying strings to strip from text content.
 * Includes company name, contact names, email addresses, phone numbers,
 * website domains, and common variations.
 */
function buildIdentifyingTerms(deal: DealData): string[] {
  const terms: string[] = [];

  // Company name and variations
  if (deal.internal_company_name) {
    const name = deal.internal_company_name.trim();
    terms.push(name);

    // Common suffixes to strip independently
    const suffixes = [
      ' Inc',
      ' Inc.',
      ' LLC',
      ' Corp',
      ' Corp.',
      ' Ltd',
      ' Ltd.',
      ' Co',
      ' Co.',
      ' LP',
      ' LLP',
    ];
    for (const suffix of suffixes) {
      if (name.endsWith(suffix)) {
        terms.push(name.slice(0, -suffix.length).trim());
      }
    }
  }

  if (deal.title && deal.title !== deal.internal_company_name) {
    terms.push(deal.title.trim());
  }

  // Contact names
  if (deal.main_contact_name) {
    terms.push(deal.main_contact_name.trim());
    // Also add first/last name parts
    const nameParts = deal.main_contact_name.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      // Only add name parts that are 3+ characters to avoid false positives
      nameParts.forEach((part) => {
        if (part.length >= 3) terms.push(part);
      });
    }
  }

  // Email addresses
  if (deal.main_contact_email) {
    terms.push(deal.main_contact_email.trim());
  }

  // Phone numbers
  if (deal.main_contact_phone) {
    terms.push(deal.main_contact_phone.trim());
    // Also add without formatting
    terms.push(deal.main_contact_phone.replace(/[\s\-().]/g, ''));
  }

  // Website domain
  if (deal.website) {
    const url = deal.website.trim();
    terms.push(url);
    // Extract domain without protocol and www
    const domain = url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
    terms.push(domain);
    // Also the domain without TLD (e.g. "abcheating" from "abcheating.com")
    const domainBase = domain.split('.')[0];
    if (domainBase && domainBase.length >= 4) {
      terms.push(domainBase);
    }
  }

  // City name (prevents geographic identification)
  if (deal.address_city) {
    const city = deal.address_city.trim();
    if (city.length >= 3) terms.push(city);
  }

  // Internal deal memo link
  if (deal.internal_deal_memo_link) {
    terms.push(deal.internal_deal_memo_link.trim());
  }

  // Deduplicate and sort by length (longest first for replacement priority)
  const unique = [...new Set(terms.filter((t) => t.length > 0))];
  unique.sort((a, b) => b.length - a.length);
  return unique;
}

/**
 * Strip all identifying terms from a text string, replacing them
 * with "the Company" or "[redacted]" as appropriate.
 */
export function stripIdentifyingInfo(text: string, deal: DealData): string {
  if (!text || typeof text !== 'string') return '';

  const terms = buildIdentifyingTerms(deal);
  let result = text;

  for (const term of terms) {
    // Case-insensitive replacement
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    result = result.replace(regex, 'the Company');
  }

  // Also strip any remaining email addresses
  result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[redacted]');

  // Strip any remaining phone numbers (US format + extensions)
  result = result.replace(/(\+?1?\s*[-.]?\s*)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(\s*(x|ext\.?)\s*\d{1,6})?/gi, '[redacted]');

  // Strip any remaining URLs
  result = result.replace(/https?:\/\/[^\s)]+/gi, '[redacted]');

  return result;
}

/**
 * Map a US state abbreviation (e.g. "TX") or full state name to an anonymous
 * regional descriptor. Returns the input unchanged if no mapping exists.
 */
const STATE_ABBREV_TO_REGION: Record<string, string> = {
  AL: 'Southeast', AK: 'Northwest', AZ: 'Mountain West', AR: 'South Central',
  CA: 'West Coast', CO: 'Mountain West', CT: 'New England', DE: 'Mid-Atlantic',
  FL: 'Southeast', GA: 'Southeast', HI: 'Pacific', ID: 'Mountain West',
  IL: 'Midwest', IN: 'Midwest', IA: 'Midwest', KS: 'Great Plains',
  KY: 'Southeast', LA: 'South Central', ME: 'New England', MD: 'Mid-Atlantic',
  MA: 'New England', MI: 'Midwest', MN: 'Great Plains', MS: 'Southeast',
  MO: 'Great Plains', MT: 'Mountain West', NE: 'Great Plains', NV: 'Mountain West',
  NH: 'New England', NJ: 'Mid-Atlantic', NM: 'Mountain West', NY: 'Mid-Atlantic',
  NC: 'Southeast', ND: 'Great Plains', OH: 'Midwest', OK: 'South Central',
  OR: 'West Coast', PA: 'Mid-Atlantic', RI: 'New England', SC: 'Southeast',
  SD: 'Great Plains', TN: 'Southeast', TX: 'South Central', UT: 'Mountain West',
  VT: 'New England', VA: 'Southeast', WA: 'West Coast', WV: 'Mid-Atlantic',
  WI: 'Midwest', WY: 'Mountain West',
};

const STATE_NAME_TO_REGION: Record<string, string> = {
  'Alabama': 'Southeast', 'Alaska': 'Northwest', 'Arizona': 'Mountain West',
  'Arkansas': 'South Central', 'California': 'West Coast', 'Colorado': 'Mountain West',
  'Connecticut': 'New England', 'Delaware': 'Mid-Atlantic', 'Florida': 'Southeast',
  'Georgia': 'Southeast', 'Hawaii': 'Pacific', 'Idaho': 'Mountain West',
  'Illinois': 'Midwest', 'Indiana': 'Midwest', 'Iowa': 'Midwest',
  'Kansas': 'Great Plains', 'Kentucky': 'Southeast', 'Louisiana': 'South Central',
  'Maine': 'New England', 'Maryland': 'Mid-Atlantic', 'Massachusetts': 'New England',
  'Michigan': 'Midwest', 'Minnesota': 'Great Plains', 'Mississippi': 'Southeast',
  'Missouri': 'Great Plains', 'Montana': 'Mountain West', 'Nebraska': 'Great Plains',
  'Nevada': 'Mountain West', 'New Hampshire': 'New England', 'New Jersey': 'Mid-Atlantic',
  'New Mexico': 'Mountain West', 'New York': 'Mid-Atlantic', 'North Carolina': 'Southeast',
  'North Dakota': 'Great Plains', 'Ohio': 'Midwest', 'Oklahoma': 'South Central',
  'Oregon': 'West Coast', 'Pennsylvania': 'Mid-Atlantic', 'Rhode Island': 'New England',
  'South Carolina': 'Southeast', 'South Dakota': 'Great Plains', 'Tennessee': 'Southeast',
  'Texas': 'South Central', 'Utah': 'Mountain West', 'Vermont': 'New England',
  'Virginia': 'Southeast', 'Washington': 'West Coast', 'West Virginia': 'Mid-Atlantic',
  'Wisconsin': 'Midwest', 'Wyoming': 'Mountain West',
};

export function stateToRegion(stateInput: string): string {
  if (!stateInput) return '';
  const trimmed = stateInput.trim();
  // Try abbreviation first (most common)
  const upper = trimmed.toUpperCase();
  if (STATE_ABBREV_TO_REGION[upper]) return STATE_ABBREV_TO_REGION[upper];
  // Try full name (title-cased)
  const titleCased = trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
  if (STATE_NAME_TO_REGION[titleCased]) return STATE_NAME_TO_REGION[titleCased];
  // Return as-is if not a recognized state (could already be a region)
  return trimmed;
}

/**
 * Title template patterns for varied anonymous listing titles.
 * Titles lead with a business narrative descriptor, NOT dollar amounts.
 * The acquisition type (Platform/Add-on) is only used when explicitly known.
 */
const TITLE_GENERATORS: Array<(industry: string, region: string, deal: DealData) => string> = [
  // Pattern 1: Margin-anchored (leads with profitability narrative)
  (industry, region, deal) => {
    const margin = deal.ebitda && deal.revenue && deal.revenue > 0 ? Math.round((deal.ebitda / deal.revenue) * 100) : 0;
    const descriptor = margin >= 25 ? 'High-Margin' : margin >= 15 ? 'Profitable' : 'Established';
    if (region) return `${descriptor} ${industry} Business — ${region}`;
    return `${descriptor} ${industry} Business`;
  },
  // Pattern 2: Scale-anchored (leads with business scale)
  (industry, region, deal) => {
    const rev = deal.revenue || 0;
    const descriptor =
      rev >= 10_000_000 ? 'Scaled' : rev >= 5_000_000 ? 'Growth-Stage' : 'Established';
    if (region) return `${descriptor} ${industry} Business — ${region}`;
    return `${descriptor} ${industry} Business`;
  },
  // Pattern 3: Tenure-anchored (use vague ranges to avoid identifying the company)
  (industry, region, deal) => {
    const years = deal.founded_year && deal.founded_year > 0 && deal.founded_year <= new Date().getFullYear() ? new Date().getFullYear() - deal.founded_year : 0;
    const yearsDesc = years >= 20 ? 'Long-Standing' : years >= 10 ? 'Multi-Decade' : 'Established';
    if (region) return `${yearsDesc} ${industry} Business — ${region}`;
    return `${yearsDesc} ${industry} Business`;
  },
];

/**
 * Generate an anonymous title for the listing based on deal data.
 * Uses varied templates instead of a single formulaic pattern.
 * Avoids leading with dollar amounts — leads with business descriptors.
 * State abbreviations are converted to regional descriptors for anonymity.
 */
function generateAnonymousTitle(deal: DealData): string {
  const smArr = toStringArray(deal.service_mix);
  const industry = deal.industry || deal.category || smArr[0] || 'Services';
  const rawState = deal.address_state || deal.location || '';
  // Convert state abbreviation to regional descriptor for anonymity
  const region = rawState ? stateToRegion(rawState) : '';

  // Pick the best template based on available data
  const margin = deal.ebitda && deal.revenue && deal.revenue > 0 ? Math.round((deal.ebitda / deal.revenue) * 100) : 0;
  const years = deal.founded_year && deal.founded_year > 0 && deal.founded_year <= new Date().getFullYear() ? new Date().getFullYear() - deal.founded_year : 0;

  // Prefer margin-anchored if strong margins, then scale-based, then years
  if (margin > 15) {
    return TITLE_GENERATORS[0](industry, region, deal);
  }
  if (deal.revenue && deal.revenue > 0) {
    return TITLE_GENERATORS[1](industry, region, deal);
  }
  if (years > 10) {
    return TITLE_GENERATORS[2](industry, region, deal);
  }
  // Default fallback
  if (region) return `Established ${industry} Business — ${region}`;
  return `${industry} Business Opportunity`;
}

/**
 * Break a long text block into readable paragraphs.
 * Splits on existing paragraph breaks first, then breaks very long paragraphs
 * at sentence boundaries to keep each paragraph concise.
 */
function formatIntoParagraphs(text: string): string {
  // Split on existing paragraph breaks (double newlines, or single with blank lines)
  let paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // If we got only one big block, try splitting on single newlines
  if (paragraphs.length === 1 && paragraphs[0].length > 400) {
    paragraphs = text.split(/\n/).filter((p) => p.trim().length > 0);
  }

  // If still a single block, split at sentence boundaries to create paragraphs
  if (paragraphs.length === 1 && paragraphs[0].length > 400) {
    const sentences = paragraphs[0].match(/[^.!?]+[.!?]+/g) || [paragraphs[0]];
    const result: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      if (current.length + trimmed.length > 350 && current.length > 0) {
        result.push(current.trim());
        current = trimmed;
      } else {
        current += (current ? ' ' : '') + trimmed;
      }
    }
    if (current.trim()) result.push(current.trim());
    paragraphs = result;
  }

  return paragraphs.map((p) => p.trim()).join('\n\n');
}

/**
 * Generate an anonymous description from executive summary or description.
 * Builds a comprehensive, well-structured overview using ALL available deal data.
 * This is the primary text buyers see — it must be detailed, compelling, and
 * formatted with a clean mix of concise narrative sentences and bullet points
 * where data is best presented as a list. The goal is maximum readability.
 *
 * IMPORTANT: Always produces structured sections regardless of whether an
 * executive summary exists. The exec summary is used as the Business Overview
 * section, and additional sections are appended from deal fields for depth.
 */
function generateAnonymousDescription(deal: DealData): string {
  const source = deal.executive_summary || deal.description || '';

  // Build a structured description from deal fields — be EXHAUSTIVE
  // Mix short narrative sentences with bullet points for clean, digestible content
  const sections: string[] = [];
  const industry = deal.industry || deal.category || 'services';
  const rawState = deal.address_state || deal.location;
  const region = rawState ? stateToRegion(rawState) : null;
  const employees = deal.full_time_employees || deal.linkedin_employee_count;
  const margin = deal.ebitda && deal.revenue && deal.revenue > 0 ? Math.round((deal.ebitda / deal.revenue) * 100) : 0;
  const services = toStringArray(deal.service_mix);
  const servicesList = deal.services || [];
  const allServices = [...new Set([...services, ...servicesList])];

  // Section 1: Business Overview — use exec summary if available, else build from fields
  if (source && source.length > 100) {
    // Use anonymized exec summary as the overview, formatted into paragraphs
    const anonymized = stripIdentifyingInfo(source, deal);
    const formatted = formatIntoParagraphs(anonymized);
    sections.push(`Business Overview\n\n${formatted}`);
  } else {
    const overviewParts: string[] = [];
    let intro = `The Company is an established ${industry.toLowerCase()} business`;
    if (region) intro += ` headquartered in the ${region}`;
    if (employees && employees > 0) intro += ` with a team of approximately ${employees} employees`;
    intro += '.';
    overviewParts.push(intro);

    if (allServices.length > 0) {
      if (allServices.length > 3) {
        overviewParts.push(
          `The company offers a diversified service portfolio spanning ${allServices.length} service lines, including ${allServices.slice(0, 4).join(', ')}, and other complementary offerings.`,
        );
      } else {
        overviewParts.push(`Core capabilities include ${allServices.join(', ')}.`);
      }
    }

    // Only bullet out operational details when there are multiple discrete facts
    const opsBullets: string[] = [];
    if (deal.number_of_locations && deal.number_of_locations > 1) {
      opsBullets.push(`${deal.number_of_locations} physical locations`);
    }
    if (deal.geographic_states && deal.geographic_states.length > 1) {
      opsBullets.push(`Operations across ${deal.geographic_states.length} states`);
    }

    let overviewContent = overviewParts.join(' ');
    if (opsBullets.length > 0) {
      overviewContent += '\n\n' + opsBullets.map((b) => `- ${b}`).join('\n');
    }
    sections.push(`Business Overview\n\n${overviewContent}`);
  }

  // Section 2: Financial Highlights — opening sentence + metrics as bullets
  if (deal.revenue || deal.ebitda) {
    const financialParts: string[] = [];

    // Lead with a narrative sentence about the financial profile
    let financialIntro = 'The business has the following financial profile';
    if (margin > 20) financialIntro += ` with ${margin}% EBITDA margins`;
    else if (deal.revenue && deal.revenue > 5_000_000)
      financialIntro += ` at ${formatRevenue(deal.revenue)} in revenue`;
    financialIntro += '.';
    financialParts.push(financialIntro);

    // Key metrics as bullets for easy scanning
    const metrics: string[] = [];
    if (deal.revenue) metrics.push(`Revenue: ~${formatRevenue(deal.revenue)} annually`);
    if (deal.ebitda) metrics.push(`EBITDA: ${formatRevenue(deal.ebitda)}`);
    if (margin > 0) metrics.push(`EBITDA Margin: ${margin}%`);

    let financialContent = financialParts.join(' ');
    if (metrics.length > 0) {
      financialContent += '\n\n' + metrics.map((m) => `- ${m}`).join('\n');
    }

    // Add business/revenue model as narrative after the bullets
    const modelParts: string[] = [];
    if (deal.revenue_model) modelParts.push(stripIdentifyingInfo(deal.revenue_model, deal));
    if (deal.business_model) modelParts.push(stripIdentifyingInfo(deal.business_model, deal));
    if (modelParts.length > 0) {
      financialContent += '\n\n' + modelParts.join(' ');
    }

    sections.push(`Financial Highlights\n\n${financialContent}`);
  }

  // Section 3: Market Position — narrative sentences for context, bullets for lists
  const hasMarketData =
    deal.customer_types ||
    deal.end_market_description ||
    deal.customer_geography ||
    deal.competitive_position;
  if (hasMarketData) {
    const marketParts: string[] = [];

    if (deal.customer_types) {
      marketParts.push(
        `The Company serves ${stripIdentifyingInfo(deal.customer_types.toLowerCase(), deal)}.`,
      );
    }
    if (deal.end_market_description) {
      marketParts.push(stripIdentifyingInfo(deal.end_market_description, deal));
    }
    if (deal.customer_geography) {
      marketParts.push(
        `Service coverage extends across ${stripIdentifyingInfo(deal.customer_geography.toLowerCase(), deal)}.`,
      );
    }
    if (deal.competitive_position) {
      marketParts.push(stripIdentifyingInfo(deal.competitive_position, deal));
    }

    sections.push(`Market Position\n\n${marketParts.join(' ')}`);
  }

  // Section 4: Growth Opportunities — intro sentence + drivers as bullets
  const growthDrivers = Array.isArray(deal.growth_drivers)
    ? (deal.growth_drivers as string[]).filter((d): d is string => typeof d === 'string')
    : [];
  if (growthDrivers.length > 0 || deal.investment_thesis) {
    const growthParts: string[] = [];
    growthParts.push('The owner has identified the following expansion opportunities.');

    if (growthDrivers.length > 0) {
      growthParts.push(
        '\n\n' +
          growthDrivers
            .slice(0, 4)
            .map((d) => `- ${d}`)
            .join('\n'),
      );
    }
    if (deal.investment_thesis) {
      growthParts.push('\n\n' + stripIdentifyingInfo(deal.investment_thesis, deal));
    }

    sections.push(`Growth Opportunities\n\n${growthParts.join('')}`);
  }

  // Section 5: Transaction Context — straightforward narrative
  if (deal.owner_goals || deal.seller_motivation) {
    const transitionParts: string[] = [];
    if (deal.seller_motivation) {
      transitionParts.push(stripIdentifyingInfo(deal.seller_motivation, deal));
    } else if (deal.owner_goals) {
      transitionParts.push(stripIdentifyingInfo(deal.owner_goals, deal));
    }
    if (deal.transition_preferences) {
      transitionParts.push(stripIdentifyingInfo(deal.transition_preferences, deal));
    }
    if (transitionParts.length > 0) {
      sections.push(`Transaction Overview\n\n${transitionParts.join(' ')}`);
    }
  }

  return sections.join('\n\n');
}

/**
 * Filter service entries to only include clean, short service names.
 * Rejects raw text/notes that were incorrectly stored as service_mix values.
 */
function filterCleanServices(services: string[]): string[] {
  return services.filter((s) => {
    const trimmed = s.trim();
    // Skip empty entries
    if (trimmed.length === 0) return false;
    // A legitimate service name is short (under 60 chars) and doesn't contain
    // sentence-like patterns (multiple spaces + verbs, periods, etc.)
    if (trimmed.length > 60) return false;
    // Reject entries that look like sentences (contain verbs/articles typical of prose).
    // Require whitespace after the match word to avoid false positives in compound service
    // names like "Therapeutic", "Anesthesia", etc.
    if (/\b(is|are|was|were|that|which|also|primarily|including)\s/i.test(trimmed)) return false;
    return true;
  });
}

/**
 * Generate a compelling hero description for the listing card.
 * Builds a rich, narrative 2-4 sentence elevator pitch that gives buyers
 * a real sense of the opportunity — not just a data dump.
 *
 * IMPORTANT: All output is run through stripIdentifyingInfo before returning
 * to prevent any company names or identifying details from leaking.
 */
function generateHeroDescription(deal: DealData): string {
  const industry = deal.industry || deal.category || 'services';
  const rawState = deal.address_state || deal.location;
  const region = rawState ? stateToRegion(rawState) : null;
  const employees = deal.full_time_employees || deal.linkedin_employee_count;
  const margin = deal.ebitda && deal.revenue && deal.revenue > 0 ? Math.round((deal.ebitda / deal.revenue) * 100) : 0;
  const services = toStringArray(deal.service_mix);
  const servicesList = deal.services || [];
  const allServices = filterCleanServices([...new Set([...services, ...servicesList])]);

  // Sentence 1: What the company is — industry, geography (region only)
  // NOTE: Founding year / exact years in operation are excluded from anonymous
  // listings to prevent identification.
  let sentence1 = `Established ${industry.toLowerCase()} business`;
  if (region) sentence1 += ` based in the ${region}`;
  sentence1 += '.';

  // Sentence 2: Financial profile — revenue, EBITDA, margin, team size
  const financialParts: string[] = [];
  if (deal.revenue && deal.revenue > 0)
    financialParts.push(`${formatRevenue(deal.revenue)} in annual revenue`);
  if (deal.ebitda && deal.ebitda > 0 && margin > 0) {
    financialParts.push(`${formatRevenue(deal.ebitda)} EBITDA (${margin}% margins)`);
  } else if (deal.ebitda && deal.ebitda > 0) {
    financialParts.push(`${formatRevenue(deal.ebitda)} EBITDA`);
  }
  if (employees && employees > 0) financialParts.push(`${employees}-person team`);

  let sentence2 = '';
  if (financialParts.length > 0) {
    sentence2 = `The company generates ${financialParts.join(' with ')}.`;
  }

  // Sentence 3: Operations depth — services, locations, geographic reach, customer base
  const opsParts: string[] = [];
  if (allServices.length > 2) {
    opsParts.push(
      `diversified across ${allServices.length} service lines including ${allServices.slice(0, 3).join(', ')}`,
    );
  } else if (allServices.length > 0) {
    opsParts.push(`specializing in ${allServices.join(' and ')}`);
  }
  if (deal.number_of_locations && deal.number_of_locations > 1) {
    opsParts.push(`operating from ${deal.number_of_locations} locations`);
  }
  if (deal.geographic_states && deal.geographic_states.length > 2) {
    opsParts.push(`serving ${deal.geographic_states.length} states`);
  }
  if (deal.customer_types) {
    // Extract a brief customer descriptor (first clause only)
    const customerBrief = deal.customer_types.split(/[.;]/)[0].trim().toLowerCase();
    if (customerBrief.length > 5 && customerBrief.length < 100) {
      opsParts.push(`with a customer base of ${customerBrief}`);
    }
  }

  let sentence3 = '';
  if (opsParts.length > 0) {
    sentence3 = `Operations are ${opsParts.slice(0, 2).join(', ')}.`;
    // Capitalize first letter properly
    sentence3 = sentence3.charAt(0).toUpperCase() + sentence3.slice(1);
  }

  // Sentence 4: Growth/competitive angle or owner context
  let sentence4 = '';
  const growthDrivers = Array.isArray(deal.growth_drivers)
    ? (deal.growth_drivers as string[]).filter((d): d is string => typeof d === 'string')
    : [];
  if (growthDrivers.length > 0) {
    sentence4 = `Growth levers include ${growthDrivers.slice(0, 2).join(' and ').toLowerCase()}.`;
  } else if (deal.customer_geography) {
    sentence4 = `Serving ${deal.customer_geography.toLowerCase()} markets.`;
  } else if (deal.geographic_states && deal.geographic_states.length > 1) {
    sentence4 = `Multi-state operations with regional market coverage.`;
  }

  // Assemble — always at least 2 sentences, up to 4
  const parts = [sentence1, sentence2, sentence3, sentence4].filter((s) => s.length > 0);
  let hero = parts.join(' ');

  // CRITICAL: Strip any identifying information that may have leaked through
  hero = stripIdentifyingInfo(hero, deal);

  // Ensure <= 500 chars — trim from the end if needed
  if (hero.length <= 500) return hero.trim();
  // Trim to last complete sentence within 500 chars
  const trimmed = hero.substring(0, 500);
  const lastPeriod = trimmed.lastIndexOf('.');
  if (lastPeriod > 100) return trimmed.substring(0, lastPeriod + 1).trim();
  // No good sentence break found — append period to avoid incomplete sentence
  const result = trimmed.trim();
  return result.endsWith('.') ? result : result + '.';
}

/**
 * Build a minimal DealData object from a landing page deal for anonymization.
 * Used by landing page components that need to run stripIdentifyingInfo.
 * Internal fields (internal_company_name, website) are intentionally null
 * because landing page queries must NOT fetch PII.
 */
export function buildLandingPageDealData(deal: {
  id: string;
  title: string;
  revenue: number | null;
  ebitda: number | null;
  location: string | null;
  category?: string | null;
  categories?: string[] | null;
  full_time_employees?: number | null;
}): DealData {
  return {
    id: deal.id,
    title: deal.title,
    internal_company_name: null,
    executive_summary: null,
    description: null,
    revenue: deal.revenue,
    ebitda: deal.ebitda,
    location: deal.location,
    address_state: null,
    address_city: null,
    category: deal.category ?? deal.categories?.[0] ?? null,
    industry: null,
    service_mix: null,
    website: null,
    full_time_employees: deal.full_time_employees ?? null,
    linkedin_employee_count: null,
    main_contact_name: null,
    main_contact_email: null,
    main_contact_phone: null,
    main_contact_title: null,
    geographic_states: null,
    internal_deal_memo_link: null,
  };
}

function formatRevenue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

/**
 * Main function: transforms deal data into anonymized listing form data.
 * Returns pre-filled values for the listing editor form.
 *
 * NOTE: custom_sections are NOT generated here. They come from the lead memo
 * generator (generate-lead-memo edge function) which produces the same 9
 * sections as the anonymous teaser memo. This keeps content in one place.
 */
export function anonymizeDealToListing(deal: DealData): AnonymizedListingData {
  // Normalize fields that may arrive as strings from the DB but are used as arrays
  const serviceMix = toStringArray(deal.service_mix);

  const categories: string[] = [];
  if (deal.category) categories.push(deal.category);
  if (deal.industry && deal.industry !== deal.category) categories.push(deal.industry);
  // Only include clean, short service names — not raw text/notes
  const cleanServices = filterCleanServices(serviceMix);
  for (const s of cleanServices) {
    if (!categories.includes(s)) categories.push(s);
  }

  const rawLocation = deal.address_state || deal.location || '';
  const location = rawLocation ? stateToRegion(rawLocation) : '';
  const employees = deal.full_time_employees || deal.linkedin_employee_count || 0;
  const margin =
    deal.ebitda && deal.revenue && deal.revenue > 0 ? Math.round((deal.ebitda / deal.revenue) * 100) : null;

  // Build services list from service_mix + services
  const services: string[] = [...serviceMix];
  if (deal.services) {
    deal.services.forEach((s) => {
      if (!services.includes(s)) services.push(s);
    });
  }

  return {
    title: generateAnonymousTitle(deal),
    description: generateAnonymousDescription(deal),
    hero_description: generateHeroDescription(deal),
    categories: categories.length > 0 ? categories : [],
    location,
    revenue: deal.revenue || 0,
    ebitda: deal.ebitda || 0,
    ebitda_margin: margin,
    full_time_employees: employees,
    internal_company_name: deal.internal_company_name || '',
    internal_notes: `Created from deal: ${deal.internal_company_name || deal.id}`,
    company_website: deal.website || '',
    // Custom metrics (GAP 6) — auto-populate from deal data
    metric_3_type: services.length > 0 ? 'custom' : 'employees',
    metric_3_custom_label: services.length > 0 ? 'Service Lines' : '',
    metric_3_custom_value: services.length > 0 ? `${services.length}` : '',
    metric_3_custom_subtitle: services.length > 0 ? 'Diversified offerings' : '',
    metric_4_type: 'ebitda_margin',
    metric_4_custom_label: '',
    metric_4_custom_value: '',
    metric_4_custom_subtitle: '',
    // Structured contact fields — split deal's main_contact_name into first/last
    main_contact_first_name: deal.main_contact_name
      ? deal.main_contact_name.trim().split(/\s+/)[0] || ''
      : '',
    main_contact_last_name: deal.main_contact_name
      ? deal.main_contact_name.trim().split(/\s+/).slice(1).join(' ') || ''
      : '',
    main_contact_email: deal.main_contact_email || '',
    main_contact_phone: deal.main_contact_phone || '',
    // Deal detail fields carried to listing
    services: services.length > 0 ? services : [],
    service_mix: serviceMix.join(', '),
    geographic_states: deal.geographic_states || [],
  };
}

/**
 * Convert a structured plain-text description (with section headers, paragraphs,
 * and bullet points) into HTML suitable for the TipTap rich text editor.
 *
 * Expected input format:
 *   Section Title\n\nParagraph text.\n\n- Bullet 1\n- Bullet 2\n\nSection Title\n\n...
 */
export function descriptionToHtml(plainText: string): string {
  if (!plainText || plainText.trim().length === 0) return '';

  // Split into sections by double-newline-separated blocks
  const blocks = plainText.split(/\n\n+/).filter((b) => b.trim().length > 0);
  const htmlParts: string[] = [];

  // Known section headers from generateAnonymousDescription
  const sectionHeaders = new Set([
    'Business Overview',
    'Financial Highlights',
    'Market Position',
    'Growth Opportunities',
    'Transaction Overview',
  ]);

  for (const block of blocks) {
    const trimmed = block.trim();

    // Check if this block is a section header
    if (sectionHeaders.has(trimmed)) {
      htmlParts.push(`<h2>${trimmed}</h2>`);
      continue;
    }

    // Check if this is a bullet list (lines starting with "- ")
    const lines = trimmed.split('\n');
    const isBulletList = lines.every((l) => l.trim().startsWith('- '));
    if (isBulletList) {
      const items = lines.map((l) => `<li>${l.trim().replace(/^- /, '')}</li>`).join('');
      htmlParts.push(`<ul>${items}</ul>`);
      continue;
    }

    // Mixed content: some bullets, some not — split into paragraphs and lists
    const hasBullets = lines.some((l) => l.trim().startsWith('- '));
    if (hasBullets) {
      let currentParagraph: string[] = [];
      let currentBullets: string[] = [];

      const flushParagraph = () => {
        if (currentParagraph.length > 0) {
          htmlParts.push(`<p>${currentParagraph.join(' ')}</p>`);
          currentParagraph = [];
        }
      };
      const flushBullets = () => {
        if (currentBullets.length > 0) {
          const items = currentBullets.map((b) => `<li>${b}</li>`).join('');
          htmlParts.push(`<ul>${items}</ul>`);
          currentBullets = [];
        }
      };

      for (const line of lines) {
        if (line.trim().startsWith('- ')) {
          flushParagraph();
          currentBullets.push(line.trim().replace(/^- /, ''));
        } else if (line.trim().length > 0) {
          flushBullets();
          currentParagraph.push(line.trim());
        }
      }
      flushBullets();
      flushParagraph();
      continue;
    }

    // Regular paragraph
    htmlParts.push(`<p>${trimmed}</p>`);
  }

  return htmlParts.join('');
}
