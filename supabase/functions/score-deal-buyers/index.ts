import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';

// ── Types ──

interface ScoreRequest {
  listingId: string;
  forceRefresh?: boolean;
}

interface BuyerScore {
  buyer_id: string;
  company_name: string;
  pe_firm_name: string | null;
  pe_firm_id: string | null;
  buyer_type: string | null;
  hq_state: string | null;
  hq_city: string | null;
  has_fee_agreement: boolean;
  acquisition_appetite: string | null;
  company_website: string | null;
  composite_score: number;
  service_score: number;
  geography_score: number;
  size_score: number;
  bonus_score: number;
  fit_signals: string[];
  fit_reason: string;
  tier: 'move_now' | 'strong' | 'speculative';
  source: 'ai_seeded' | 'marketplace' | 'scored';
}

// ── Scoring weights (v1 — hardcoded) ──

const WEIGHTS = {
  service: 0.4,
  geography: 0.3,
  size: 0.2,
  bonus: 0.1,
} as const;

const MAX_RESULTS = 50;
const CACHE_HOURS = 4;

// ── US region mapping for geographic scoring ──

const STATE_REGIONS: Record<string, string> = {
  CT: 'northeast',
  MA: 'northeast',
  ME: 'northeast',
  NH: 'northeast',
  NJ: 'northeast',
  NY: 'northeast',
  PA: 'northeast',
  RI: 'northeast',
  VT: 'northeast',
  IL: 'midwest',
  IN: 'midwest',
  IA: 'midwest',
  KS: 'midwest',
  MI: 'midwest',
  MN: 'midwest',
  MO: 'midwest',
  NE: 'midwest',
  ND: 'midwest',
  OH: 'midwest',
  SD: 'midwest',
  WI: 'midwest',
  AL: 'south',
  AR: 'south',
  DC: 'south',
  DE: 'south',
  FL: 'south',
  GA: 'south',
  KY: 'south',
  LA: 'south',
  MD: 'south',
  MS: 'south',
  NC: 'south',
  OK: 'south',
  SC: 'south',
  TN: 'south',
  TX: 'south',
  VA: 'south',
  WV: 'south',
  AK: 'west',
  AZ: 'west',
  CA: 'west',
  CO: 'west',
  HI: 'west',
  ID: 'west',
  MT: 'west',
  NV: 'west',
  NM: 'west',
  OR: 'west',
  UT: 'west',
  WA: 'west',
  WY: 'west',
};

// ── Sector synonym expansion for semantic matching ──

