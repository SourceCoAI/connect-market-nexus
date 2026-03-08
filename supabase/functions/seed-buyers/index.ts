/**
 * seed-buyers – AI Buyer Discovery Engine (v2 — Two-Pass PE-Backed Platform Discovery)
 *
 * Discovers PE-backed platform companies that are actively consolidating a specific
 * niche through add-on acquisitions. Uses a two-pass approach:
 *
 * Pass 1: Define the ideal buyer profile (what to look for + what to exclude)
 * Pass 2: Find and verify specific PE-backed platform companies matching the profile
 *
 * Flow:
 * 1. Auth guard (admin only)
 * 2. Fetch deal details from listings table
 * 3. Validate critical deal fields are populated (Phase 0)
 * 4. Check buyer_seed_cache for recent results (90-day TTL)
 * 5. Pass 1: Call Claude to define the ideal PE-backed platform buyer profile
 * 6. Pass 2: Call Claude to find specific companies matching the profile
 * 7. Deduplicate against existing buyers (by website domain)
 * 8. Insert new buyers with ai_seeded=true
 * 9. Log each action to buyer_seed_log (with buyer profile for debugging)
 * 10. Update buyer_seed_cache
 * 11. Return results
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { callClaude, CLAUDE_MODELS } from '../_shared/claude-client.ts';
import { googleSearch } from '../_shared/serper-client.ts';

// ── Types ──

interface SeedRequest {
  listingId: string;
  maxBuyers?: number;
  forceRefresh?: boolean;
  buyerCategory?: 'sponsors' | 'operating_companies';
  /** Optional job ID for progress tracking in buyer_search_jobs table */
  jobId?: string;
}

interface AISuggestedBuyer {
  company_name: string;
  company_website: string | null;
  buyer_type:
    | 'private_equity'
    | 'corporate'
    | 'family_office'
    | 'independent_sponsor'
    | 'search_fund'
    | 'individual_buyer';
  pe_firm_name: string | null;
  hq_city: string | null;
  hq_state: string | null;
  thesis_summary: string;
  why_relevant: string;
  target_services: string[];
  target_industries: string[];
  target_geographies: string[];
  known_acquisitions: string[];
  estimated_ebitda_min: number | null;
  estimated_ebitda_max: number | null;
  verification_status?: 'verified' | 'unverified';
}

interface SeedResult {
  buyer_id: string;
  company_name: string;
  action: 'inserted' | 'enriched_existing' | 'probable_duplicate';
  why_relevant: string;
  was_new_record: boolean;
}

// ── Helpers ──

function buildCacheKey(
  deal: {
    id: string;
    industry: string | null;
    categories: string[] | null;
    address_state: string | null;
    ebitda: number | null;
  },
  buyerCategory?: string,
): string {
  const catSuffix = buyerCategory ? `:${buyerCategory}` : '';
  return `seed:v2:${deal.id}${catSuffix}`;
}

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Attempt to find a company website via Google search when Claude didn't provide one.
 * Returns the first plausible URL or null.
 */
async function lookupCompanyWebsite(companyName: string): Promise<string | null> {
  try {
    const results = await googleSearch(`${companyName} official website`, 5);
    for (const result of results) {
      const url = result.url;
      // Skip social media, directories, and news sites
      if (
        url.includes('linkedin.com') ||
        url.includes('facebook.com') ||
        url.includes('twitter.com') ||
        url.includes('yelp.com') ||
        url.includes('bbb.org') ||
        url.includes('crunchbase.com') ||
        url.includes('wikipedia.org') ||
        url.includes('bloomberg.com') ||
        url.includes('pitchbook.com') ||
        url.includes('zoominfo.com')
      ) {
        continue;
      }
      // Return the first non-directory result as the likely company website
      return url;
    }
    return null;
  } catch (e) {
    console.warn(`Website lookup failed for ${companyName} (non-fatal):`, e);
    return null;
  }
}

/**
 * Sanitize PE firm names that Claude sometimes returns as full sentences.
 * Extracts just the firm name from strings like:
 * "MYR Group acquired Pike; formerly Lindsay Goldberg — now publicly traded via MYR Group"
 */
function sanitizePeFirmName(raw: string): string {
  // Take the part before any semicolons, em-dashes, or long-dashes
  let name = raw.split(/[;—–]/)[0].trim();
  // Remove common sentence prefixes like "Backed by " or "Owned by "
  name = name.replace(/^(backed by|owned by|sponsored by|portfolio of)\s+/i, '').trim();
  // If still too long (>60 chars), it's probably a sentence — take first 3 words
  if (name.length > 60) {
    name = name.split(/\s+/).slice(0, 3).join(' ');
  }
  return name;
}

