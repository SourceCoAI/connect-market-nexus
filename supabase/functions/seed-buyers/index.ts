/**
 * seed-buyers – AI Buyer Seeding Engine
 *
 * Uses Claude to discover PE firms, platform companies, and strategic acquirers
 * that match a deal's criteria, then inserts them into remarketing_buyers.
 *
 * Flow:
 * 1. Auth guard (admin only)
 * 2. Fetch deal details from listings table
 * 3. Check buyer_seed_cache for recent results (90-day TTL)
 * 4. Call Claude to discover matching buyers
 * 5. Deduplicate against existing remarketing_buyers (by company name / website domain)
 * 6. Insert new buyers with ai_seeded=true
 * 7. Log each action to buyer_seed_log
 * 8. Update buyer_seed_cache
 * 9. Return results
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { callClaude, CLAUDE_MODELS } from '../_shared/claude-client.ts';
import { requireAdmin } from '../_shared/auth.ts';

// ── Types ──

interface SeedRequest {
  listingId: string;
  maxBuyers?: number;
  forceRefresh?: boolean;
  buyerCategory?: 'sponsors' | 'operating_companies';
}

interface AISuggestedBuyer {
  company_name: string;
  company_website: string | null;
  buyer_type: 'pe_firm' | 'platform' | 'strategic' | 'family_office';
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
}

interface SeedResult {
  buyer_id: string;
  company_name: string;
  action: 'inserted' | 'enriched_existing' | 'probable_duplicate';
  why_relevant: string;
  was_new_record: boolean;
}

// ── Helpers ──

function buildCacheKey(deal: {
  id: string;
  industry: string | null;
  categories: string[] | null;
  address_state: string | null;
  ebitda: number | null;
}, buyerCategory?: string): string {
  const industry = (deal.industry || 'unknown').toLowerCase().trim();
  const cats = (deal.categories || []).sort().join(',').toLowerCase();
  const state = (deal.address_state || 'unknown').toLowerCase().trim();
  const ebitdaBucket = deal.ebitda
    ? Math.floor(deal.ebitda / 500_000) * 500_000
    : 0;
  const catSuffix = buyerCategory ? `:${buyerCategory}` : '';
  return `seed:${industry}:${cats}:${state}:${ebitdaBucket}${catSuffix}`;
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

function normalizeCompanyName(name: string): string {
  let normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
  // Strip known corporate suffixes iteratively (handles "ABC Holdings LLC" → "abc")
  const suffixPattern = /\s+(inc|llc|corp|ltd|lp|group|partners|capital|holdings|company|co)\s*$/;
  while (suffixPattern.test(normalized)) {
    normalized = normalized.replace(suffixPattern, '').trim();
  }
  return normalized;
}

function buildSystemPrompt(): string {
  return `You are an elite M&A buyer discovery specialist who deeply understands private equity roll-ups, platform strategies, and strategic acquisitions across niche industry verticals.

YOUR MISSION: Find the BEST-FIT acquirers for a specific deal — not the most obvious or largest, but the ones whose strategy, portfolio, and acquisition history make them a genuinely compelling match.

CRITICAL RULES:
- Only suggest REAL companies that actually exist. Never fabricate names.
- Prioritize NICHE, SPECIALIZED buyers over large generalist firms. A $200M PE fund with three portfolio companies in the exact sub-sector is far more valuable than a $10B fund that occasionally invests in the broad industry.
- Look for firms actively executing "buy-and-build" or roll-up strategies in the deal's specific vertical. Platform companies doing add-on acquisitions in the same niche are the highest-value finds.
- Include firms that have made RECENT, VERIFIABLE acquisitions in the specific sub-sector — not firms that might theoretically be interested.
- Think about the full ecosystem: Who are the PE-backed platforms rolling up this space? Which strategic acquirers are on acquisition sprees in this niche? Which infrastructure funds or specialty PE firms have thesis overlap?
- For each buyer, explain specifically WHY they are a uniquely good fit for THIS deal — reference their portfolio companies, known acquisitions, stated thesis, or geographic strategy.
- Include the company's website if you know it.
- Quality over quantity: 5 highly relevant buyers beats 10 generic ones.

You must respond with valid JSON only. No markdown, no code fences, no explanatory text outside the JSON.`;
}

function buildUserPrompt(deal: Record<string, unknown>, maxBuyers: number, buyerCategory?: string): string {
  const ebitdaNum = deal.ebitda as number | null;
  const ebitdaStr = ebitdaNum
    ? `$${(ebitdaNum / 1_000_000).toFixed(1)}M`
    : 'Not disclosed';

  const cats = (deal.categories as string[] | null)?.length
    ? (deal.categories as string[]).join(', ')
    : (deal.category as string) || 'Not specified';

  const geoStates = (deal.geographic_states as string[] | null)?.length
    ? (deal.geographic_states as string[]).join(', ')
    : (deal.address_state as string) || 'Not specified';

  // Use the richest available description field — in order of preference
  const description =
    (deal.executive_summary as string) ||
    (deal.description as string) ||
    (deal.hero_description as string) ||
    'No description available';

  const thesis = (deal.investment_thesis as string) || '';
  const endMarket = (deal.end_market_description as string) || '';
  const bizModel = (deal.business_model as string) || (deal.revenue_model as string) || '';
  const ownerGoals = (deal.owner_goals as string) || (deal.seller_motivation as string) || '';

  let categoryInstruction = '';
  if (buyerCategory === 'sponsors') {
    categoryInstruction = `
BUYER TYPE FILTER: ONLY return financial sponsors — PE firms, growth equity firms, infrastructure funds, family offices, independent sponsors, and search funds that invest in this vertical.
- Prioritize PE firms actively building platforms via buy-and-build strategies in this exact niche
- Include specialty funds focused on this industry (e.g., infrastructure funds for utility deals, healthcare-focused PE for medical deals)
- Look for firms that have backed portfolio companies making add-on acquisitions in this space
- Do NOT include operating companies or strategic acquirers
`;
  } else if (buyerCategory === 'operating_companies') {
    categoryInstruction = `
BUYER TYPE FILTER: ONLY return operating companies and strategic acquirers — real businesses that operate in the same or adjacent industries.
- Prioritize PE-backed platform companies actively doing add-on acquisitions to consolidate this niche
- Include regional or national operators that compete in or serve the same end market
- Look for companies that have recently acquired similar businesses as part of a roll-up strategy
- Do NOT include PE firms, financial sponsors, family offices, or investment funds (the PE backer can be listed as pe_firm_name but the company_name must be the operating company)
`;
  }

  return `Find up to ${maxBuyers} potential acquirers for this business. Focus on finding the BEST strategic fits — firms whose acquisition thesis, portfolio, and track record directly align with this deal.
${categoryInstruction}
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
${bizModel ? `BUSINESS MODEL:\n${bizModel}\n` : ''}
${ownerGoals ? `SELLER GOALS:\n${ownerGoals}\n` : ''}

DISCOVERY GUIDANCE:
- Think about who is ACTIVELY acquiring in this specific sub-sector right now
- Consider the full buyer ecosystem: PE-backed platforms doing add-ons, specialty PE funds, regional consolidators, national strategic acquirers expanding into this geography
- Prioritize buyers with VERIFIABLE recent acquisitions in this niche over firms that are merely tangentially related
- A small specialized firm with 3 acquisitions in this exact space is more valuable than a Fortune 500 with broad interests

Return a JSON array of up to ${maxBuyers} buyers. Each object must have:
{
  "company_name": "exact legal/common name",
  "company_website": "url or null",
  "buyer_type": "pe_firm" | "platform" | "strategic" | "family_office",
  "pe_firm_name": "PE sponsor name or null (for platform companies, name the PE backer)",
  "hq_city": "city or null",
  "hq_state": "2-letter state code or null",
  "thesis_summary": "their acquisition thesis in 1-2 sentences — what they invest in and why",
  "why_relevant": "1-2 sentences explaining why this buyer is a uniquely good fit for THIS specific deal — reference their portfolio, acquisitions, thesis overlap, or geographic strategy",
  "target_services": ["service types they acquire"],
  "target_industries": ["industries they invest in"],
  "target_geographies": ["states or regions they cover"],
  "known_acquisitions": ["names of recent acquisitions in this or adjacent spaces"],
  "estimated_ebitda_min": number or null,
  "estimated_ebitda_max": number or null
}

Return ONLY the JSON array. No markdown, no explanation.`;
}

function findLastCompleteObject(text: string): number {
  // Walk backward through the string to find the last '}' that is NOT inside
  // an unterminated string literal. We track whether we're inside a string.
  let inString = false;
  let lastGoodClose = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') { i++; continue; } // skip escaped char
      if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === '}') lastGoodClose = i;
    }
  }
  return lastGoodClose;
}

function repairAndParseJson(raw: string): unknown {
  // Remove markdown code fences
  let cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find JSON array boundaries
  const jsonStart = cleaned.indexOf('[');
  if (jsonStart === -1) throw new Error('No JSON array found in response');

  const jsonEnd = cleaned.lastIndexOf(']');
  cleaned = jsonEnd > jsonStart
    ? cleaned.substring(jsonStart, jsonEnd + 1)
    : cleaned.substring(jsonStart); // truncated — no closing bracket

  // Remove control chars that break JSON
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ' ');

  // First attempt: direct parse
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  // Second attempt: strip trailing commas
  let repaired = cleaned
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');

  try { return JSON.parse(repaired); } catch { /* continue */ }

  // Third attempt: find the last properly-closed object (not inside a string)
  // This handles truncated output where a string literal is unterminated
  const lastGood = findLastCompleteObject(cleaned);
  if (lastGood > 0) {
    repaired = cleaned.substring(0, lastGood + 1);
    // Remove trailing comma before we close
    repaired = repaired.replace(/,\s*$/, '');
    if (!repaired.endsWith(']')) repaired += ']';
    if (!repaired.startsWith('[')) repaired = '[' + repaired;
    repaired = repaired.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

    try { return JSON.parse(repaired); } catch { /* continue */ }
  }

  throw new Error(`Cannot parse Claude response as JSON (length=${raw.length})`);
}