// Synonyms map each sector term to closely-related terms for matching.
// IMPORTANT: Avoid generic bridge terms (e.g. "healthcare", "building services",
// "facility services") as synonyms of specific verticals — they cause false
// exact-match scores between unrelated industries (e.g. dental ↔ veterinary
// through "healthcare"). Only map to genuinely interchangeable or directly
// overlapping terms.
const SECTOR_SYNONYMS: Record<string, string[]> = {
  // Utilities / Infrastructure
  utility: [
    'utilities',
    'utility services',
    'infrastructure',
    'field services',
    'municipal services',
  ],
  'utility services': [
    'utility',
    'utilities',
    'infrastructure services',
    'outsourced utility',
    'municipal',
  ],
  metering: ['amr', 'ami', 'smart meter', 'meter reading', 'meter installation'],
  infrastructure: ['utility', 'field services', 'municipal', 'outsourced services'],
  // Home Services — each maps to "home services" as their shared parent but NOT
  // to each other's specific terms (hvac ≠ plumbing, plumbing ≠ roofing)
  'home services': ['residential services', 'home repair'],
  hvac: ['mechanical', 'climate control', 'heating and cooling'],
  plumbing: ['plumbing services', 'mechanical services', 'pipe services'],
  roofing: ['roofing services', 'exterior services'],
  collision: ['auto body', 'paint and body', 'auto repair'],
  // Healthcare — each sub-vertical maps to its own close synonyms, NOT the
  // generic "healthcare" umbrella (prevents dental ↔ veterinary false matches)
  healthcare: ['health services', 'medical services', 'patient care'],
  dental: ['dental services', 'dental practice', 'orthodontics', 'oral health'],
  'behavioral health': ['mental health', 'therapy', 'counseling', 'psychiatric services'],
  veterinary: ['animal health', 'pet care', 'veterinary services', 'animal hospital'],
  // Staffing / Professional Services
  staffing: [
    'workforce solutions',
    'temporary staffing',
    'talent acquisition',
    'recruiting',
    'employment services',
  ],
  recruiting: ['staffing', 'talent acquisition', 'executive search', 'workforce solutions'],
  consulting: ['advisory', 'professional services', 'management consulting'],
  accounting: ['bookkeeping', 'cpa', 'tax services', 'audit services'],
  // Construction / Trades — each maps to close synonyms, not generic "building services"
  electrical: ['electrical services', 'electrical contracting', 'power systems'],
  construction: ['general contracting', 'specialty contracting', 'trades'],
  'fire protection': ['fire safety', 'fire suppression', 'life safety', 'sprinkler systems'],
  restoration: ['remediation', 'disaster recovery', 'reconstruction', 'water damage'],
  // Facility / Building Services
  janitorial: ['commercial cleaning', 'custodial', 'cleaning services'],
  'commercial cleaning': ['janitorial', 'custodial', 'cleaning services'],
  'facility services': ['building services', 'property services', 'facilities management'],
  'building services': ['facility services', 'property management', 'building maintenance'],
  // Technology / IT
  'it services': ['managed services', 'msp', 'technology services', 'it support'],
  cybersecurity: ['information security', 'managed security', 'infosec', 'network security'],
  software: ['saas', 'technology', 'tech-enabled services'],
  telecom: ['telecommunications', 'communications', 'wireless', 'connectivity'],
  // Industrial / Manufacturing
  manufacturing: ['production', 'fabrication', 'industrial', 'precision manufacturing'],
  distribution: ['wholesale', 'supply chain', 'industrial distribution'],
  logistics: ['transportation', 'freight', '3pl', 'warehousing'],
  // Other Services
  landscaping: ['grounds maintenance', 'outdoor services', 'lawn care', 'landscape services'],
  'pest control': ['extermination', 'pest management', 'termite control'],
  'waste management': ['waste services', 'recycling', 'hauling', 'waste collection'],
  'environmental services': ['remediation', 'environmental consulting', 'environmental compliance'],
  insurance: ['insurance services', 'insurance brokerage', 'risk management'],
  'food services': ['food distribution', 'catering', 'food manufacturing'],
  automotive: ['auto services', 'auto repair', 'collision', 'vehicle services'],
  education: ['training', 'learning', 'ed tech', 'tutoring', 'educational services'],
};

function expandTerms(terms: string[]): string[] {
  const expanded = new Set(terms.map((t) => t.toLowerCase()));
  for (const t of terms) {
    const synonyms = SECTOR_SYNONYMS[t.toLowerCase()] || [];
    for (const s of synonyms) expanded.add(s.toLowerCase());
  }
  return [...expanded];
}

// ── Helper: extract keywords from rich text fields ──

function extractDealKeywords(deal: Record<string, unknown>): string[] {
  const richText = [
    deal.executive_summary,
    deal.description,
    deal.hero_description,
    deal.investment_thesis,
    deal.end_market_description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Use word boundary matching to prevent false positives
  // (e.g. "dental" matching inside "accidental")
  const knownTerms = Object.keys(SECTOR_SYNONYMS);
  return knownTerms.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`);
    return regex.test(richText);
  });
}

// ── Helper: normalize strings for comparison ──

function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().trim();
}

/** Title-case a lowercase term for display: "utility services" → "Utility Services" */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normArray(arr: string[] | null | undefined): string[] {
  if (!arr) return [];
  return arr.map((s) => norm(s)).filter(Boolean);
}

// ── Scoring functions ──

function scoreService(
  dealCategories: string[],
  dealIndustry: string,
  buyerServices: string[],
  buyerIndustries: string[],
  buyerIndustryVertical: string,
): { score: number; signals: string[] } {
  const rawDealTerms = [...dealCategories, dealIndustry].filter(Boolean);
  const rawBuyerTerms = [...buyerServices, ...buyerIndustries, buyerIndustryVertical].filter(
    Boolean,
  );

  if (rawDealTerms.length === 0 || rawBuyerTerms.length === 0) {
    return { score: 0, signals: [] }; // No data — cannot score, don't inflate
  }

  // Expand terms through synonyms for semantic matching
  const dealTerms = expandTerms(rawDealTerms);
  const buyerTerms = expandTerms(rawBuyerTerms);

  let bestMatch = 0;
  const exactMatches = new Set<string>();
  const adjacentMatches = new Set<string>();
  for (const dt of dealTerms) {
    for (const bt of buyerTerms) {
      if (dt === bt) {
        bestMatch = 100;
        exactMatches.add(bt);
      } else if (dt.length >= 4 && bt.length >= 4) {
        // Use word boundary matching to prevent false positives
        // e.g. "fire" should NOT match "fireplace", but "meter" should match "meter reading"
        const shorter = dt.length <= bt.length ? dt : bt;
        const longer = dt.length <= bt.length ? bt : dt;
        const escaped = shorter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`).test(longer)) {
          if (bestMatch < 60) bestMatch = 60;
          adjacentMatches.add(bt);
        }
      }
    }
  }

  // Collect all matching signals (exact matches take priority in descriptions)
  const matchSignals: string[] = [];
  for (const m of exactMatches) matchSignals.push(`Exact industry match: ${m}`);
  if (bestMatch < 100) {
    for (const m of adjacentMatches) matchSignals.push(`Adjacent industry: ${m}`);
  }

  return { score: bestMatch, signals: matchSignals };
}