/**
 * Phase 0: Validate critical deal fields before running AI discovery.
 * Returns a list of missing fields. If any are missing, the caller should
 * surface a warning instead of running the AI on incomplete data.
 */
function validateDealFields(deal: Record<string, unknown>): string[] {
  const missing: string[] = [];

  // At least one description field must be populated
  const hasDescription =
    (deal.executive_summary as string)?.trim() ||
    (deal.description as string)?.trim() ||
    (deal.hero_description as string)?.trim();
  if (!hasDescription)
    missing.push('description (executive_summary, description, or hero_description)');

  if (!(deal.industry as string)?.trim()) missing.push('industry');

  const cats = deal.categories as string[] | null;
  const cat = deal.category as string | null;
  if ((!cats || cats.length === 0) && !cat?.trim()) missing.push('categories');

  return missing;
}

// ── Two-Pass Prompt System ──

function buildPass1SystemPrompt(): string {
  return `You are an M&A advisor specializing in lower-middle market acquisitions ($500K–$10M EBITDA). Your job is to define the EXACT buyer profile for this deal. The buyers you're looking for are PE-BACKED PLATFORM COMPANIES — operating businesses with private equity sponsors behind them that are actively acquiring companies in this niche as part of a buy-and-build strategy.

CRITICAL: You are defining what to LOOK FOR, not finding specific companies yet. Be precise and specific about the niche — generic descriptions lead to wrong-industry results.

You must respond with valid JSON only. No markdown, no code fences, no explanatory text outside the JSON.`;
}

function buildPass1UserPrompt(deal: Record<string, unknown>): string {
  const ebitdaNum = deal.ebitda as number | null;
  const ebitdaStr = ebitdaNum ? `$${(ebitdaNum / 1_000_000).toFixed(1)}M` : 'Not disclosed';

  const cats = (deal.categories as string[] | null)?.length
    ? (deal.categories as string[]).join(', ')
    : (deal.category as string) || 'Not specified';

  const geoStates = (deal.geographic_states as string[] | null)?.length
    ? (deal.geographic_states as string[]).join(', ')
    : (deal.address_state as string) || 'Not specified';

  const description =
    (deal.executive_summary as string) ||
    (deal.description as string) ||
    (deal.hero_description as string) ||
    'No description available';

  const thesis = (deal.investment_thesis as string) || '';
  const endMarket = (deal.end_market_description as string) || '';

  return `Define the EXACT buyer profile for this deal. The buyers I'm looking for are PE-BACKED PLATFORM COMPANIES — operating businesses with private equity sponsors behind them that are actively acquiring companies in this niche.

DEAL OVERVIEW:
Title: ${(deal.title as string) || 'Not provided'}
Industry: ${(deal.industry as string) || 'Not specified'}
Service Categories: ${cats}
EBITDA: ${ebitdaStr}
Headquarters: ${(deal.address_state as string) || 'Not specified'}
Geographic Coverage: ${geoStates}

BUSINESS DESCRIPTION:
${description}

${thesis ? `INVESTMENT THESIS:\n${thesis}\n` : ''}
${endMarket ? `END MARKET / CUSTOMERS:\n${endMarket}\n` : ''}

Respond with a JSON object containing:
{
  "ideal_buyer_description": "2-3 sentences describing the type of PE-backed platform that acquires this business. Name the operating company type, not the PE firm type.",
  "must_have_criteria": ["3-5 specific criteria the platform company must have. Be precise — e.g. 'fleet maintenance and DOT inspection services' not 'vehicle services'. One criterion must always be: 'Backed by a private equity firm with a stated buy-and-build thesis in this vertical.'"],
  "exclusion_list": [{"type": "description of excluded company type", "reason": "why they're excluded"}],
  "search_terms": ["3-5 specific search queries to find PE-backed platforms in this niche"]
}

EXCLUSION LIST MUST ALWAYS INCLUDE:
- Standalone operators without PE backing (they lack acquisition capital and won't pay advisory fees)
- PE firms themselves (we want the platform company name, with the PE backer listed separately)
- Adjacent-but-different industries (explain why they're different)

Return ONLY the JSON object. No markdown, no explanation.`;
}

