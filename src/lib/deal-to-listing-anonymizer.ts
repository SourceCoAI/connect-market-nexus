/**
 * Utility for transforming deal data into anonymized marketplace listing data.
 * Strips company names, contact info, website domains, and other identifying
 * information from text fields while mapping deal fields to listing fields.
 *
 * Content sections (custom_sections) are populated by the lead memo generator
 * (generate-lead-memo edge function), NOT by this module. This module only
 * handles the structural/metadata anonymization for initial listing creation.
 */

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
  if (!text) return text;

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

  // Strip any remaining phone numbers (US format)
  result = result.replace(/(\+?1?\s*[-.]?\s*)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[redacted]');

  return result;
}

/**
 * Title template patterns for varied anonymous listing titles.
 * Each generator returns a different style of title.
 */
const TITLE_GENERATORS: Array<(industry: string, state: string, deal: DealData) => string> = [
  // Pattern 1: Revenue-anchored
  (industry, state, deal) => {
    const rev = deal.revenue ? `${formatRevenue(deal.revenue)}` : '';
    if (rev && state) return `${rev} ${industry} Platform — ${state}`;
    if (rev) return `${rev} ${industry} Platform`;
    if (state) return `${industry} Platform in ${state}`;
    return `${industry} Platform Opportunity`;
  },
  // Pattern 2: Margin-anchored
  (industry, state, deal) => {
    const margin = deal.ebitda && deal.revenue ? Math.round((deal.ebitda / deal.revenue) * 100) : 0;
    if (margin > 15 && state) return `High-Margin ${industry} Business in ${state}`;
    if (state) return `Profitable ${industry} Business in ${state}`;
    return `Profitable ${industry} Business`;
  },
  // Pattern 3: Years-anchored
  (industry, state, deal) => {
    const years = deal.founded_year ? new Date().getFullYear() - deal.founded_year : 0;
    const yearsDesc = years >= 20 ? `${years}+ Year` : years >= 10 ? 'Multi-Decade' : 'Established';
    if (state) return `${yearsDesc} ${industry} Business in ${state}`;
    return `${yearsDesc} ${industry} Business`;
  },
];

/**
 * Generate an anonymous title for the listing based on deal data.
 * Uses varied templates instead of a single formulaic pattern.
 */
function generateAnonymousTitle(deal: DealData): string {
  const smArr = toStringArray(deal.service_mix);
  const industry = deal.industry || deal.category || smArr[0] || 'Services';
  const state = deal.address_state || deal.location || '';

  // Pick the best template based on available data
  const margin = deal.ebitda && deal.revenue ? Math.round((deal.ebitda / deal.revenue) * 100) : 0;
  const years = deal.founded_year ? new Date().getFullYear() - deal.founded_year : 0;

  // Prefer margin-anchored if high margins, then revenue-anchored, then years
  if (deal.revenue && deal.revenue > 0 && margin > 15) {
    return TITLE_GENERATORS[1](industry, state, deal);
  }
  if (deal.revenue && deal.revenue > 0) {
    return TITLE_GENERATORS[0](industry, state, deal);
  }
  if (years > 10) {
    return TITLE_GENERATORS[2](industry, state, deal);
  }
  // Default fallback
  if (state) return `${industry} Business in ${state}`;
  return `${industry} Business Opportunity`;
}

/**
 * Generate an anonymous description from executive summary or description.
 * Builds a multi-paragraph overview with all available data.
 */