function scoreGeography(
  dealState: string,
  dealGeoStates: string[],
  buyerGeos: string[],
  buyerFootprint: string[],
  buyerHqState: string,
): { score: number; signals: string[] } {
  const signals: string[] = [];
  const dealStates = [dealState, ...dealGeoStates].filter(Boolean);

  if (dealStates.length === 0) {
    return { score: 0, signals: [] }; // No deal geo data — cannot score, don't inflate
  }

  const allBuyerGeos = [...buyerGeos, ...buyerFootprint, buyerHqState].filter(Boolean);

  // Check for national buyer
  const nationalIndicators = ['national', 'nationwide', 'all states', 'us', 'united states'];
  if (allBuyerGeos.some((g) => nationalIndicators.includes(g))) {
    signals.push('National buyer');
    return { score: 80, signals };
  }

  // Check for state match
  for (const ds of dealStates) {
    if (allBuyerGeos.includes(ds)) {
      signals.push(`State match: ${ds}`);
      return { score: 100, signals };
    }
  }

  // Check for region match
  // Region names that may appear directly in buyer geos (e.g., "northeast", "midwest")
  const REGION_NAMES = new Set([
    'northeast',
    'midwest',
    'south',
    'west',
    'southeast',
    'southwest',
    'northwest',
  ]);
  const dealRegions = new Set(
    dealStates.map((s) => STATE_REGIONS[s.toUpperCase()]).filter(Boolean),
  );

  // Buyer regions: derive from state codes AND recognize region names directly
  const buyerRegions = new Set<string>();
  for (const g of allBuyerGeos) {
    const fromState = STATE_REGIONS[g.toUpperCase()];
    if (fromState) buyerRegions.add(fromState);
    // Direct region name match (e.g., "northeast" in target_geographies)
    if (REGION_NAMES.has(g)) {
      // Map sub-regions to broader regions for matching
      if (g === 'southeast' || g === 'southwest') buyerRegions.add('south');
      else if (g === 'northwest') buyerRegions.add('west');
      buyerRegions.add(g);
    }
  }
  // Expand deal regions to include sub-regions for symmetric matching
  const expandedDealRegions = new Set<string>(dealRegions);
  for (const dr of [...dealRegions]) {
    // If deal is in 'south', it should also match buyers targeting 'southeast'/'southwest'
    if (dr === 'south') {
      expandedDealRegions.add('southeast');
      expandedDealRegions.add('southwest');
    } else if (dr === 'west') {
      expandedDealRegions.add('northwest');
    }
  }

  for (const dr of expandedDealRegions) {
    if (buyerRegions.has(dr)) {
      signals.push(`Region match: ${dr}`);
      return { score: 60, signals };
    }
  }

  return { score: 0, signals: [] };
}