function buildPass2SystemPrompt(): string {
  return `You are an M&A buyer sourcing specialist. Your job is to find real PE-BACKED PLATFORM COMPANIES that match a specific buyer profile. Every company you return must be a real, operating business with an identifiable private equity sponsor.

CRITICAL RULES:
- Every company must be a PE-BACKED PLATFORM — an operating business with a private equity sponsor. You MUST name the PE firm.
- Return the PLATFORM COMPANY name as the primary result, never the PE firm. The PE firm goes in the pe_firm_name field.
- If you find a great company but cannot confirm PE backing, do NOT include it.
- The ONE exception to the PE requirement: a large strategic acquirer ($500M+ revenue) with a documented, active acquisition program in this exact niche. Flag these explicitly with buyer_type "corporate" and a note in why_relevant.
- Quality over quantity: 5 verified PE-backed platforms beats 10 unverified or marginal matches.
- Only suggest REAL companies that actually exist. Never fabricate names.
- Check each result against the exclusion list. If a company matches an exclusion, drop it.
- Do NOT pad the list with non-PE companies to hit the target count.

You must respond with valid JSON only. No markdown, no code fences, no explanatory text outside the JSON.`;
}

function buildPass2UserPrompt(
  deal: Record<string, unknown>,
  buyerProfile: Record<string, unknown>,
  maxBuyers: number,
  buyerCategory?: string,
): string {
  const ebitdaNum = deal.ebitda as number | null;
  const ebitdaStr = ebitdaNum ? `$${(ebitdaNum / 1_000_000).toFixed(1)}M` : 'Not disclosed';

  let categoryInstruction = '';
  if (buyerCategory === 'sponsors') {
    categoryInstruction = `
BUYER TYPE FILTER: ONLY return financial sponsors — PE firms with portfolio platform companies in this niche.
- Return the platform company name, not the PE firm name
- The PE firm goes in pe_firm_name
- Do NOT include standalone operating companies without PE backing
`;
  } else if (buyerCategory === 'operating_companies') {
    categoryInstruction = `
BUYER TYPE FILTER: ONLY return PE-backed operating companies (platform companies doing add-on acquisitions).
- These are real businesses that operate in the same industry as the deal
- They MUST have an identifiable PE sponsor (listed in pe_firm_name)
- Do NOT include PE firms themselves — only the operating platforms they back
`;
  }

  return `Using the buyer profile below, find real PE-BACKED PLATFORM COMPANIES that match ALL must-have criteria.
${categoryInstruction}
BUYER PROFILE:
${JSON.stringify(buyerProfile, null, 2)}

DEAL CONTEXT:
Title: ${(deal.title as string) || 'Not provided'}
Industry: ${(deal.industry as string) || 'Not specified'}
EBITDA: ${ebitdaStr}
Location: ${(deal.address_state as string) || 'Not specified'}

Instructions:
1. Find PE-backed platforms matching the must-have criteria.
2. For each result, verify: (a) they exist and are in the right business, (b) they have an identifiable PE sponsor, (c) evidence of acquisition activity.
3. Check each result against the exclusion list. If a company matches an exclusion, drop it.
4. Return ${maxBuyers} companies max. If fewer than ${maxBuyers} are genuine PE-backed matches, return fewer. Do NOT pad the list.
5. For each company, classify verification_status as "verified" (you're confident in PE backing and service match) or "unverified" (you believe it's a fit but aren't fully certain).

Return a JSON array of up to ${maxBuyers} buyers. Each object must have:
{
  "company_name": "exact legal/common name of the PLATFORM COMPANY (not the PE firm)",
  "company_website": "url or null",
  "buyer_type": "corporate",
  "pe_firm_name": "PE sponsor name — REQUIRED for every result (or null only for rare large strategics)",
  "hq_city": "city or null",
  "hq_state": "2-letter state code or null",
  "thesis_summary": "1-2 sentences — what this platform does and their acquisition strategy",
  "why_relevant": "1-2 sentences explaining why this PE-backed platform is a fit for THIS deal — reference their services, acquisitions, and PE sponsor's thesis",
  "target_services": ["service types they operate in"],
  "target_industries": ["industries they invest in"],
  "target_geographies": ["states or regions they cover"],
  "known_acquisitions": ["names of specific companies they've acquired"],
  "estimated_ebitda_min": null,
  "estimated_ebitda_max": null,
  "verification_status": "verified or unverified"
}

Return ONLY the JSON array. No markdown, no explanation.`;
}

// ── JSON Parsing (robust) ──

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/g;

