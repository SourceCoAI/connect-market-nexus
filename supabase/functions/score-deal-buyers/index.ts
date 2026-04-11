import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import type { BuyerScore, ScoreRequest, ScoreWeights } from '../_shared/scoring/types.ts';
import {
  SCORE_WEIGHTS,
  getScoreWeights,
  getServiceGateMultiplier,
  getBuyerTypePriority,
} from '../_shared/scoring/types.ts';
import {
  norm,
  normArray,
  titleCase,
  extractDealKeywords,
  scoreService,
  scoreGeography,
  scoreBonus,
  classifyTier,
} from '../_shared/scoring/scorers.ts';

const MAX_INTERNAL = 100;
const MAX_EXTERNAL = 50;
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
    const { listingId, forceRefresh, lookupBuyerId } = body;

    if (!listingId) {
      return new Response(JSON.stringify({ error: 'listingId is required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch deal (moved before cache check so we can compute content hash) ──
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

    // Compute a content hash of scoring-relevant deal fields so the cache
    // auto-invalidates when someone edits the deal's industry, categories, etc.
    const contentHashInput = [
      deal.industry || '',
      deal.category || '',
      JSON.stringify(deal.categories || []),
      deal.address_state || '',
      JSON.stringify(deal.geographic_states || []),
      String(deal.ebitda || ''),
    ].join('|');
    let contentHash = 0;
    for (let i = 0; i < contentHashInput.length; i++) {
      contentHash = ((contentHash << 5) - contentHash + contentHashInput.charCodeAt(i)) | 0;
    }
    const contentHashStr = String(contentHash);

    // ── Check cache (Issue #40: also verify universe context matches + content hash) ──
    if (!forceRefresh && !lookupBuyerId) {
      // Select known columns only; content_hash may not exist yet (requires migration).
      // If the column exists, it'll be in the result; if not, the query still works
      // with just the known columns and we skip hash-based invalidation.
      const { data: cached } = await supabase
        .from('buyer_recommendation_cache')
        .select('results, buyer_count, scored_at, universe_ids')
        .eq('listing_id', listingId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      // Fetch current universe links early so we can compare with cache
      const { data: cacheCheckUniverseLinks } = await supabase
        .from('remarketing_universe_deals')
        .select('universe_id')
        .eq('listing_id', listingId)
        .eq('status', 'active');
      const currentUniverseIds = (cacheCheckUniverseLinks || [])
        .map((l) => l.universe_id)
        .sort();
      const currentUniverseKey = JSON.stringify(currentUniverseIds);

      if (
        cached &&
        JSON.stringify((cached.universe_ids || []).slice().sort()) === currentUniverseKey
      ) {
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

    // ── Fetch deal's universe(s) ──
    const { data: universeLinks } = await supabase
      .from('remarketing_universe_deals')
      .select('universe_id')
      .eq('listing_id', listingId)
      .eq('status', 'active');

    const universeIds = (universeLinks || []).map((l) => l.universe_id);

    // H-1 FIX: Fetch universe-specific weights if the deal belongs to a universe.
    // If no universe weights are found, fall back to DEFAULT_SCORE_WEIGHTS.
    // v4: owner_goals_weight is fetched for backwards compat but ignored by getScoreWeights.
    let weights: ScoreWeights = { ...SCORE_WEIGHTS };
    if (universeIds.length > 0) {
      const { data: universe } = await supabase
        .from('buyer_universes')
        .select('service_weight, geography_weight')
        .eq('id', universeIds[0])
        .single();

      if (universe) {
        weights = getScoreWeights(universe);
        console.log(
          `[score-deal-buyers] Using universe weights for ${universeIds[0]}:`,
          weights,
        );
      }
    }

    // ── Fetch buyers (active, non-archived, scoped to deal's universes when available) ──
    const BUYER_SELECT =
      'id, company_name, company_website, platform_website, pe_firm_name, pe_firm_id, buyer_type, is_pe_backed, hq_state, hq_city, ' +
      'target_services, target_industries, industry_vertical, ' +
      'target_geographies, geographic_footprint, ' +
      'target_ebitda_min, target_ebitda_max, ' +
      'has_fee_agreement, acquisition_appetite, total_acquisitions, ' +
      'thesis_summary, ai_seeded, ai_seeded_from_deal_id, ai_seeded_at, marketplace_firm_id, is_publicly_traded';

    // deno-lint-ignore no-explicit-any
    let fetchedBuyers: any[] | null = null;
    // deno-lint-ignore no-explicit-any
    let buyerError: any = null;

    if (universeIds.length > 0) {
      // Scope internal buyers to the deal's universe(s).
      // Also fetch AI-seeded buyers and buyers with no universe (manually added)
      // separately so they aren't excluded by the universe filter.
      const [internalResult, aiSeededResult, noUniverseResult] = await Promise.all([
        supabase
          .from('buyers')
          .select(BUYER_SELECT)
          .eq('archived', false)
          .in('universe_id', universeIds)
          .order('created_at', { ascending: false })
          .limit(10000),
        supabase
          .from('buyers')
          .select(BUYER_SELECT)
          .eq('archived', false)
          .eq('ai_seeded', true)
          .order('created_at', { ascending: false })
          .limit(5000),
        // Include manually-added buyers with no universe assignment
        supabase
          .from('buyers')
          .select(BUYER_SELECT)
          .eq('archived', false)
          .is('universe_id', null)
          .neq('ai_seeded', true)
          .order('created_at', { ascending: false })
          .limit(5000),
      ]);

      buyerError = internalResult.error || aiSeededResult.error || noUniverseResult.error;

      if (internalResult.data?.length === 10000) {
        console.warn(`Buyer pool hit 10,000 limit for universes ${universeIds}. Some buyers may be excluded from scoring.`);
      }
      if (aiSeededResult.data?.length === 5000) {
        console.warn(`AI-seeded buyer pool hit 5,000 limit. Some buyers may be excluded from scoring.`);
      }
      if (noUniverseResult.data?.length === 5000) {
        console.warn(`No-universe buyer pool hit 5,000 limit. Some buyers may be excluded from scoring.`);
      }

      // Merge and deduplicate by buyer id
      const seen = new Set<string>();
      // deno-lint-ignore no-explicit-any
      const merged: any[] = [];
      for (const b of [
        ...(internalResult.data || []),
        ...(aiSeededResult.data || []),
        ...(noUniverseResult.data || []),
      ]) {
        if (!seen.has(b.id)) {
          seen.add(b.id);
          merged.push(b);
        }
      }
      fetchedBuyers = merged;
    } else {
      // No universes connected — fall back to unfiltered behavior (all buyers)
      const result = await supabase.from('buyers').select(BUYER_SELECT).eq('archived', false).order('created_at', { ascending: false }).limit(10000);
      fetchedBuyers = result.data;
      buyerError = result.error;
      if (result.data?.length === 10000) {
        console.warn(`Buyer pool hit 10,000 limit (no universes). Some buyers may be excluded from scoring.`);
      }
    }

    if (buyerError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch buyers', details: buyerError.message }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const buyers = fetchedBuyers;
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

    // ── Fetch seed log data ──
    const { data: seedLogRows } = await supabase
      .from('buyer_seed_log')
      .select('remarketing_buyer_id, why_relevant, known_acquisitions')
      .eq('source_deal_id', listingId);

    const { data: allAcquisitionRows } = await supabase
      .from('buyer_seed_log')
      .select('remarketing_buyer_id, known_acquisitions')
      .not('known_acquisitions', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2000);

    // ── Fetch transcript-extracted insights for enriched scoring ──
    // Batch-fetch the most recent extracted_insights for all buyers. This data
    // supplements buyer profile fields (target_services, target_geographies) with
    // what buyers actually said on calls — higher fidelity than profile data alone.
    const allBuyerIds = buyers.map((b: { id: string }) => b.id);
    // Fetch in batches of 500 to avoid Supabase query limits
    const transcriptInsightsMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < allBuyerIds.length; i += 500) {
      const batchIds = allBuyerIds.slice(i, i + 500);
      const { data: transcriptRows } = await supabase
        .from('buyer_transcripts')
        .select('buyer_id, extracted_insights, call_date')
        .in('buyer_id', batchIds)
        .eq('extraction_status', 'completed')
        .not('extracted_insights', 'is', null)
        .order('call_date', { ascending: false });

      for (const row of transcriptRows || []) {
        // Keep only the most recent transcript per buyer
        if (!transcriptInsightsMap.has(row.buyer_id)) {
          transcriptInsightsMap.set(row.buyer_id, row.extracted_insights as Record<string, unknown>);
        }
      }
    }
    console.log(`[score-deal-buyers] Loaded transcript insights for ${transcriptInsightsMap.size} buyers`);

    // ── Fetch rejected buyers from discovery feedback ──
    const { data: rejectedRows } = await supabase
      .from('buyer_discovery_feedback')
      .select('buyer_id')
      .eq('listing_id', listingId)
      .eq('action', 'rejected');

    const rejectedBuyerIds = new Set<string>(
      (rejectedRows || []).map((r) => r.buyer_id),
    );

    // Issue #41: Fetch cross-niche rejections — buyers rejected on OTHER deals
    // in the same industry/category. These get a soft penalty (-15) rather than
    // hard exclusion, since the buyer may still be relevant for this specific deal.
    const nicheFilters = [deal.industry, deal.category].filter(Boolean);
    let nicheRejectedBuyerIds = new Set<string>();
    if (nicheFilters.length > 0) {
      // Find other listings in the same industry/category
      const { data: siblingListings } = await supabase
        .from('listings')
        .select('id')
        .neq('id', listingId)
        .or(nicheFilters.map((f) => `industry.eq.${f},category.eq.${f}`).join(','));

      const siblingIds = (siblingListings || []).map((l) => l.id);
      if (siblingIds.length > 0) {
        const { data: nicheRejectedRows } = await supabase
          .from('buyer_discovery_feedback')
          .select('buyer_id')
          .in('listing_id', siblingIds)
          .eq('action', 'rejected');

        nicheRejectedBuyerIds = new Set<string>(
          (nicheRejectedRows || []).map((r) => r.buyer_id),
        );
        // Remove buyers already hard-excluded so we don't double-penalize
        for (const id of rejectedBuyerIds) {
          nicheRejectedBuyerIds.delete(id);
        }
      }
    }

    const seedLogMap = new Map<string, string>();
    const seedLogAcquisitionsMap = new Map<string, string[]>();
    // Track which buyer IDs have seed log entries for this deal
    const seedLogBuyerIds = new Set<string>();
    for (const row of seedLogRows || []) {
      seedLogBuyerIds.add(row.remarketing_buyer_id);
      if (row.why_relevant) seedLogMap.set(row.remarketing_buyer_id, row.why_relevant);
      if (row.known_acquisitions?.length)
        seedLogAcquisitionsMap.set(row.remarketing_buyer_id, row.known_acquisitions);
    }
    for (const row of allAcquisitionRows || []) {
      if (!seedLogAcquisitionsMap.has(row.remarketing_buyer_id) && row.known_acquisitions?.length) {
        seedLogAcquisitionsMap.set(row.remarketing_buyer_id, row.known_acquisitions);
      }
    }

    // ── Filter out stale AI-seeded buyers and rejected buyers ──
    // AI-seeded buyers should only appear if they have a seed log entry for
    // THIS deal (i.e., they came from the most recent AI search for this deal).
    // Buyers rejected via "Not a Fit" feedback are also excluded.
    const filteredBuyers = buyers.filter((buyer) => {
      // Always exclude rejected buyers
      if (rejectedBuyerIds.has(buyer.id)) return false;
      // AI-seeded buyers must have a seed log entry for this deal
      if (buyer.ai_seeded && !seedLogBuyerIds.has(buyer.id)) return false;
      return true;
    });

    // ── Normalize deal fields ──
    const richKeywords = extractDealKeywords(deal);
    const dealCategories = normArray([
      ...(deal.categories || (deal.category ? [deal.category] : [])),
      ...richKeywords,
    ]);
    const dealIndustry = norm(deal.industry);
    const dealState = norm(deal.address_state);
    const dealGeoStates = normArray(deal.geographic_states);
    // ── Score each buyer ──
    const scored: BuyerScore[] = [];

    for (const buyer of filteredBuyers) {
      let buyerServices = normArray(buyer.target_services);
      const buyerIndustries = normArray(buyer.target_industries);
      const buyerIndustryVertical = norm(buyer.industry_vertical);
      let buyerGeos = normArray(buyer.target_geographies);
      const buyerFootprint = normArray(buyer.geographic_footprint);
      const buyerHqState = norm(buyer.hq_state);

      // ── Merge transcript-extracted insights into scoring inputs ──
      // Transcript data is higher-fidelity than profile data because it captures
      // what buyers actually said on calls about their acquisition criteria.
      let transcriptSummary: string | undefined;
      const insights = transcriptInsightsMap.get(buyer.id);
      if (insights) {
        const buyerCriteria = insights.buyer_criteria as Record<string, unknown> | undefined;
        if (buyerCriteria) {
          // Merge transcript services (if confidence >= 50)
          const svcCriteria = buyerCriteria.service_criteria as {
            target_services?: string[];
            service_confidence?: number;
          } | undefined;
          if (svcCriteria?.target_services?.length && (svcCriteria.service_confidence ?? 0) >= 50) {
            const transcriptServices = normArray(svcCriteria.target_services);
            const mergedServices = new Set([...buyerServices, ...transcriptServices]);
            buyerServices = [...mergedServices];
          }

          // Merge transcript geography (if confidence >= 50)
          const geoCriteria = buyerCriteria.geography_criteria as {
            target_states?: string[];
            target_regions?: string[];
            confidence?: number;
          } | undefined;
          if (geoCriteria?.confidence && geoCriteria.confidence >= 50) {
            if (geoCriteria.target_states?.length) {
              const transcriptGeos = normArray(geoCriteria.target_states);
              const mergedGeos = new Set([...buyerGeos, ...transcriptGeos]);
              buyerGeos = [...mergedGeos];
            }
          }

          // Build transcript summary for display on the card
          const summaryParts: string[] = [];
          if (svcCriteria?.target_services?.length) {
            summaryParts.push(`targets ${svcCriteria.target_services.slice(0, 3).join(', ')}`);
          }
          if (geoCriteria?.target_states?.length) {
            summaryParts.push(`in ${geoCriteria.target_states.slice(0, 4).join(', ')}`);
          }
          const sizeCriteria = buyerCriteria.size_criteria as {
            ebitda_min?: number;
            ebitda_max?: number;
          } | undefined;
          if (sizeCriteria?.ebitda_min || sizeCriteria?.ebitda_max) {
            const minStr = sizeCriteria.ebitda_min ? `$${(sizeCriteria.ebitda_min / 1_000_000).toFixed(1)}M` : '';
            const maxStr = sizeCriteria.ebitda_max ? `$${(sizeCriteria.ebitda_max / 1_000_000).toFixed(1)}M` : '';
            if (minStr && maxStr) summaryParts.push(`${minStr}-${maxStr} EBITDA`);
            else if (minStr) summaryParts.push(`${minStr}+ EBITDA`);
            else if (maxStr) summaryParts.push(`up to ${maxStr} EBITDA`);
          }
          if (summaryParts.length > 0) {
            transcriptSummary = `Said they ${summaryParts.join(', ')}`;
          }
        }
        // Fall back to buyer_profile thesis if no criteria
        if (!transcriptSummary) {
          const profile = insights.buyer_profile as { thesis_summary?: string } | undefined;
          if (profile?.thesis_summary) {
            transcriptSummary = profile.thesis_summary;
          }
        }
      }

      // AI-seeded buyers get +20 service_score bonus from seed log why_relevant
      const seedLogReason = seedLogMap.get(buyer.id);
      const AI_SEED_BONUS = 20;
      const aiSeedBoost = seedLogReason ? AI_SEED_BONUS : 0;

      const svc = scoreService(
        dealCategories,
        dealIndustry,
        buyerServices,
        buyerIndustries,
        buyerIndustryVertical,
      );
      // Apply AI-seeded bonus: cap at 100
      svc.score = Math.min(svc.score + aiSeedBoost, 100);
      if (aiSeedBoost > 0) svc.signals.push(`AI-seeded +${AI_SEED_BONUS} (why_relevant)`);

      const geo = scoreGeography(dealState, dealGeoStates, buyerGeos, buyerFootprint, buyerHqState);
      // Bonus signals are computed for display only — they no longer affect the composite score
      const bonus = scoreBonus(buyer);

      // v4: Composite = service + geography only. Bonus removed to focus on pure fit.
      const rawComposite = Math.round(
        svc.score * weights.service +
          geo.score * weights.geography,
      );

      // Apply service fit gate multiplier — crushes composite for bad service fits
      const gateMultiplier = getServiceGateMultiplier(svc.score, svc.noData);
      let composite = Math.round(rawComposite * gateMultiplier);

      // Issue #41: Soft penalty for buyers rejected on sibling deals in the same niche
      const NICHE_REJECTION_PENALTY = 15;
      if (nicheRejectedBuyerIds.has(buyer.id)) {
        composite = Math.max(0, composite - NICHE_REJECTION_PENALTY);
      }

      const fitSignals = [...svc.signals, ...geo.signals, ...bonus.signals];

      // Add gate signal if it reduced the score
      if (gateMultiplier < 1.0) {
        fitSignals.push(`Service gate: ${Math.round(gateMultiplier * 100)}% (low service fit)`);
      }

      // Issue #41: Signal for niche rejection penalty
      if (nicheRejectedBuyerIds.has(buyer.id)) {
        fitSignals.push(`Niche rejection: -${NICHE_REJECTION_PENALTY} (rejected on similar deal)`);
      }

      // Derive source from buyer origin
      const source: BuyerScore['source'] = buyer.ai_seeded
        ? 'ai_seeded'
        : buyer.marketplace_firm_id
          ? 'marketplace'
          : 'scored';

      const isPeBacked = !!buyer.is_pe_backed;
      const buyerTypePriority = getBuyerTypePriority(buyer.buyer_type, isPeBacked);

      const tier = classifyTier(composite, !!buyer.has_fee_agreement, buyer.acquisition_appetite);

      // Build fit_reason (seedLogReason already fetched above for AI boost)
      const seedLogAcquisitions = seedLogAcquisitionsMap.get(buyer.id);
      const rawThesis = (buyer.thesis_summary || '').trim();
      const thesisCleaned = rawThesis
        .replace(
          /\.?\s*(Exact industry match:[^.]*|Adjacent industry:[^.]*|State match:[^.]*|Region match:[^.]*|National buyer|EBITDA [^.]*|Fee agreement signed|Aggressive [^.]*|\d+ acquisitions)\.?\s*/gi,
          '',
        )
        .trim();

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
      const matchingServiceTerms = svc.signals
        .map((s) => {
          const m = s.match(/^(?:Exact industry match|Same-family industry|Adjacent industry):\s*(.+)/i);
          return m?.[1]?.trim() || null;
        })
        .filter(Boolean) as string[];

      const rawBuyerGeos = [
        ...((buyer.target_geographies as string[]) || []),
        ...((buyer.geographic_footprint as string[]) || []),
      ].filter(Boolean);
      const uniqueGeos = [...new Set(rawBuyerGeos.map((g) => g.toUpperCase()))];
      const otherCoveredStates = uniqueGeos
        .filter((g) => g.length === 2 && g !== dealState?.toUpperCase())
        .slice(0, 4);

      let fit_reason: string;
      if (seedLogReason) {
        fit_reason = seedLogReason;
      } else if (thesisCleaned) {
        let reason = thesisCleaned.endsWith('.') ? thesisCleaned : `${thesisCleaned}.`;
        const matchDetails: string[] = [];
        if (svc.score >= 100) {
          if (matchingServiceTerms.length > 0) {
            matchDetails.push(
              `directly targets ${matchingServiceTerms.slice(0, 3).map(titleCase).join(', ')} \u2014 overlapping with ${dealIndustry || 'the deal'}`,
            );
          } else {
            matchDetails.push(`directly targets ${dealIndustry || 'this industry'}`);
          }
        } else if (svc.score >= 80) {
          if (matchingServiceTerms.length > 0) {
            matchDetails.push(
              `same-family fit via ${matchingServiceTerms.slice(0, 2).map(titleCase).join(', ')} to ${dealIndustry || 'this industry'}`,
            );
          } else {
            matchDetails.push(
              `same-family fit to ${dealIndustry || 'this industry'}${buyer.industry_vertical ? ` (${buyer.industry_vertical})` : ''}`,
            );
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
        else if (svc.score >= 80)
          parts.push(`operates in a related ${dealIndustry || 'industry'} vertical`);
        else if (svc.score >= 60)
          parts.push(`invests in adjacent ${dealIndustry || 'industry'} verticals`);
        if (geo.score >= 100)
          parts.push(`active in ${dealState?.toUpperCase() || 'target geography'}`);
        else if (geo.score >= 80) parts.push('national acquisition footprint');
        else if (geo.score >= 60) parts.push('regional geographic overlap');
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
        platform_website: buyer.platform_website || null,
        composite_score: composite,
        service_score: svc.score,
        geography_score: geo.score,
        bonus_score: bonus.score,
        fit_signals: fitSignals,
        fit_reason,
        tier,
        source,
        buyer_type_priority: buyerTypePriority,
        is_pe_backed: isPeBacked,
        is_publicly_traded: buyer.is_publicly_traded ?? null,
        transcript_summary: transcriptSummary,
      });
    }

    // ── Rank: primary by composite score, secondary by buyer type priority ──
    scored.sort((a, b) => {
      const scoreDiff = b.composite_score - a.composite_score;
      if (scoreDiff !== 0) return scoreDiff;
      // Among equal scores, PE-backed platforms rank first
      return (a.buyer_type_priority || 5) - (b.buyer_type_priority || 5);
    });

    // ── "Why Not?" lookup: return a single buyer's full breakdown ──
    if (lookupBuyerId) {
      const rank = scored.findIndex((b) => b.buyer_id === lookupBuyerId);
      const buyerScore = scored.find((b) => b.buyer_id === lookupBuyerId);
      const wasRejected = rejectedBuyerIds.has(lookupBuyerId);
      const wasNicheRejected = nicheRejectedBuyerIds.has(lookupBuyerId);
      const wasFilteredAiSeed = buyers.some(
        (b: { id: string; ai_seeded: boolean }) =>
          b.id === lookupBuyerId && b.ai_seeded && !seedLogBuyerIds.has(lookupBuyerId),
      );

      let status: string;
      if (wasRejected) {
        status = 'Excluded — rejected on this deal';
      } else if (wasFilteredAiSeed) {
        status = 'Excluded — AI-seeded for a different deal';
      } else if (buyerScore && rank >= 0) {
        const cap = buyerScore.source === 'ai_seeded' ? MAX_EXTERNAL : MAX_INTERNAL;
        const poolRank = scored
          .filter((b) => (buyerScore.source === 'ai_seeded') === (b.source === 'ai_seeded'))
          .findIndex((b) => b.buyer_id === lookupBuyerId);
        if (poolRank >= cap) {
          status = `Ranked #${poolRank + 1} in ${buyerScore.source === 'ai_seeded' ? 'external' : 'internal'} pool (below top-${cap} cap)`;
        } else {
          status = `Ranked #${poolRank + 1} in ${buyerScore.source === 'ai_seeded' ? 'external' : 'internal'} pool`;
        }
      } else {
        status = 'Not found in buyer pool (may be archived or not in this universe)';
      }

      return new Response(
        JSON.stringify({
          lookup: true,
          buyer_id: lookupBuyerId,
          score: buyerScore || null,
          rank: rank >= 0 ? rank + 1 : null,
          total_scored: scored.length,
          status,
          was_rejected: wasRejected,
          was_niche_rejected: wasNicheRejected,
        }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // Split into internal (pool) and external (AI-discovered) pools with independent caps.
    // This ensures AI-seeded buyers always surface in the External tab rather than
    // competing with the entire buyer pool for a single capped list.
    const internalBuyers = scored.filter((b) => b.source !== 'ai_seeded').slice(0, MAX_INTERNAL);
    const externalBuyers = scored.filter((b) => b.source === 'ai_seeded').slice(0, MAX_EXTERNAL);
    const topBuyers = [...internalBuyers, ...externalBuyers];

    // ── Write to cache ──
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_HOURS * 60 * 60 * 1000);

    // Note: content_hash is computed above but not written to the cache table yet.
    // A future migration should add a content_hash TEXT column to buyer_recommendation_cache,
    // then uncomment content_hash in the upsert and add it to the cache SELECT above
    // for stale-on-edit invalidation.
    const { error: cacheError } = await supabase.from('buyer_recommendation_cache').upsert(
      {
        listing_id: listingId,
        scored_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        buyer_count: topBuyers.length,
        results: topBuyers,
        score_version: 'v4',
        universe_ids: universeIds,
        // content_hash: contentHashStr, // Uncomment after migration adds this column
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