function generateAnonymousDescription(deal: DealData): string {
  const source = deal.executive_summary || deal.description || '';

  // If we have existing text, anonymize it
  if (source && source.length > 100) {
    return stripIdentifyingInfo(source, deal);
  }

  // Otherwise build a structured description from deal fields
  const paragraphs: string[] = [];
  const industry = deal.industry || deal.category || 'services';
  const state = deal.address_state || deal.location;
  const employees = deal.full_time_employees || deal.linkedin_employee_count;
  const years = deal.founded_year ? new Date().getFullYear() - deal.founded_year : 0;

  // Paragraph 1: Company overview
  let p1 = `The Company is an established ${industry.toLowerCase()} business`;
  if (state) p1 += ` headquartered in ${state}`;
  if (years > 0) p1 += `, operating for over ${years} years`;
  p1 += '.';
  const descSmArr = toStringArray(deal.service_mix);
  if (descSmArr.length > 0) {
    p1 += ` Core capabilities include ${descSmArr.slice(0, 4).join(', ')}.`;
  }
  paragraphs.push(p1);

  // Paragraph 2: Financial profile
  if (deal.revenue || deal.ebitda) {
    let p2 = 'The business generates';
    if (deal.revenue) p2 += ` ${formatRevenue(deal.revenue)} in annual revenue`;
    if (deal.ebitda) {
      const margin = deal.revenue ? Math.round((deal.ebitda / deal.revenue) * 100) : 0;
      p2 += `${deal.revenue ? ' with' : ''} ${formatRevenue(deal.ebitda)} in EBITDA`;
      if (margin > 0) p2 += ` (${margin}% margin)`;
    }
    p2 += '.';
    if (employees) p2 += ` The company employs approximately ${employees} team members.`;
    paragraphs.push(p2);
  }

  // Paragraph 3: Market position
  if (deal.customer_geography || deal.geographic_states?.length || deal.end_market_description) {
    let p3 = '';
    if (deal.end_market_description) {
      p3 = stripIdentifyingInfo(deal.end_market_description, deal);
    } else {
      p3 = 'The Company serves';
      if (deal.customer_types) p3 += ` ${deal.customer_types.toLowerCase()} customers`;
      else p3 += ' a diverse customer base';
      if (deal.geographic_states && deal.geographic_states.length > 0) {
        p3 += ` across ${deal.geographic_states.length > 3 ? 'multiple states' : deal.geographic_states.join(', ')}`;
      }
      p3 += '.';
    }
    paragraphs.push(p3);
  }

  return paragraphs.join('\n\n');
}

/**
 * Generate a short hero description for the listing card.
 * Creates varied, compelling previews instead of a single pattern.
 */
function generateHeroDescription(deal: DealData): string {
  const industry = deal.industry || deal.category || 'services';
  const state = deal.address_state || deal.location;
  const employees = deal.full_time_employees || deal.linkedin_employee_count;
  const years = deal.founded_year ? new Date().getFullYear() - deal.founded_year : 0;
  const margin = deal.ebitda && deal.revenue ? Math.round((deal.ebitda / deal.revenue) * 100) : 0;

  const highlights: string[] = [];

  // Lead with the most compelling differentiator
  if (years >= 20) {
    highlights.push(`${years}+ year operating history`);
  } else if (years >= 10) {
    highlights.push('multi-decade track record');
  }

  if (deal.revenue && deal.revenue > 0) {
    highlights.push(`${formatRevenue(deal.revenue)} in annual revenue`);
  }

  if (margin > 20) {
    highlights.push(`${margin}% EBITDA margins`);
  } else if (deal.ebitda && deal.ebitda > 0) {
    highlights.push(`${formatRevenue(deal.ebitda)} EBITDA`);
  }

  if (employees && employees > 50) {
    highlights.push(`${employees}+ person team`);
  }

  if (deal.number_of_locations && deal.number_of_locations > 1) {
    highlights.push(`${deal.number_of_locations} locations`);
  }

  // Build the sentence
  let hero = `${industry} business`;
  if (state) hero += ` in ${state}`;

  if (highlights.length >= 2) {
    hero += ` with ${highlights.slice(0, 3).join(', ')}`;
  } else if (highlights.length === 1) {
    hero += ` with ${highlights[0]}`;
  }

  hero += '. ';

  // Add a value proposition line if we have the data
  const heroSmArr = toStringArray(deal.service_mix);
  if (heroSmArr.length > 2) {
    hero += `Diversified across ${heroSmArr.length} service lines.`;
  } else if (deal.customer_geography) {
    hero += `Serving ${deal.customer_geography.toLowerCase()} markets.`;
  } else if (deal.geographic_states && deal.geographic_states.length > 1) {
    hero += `Multi-state operations.`;
  }

  // Ensure <= 500 chars
  return hero.trim().substring(0, 500);
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
  for (const s of serviceMix) {
    if (!categories.includes(s)) categories.push(s);
  }

  const location = deal.address_state || deal.location || '';
  const employees = deal.full_time_employees || deal.linkedin_employee_count || 0;
  const margin =
    deal.ebitda && deal.revenue ? Math.round((deal.ebitda / deal.revenue) * 100) : null;

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
  };
}
