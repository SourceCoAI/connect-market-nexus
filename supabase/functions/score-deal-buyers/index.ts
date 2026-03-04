import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import type { BuyerScore, ScoreRequest } from '../_shared/scoring/types.ts';
import { SCORE_WEIGHTS } from '../_shared/scoring/types.ts';
import {
  norm,
  normArray,
  titleCase,
  extractDealKeywords,
  scoreService,
  scoreGeography,
  scoreSize,
  scoreBonus,
  classifyTier,
} from '../_shared/scoring/scorers.ts';

const MAX_RESULTS = 50;
const CACHE_HOURS = 4;

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
        svc.score * SCORE_WEIGHTS.service +
          geo.score * SCORE_WEIGHTS.geography +
          size.score * SCORE_WEIGHTS.size +
          bonus.score * SCORE_WEIGHTS.bonus,
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
        buyer.buyer_type === 'private_equity'
          ? 'PE firm'
          : buyer.buyer_type === 'corporate' && buyer.is_pe_backed
            ? 'PE-backed platform'
            : buyer.buyer_type === 'family_office'
              ? 'Family office'
              : buyer.buyer_type === 'search_fund'
                ? 'Search fund'
                : buyer.buyer_type === 'independent_sponsor'
                  ? 'Independent sponsor'
                  : buyer.buyer_type === 'individual_buyer'
                    ? 'Individual buyer'
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

    // ── Write to cache (non-blocking -- scoring still succeeds if cache write fails) ──
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