function scoreSize(
  dealEbitda: number | null,
  buyerMin: number | null,
  buyerMax: number | null,
): { score: number; signals: string[] } {
  const signals: string[] = [];

  if (dealEbitda == null || (buyerMin == null && buyerMax == null)) {
    return { score: 0, signals: [] }; // No data — cannot score, don't inflate
  }

  const min = buyerMin ?? 0;
  const max = buyerMax ?? Number.MAX_SAFE_INTEGER;

  if (dealEbitda >= min && dealEbitda <= max) {
    signals.push(`EBITDA in range ($${(dealEbitda / 1_000_000).toFixed(1)}M)`);
    return { score: 100, signals };
  }

  // Within 50% of range
  const rangeSize = max === Number.MAX_SAFE_INTEGER ? min * 2 : max - min;
  const tolerance = rangeSize * 0.5;
  if (dealEbitda >= min - tolerance && dealEbitda <= max + tolerance) {
    signals.push('EBITDA near target range');
    return { score: 60, signals };
  }

  return { score: 0, signals: [] };
}

function scoreBonus(buyer: {
  has_fee_agreement: boolean | null;
  acquisition_appetite: string | null;
  total_acquisitions: number | null;
}): { score: number; signals: string[] } {
  let points = 0;
  const signals: string[] = [];

  if (buyer.has_fee_agreement) {
    points += 34;
    signals.push('Fee agreement signed');
  }
  if (norm(buyer.acquisition_appetite) === 'aggressive') {
    points += 33;
    signals.push('Aggressive acquisition appetite');
  }
  if ((buyer.total_acquisitions || 0) > 3) {
    points += 33;
    signals.push(`${buyer.total_acquisitions} acquisitions`);
  }

  return { score: Math.min(points, 100), signals };
}

function classifyTier(
  compositeScore: number,
  hasFeeAgreement: boolean,
  appetite: string | null,
): 'move_now' | 'strong' | 'speculative' {
  if (compositeScore >= 80 && (hasFeeAgreement || norm(appetite) === 'aggressive')) {
    return 'move_now';
  }
  if (compositeScore >= 60) {
    return 'strong';
  }
  return 'speculative';
}