function findLastCompleteObject(text: string): number {
  let inString = false;
  let lastGoodClose = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === '}') lastGoodClose = i;
    }
  }
  return lastGoodClose;
}

function repairAndParseJson(raw: string): unknown {
  let cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const jsonStart = cleaned.indexOf('[');
  const objStart = cleaned.indexOf('{');

  // If '{' appears before '[' (or no '[' exists), try object parsing first.
  // This handles Pass 1 responses like {"key": "val", "arr": ["a", "b"]}
  // where the first '[' is inside the object, not a top-level array.
  if (objStart !== -1 && (jsonStart === -1 || objStart < jsonStart)) {
    const objEnd = cleaned.lastIndexOf('}');
    const objSlice =
      objEnd > objStart ? cleaned.substring(objStart, objEnd + 1) : cleaned.substring(objStart);
    const objCleaned = objSlice.replace(CONTROL_CHARS_RE, ' ');
    try {
      return JSON.parse(objCleaned);
    } catch {
      // If object parsing fails, fall through to array parsing
      // (the '{' might be inside a preamble before the actual array)
    }
  }

  if (jsonStart === -1) {
    if (objStart === -1) throw new Error('No JSON found in response');
    throw new Error(`Cannot parse Claude response as JSON (length=${raw.length})`);
  }

  const jsonEnd = cleaned.lastIndexOf(']');
  cleaned =
    jsonEnd > jsonStart ? cleaned.substring(jsonStart, jsonEnd + 1) : cleaned.substring(jsonStart);

  cleaned = cleaned.replace(CONTROL_CHARS_RE, ' ');

  // Attempt 1: direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    /* continue */
  }

  // Attempt 2: strip trailing commas
  let repaired = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  try {
    return JSON.parse(repaired);
  } catch {
    /* continue */
  }

  // Attempt 3: find the last properly-closed object and truncate there
  const lastGood = findLastCompleteObject(cleaned);
  if (lastGood > 0) {
    repaired = cleaned.substring(0, lastGood + 1);
    repaired = repaired.replace(/,\s*$/, '');
    if (!repaired.endsWith(']')) repaired += ']';
    if (!repaired.startsWith('[')) repaired = '[' + repaired;
    repaired = repaired.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    try {
      return JSON.parse(repaired);
    } catch {
      /* continue */
    }
  }

  // Attempt 4: aggressive repair
  let inStr = false;
  let depth = 0;
  let arrDepth = 0;
  let lastCompleteObjEnd = -1;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0 && arrDepth === 1) lastCompleteObjEnd = i;
      } else if (ch === '[') arrDepth++;
      else if (ch === ']') arrDepth--;
    }
  }

  if (lastCompleteObjEnd > 0) {
    repaired = cleaned.substring(0, lastCompleteObjEnd + 1);
    repaired = repaired.replace(/,\s*$/, '');
    const firstBracket = repaired.indexOf('[');
    if (firstBracket >= 0) {
      repaired = repaired.substring(firstBracket);
    }
    if (!repaired.endsWith(']')) repaired += ']';
    repaired = repaired.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    try {
      const result = JSON.parse(repaired);
      console.log(
        `JSON repair attempt 4 succeeded — recovered ${Array.isArray(result) ? result.length : '?'} items from truncated response`,
      );
      return result;
    } catch {
      /* continue */
    }
  }

  // Attempt 5: extract individual objects with regex as last resort
  const objectMatches: unknown[] = [];
  const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match;
  while ((match = objRegex.exec(cleaned)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.company_name) objectMatches.push(obj);
    } catch {
      /* skip malformed */
    }
  }
  if (objectMatches.length > 0) {
    console.log(`JSON repair attempt 5 (regex) recovered ${objectMatches.length} buyer objects`);
    return objectMatches;
  }

  throw new Error(`Cannot parse Claude response as JSON (length=${raw.length})`);
}