function parseClaudeResponse(responseText: string): AISuggestedBuyer[] {
  const parsed = repairAndParseJson(responseText);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array from Claude');
  }

  // Validate and clean each buyer
  return parsed.map((b: Record<string, unknown>) => ({
    company_name: String(b.company_name || '').trim(),
    company_website: b.company_website ? String(b.company_website).trim() : null,
    buyer_type: (['pe_firm', 'platform', 'strategic', 'family_office'].includes(String(b.buyer_type))
      ? String(b.buyer_type)
      : 'strategic') as AISuggestedBuyer['buyer_type'],
    pe_firm_name: b.pe_firm_name ? String(b.pe_firm_name).trim() : null,
    hq_city: b.hq_city ? String(b.hq_city).trim() : null,
    hq_state: b.hq_state ? String(b.hq_state).trim().toUpperCase().slice(0, 2) : null,
    thesis_summary: String(b.thesis_summary || '').trim(),
    why_relevant: String(b.why_relevant || '').trim(),
    target_services: Array.isArray(b.target_services) ? b.target_services.map(String) : [],
    target_industries: Array.isArray(b.target_industries) ? b.target_industries.map(String) : [],
    target_geographies: Array.isArray(b.target_geographies) ? b.target_geographies.map(String) : [],
    known_acquisitions: Array.isArray(b.known_acquisitions) ? b.known_acquisitions.map(String) : [],
    estimated_ebitda_min: typeof b.estimated_ebitda_min === 'number' ? b.estimated_ebitda_min : null,
    estimated_ebitda_max: typeof b.estimated_ebitda_max === 'number' ? b.estimated_ebitda_max : null,
  })).filter(b => b.company_name.length > 0);
}