// ── Main handler ──

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const headers = getCorsHeaders(req);

  try {
    // ── Auth guard (shared helper) ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Service-role bypass for internal queue workers (e.g. process-scoring-queue)
    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '');
    const isServiceCall = authToken === supabaseServiceKey;

    if (!isServiceCall) {
      const auth = await requireAdmin(req, supabase);
      if (!auth.isAdmin) {
        const status = auth.authenticated ? 403 : 401;
        return new Response(JSON.stringify({ error: auth.error }), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
    }
    // ── End auth guard ──

    const body: ScoreRequest = await req.json();
    const { listingId, forceRefresh } = body;

    if (!listingId) {
      return new Response(JSON.stringify({ error: 'listingId is required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // ── Check cache ──
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('buyer_recommendation_cache')
        .select('results, buyer_count, scored_at')
        .eq('listing_id', listingId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (cached) {
        return new Response(
          JSON.stringify({
            buyers: cached.results,
            total: cached.buyer_count,
            cached: true,
            scored_at: cached.scored_at,
          }),
          { headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── Fetch deal ──
    const { data: deal, error: dealError } = await supabase
      .from('listings')
      .select(
        'id, title, industry, category, categories, ebitda, address_state, geographic_states,' +
          'executive_summary, description, hero_description, investment_thesis,' +
          'end_market_description, business_model, revenue_model, customer_types,' +
          'owner_goals, seller_motivation, transition_preferences',
      )
      .eq('id', listingId)
      .single();

    if (dealError || !deal) {
      return new Response(
        JSON.stringify({ error: 'Deal not found', details: dealError?.message }),
        { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // ── Fetch ALL active, non-archived buyers ──
    // Explicit limit required: Supabase config max_rows=1000 silently truncates without it
    const { data: buyers, error: buyerError } = await supabase
      .from('buyers')
      .select(
        'id, company_name, company_website, pe_firm_name, pe_firm_id, buyer_type, is_pe_backed, hq_state, hq_city, ' +
          'target_services, target_industries, industry_vertical, ' +
          'target_geographies, geographic_footprint, ' +
          'target_ebitda_min, target_ebitda_max, ' +
          'has_fee_agreement, acquisition_appetite, total_acquisitions, ' +
          'thesis_summary, ai_seeded, ai_seeded_from_deal_id, ai_seeded_at, marketplace_firm_id',
      )
      .eq('archived', false)
      .limit(10000);

    if (buyerError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch buyers', details: buyerError.message }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    if (!buyers || buyers.length === 0) {
      const emptyResult = {
        buyers: [],
        total: 0,
        cached: false,
        scored_at: new Date().toISOString(),
      };
      return new Response(JSON.stringify(emptyResult), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch seed log data (why_relevant is deal-specific; known_acquisitions spans all deals) ──
    const { data: seedLogRows } = await supabase
      .from('buyer_seed_log')
      .select('remarketing_buyer_id, why_relevant, known_acquisitions')
      .eq('source_deal_id', listingId);

    // Also fetch known_acquisitions across ALL deals so we can surface them even when
    // a buyer was seeded from a different deal (why_relevant is still deal-specific above)
    const { data: allAcquisitionRows } = await supabase
      .from('buyer_seed_log')
      .select('remarketing_buyer_id, known_acquisitions')
      .not('known_acquisitions', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2000);

    const seedLogMap = new Map<string, string>();
    const seedLogAcquisitionsMap = new Map<string, string[]>();
    for (const row of seedLogRows || []) {
      if (row.why_relevant) seedLogMap.set(row.remarketing_buyer_id, row.why_relevant);
      if (row.known_acquisitions?.length)
        seedLogAcquisitionsMap.set(row.remarketing_buyer_id, row.known_acquisitions);
    }
    // Merge in acquisitions from other deals (don't overwrite deal-specific ones)
    for (const row of allAcquisitionRows || []) {
      if (!seedLogAcquisitionsMap.has(row.remarketing_buyer_id) && row.known_acquisitions?.length) {
        seedLogAcquisitionsMap.set(row.remarketing_buyer_id, row.known_acquisitions);
      }
    }

    // ── Normalize deal fields ──
    const richKeywords = extractDealKeywords(deal);
    const dealCategories = normArray([
      ...(deal.categories || (deal.category ? [deal.category] : [])),
      ...richKeywords,
    ]);
    const dealIndustry = norm(deal.industry);
    const dealState = norm(deal.address_state);
    const dealGeoStates = normArray(deal.geographic_states);
    const dealEbitda = deal.ebitda;

    // ── Score each buyer ──
    const scored: BuyerScore[] = [];

    for (const buyer of buyers) {
      const buyerServices = normArray(buyer.target_services);
      const buyerIndustries = normArray(buyer.target_industries);
      const buyerIndustryVertical = norm(buyer.industry_vertical);
      const buyerGeos = normArray(buyer.target_geographies);
      const buyerFootprint = normArray(buyer.geographic_footprint);
      const buyerHqState = norm(buyer.hq_state);

      const svc = scoreService(
        dealCategories,
        dealIndustry,
        buyerServices,
        buyerIndustries,
        buyerIndustryVertical,
      );
      const geo = scoreGeography(dealState, dealGeoStates, buyerGeos, buyerFootprint, buyerHqState);
      const size = scoreSize(dealEbitda, buyer.target_ebitda_min, buyer.target_ebitda_max);
      const bonus = scoreBonus(buyer);

      const composite = Math.round(
        svc.score * WEIGHTS.service +
          geo.score * WEIGHTS.geography +
          size.score * WEIGHTS.size +
          bonus.score * WEIGHTS.bonus,
      );

      const fitSignals = [...svc.signals, ...geo.signals, ...size.signals, ...bonus.signals];

      // Derive source from buyer origin
      const source: BuyerScore['source'] = buyer.ai_seeded
        ? 'ai_seeded'
        : buyer.marketplace_firm_id
          ? 'marketplace'
          : 'scored';

      const tier = classifyTier(composite, !!buyer.has_fee_agreement, buyer.acquisition_appetite);

      // Build fit_reason: seed log why_relevant (best) > thesis + deal context (good) > generated sentence
      const seedLogReason = seedLogMap.get(buyer.id);
      const seedLogAcquisitions = seedLogAcquisitionsMap.get(buyer.id);
      const rawThesis = (buyer.thesis_summary || '').trim();
      // Strip signal-like suffixes that may have been appended to thesis_summary by previous code
      const thesisCleaned = rawThesis
        .replace(
          /\.?\s*(Exact industry match:[^.]*|Adjacent industry:[^.]*|State match:[^.]*|Region match:[^.]*|National buyer|EBITDA [^.]*|Fee agreement signed|Aggressive [^.]*|\d+ acquisitions)\.?\s*/gi,
          '',
        )
        .trim();

      // Shared helpers for richer descriptions
      const _rawBuyerServices = ((buyer.target_services as string[]) || []).filter(Boolean);
      const _rawBuyerIndustriesList = ((buyer.target_industries as string[]) || []).filter(Boolean);
      const _buyerTypeLabel =
        buyer.buyer_type === 'pe_firm'
          ? 'PE firm'
          : buyer.buyer_type === 'platform'
            ? 'PE-backed platform'
            : buyer.buyer_type === 'family_office'
              ? 'Family office'
              : 'Strategic acquirer';
      const _locationStr =
        buyer.hq_city && buyer.hq_state
          ? `${buyer.hq_city}, ${buyer.hq_state}`
          : buyer.hq_state || '';
      const ebitdaMinStr = buyer.target_ebitda_min
        ? `$${(buyer.target_ebitda_min / 1_000_000).toFixed(1)}M`
        : null;
      const ebitdaMaxStr = buyer.target_ebitda_max
        ? `$${(buyer.target_ebitda_max / 1_000_000).toFixed(1)}M`
        : null;
      const ebitdaRangeStr =
        ebitdaMinStr && ebitdaMaxStr
          ? `${ebitdaMinStr}\u2013${ebitdaMaxStr}`
          : ebitdaMinStr
            ? `${ebitdaMinStr}+`
            : ebitdaMaxStr
              ? `up to ${ebitdaMaxStr}`
              : null;

      // Extract specific matching terms from scoring signals for use in descriptions
      const matchingServiceTerms = svc.signals
        .map((s) => {
          const m = s.match(/^(?:Exact industry match|Adjacent industry):\s*(.+)/i);
          return m?.[1]?.trim() || null;
        })
        .filter(Boolean) as string[];

      // Collect buyer's geographic coverage for richer geographic descriptions
      const rawBuyerGeos = [
        ...((buyer.target_geographies as string[]) || []),
        ...((buyer.geographic_footprint as string[]) || []),
      ].filter(Boolean);
      const uniqueGeos = [...new Set(rawBuyerGeos.map((g) => g.toUpperCase()))];
      // States the buyer covers beyond the deal state (for "also covers X, Y" detail)
      const otherCoveredStates = uniqueGeos
        .filter((g) => g.length === 2 && g !== dealState?.toUpperCase())
        .slice(0, 4);

      let fit_reason: string;
      if (seedLogReason) {
        fit_reason = seedLogReason;
      } else if (thesisCleaned) {
        // Use full thesis and append rich deal-specific scoring context
        let reason = thesisCleaned.endsWith('.') ? thesisCleaned : `${thesisCleaned}.`;
        // Append detailed deal-specific match analysis
        const matchDetails: string[] = [];
        if (svc.score >= 100) {
          if (matchingServiceTerms.length > 0) {
            matchDetails.push(
              `directly targets ${matchingServiceTerms.slice(0, 3).map(titleCase).join(', ')} \u2014 overlapping with ${dealIndustry || 'the deal'}`,
            );
          } else {
            matchDetails.push(`directly targets ${dealIndustry || 'this industry'}`);
          }
        } else if (svc.score >= 60) {
          if (matchingServiceTerms.length > 0) {
            matchDetails.push(
              `adjacent fit via ${matchingServiceTerms.slice(0, 2).map(titleCase).join(', ')} to ${dealIndustry || 'this industry'}${buyer.industry_vertical ? ` (${buyer.industry_vertical})` : ''}`,
            );
          } else {
            matchDetails.push(
              `adjacent fit to ${dealIndustry || 'this industry'}${buyer.industry_vertical ? ` via ${buyer.industry_vertical}` : ''}`,
            );
          }
        }
        if (geo.score >= 100) {
          const geoDetail =
            otherCoveredStates.length > 0
              ? `covers ${dealState?.toUpperCase() || 'target geography'} (also targets ${otherCoveredStates.join(', ')})`
              : `actively covers ${dealState?.toUpperCase() || 'target geography'}`;
          matchDetails.push(geoDetail);
        } else if (geo.score >= 80) {
          matchDetails.push('national acquisition footprint');
        } else if (geo.score >= 60) {
          matchDetails.push('regional geographic overlap');
        }
        if (size.score >= 100 && ebitdaRangeStr) {
          matchDetails.push(`targets ${ebitdaRangeStr} EBITDA (deal is in range)`);
        } else if (size.score >= 100) {
          matchDetails.push('EBITDA range aligns with deal');
        } else if (size.score >= 60) {
          matchDetails.push('EBITDA near target range');
        }
        if (buyer.total_acquisitions && buyer.total_acquisitions > 0) {
          matchDetails.push(
            `${buyer.total_acquisitions} completed acquisition${buyer.total_acquisitions > 1 ? 's' : ''}`,
          );
        }
        if (buyer.has_fee_agreement) matchDetails.push('fee agreement in place');
        if (norm(buyer.acquisition_appetite) === 'aggressive')
          matchDetails.push('actively acquiring');
        if (matchDetails.length > 0) {
          reason += ` Deal fit: ${matchDetails.join('; ')}.`;
        }
        if (seedLogAcquisitions && seedLogAcquisitions.length > 0) {
          reason += ` Known acquisitions: ${seedLogAcquisitions.slice(0, 3).join(', ')}.`;
        }
        fit_reason = reason;
      } else {
        // Generate a human-readable sentence from buyer context and scoring signals
        const buyerTypeLabel =
          buyer.buyer_type === 'private_equity'
            ? 'PE firm'
            : buyer.buyer_type === 'corporate'
              ? buyer.is_pe_backed
                ? 'PE-backed corporate'
                : 'Corporate acquirer'
              : buyer.buyer_type === 'family_office'
                ? 'Family office'
                : buyer.buyer_type === 'independent_sponsor'
                  ? 'Independent sponsor'
                  : buyer.buyer_type === 'search_fund'
                    ? 'Search fund'
                    : buyer.buyer_type === 'individual_buyer'
                      ? 'Individual buyer'
                      : 'Buyer';
        const locationStr =
          buyer.hq_city && buyer.hq_state
            ? `${buyer.hq_city}, ${buyer.hq_state}`
            : buyer.hq_state || '';
        const parts: string[] = [];
        if (svc.score >= 100) parts.push(`targets ${dealIndustry || 'this'} industry directly`);
        else if (svc.score >= 60)
          parts.push(`invests in adjacent ${dealIndustry || 'industry'} verticals`);
        if (geo.score >= 100)
          parts.push(`active in ${dealState?.toUpperCase() || 'target geography'}`);
        else if (geo.score >= 80) parts.push('national acquisition footprint');
        else if (geo.score >= 60) parts.push('regional geographic overlap');
        if (size.score >= 60) parts.push('EBITDA range matches deal size');
        if (buyer.has_fee_agreement) parts.push('has existing fee agreement');
        if (norm(buyer.acquisition_appetite) === 'aggressive') parts.push('actively acquiring');
        const detail = parts.length > 0 ? ` that ${parts.join(', ')}` : '';
        fit_reason = `${buyerTypeLabel}${locationStr ? ` based in ${locationStr}` : ''}${detail}.`;
      }

      scored.push({
        buyer_id: buyer.id,
        company_name: buyer.company_name,
        pe_firm_name: buyer.pe_firm_name,
        pe_firm_id: buyer.pe_firm_id || null,
        buyer_type: buyer.buyer_type,
        hq_state: buyer.hq_state,
        hq_city: buyer.hq_city,
        has_fee_agreement: !!buyer.has_fee_agreement,
        acquisition_appetite: buyer.acquisition_appetite,
        company_website: buyer.company_website || null,
        composite_score: composite,
        service_score: svc.score,
        geography_score: geo.score,
        size_score: size.score,
        bonus_score: bonus.score,
        fit_signals: fitSignals,
        fit_reason,
        tier,
        source,
      });
    }

    // ── Rank and cap ──
    scored.sort((a, b) => b.composite_score - a.composite_score);
    const topBuyers = scored.slice(0, MAX_RESULTS);

    // ── Write to cache (non-blocking — scoring still succeeds if cache write fails) ──
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_HOURS * 60 * 60 * 1000);

    const { error: cacheError } = await supabase.from('buyer_recommendation_cache').upsert(
      {
        listing_id: listingId,
        scored_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        buyer_count: topBuyers.length,
        results: topBuyers,
        score_version: 'v1',
      },
      { onConflict: 'listing_id' },
    );

    if (cacheError) {
      console.error('Cache write failed (non-fatal):', cacheError.message);
    }

    return new Response(
      JSON.stringify({
        buyers: topBuyers,
        total: topBuyers.length,
        total_scored: scored.length,
        cached: false,
        scored_at: now.toISOString(),
      }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('score-deal-buyers error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