function parseClaudeResponse(responseText: string): AISuggestedBuyer[] {
  const parsed = repairAndParseJson(responseText);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array from Claude');
  }

  return parsed
    .map((b: Record<string, unknown>) => ({
      company_name: String(b.company_name || '').trim(),
      company_website: b.company_website ? String(b.company_website).trim() : null,
      buyer_type: ([
        'private_equity',
        'corporate',
        'family_office',
        'independent_sponsor',
        'search_fund',
        'individual_buyer',
      ].includes(String(b.buyer_type))
        ? String(b.buyer_type)
        : 'corporate') as AISuggestedBuyer['buyer_type'],
      pe_firm_name: b.pe_firm_name ? String(b.pe_firm_name).trim() : null,
      hq_city: b.hq_city ? String(b.hq_city).trim() : null,
      hq_state: b.hq_state ? String(b.hq_state).trim().toUpperCase().slice(0, 2) : null,
      thesis_summary: String(b.thesis_summary || '').trim(),
      why_relevant: String(b.why_relevant || '').trim(),
      target_services: Array.isArray(b.target_services) ? b.target_services.map(String) : [],
      target_industries: Array.isArray(b.target_industries) ? b.target_industries.map(String) : [],
      target_geographies: Array.isArray(b.target_geographies)
        ? b.target_geographies.map(String)
        : [],
      known_acquisitions: Array.isArray(b.known_acquisitions)
        ? b.known_acquisitions.map(String)
        : [],
      estimated_ebitda_min:
        typeof b.estimated_ebitda_min === 'number' ? b.estimated_ebitda_min : null,
      estimated_ebitda_max:
        typeof b.estimated_ebitda_max === 'number' ? b.estimated_ebitda_max : null,
      verification_status: (b.verification_status === 'verified' ? 'verified' : 'unverified') as
        | 'verified'
        | 'unverified',
    }))
    .filter((b) => b.company_name.length > 0);
}

function parseBuyerProfile(responseText: string): Record<string, unknown> {
  const parsed = repairAndParseJson(responseText);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected JSON object from Claude for buyer profile');
  }
  return parsed as Record<string, unknown>;
}

