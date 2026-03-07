/**
 * Buyer Intelligence Tools
 * Search, profile, and analyze remarketing buyers.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';
import { checkCompanyExclusion } from '../../_shared/captarget-exclusion-filter.ts';

interface BuyerRecord {
  id: string;
  company_name?: string;
  pe_firm_name?: string;
  buyer_type?: string;
  business_type?: string;
  hq_state?: string;
  hq_city?: string;
  hq_region?: string;
  hq_country?: string;
  geographic_footprint?: string[];
  operating_locations?: string[];
  service_regions?: string[];
  target_services?: string[];
  services_offered?: string;
  target_industries?: string[];
  industry_vertical?: string;
  target_revenue_min?: number;
  target_revenue_max?: number;
  target_ebitda_min?: number;
  target_ebitda_max?: number;
  target_geographies?: string[];
  target_customer_profile?: string;
  acquisition_appetite?: string;
  acquisition_frequency?: string;
  acquisition_timeline?: string;
  alignment_score?: number;
  alignment_reasoning?: string;
  alignment_checked_at?: string;
  thesis_summary?: string;
  business_summary?: string;
  notes?: string;
  has_fee_agreement?: boolean;
  fee_agreement_status?: string;
  fee_agreement_source?: string;
  num_employees?: number;
  num_platforms?: number;
  number_of_locations?: number;
  total_acquisitions?: number;
  recent_acquisitions?: unknown;
  platform_acquisitions?: unknown;
  pe_firm_acquisitions?: unknown;
  revenue_model?: string;
  customer_geographic_reach?: string;
  company_website?: string;
  platform_website?: string;
  pe_firm_website?: string;
  buyer_linkedin?: string;
  pe_firm_linkedin?: string;
  universe_id?: string;
  archived?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ---------- Fuzzy matching ----------

// Simple fuzzy match: checks if target contains a close match to query (1 edit distance tolerance)
function fuzzyContainsWord(target: string, query: string): boolean {
  if (target.includes(query)) return true;
  if (query.length < 4) return false;
  for (let i = 0; i <= target.length - query.length + 1; i++) {
    const sub = target.substring(i, i + query.length);
    let dist = 0;
    for (let j = 0; j < query.length; j++) {
      if (sub[j] !== query[j]) dist++;
      if (dist > 1) break;
    }
    if (dist <= 1) return true;
  }
  return false;
}

// ---------- Field sets ----------

const BUYER_FIELDS_QUICK = `
  id, company_name, pe_firm_name, buyer_type, hq_state, hq_city,
  geographic_footprint, target_services, target_industries, target_revenue_min, target_revenue_max,
  target_ebitda_min, target_ebitda_max, target_geographies,
  acquisition_appetite, alignment_score, has_fee_agreement,
  thesis_summary, business_summary,
  num_employees, number_of_locations, total_acquisitions, archived
`
  .replace(/\s+/g, ' ')
  .trim();

const BUYER_FIELDS_FULL = `
  id, company_name, pe_firm_name, buyer_type, business_type,
  hq_city, hq_state, hq_region, hq_country,
  geographic_footprint, operating_locations, service_regions,
  target_services, services_offered, target_industries, industry_vertical,
  target_revenue_min, target_revenue_max, target_ebitda_min, target_ebitda_max,
  target_geographies, target_customer_profile,
  acquisition_appetite, acquisition_frequency, acquisition_timeline,
  alignment_score, alignment_reasoning, alignment_checked_at,
  thesis_summary,
  has_fee_agreement, fee_agreement_status, fee_agreement_source,
  num_employees, num_platforms, number_of_locations,
  total_acquisitions, recent_acquisitions, platform_acquisitions, pe_firm_acquisitions,
  business_summary, notes, revenue_model, customer_geographic_reach,
  company_website, platform_website, pe_firm_website,
  buyer_linkedin, pe_firm_linkedin,
  universe_id, created_at, updated_at
`
  .replace(/\s+/g, ' ')
  .trim();

// Fields for querying listings (deals/leads) — NOT buyer fields
const LISTING_LEAD_FIELDS = [
  'id',
  'title',
  'industry',
  'category',
  'categories',
  'services',
  'revenue',
  'ebitda',
  'location',
  'address_state',
  'geographic_states',
  'deal_source',
  'deal_total_score',
  'is_priority_target',
  'status',
  'captarget_sheet_tab',
  'captarget_interest_type',
  'updated_at',
  'created_at',
].join(', ');

// ---------- Tool definitions ----------

export const buyerTools: ClaudeTool[] = [
  {
    name: 'search_buyers',
    description: `Search remarketing buyers (acquirers, PE firms, platforms) in the buyers table.
DATA SOURCE: buyers table + cross-references buyer_universes for universe-aware matching.
USE WHEN: "find HVAC buyers", "buyers in Texas", "PE firms interested in plumbing", "who has a fee agreement".
SEARCHABLE FIELDS: company_name, pe_firm_name, target_industries, target_services, services_offered, industry_vertical, thesis_summary, business_summary, notes, alignment_reasoning, hq_state, geographic_footprint, target_geographies, service_regions, operating_locations, revenue_model.
KEY BEHAVIOR: Automatically includes buyers from universes whose name matches the search/industry term (e.g. "HVAC" finds buyers in the "Residential HVAC, Plumbing and Electrical" universe even if the buyer record itself doesn't say "HVAC"). When state is provided, returns ALL buyers in that state (not limited to top results).`,
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description:
            'Free-text search across company_name, pe_firm_name, buyer_type, business_type, target_services, services_offered, target_industries, industry_vertical, thesis_summary, business_summary, notes, alignment_reasoning, revenue_model, hq_state, hq_city, hq_region, geographic_footprint, target_geographies, service_regions, operating_locations. Also matches universe names.',
        },
        buyer_type: {
          type: 'string',
          description:
            'Filter by buyer type (e.g. "private_equity", "corporate", "independent_sponsor", "family_office", "search_fund", "individual_buyer")',
        },
        state: {
          type: 'string',
          description:
            'Filter by HQ state OR geographic footprint state code (e.g. "OK", "TX"). Applied at database level to find ALL matching buyers.',
        },
        universe_id: {
          type: 'string',
          description:
            'Filter to a specific buyer universe ID — scopes results to buyers in that universe',
        },
        industry: {
          type: 'string',
          description:
            'Filter by industry keyword (e.g. "hvac", "plumbing", "collision"). Searches target_industries, target_services, services_offered, industry_vertical, company_name, pe_firm_name, thesis_summary, business_summary, notes, alignment_reasoning — AND automatically matches universe names.',
        },
        services: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by target service keywords',
        },
        min_revenue: { type: 'number', description: 'Minimum target revenue' },
        max_revenue: { type: 'number', description: 'Maximum target revenue' },
        has_fee_agreement: { type: 'boolean', description: 'Filter by fee agreement status' },
        acquisition_appetite: {
          type: 'string',
          description: 'Filter by appetite (e.g. "aggressive", "active", "selective")',
        },
        include_archived: {
          type: 'boolean',
          description: 'Include archived buyers (default false)',
        },
        exclude_financial_buyers: {
          type: 'boolean',
          description:
            'Exclude PE/VC/investment bank/family office/search fund firms using CapTarget exclusion rules. Use when searching for operating companies or strategic acquirers only.',
        },
        limit: {
          type: 'number',
          description:
            'Max results (default 25 for general browsing; when state filter is used, default is 1000 to count all matching buyers)',
        },
        depth: {
          type: 'string',
          enum: ['quick', 'full'],
          description: 'quick = summary, full = all details',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_buyer_profile',
    description:
      'Get comprehensive profile for a specific buyer — company details, acquisition criteria, thesis, history, contacts, and deal scores.',
    input_schema: {
      type: 'object',
      properties: {
        buyer_id: { type: 'string', description: 'The remarketing buyer UUID' },
      },
      required: ['buyer_id'],
    },
  },
  {
    name: 'get_score_breakdown',
    description:
      'Get the detailed scoring breakdown between a specific buyer and deal — composite score, geography, service, size, and owner goals dimensions.',
    input_schema: {
      type: 'object',
      properties: {
        buyer_id: { type: 'string', description: 'The remarketing buyer UUID' },
        deal_id: { type: 'string', description: 'The deal/listing UUID' },
      },
      required: ['buyer_id', 'deal_id'],
    },
  },
  {
    name: 'get_top_buyers_for_deal',
    description:
      'Get buyers scored for a specific deal (its buyer universe), sorted by composite score. Use this to answer questions like "how many buyers in the [deal name] universe are in [state]". Supports filtering by state and high limits for counting.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'The deal/listing UUID' },
        state: {
          type: 'string',
          description:
            'Filter buyers by state code (HQ or geographic footprint) — e.g. "OK" for Oklahoma. Use this for geographic count questions.',
        },
        status: {
          type: 'string',
          description: 'Filter by score status (e.g. "approved", "pending", "passed")',
        },
        min_score: { type: 'number', description: 'Minimum composite score threshold' },
        limit: {
          type: 'number',
          description:
            'Max results (default 20 for top buyers, use 1000+ to count all buyers in the universe)',
        },
      },
      required: ['deal_id'],
    },
  },
  {
    name: 'search_lead_sources',
    description: `Search deals/leads by lead source type — CP Targets (captarget), GO Partners, marketplace, internal.
DATA SOURCE: listings table filtered by deal_source.
USE WHEN: "how many captarget leads are HVAC", "show me GO Partner leads in Texas", "HVAC leads by source".
SEARCHABLE FIELDS: industry filter checks industry, category, categories, title, services, captarget_sheet_tab. State filter checks address_state and geographic_states.
NOT FOR: searching acquirers/buyers (use search_buyers), valuation leads (use search_valuation_leads), inbound leads (use search_inbound_leads).`,
    input_schema: {
      type: 'object',
      properties: {
        source_type: {
          type: 'string',
          enum: ['captarget', 'go_partners', 'marketplace', 'internal', 'all'],
          description: 'Which lead source to query',
        },
        industry: {
          type: 'string',
          description:
            'Filter by industry keyword (e.g. "hvac", "collision", "plumbing", "auto shop", "landscaping")',
        },
        state: {
          type: 'string',
          description:
            'Filter by US state code (e.g. "TX", "FL"). Checks address_state and geographic_states.',
        },
        status: { type: 'string', description: 'Filter by deal status' },
        limit: { type: 'number', description: 'Max results (default 5000 for counts)' },
      },
      required: [],
    },
  },
  {
    name: 'search_valuation_leads',
    description: `Search valuation calculator leads — business owners who used SourceCo valuation tools (HVAC calculator, collision calculator, auto shop calculator, general calculator).
DATA SOURCE: valuation_leads table.
USE WHEN: "how many HVAC calculator leads", "valuation leads in Texas", "show me auto shop leads".
SEARCHABLE FIELDS: search param checks business_name, display_name, industry, region, location. State param checks region and location.
These are high-intent SELLER leads with self-reported financials — NOT buyers/acquirers.`,
    input_schema: {
      type: 'object',
      properties: {
        calculator_type: {
          type: 'string',
          enum: ['general', 'auto_shop', 'hvac', 'collision', 'all'],
          description:
            'Filter by calculator type. "hvac" for HVAC companies, "collision" for collision/auto body, "auto_shop" for auto repair, "general" for general calculator.',
        },
        search: {
          type: 'string',
          description:
            'Free-text search across business_name, display_name, industry, region, and location',
        },
        state: {
          type: 'string',
          description:
            'Filter by US state/region keyword (e.g. "Texas", "FL"). Searches the region and location fields.',
        },
        status: {
          type: 'string',
          description: 'Filter by lead status (e.g. "new", "contacted", "qualified")',
        },
        include_excluded: {
          type: 'boolean',
          description: 'Include excluded leads (default false)',
        },
        pushed_to_deals: {
          type: 'boolean',
          description: 'Filter by whether lead was pushed to Active Deals',
        },
        min_revenue: { type: 'number', description: 'Minimum reported revenue' },
        limit: { type: 'number', description: 'Max results (default 5000 for counts)' },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeBuyerTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'search_buyers':
      return searchBuyers(supabase, args);
    case 'get_buyer_profile':
      return getBuyerProfile(supabase, args);
    case 'get_score_breakdown':
      return getScoreBreakdown(supabase, args);
    case 'get_top_buyers_for_deal':
      return getTopBuyersForDeal(supabase, args);
    case 'search_lead_sources':
      return searchLeadSources(supabase, args);
    case 'search_valuation_leads':
      return searchValuationLeads(supabase, args);
    default:
      return { error: `Unknown buyer tool: ${toolName}` };
  }
}

// ---------- Implementations ----------

async function searchBuyers(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const depth = (args.depth as string) || 'quick';

  // When filtering by state, universe, search text, services, or industry, we need a much higher limit
  // to ensure client-side filtering has enough data to find all matches
  const hasSelectiveFilter = !!(
    args.state ||
    args.universe_id ||
    args.search ||
    args.services ||
    args.industry
  );

  // Always use FULL fields when client-side filtering is active so we can search
  // across ALL buyer data points (target_industries, thesis_summary, business_summary, etc.)
  const fields = hasSelectiveFilter || depth === 'full' ? BUYER_FIELDS_FULL : BUYER_FIELDS_QUICK;
  const limit = hasSelectiveFilter
    ? Math.min(Number(args.limit) || 1000, 5000)
    : Math.min(Number(args.limit) || 25, 100);

  let query = supabase
    .from('buyers')
    .select(fields)
    .order('alignment_score', { ascending: false, nullsFirst: false })
    .limit(limit);

  // Archived filter (default: exclude archived)
  if (args.include_archived !== true) {
    query = query.eq('archived', false);
  }

  if (args.buyer_type) query = query.eq('buyer_type', args.buyer_type as string);
  if (args.has_fee_agreement !== undefined)
    query = query.eq('has_fee_agreement', args.has_fee_agreement as boolean);
  if (args.acquisition_appetite)
    query = query.eq('acquisition_appetite', args.acquisition_appetite as string);
  if (args.universe_id) query = query.eq('universe_id', args.universe_id as string);

  // Apply state filter at DB level (checks hq_state OR geographic_footprint array)
  // This ensures ALL matching buyers are returned, not just the top N by score
  if (args.state) {
    const st = (args.state as string).toUpperCase().replace(/[^A-Z]/g, '');
    if (st.length === 2) {
      query = query.or(`hq_state.eq.${st},geographic_footprint.cs.{${st}}`);
    }
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  let results: BuyerRecord[] = (data as unknown as BuyerRecord[]) || [];

  // ---- Universe-aware search ----
  // When searching by industry or free text, also find universes whose name/description
  // matches the search term, and include all buyers from those universes.
  // This ensures "Find HVAC buyers" returns buyers from the "Residential HVAC, Plumbing
  // and Electrical" universe even if individual buyer records don't contain "hvac".
  //
  // IMPORTANT: For ambiguous short terms (e.g. "auto"), prefer exact word-boundary matches
  // to avoid cross-contamination (e.g. "auto" matching both "Auto Services" and "Collision/Auto Body").
  const matchingUniverseIds: Set<string> = new Set();
  const matchedUniverseNames: Map<string, string> = new Map(); // id -> name for transparency
  if ((args.industry || args.search) && !args.universe_id) {
    const searchTerm = ((args.industry || args.search) as string).toLowerCase();
    const { data: universes } = await supabase
      .from('buyer_universes')
      .select('id, name, description')
      .eq('archived', false);

    if (universes) {
      // Build word-boundary regex for more precise matching on short/ambiguous terms
      // For terms <= 5 chars (e.g. "auto", "hvac"), require word boundary to avoid
      // "auto" matching "auto body" in a collision universe description
      const useStrictMatch = searchTerm.length <= 5;
      const wordBoundaryRegex = useStrictMatch
        ? new RegExp(`\\b${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
        : null;

      for (const u of universes) {
        const nameMatch = useStrictMatch
          ? wordBoundaryRegex!.test(u.name || '')
          : u.name?.toLowerCase().includes(searchTerm);
        const descMatch = useStrictMatch
          ? wordBoundaryRegex!.test(u.description || '')
          : u.description?.toLowerCase().includes(searchTerm);

        if (nameMatch || descMatch) {
          matchingUniverseIds.add(u.id);
          matchedUniverseNames.set(u.id, u.name || 'Unknown');
        }
      }
    }

    // Fetch additional buyers from matching universes that may not be in the initial results
    if (matchingUniverseIds.size > 0) {
      const existingIds = new Set(results.map((b: BuyerRecord) => b.id));
      const universeIds = Array.from(matchingUniverseIds);

      let universeQuery = supabase
        .from('buyers')
        .select(fields)
        .in('universe_id', universeIds)
        .order('alignment_score', { ascending: false, nullsFirst: false })
        .limit(500);

      if (args.include_archived !== true) {
        universeQuery = universeQuery.eq('archived', false);
      }

      const { data: universeBuyers } = await universeQuery;
      if (universeBuyers) {
        for (const b of universeBuyers as unknown as BuyerRecord[]) {
          if (!existingIds.has(b.id)) {
            results.push(b);
            existingIds.add(b.id);
          }
        }
      }
    }
  }

  // Helper: safely check if a field (which may be string or array) contains a term
  const fieldContains = (field: unknown, term: string): boolean => {
    if (!field) return false;
    if (Array.isArray(field))
      return field.some((v: string) => String(v).toLowerCase().includes(term));
    if (typeof field === 'string') return field.toLowerCase().includes(term);
    return false;
  };

  // Client-side service filter
  if (args.services && (args.services as string[]).length > 0) {
    const svcTerms = (args.services as string[]).map((s) => s.toLowerCase());
    results = results.filter((b: BuyerRecord) =>
      svcTerms.some(
        (term) => fieldContains(b.target_services, term) || fieldContains(b.services_offered, term),
      ),
    );
  }

  // Client-side revenue range filter
  if (args.min_revenue) {
    const min = args.min_revenue as number;
    results = results.filter(
      (b: BuyerRecord) => !b.target_revenue_max || b.target_revenue_max >= min,
    );
  }
  if (args.max_revenue) {
    const max = args.max_revenue as number;
    results = results.filter(
      (b: BuyerRecord) => !b.target_revenue_min || b.target_revenue_min <= max,
    );
  }

  // Client-side industry keyword filter — searches ALL relevant buyer fields
  // Uses fieldContains() for array/string columns that may have mixed types
  // Also matches buyers whose universe name/description contains the term
  if (args.industry) {
    const term = (args.industry as string).toLowerCase();
    results = results.filter(
      (b: BuyerRecord) =>
        (matchingUniverseIds.size > 0 && matchingUniverseIds.has(b.universe_id)) ||
        fieldContains(b.target_industries, term) ||
        fieldContains(b.target_services, term) ||
        fieldContains(b.services_offered, term) ||
        b.industry_vertical?.toLowerCase().includes(term) ||
        b.company_name?.toLowerCase().includes(term) ||
        b.pe_firm_name?.toLowerCase().includes(term) ||
        b.thesis_summary?.toLowerCase().includes(term) ||
        b.business_summary?.toLowerCase().includes(term) ||
        b.notes?.toLowerCase().includes(term) ||
        b.alignment_reasoning?.toLowerCase().includes(term),
    );
  }

  // Client-side free-text search — searches ALL buyer data fields with fuzzy matching
  // Also matches buyers whose universe name/description contains the term
  if (args.search) {
    const term = (args.search as string).toLowerCase();
    const searchWords = term.split(/\s+/).filter((w) => w.length > 2);
    results = results.filter((b: BuyerRecord) => {
      if (matchingUniverseIds.size > 0 && matchingUniverseIds.has(b.universe_id)) return true;

      const compName = (b.company_name || '').toLowerCase();
      const peName = (b.pe_firm_name || '').toLowerCase();

      // Exact substring matches across all fields
      if (
        compName.includes(term) ||
        peName.includes(term) ||
        b.buyer_type?.toLowerCase().includes(term) ||
        b.business_type?.toLowerCase().includes(term) ||
        fieldContains(b.target_services, term) ||
        fieldContains(b.services_offered, term) ||
        fieldContains(b.target_industries, term) ||
        b.industry_vertical?.toLowerCase().includes(term) ||
        b.thesis_summary?.toLowerCase().includes(term) ||
        b.business_summary?.toLowerCase().includes(term) ||
        b.notes?.toLowerCase().includes(term) ||
        b.alignment_reasoning?.toLowerCase().includes(term) ||
        b.revenue_model?.toLowerCase().includes(term) ||
        b.hq_state?.toLowerCase().includes(term) ||
        b.hq_city?.toLowerCase().includes(term) ||
        b.hq_region?.toLowerCase().includes(term) ||
        fieldContains(b.geographic_footprint, term) ||
        fieldContains(b.target_geographies, term) ||
        fieldContains(b.service_regions, term) ||
        fieldContains(b.operating_locations, term)
      )
        return true;

      // Fuzzy matching for company/entity names (1 edit distance tolerance)
      const combined = `${compName} ${peName}`;
      if (searchWords.length > 1 && searchWords.every((w) => fuzzyContainsWord(combined, w)))
        return true;
      if (
        term.length >= 4 &&
        (fuzzyContainsWord(compName, term) || fuzzyContainsWord(peName, term))
      )
        return true;

      return false;
    });
  }

  // Track count before client-side filtering for response quality
  const totalBeforeFiltering = results.length;

  // CapTarget exclusion filter — remove PE/VC/investment banks when requested
  if (args.exclude_financial_buyers === true) {
    results = results.filter((b: BuyerRecord) => {
      const exclusion = checkCompanyExclusion({
        companyName: b.company_name || b.pe_firm_name || '',
        description: b.business_summary || b.thesis_summary || '',
        contactTitle: null,
        industry: b.industry_vertical || null,
      });
      return !exclusion.excluded;
    });
  }

  // Build filter echo and zero-result suggestion
  const filtersApplied: Record<string, unknown> = {};
  if (args.state) filtersApplied.state = args.state;
  if (args.industry) filtersApplied.industry = args.industry;
  if (args.search) filtersApplied.search = args.search;
  if (args.services) filtersApplied.services = args.services;
  if (args.buyer_type) filtersApplied.buyer_type = args.buyer_type;
  if (args.min_revenue) filtersApplied.min_revenue = args.min_revenue;
  if (args.max_revenue) filtersApplied.max_revenue = args.max_revenue;
  if (args.has_fee_agreement !== undefined)
    filtersApplied.has_fee_agreement = args.has_fee_agreement;
  if (args.acquisition_appetite) filtersApplied.acquisition_appetite = args.acquisition_appetite;
  if (args.universe_id) filtersApplied.universe_id = args.universe_id;
  if (args.exclude_financial_buyers) filtersApplied.exclude_financial_buyers = true;

  // Build universe breakdown for transparency when universe-aware matching was active
  const universeBreakdown: Record<string, { name: string; count: number }> = {};
  if (matchedUniverseNames.size > 0) {
    for (const b of results) {
      const bRecord = b as BuyerRecord;
      if (bRecord.universe_id && matchedUniverseNames.has(bRecord.universe_id)) {
        const uid = bRecord.universe_id;
        if (!universeBreakdown[uid]) {
          universeBreakdown[uid] = { name: matchedUniverseNames.get(uid)!, count: 0 };
        }
        universeBreakdown[uid].count++;
      }
    }
  }

  return {
    data: {
      buyers: results,
      total: results.length,
      total_before_filtering: totalBeforeFiltering,
      depth,
      filters_applied: filtersApplied,
      limit_reached: results.length >= limit,
      // Show which universes were matched so the AI can detect cross-contamination
      ...(matchedUniverseNames.size > 0
        ? {
            matched_universes: Object.entries(universeBreakdown).map(([id, info]) => ({
              universe_id: id,
              universe_name: info.name,
              buyer_count: info.count,
            })),
            universe_warning:
              matchedUniverseNames.size > 1
                ? `WARNING: ${matchedUniverseNames.size} different universes matched the search term. Results include buyers from: ${Array.from(matchedUniverseNames.values()).join(', ')}. If the user asked about a SPECIFIC universe, re-query with universe_id to scope results correctly.`
                : undefined,
          }
        : {}),
      ...(results.length === 0
        ? {
            suggestion:
              totalBeforeFiltering > 0
                ? `${totalBeforeFiltering} buyers were fetched but none matched your filters. Try broadening: remove the industry/search/state filter, or check search_lead_sources and search_valuation_leads for other data sources.`
                : 'No buyers found in the database with the current filters. Try removing filters or checking other sources (search_lead_sources, search_valuation_leads, search_inbound_leads).',
          }
        : {}),
    },
  };
}

async function getBuyerProfile(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const buyerId = args.buyer_id as string;

  // Parallel fetch: buyer + contacts + scores + transcripts
  // Updated Feb 2026: contacts now fetched from unified contacts table (buyer_contacts is legacy)
  const [buyerResult, contactsResult, scoresResult, transcriptsResult] = await Promise.all([
    supabase.from('buyers').select(BUYER_FIELDS_FULL).eq('id', buyerId).single(),
    supabase
      .from('contacts')
      .select(
        'id, first_name, last_name, email, phone, title, is_primary_at_firm, nda_signed, fee_agreement_signed, linkedin_url, source, created_at',
      )
      .eq('remarketing_buyer_id', buyerId)
      .eq('contact_type', 'buyer')
      .eq('archived', false)
      .order('is_primary_at_firm', { ascending: false }),
    supabase
      .from('remarketing_scores')
      .select(
        'listing_id, composite_score, status, tier, geography_score, service_score, size_score, owner_goals_score, fit_reasoning',
      )
      .eq('buyer_id', buyerId)
      .order('composite_score', { ascending: false })
      .limit(10),
    supabase
      .from('call_transcripts')
      .select('id, created_at, call_type, ceo_detected, key_quotes, extracted_insights')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  if (buyerResult.error) return { error: buyerResult.error.message };

  return {
    data: {
      buyer: buyerResult.data,
      contacts: contactsResult.data || [],
      deal_scores: scoresResult.data || [],
      recent_transcripts: transcriptsResult.data || [],
    },
  };
}

async function getScoreBreakdown(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('remarketing_scores')
    .select('*')
    .eq('buyer_id', args.buyer_id as string)
    .eq('listing_id', args.deal_id as string)
    .single();

  if (error) return { error: error.message };
  return { data: { score: data } };
}

async function getTopBuyersForDeal(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const dealId = args.deal_id as string;
  // Increase default limit to allow counting all buyers in a universe
  // Use 1000 when state filter is requested so geographic counts are accurate
  const defaultLimit = args.state ? 1000 : 20;
  const limit = Math.min(Number(args.limit) || defaultLimit, 2000);

  let query = supabase
    .from('remarketing_scores')
    .select(
      `
      buyer_id, composite_score, status, tier,
      geography_score, service_score, size_score, owner_goals_score,
      acquisition_score, business_model_score, portfolio_score,
      fit_reasoning, pass_reason
    `,
    )
    .eq('listing_id', dealId)
    .order('composite_score', { ascending: false })
    .limit(limit);

  if (args.status) query = query.eq('status', args.status as string);
  if (args.min_score) query = query.gte('composite_score', args.min_score as number);

  const { data: scores, error: scoresError } = await query;
  if (scoresError) return { error: scoresError.message };

  if (!scores || scores.length === 0) {
    return {
      data: {
        buyers: [],
        total: 0,
        deal_id: dealId,
        filters_applied: {
          ...(args.status ? { status: args.status } : {}),
          ...(args.min_score ? { min_score: args.min_score } : {}),
          ...(args.state ? { state: args.state } : {}),
        },
        suggestion:
          'No scored buyers found for this deal. The deal may not have a buyer universe built yet, or no buyers have been scored. Check with get_deal_details to confirm remarketing_status.',
      },
    };
  }

  // Fetch buyer details for the scored buyer IDs
  const buyerIds = scores.map((s: { buyer_id: string }) => s.buyer_id);
  let buyerQuery = supabase
    .from('buyers')
    .select(
      'id, company_name, pe_firm_name, buyer_type, hq_state, hq_city, has_fee_agreement, geographic_footprint',
    )
    .in('id', buyerIds);

  // Apply state filter at DB level when requested
  if (args.state) {
    const st = (args.state as string).toUpperCase().replace(/[^A-Z]/g, '');
    if (st.length === 2) {
      buyerQuery = buyerQuery.or(`hq_state.eq.${st},geographic_footprint.cs.{${st}}`);
    }
  }

  const { data: buyers } = await buyerQuery;

  const buyerMap = new Map((buyers || []).map((b: { id: string }) => [b.id, b]));

  const enriched = scores
    .map((s: { buyer_id: string }) => ({
      ...s,
      buyer: buyerMap.get(s.buyer_id) || null,
    }))
    .filter((s: { buyer: unknown }) => !args.state || s.buyer !== null); // filter out non-matching buyers when state is specified

  return {
    data: {
      buyers: enriched,
      total: enriched.length,
      total_scored: scores.length,
      deal_id: dealId,
      filters_applied: {
        ...(args.status ? { status: args.status } : {}),
        ...(args.min_score ? { min_score: args.min_score } : {}),
        ...(args.state ? { state: args.state } : {}),
      },
      limit_reached: scores.length >= limit,
      ...(enriched.length === 0 && args.state
        ? {
            suggestion: `${scores.length} buyers scored for this deal but none match state "${args.state}". Try removing the state filter to see all scored buyers.`,
          }
        : {}),
    },
  };
}

async function searchLeadSources(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const sourceType = (args.source_type as string) || 'all';
  const requestedLimit = Number(args.limit) || 5000;

  // Map source type to deal_source values
  const sourceMap: Record<string, string[]> = {
    captarget: ['captarget', 'cp_target'],
    go_partners: ['go_partners', 'go-partners'],
    marketplace: ['marketplace'],
    internal: ['internal', 'direct'],
  };

  // Paginate to fetch all matching rows using correct listing fields
  const PAGE_SIZE = 1000;
  let allData: Record<string, unknown>[] = [];
  let offset = 0;

  while (offset < requestedLimit) {
    const batchSize = Math.min(PAGE_SIZE, requestedLimit - offset);
    let query = supabase
      .from('listings')
      .select(LISTING_LEAD_FIELDS)
      .is('deleted_at', null)
      .order('deal_total_score', { ascending: false, nullsFirst: false })
      .range(offset, offset + batchSize - 1);

    if (sourceType !== 'all') {
      const sources = sourceMap[sourceType] || [sourceType];
      query = query.in('deal_source', sources);
    }
    if (args.status) query = query.eq('status', args.status as string);

    const { data: batch, error } = await query;
    if (error) return { error: error.message };
    if (!batch || batch.length === 0) break;
    allData = allData.concat(batch);
    if (batch.length < batchSize) break;
    offset += batch.length;
  }

  const totalFromDb = allData.length;

  // Client-side state filter — checks address_state and geographic_states
  if (args.state) {
    const st = (args.state as string).toUpperCase().replace(/[^A-Z]/g, '');
    if (st.length === 2) {
      const stLower = st.toLowerCase();
      allData = allData.filter((d: Record<string, unknown>) => {
        const addrState = ((d.address_state as string) || '').toLowerCase();
        const geoStates = (d.geographic_states as string[]) || [];
        return (
          addrState === stLower ||
          addrState.includes(stLower) ||
          geoStates.some((s: string) => s.toUpperCase() === st)
        );
      });
    }
  }

  // Client-side industry keyword filter — checks ALL relevant text fields
  if (args.industry) {
    const term = (args.industry as string).toLowerCase();
    allData = allData.filter((d: Record<string, unknown>) => {
      const industry = ((d.industry as string) || '').toLowerCase();
      const category = ((d.category as string) || '').toLowerCase();
      const categories = (d.categories as string[]) || [];
      const title = ((d.title as string) || '').toLowerCase();
      const services = (d.services as string[]) || [];
      const captargetTab = ((d.captarget_sheet_tab as string) || '').toLowerCase();
      return (
        industry.includes(term) ||
        category.includes(term) ||
        categories.some((c: string) => c.toLowerCase().includes(term)) ||
        title.includes(term) ||
        services.some((s: string) => s.toLowerCase().includes(term)) ||
        captargetTab.includes(term)
      );
    });
  }

  // Source breakdown
  const sourceBreakdown: Record<string, number> = {};
  const industryBreakdown: Record<string, number> = {};
  for (const d of allData) {
    const src = ((d as Record<string, unknown>).deal_source as string) || 'unknown';
    sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;

    const ind = ((d as Record<string, unknown>).industry as string) || 'unknown';
    industryBreakdown[ind] = (industryBreakdown[ind] || 0) + 1;
  }

  const filtersApplied: Record<string, unknown> = { source_type: sourceType };
  if (args.industry) filtersApplied.industry = args.industry;
  if (args.state) filtersApplied.state = args.state;
  if (args.status) filtersApplied.status = args.status;

  return {
    data: {
      deals: allData,
      total: allData.length,
      total_before_filtering: totalFromDb,
      source_breakdown: sourceBreakdown,
      industry_breakdown: industryBreakdown,
      filters_applied: filtersApplied,
      limit_reached: allData.length >= requestedLimit,
      ...(allData.length === 0
        ? {
            suggestion:
              totalFromDb > 0
                ? `${totalFromDb} leads found from ${sourceType} sources but none matched your industry/state filter. Try broadening: remove the "${args.industry || args.state}" filter.`
                : `No leads found for source type "${sourceType}". Try source_type "all" to search across all sources, or use search_buyers for acquirers/PE firms.`,
          }
        : {}),
    },
  };
}

async function searchValuationLeads(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const calcType = (args.calculator_type as string) || 'all';
  const limit = Math.min(Number(args.limit) || 5000, 10000);

  let query = supabase
    .from('valuation_leads')
    .select(
      'id, calculator_type, display_name, business_name, industry, region, location, revenue, ebitda, lead_score, quality_tier, status, pushed_to_all_deals, excluded, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (calcType !== 'all') {
    query = query.eq('calculator_type', calcType);
  }
  if (args.status) query = query.eq('status', args.status as string);
  if (args.include_excluded !== true) query = query.eq('excluded', false);
  if (args.pushed_to_deals !== undefined)
    query = query.eq('pushed_to_all_deals', args.pushed_to_deals as boolean);
  if (args.min_revenue) query = query.gte('revenue', args.min_revenue as number);

  const { data, error } = await query;
  if (error) return { error: error.message };

  let leads = data || [];
  const totalFromDb = leads.length;

  // Client-side free-text search across all relevant fields
  if (args.search) {
    const term = (args.search as string).toLowerCase();
    leads = leads.filter(
      (l: {
        business_name?: string;
        display_name?: string;
        industry?: string;
        region?: string;
        location?: string;
      }) =>
        l.business_name?.toLowerCase().includes(term) ||
        l.display_name?.toLowerCase().includes(term) ||
        l.industry?.toLowerCase().includes(term) ||
        l.region?.toLowerCase().includes(term) ||
        l.location?.toLowerCase().includes(term),
    );
  }

  if (args.state) {
    const term = (args.state as string).toLowerCase();
    leads = leads.filter(
      (l: { region?: string; location?: string }) =>
        l.region?.toLowerCase().includes(term) || l.location?.toLowerCase().includes(term),
    );
  }

  // Aggregate by calculator type
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const l of leads) {
    byType[l.calculator_type] = (byType[l.calculator_type] || 0) + 1;
    const st = l.status || 'unknown';
    byStatus[st] = (byStatus[st] || 0) + 1;
  }

  const filtersApplied: Record<string, unknown> = { calculator_type: calcType };
  if (args.search) filtersApplied.search = args.search;
  if (args.state) filtersApplied.state = args.state;
  if (args.status) filtersApplied.status = args.status;
  if (args.min_revenue) filtersApplied.min_revenue = args.min_revenue;
  if (args.pushed_to_deals !== undefined) filtersApplied.pushed_to_deals = args.pushed_to_deals;

  return {
    data: {
      leads,
      total: leads.length,
      total_before_filtering: totalFromDb,
      by_calculator_type: byType,
      by_status: byStatus,
      filters_applied: filtersApplied,
      limit_reached: leads.length >= limit,
      ...(leads.length === 0
        ? {
            suggestion:
              totalFromDb > 0
                ? `${totalFromDb} valuation leads exist for calculator_type "${calcType}" but none matched your search/state filter. Try broadening your search.`
                : `No valuation leads found for calculator_type "${calcType}". Try calculator_type "all", or use search_lead_sources / search_buyers for other data sources.`,
          }
        : {}),
    },
  };
}