// ── Main handler ──

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const headers = getCorsHeaders(req);

  try {
    // ── Auth guard (mirrors score-deal-buyers pattern) ──
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace('Bearer ', '').trim();
    if (!callerToken) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    });
    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: callerUser.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: admin access required' }),
        { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }
    // ── End auth guard ──

    const body: SeedRequest = await req.json();
    const { listingId, maxBuyers = 10, forceRefresh = false, buyerCategory } = body;

    if (!listingId) {
      return new Response(
        JSON.stringify({ error: 'listingId is required' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // ── Fetch deal ──
    const { data: deal, error: dealError } = await supabase
      .from('listings')
      .select(
        'id, title, industry, category, categories, ebitda, address_state,' +
        'geographic_states, executive_summary, description, hero_description,' +
        'investment_thesis, end_market_description, business_model, revenue_model,' +
        'customer_types, growth_trajectory, owner_goals, seller_motivation, transition_preferences'
      )
      .eq('id', listingId)
      .single();

    if (dealError || !deal) {
      return new Response(
        JSON.stringify({ error: 'Deal not found', details: dealError?.message }),
        { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
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
        // Return the cached buyer IDs with their details
        const { data: cachedBuyers } = await supabase
          .from('remarketing_buyers')
          .select('id, company_name, buyer_type, hq_state, hq_city, ai_seeded, thesis_summary')
          .in('id', cached.buyer_ids);

        return new Response(
          JSON.stringify({
            seeded_buyers: (cachedBuyers || []).map(b => ({
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
    // Explicit limit required: Supabase config max_rows=1000 silently truncates without it
    const { data: existingBuyers } = await supabase
      .from('remarketing_buyers')
      .select('id, company_name, company_website')
      .eq('archived', false)
      .limit(10000);

    const existingNameSet = new Set(
      (existingBuyers || []).map(b => normalizeCompanyName(b.company_name)),
    );
    const existingDomainSet = new Set(
      (existingBuyers || [])
        .map(b => extractDomain(b.company_website))
        .filter(Boolean) as string[],
    );
    // Map normalized name → existing buyer id for enrichment
    const nameToId = new Map(
      (existingBuyers || []).map(b => [normalizeCompanyName(b.company_name), b.id]),
    );

    // ── Call Claude to discover buyers ──
    const cappedMax = Math.min(maxBuyers, 15);
    const claudeResponse = await callClaude({
      model: CLAUDE_MODELS.sonnet,
      maxTokens: 4096,
      systemPrompt: buildSystemPrompt(),
      messages: [
        { role: 'user', content: buildUserPrompt(deal, cappedMax, buyerCategory) },
      ],
      timeoutMs: 60000,
    });

    // Extract text from response
    const responseText = claudeResponse.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    if (!responseText) {
      return new Response(
        JSON.stringify({
          error: 'Claude returned empty response',
          usage: claudeResponse.usage,
        }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const suggestedBuyers = parseClaudeResponse(responseText);

    // ── Deduplicate and insert ──
    const results: SeedResult[] = [];
    const newBuyerIds: string[] = [];
    const seedLogEntries: Record<string, unknown>[] = [];
    const now = new Date().toISOString();

    for (const suggested of suggestedBuyers) {
      const normName = normalizeCompanyName(suggested.company_name);
      const domain = extractDomain(suggested.company_website);

      let action: SeedResult['action'];
      let buyerId: string;
      let wasNew = false;

      // Check for duplicate by name
      const existingId = nameToId.get(normName);
      // Check for duplicate by domain
      const domainMatch = domain && existingDomainSet.has(domain);

      if (existingId) {
        // Existing buyer — enrich with AI context
        action = 'enriched_existing';
        buyerId = existingId;

        // Update the existing record with AI seeding metadata
        await supabase
          .from('remarketing_buyers')
          .update({
            ai_seeded: true,
            ai_seeded_at: now,
            ai_seeded_from_deal_id: listingId,
          })
          .eq('id', buyerId);
      } else if (domainMatch) {
        // Probable duplicate via domain
        action = 'probable_duplicate';
        const domainBuyer = (existingBuyers || []).find(
          b => extractDomain(b.company_website) === domain,
        );
        if (!domainBuyer) {
          // Cannot resolve the duplicate — skip to avoid corrupting UUID[] cache
          console.warn(`Domain match for ${domain} but could not resolve buyer ID, skipping`);
          continue;
        }
        buyerId = domainBuyer.id;
      } else {
        // New buyer — insert
        action = 'inserted';
        wasNew = true;

        const { data: inserted, error: insertError } = await supabase
          .from('remarketing_buyers')
          .insert({
            company_name: suggested.company_name,
            company_website: suggested.company_website,
            buyer_type: suggested.buyer_type,
            pe_firm_name: suggested.pe_firm_name,
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
          })
          .select('id')
          .single();

        if (insertError || !inserted) {
          console.error(`Failed to insert buyer ${suggested.company_name}:`, insertError);
          continue;
        }

        buyerId = inserted.id;

        // Track in dedup sets for subsequent iterations
        existingNameSet.add(normName);
        if (domain) existingDomainSet.add(domain);
        nameToId.set(normName, buyerId);
      }

      newBuyerIds.push(buyerId);

      // Collect log entry for batch insert after the loop
      seedLogEntries.push({
        remarketing_buyer_id: buyerId,
        source_deal_id: listingId,
        why_relevant: suggested.why_relevant,
        known_acquisitions: suggested.known_acquisitions,
        was_new_record: wasNew,
        action,
        seed_model: CLAUDE_MODELS.sonnet,
        category_cache_key: cacheKey,
      });

      results.push({
        buyer_id: buyerId,
        company_name: suggested.company_name,
        action,
        why_relevant: suggested.why_relevant,
        was_new_record: wasNew,
      });
    }

    // ── Batch insert seed log entries (delete stale entries for this deal first) ──
    if (seedLogEntries.length > 0) {
      const buyerIdsToLog = seedLogEntries.map(e => e.remarketing_buyer_id as string);
      // Remove previous seed log entries for these buyer+deal pairs to prevent unbounded growth
      const { error: deleteError } = await supabase
        .from('buyer_seed_log')
        .delete()
        .eq('source_deal_id', listingId)
        .in('remarketing_buyer_id', buyerIdsToLog);
      if (deleteError) {
        console.error('Seed log cleanup failed (non-fatal):', deleteError.message);
      }

      const { error: logError } = await supabase.from('buyer_seed_log').insert(seedLogEntries);
      if (logError) {
        console.error('Batch seed log insert failed (non-fatal):', logError.message);
      }
    }

    // ── Update seed cache ──
    await supabase
      .from('buyer_seed_cache')
      .upsert(
        {
          cache_key: cacheKey,
          buyer_ids: newBuyerIds,
          seeded_at: now,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'cache_key' },
      );

    const inserted = results.filter(r => r.action === 'inserted').length;
    const enriched = results.filter(r => r.action === 'enriched_existing').length;
    const dupes = results.filter(r => r.action === 'probable_duplicate').length;

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
        model: CLAUDE_MODELS.sonnet,
        usage: claudeResponse.usage,
      }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('seed-buyers error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }
});