// ── Main handler ──

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const headers = getCorsHeaders(req);
  let _jobId: string | undefined; // hoisted for error handler access

  try {
    // ── Auth guard (mirrors score-deal-buyers pattern) ──
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace('Bearer ', '').trim();
    if (!callerToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    });
    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: callerUser.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin access required' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
    // ── End auth guard ──

    const body: SeedRequest = await req.json();
    const { listingId, maxBuyers = 8, forceRefresh = false, buyerCategory, jobId } = body;
    _jobId = jobId; // hoist for catch block

    // Helper to update job progress (non-fatal if it fails)
    async function updateJobProgress(updates: Record<string, unknown>) {
      if (!jobId) return;
      try {
        await supabase.from('buyer_search_jobs').update({
          ...updates,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
      } catch (e) {
        console.warn('Job progress update failed (non-fatal):', e);
      }
    }

    if (!listingId) {
      return new Response(JSON.stringify({ error: 'listingId is required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch deal ──
    const { data: deal, error: dealError } = await supabase
      .from('listings')
      .select(
        'id, title, industry, category, categories, ebitda, address_state,' +
          'geographic_states, executive_summary, description, hero_description,' +
          'investment_thesis, end_market_description, business_model, revenue_model,' +
          'customer_types, growth_trajectory, owner_goals, seller_motivation, transition_preferences',
      )
      .eq('id', listingId)
      .single();

    if (dealError || !deal) {
      return new Response(
        JSON.stringify({ error: 'Deal not found', details: dealError?.message }),
        { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // ── Phase 0: Validate critical deal fields ──
    const missingFields = validateDealFields(deal);
    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'Deal is missing critical fields required for AI buyer discovery',
          missing_fields: missingFields,
          details: `The following fields must be populated before running AI discovery: ${missingFields.join(', ')}. Please update the deal record and try again.`,
        }),
        { status: 422, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // ── Check seed cache ──
    const cacheKey = buildCacheKey(deal, buyerCategory);

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('buyer_seed_cache')
        .select('buyer_ids, seeded_at')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (cached && cached.buyer_ids?.length > 0) {
        const { data: cachedBuyers } = await supabase
          .from('buyers')
          .select('id, company_name, buyer_type, hq_state, hq_city, ai_seeded, thesis_summary')
          .in('id', cached.buyer_ids);

        return new Response(
          JSON.stringify({
            seeded_buyers: (cachedBuyers || []).map((b) => ({
              buyer_id: b.id,
              company_name: b.company_name,
              action: 'cached' as const,
              why_relevant: b.thesis_summary || '',
              was_new_record: false,
            })),
            total: cachedBuyers?.length || 0,
            cached: true,
            seeded_at: cached.seeded_at,
            cache_key: cacheKey,
          }),
          { headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── Fetch existing buyers for deduplication ──
    const { data: existingBuyers } = await supabase
      .from('buyers')
      .select('id, company_name, company_website')
      .eq('archived', false)
      .not('company_website', 'is', null)
      .limit(10000);

    const existingDomainSet = new Set(
      (existingBuyers || [])
        .map((b) => extractDomain(b.company_website))
        .filter(Boolean) as string[],
    );
    const domainToId = new Map(
      (existingBuyers || [])
        .map((b) => {
          const domain = extractDomain(b.company_website);
          return domain ? ([domain, b.id] as [string, string]) : null;
        })
        .filter(Boolean) as [string, string][],
    );

    // ── Fetch past feedback for this niche (for calibration) ──
    const dealIndustry = (deal.industry as string) || '';
    const dealCategories = (deal.categories as string[]) || [];
    let feedbackSection = '';
    if (dealIndustry || dealCategories.length > 0) {
      const { data: feedbackRows } = await supabase
        .from('buyer_discovery_feedback')
        .select('buyer_name, pe_firm_name, action, reason, niche_category')
        .in('niche_category', [dealIndustry, ...dealCategories].filter(Boolean))
        .order('created_at', { ascending: false })
        .limit(20);

      if (feedbackRows && feedbackRows.length > 0) {
        const accepted = feedbackRows.filter((f) => f.action === 'accepted');
        const rejected = feedbackRows.filter((f) => f.action === 'rejected');

        if (accepted.length > 0 || rejected.length > 0) {
          feedbackSection = '\n\nCALIBRATION FROM PAST DEALS IN THIS NICHE:\n';
          if (accepted.length > 0) {
            feedbackSection += '\nAccepted buyers (these set the quality bar):\n';
            for (const a of accepted.slice(0, 5)) {
              feedbackSection += `• ${a.buyer_name}${a.pe_firm_name ? ` (backed by ${a.pe_firm_name})` : ''}\n`;
            }
          }
          if (rejected.length > 0) {
            feedbackSection += '\nRejected buyers (do NOT suggest similar companies):\n';
            for (const r of rejected.slice(0, 5)) {
              feedbackSection += `• ${r.buyer_name}${r.reason ? ` — Rejected because: ${r.reason}` : ''}\n`;
            }
          }
          feedbackSection += '\nEvery buyer you suggest should look like the accepted examples.\n';
        }
      }
    }

    // ── Pass 1: Define the buyer profile ──
    await updateJobProgress({ status: 'searching', progress_pct: 10, progress_message: 'Defining ideal buyer profile (Pass 1)…' });
    console.log('Pass 1: Defining buyer profile...');
    const pass1Response = await callClaude({
      model: CLAUDE_MODELS.sonnet,
      maxTokens: 2048,
      systemPrompt: buildPass1SystemPrompt(),
      messages: [{ role: 'user', content: buildPass1UserPrompt(deal) }],
      timeoutMs: 30000,
    });

    const pass1Text = pass1Response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    if (!pass1Text) {
      return new Response(
        JSON.stringify({
          error: 'Claude returned empty response for buyer profile (Pass 1)',
          usage: pass1Response.usage,
        }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const buyerProfile = parseBuyerProfile(pass1Text);
    console.log(
      'Pass 1 complete. Buyer profile defined:',
      JSON.stringify(buyerProfile).slice(0, 500),
    );

    // ── Pass 2: Find PE-backed platforms matching the profile ──
    await updateJobProgress({ status: 'searching', progress_pct: 35, progress_message: 'Searching for PE-backed platform companies (Pass 2)…' });
    console.log('Pass 2: Finding PE-backed platform companies...');
    const cappedMax = Math.min(maxBuyers, 8);

    // Append feedback calibration to the pass 2 prompt
    let pass2Prompt = buildPass2UserPrompt(deal, buyerProfile, cappedMax, buyerCategory);
    if (feedbackSection) {
      pass2Prompt += feedbackSection;
    }

    const pass2Response = await callClaude({
      model: CLAUDE_MODELS.opus,
      maxTokens: 8192,
      systemPrompt: buildPass2SystemPrompt(),
      messages: [{ role: 'user', content: pass2Prompt }],
      timeoutMs: 90000,
    });

    const pass2Text = pass2Response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    if (!pass2Text) {
      return new Response(
        JSON.stringify({
          error: 'Claude returned empty response for buyer discovery (Pass 2)',
          usage: pass2Response.usage,
        }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const suggestedBuyers = parseClaudeResponse(pass2Text);

    // ── Deduplicate and insert ──
    await updateJobProgress({ status: 'scoring', progress_pct: 65, progress_message: `Found ${suggestedBuyers.length} candidates. Deduplicating & inserting…` });
    const results: SeedResult[] = [];
    const newBuyerIds: string[] = [];
    const seedLogEntries: Record<string, unknown>[] = [];
    const now = new Date().toISOString();

    for (const suggested of suggestedBuyers) {
      // If Claude didn't provide a website, attempt a Google search to find one
      if (!suggested.company_website) {
        console.info(`${suggested.company_name} — no website from AI, attempting Serper lookup…`);
        const foundUrl = await lookupCompanyWebsite(suggested.company_name);
        if (foundUrl) {
          suggested.company_website = foundUrl;
          console.info(`  → Found website via Serper: ${foundUrl}`);
        }
      }

      const domain = extractDomain(suggested.company_website);

      // Website is still required after lookup — skip if we couldn't find one.
      if (!domain || !suggested.company_website) {
        console.info(`Skipping ${suggested.company_name} — no website found (AI or Serper)`);
        continue;
      }

      // Sanitize PE firm name if present (Claude sometimes returns full sentences)
      if (suggested.pe_firm_name) {
        const cleaned = sanitizePeFirmName(suggested.pe_firm_name);
        if (cleaned !== suggested.pe_firm_name) {
          console.info(`Sanitized PE firm name: "${suggested.pe_firm_name}" → "${cleaned}"`);
          suggested.pe_firm_name = cleaned;
        }
      }

      let action: SeedResult['action'];
      let buyerId: string;
      let wasNew = false;

      // Dedup by domain (the canonical unique identifier for buyers)
      const existingId = domainToId.get(domain);

      if (existingId) {
        action = 'enriched_existing';
        buyerId = existingId;

        await supabase
          .from('buyers')
          .update({
            ai_seeded: true,
            ai_seeded_at: now,
            ai_seeded_from_deal_id: listingId,
          })
          .eq('id', buyerId);
      } else {
        action = 'inserted';
        wasNew = true;

        // ── Resolve PE firm parent (lookup or auto-create) ──
        let resolvedPeFirmId: string | null = null;
        if (suggested.pe_firm_name && suggested.buyer_type !== 'private_equity') {
          const { data: existingPeFirm } = await supabase
            .from('buyers')
            .select('id')
            .eq('archived', false)
            .ilike('company_name', suggested.pe_firm_name)
            .eq('buyer_type', 'private_equity')
            .maybeSingle();

          if (existingPeFirm) {
            resolvedPeFirmId = existingPeFirm.id;
          } else {
            const { data: newFirm, error: firmError } = await supabase
              .from('buyers')
              .insert({
                company_name: suggested.pe_firm_name,
                buyer_type: 'private_equity',
                ai_seeded: true,
                ai_seeded_at: now,
                ai_seeded_from_deal_id: listingId,
                verification_status: 'pending',
              })
              .select('id')
              .single();

            if (firmError) {
              if (firmError.code === '23505') {
                const { data: raced } = await supabase
                  .from('buyers')
                  .select('id')
                  .eq('archived', false)
                  .ilike('company_name', suggested.pe_firm_name)
                  .maybeSingle();
                if (raced) resolvedPeFirmId = raced.id;
              } else {
                console.error(
                  `Failed to auto-create PE firm ${suggested.pe_firm_name}:`,
                  firmError,
                );
              }
            } else if (newFirm) {
              resolvedPeFirmId = newFirm.id;
            }
          }
        }

        const { data: inserted, error: insertError } = await supabase
          .from('buyers')
          .insert({
            company_name: suggested.company_name,
            company_website: suggested.company_website,
            buyer_type: suggested.buyer_type,
            pe_firm_name: suggested.pe_firm_name,
            pe_firm_id: resolvedPeFirmId,
            hq_city: suggested.hq_city,
            hq_state: suggested.hq_state,
            thesis_summary: suggested.thesis_summary,
            target_services: suggested.target_services,
            target_industries: suggested.target_industries,
            target_geographies: suggested.target_geographies,
            target_ebitda_min: suggested.estimated_ebitda_min,
            target_ebitda_max: suggested.estimated_ebitda_max,
            ai_seeded: true,
            ai_seeded_at: now,
            ai_seeded_from_deal_id: listingId,
            verification_status: 'pending',
            is_pe_backed: !!suggested.pe_firm_name,
          })
          .select('id')
          .single();

        if (insertError) {
          if (insertError.code === '23505') {
            const { data: raced } = await supabase
              .from('buyers')
              .select('id')
              .eq('archived', false)
              .ilike('company_website', `%${domain}%`)
              .maybeSingle();

            if (raced) {
              action = 'enriched_existing';
              wasNew = false;
              buyerId = raced.id;
              existingDomainSet.add(domain);
              domainToId.set(domain, raced.id);
            } else {
              console.warn(
                `Unique conflict inserting ${suggested.company_name} but couldn't re-find by domain — skipping`,
              );
              continue;
            }
          } else {
            console.error(`Failed to insert buyer ${suggested.company_name}:`, insertError);
            continue;
          }
        } else if (!inserted) {
          console.error(`No data returned inserting buyer ${suggested.company_name}`);
          continue;
        } else {
          buyerId = inserted.id;
        }

        existingDomainSet.add(domain);
        domainToId.set(domain, buyerId);
      }

      // De-duplicate: skip if we already processed this buyerId in this run
      if (newBuyerIds.includes(buyerId)) {
        console.log(`Skipping duplicate buyerId ${buyerId} (${suggested.company_name})`);
        continue;
      }

      newBuyerIds.push(buyerId);

      seedLogEntries.push({
        remarketing_buyer_id: buyerId,
        source_deal_id: listingId,
        why_relevant: suggested.why_relevant,
        known_acquisitions: suggested.known_acquisitions,
        was_new_record: wasNew,
        action,
        seed_model: CLAUDE_MODELS.opus,
        category_cache_key: cacheKey,
        buyer_profile: buyerProfile,
        verification_status: suggested.verification_status || 'unverified',
      });

      results.push({
        buyer_id: buyerId,
        company_name: suggested.company_name,
        action,
        why_relevant: suggested.why_relevant,
        was_new_record: wasNew,
      });
    }

    // ── Batch upsert seed log entries (resilient to duplicates) ──
    if (seedLogEntries.length > 0) {
      const { error: logError } = await supabase
        .from('buyer_seed_log')
        .upsert(seedLogEntries, {
          onConflict: 'remarketing_buyer_id,source_deal_id',
          ignoreDuplicates: false,
        });
      if (logError) {
        console.error('Seed log upsert failed:', logError.message);
        // Mark job with warning so UI knows
        await updateJobProgress({
          status: 'failed',
          progress_pct: 95,
          progress_message: `Buyers found but audit log write failed: ${logError.message}`,
          error: `Seed log write failed: ${logError.message}`,
          buyers_found: results.length,
          completed_at: new Date().toISOString(),
        });
        return new Response(
          JSON.stringify({ error: 'Seed log write failed', details: logError.message }),
          { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── Update seed cache ──
    await supabase.from('buyer_seed_cache').upsert(
      {
        cache_key: cacheKey,
        buyer_ids: newBuyerIds,
        seeded_at: now,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'cache_key' },
    );

    const inserted = results.filter((r) => r.action === 'inserted').length;
    const enriched = results.filter((r) => r.action === 'enriched_existing').length;
    const dupes = results.filter((r) => r.action === 'probable_duplicate').length;

    // Note: score-deal-buyers refresh is handled by the frontend after seed completes
    // (RecommendedBuyersTab calls refresh() which invokes score-deal-buyers with forceRefresh).

    // Mark job as completed
    await updateJobProgress({
      status: 'completed',
      progress_pct: 100,
      progress_message: `Done! Found ${results.length} buyers (${inserted} new, ${enriched} updated)`,
      buyers_found: results.length,
      buyers_inserted: inserted,
      buyers_updated: enriched,
      completed_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        seeded_buyers: results,
        total: results.length,
        inserted,
        enriched_existing: enriched,
        probable_duplicates: dupes,
        cached: false,
        seeded_at: now,
        cache_key: cacheKey,
        model: CLAUDE_MODELS.opus,
        usage: {
          pass1: pass1Response.usage,
          pass2: pass2Response.usage,
          total_input_tokens: pass1Response.usage.input_tokens + pass2Response.usage.input_tokens,
          total_output_tokens:
            pass1Response.usage.output_tokens + pass2Response.usage.output_tokens,
        },
        buyer_profile: buyerProfile,
      }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('seed-buyers error:', error);
    // Mark job as failed if we have a jobId
    // Mark job as failed if we have a jobId
    if (_jobId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const errClient = createClient(supabaseUrl, supabaseServiceKey);
        await errClient.from('buyer_search_jobs').update({
          status: 'failed',
          progress_pct: 0,
          progress_message: 'Search failed',
          error: String(error).slice(0, 500),
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', _jobId);
      } catch { /* best effort */ }
    }
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }
});
