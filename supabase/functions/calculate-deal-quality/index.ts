import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface DealQualityScores {
  deal_total_score: number;
  deal_size_score: number;
  revenue_score?: number;
  ebitda_score?: number;
  linkedin_boost?: number;
  quality_calculation_version: string;
  scoring_notes?: string;
}

// Parse linkedin_employee_range strings like "11-50 employees" → midpoint estimate
function estimateEmployeesFromRange(range: string | null): number {
  if (!range) return 0;
  const cleaned = range.replace(/,/g, '').toLowerCase();
  const plusMatch = cleaned.match(/(\d+)\+/);
  if (plusMatch) return parseInt(plusMatch[1], 10) * 1.2; // conservative estimate above floor
  const rangeMatch = cleaned.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch)
    return Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2);
  const singleMatch = cleaned.match(/^(\d+)/);
  if (singleMatch) return parseInt(singleMatch[1], 10);
  return 0;
}

function calculateScoresFromData(deal: Record<string, any>): DealQualityScores {
  const notes: string[] = [];

  const normalizeFinancial = (val: number): number => {
    // Assume values are stored in actual dollars.
    // Only apply multiplier heuristic for values that are clearly shorthand:
    //   0.5-999 with decimals (e.g., 2.5 = $2.5M) → treat as millions
    //   1-999 integers → ambiguous, but in M&A context likely millions
    //   1000-99999 → likely thousands shorthand (e.g., 5000 = $5M)
    //   100000+ → treat as actual dollars
    if (val <= 0) return 0;
    if (val >= 100_000) return val; // Already in actual dollars
    if (val >= 1_000) return Math.round(val * 1_000); // Thousands shorthand
    if (val >= 1) return Math.round(val * 1_000_000); // Millions shorthand
    // Sub-dollar values (e.g., 0.5 = $500K)
    return Math.round(val * 1_000_000);
  };

  const revenue = normalizeFinancial(Number(deal.revenue) || 0);
  const ebitda = normalizeFinancial(Number(deal.ebitda) || 0);
  const hasFinancials = revenue > 0 || ebitda > 0;

  // Employee waterfall: LinkedIn count → LinkedIn range → website (FT+PT) → team page
  const totalWebsiteEmployees =
    (Number(deal.full_time_employees) || 0) + (Number(deal.part_time_employees) || 0);
  let employeeCount = Number(deal.linkedin_employee_count) || 0;
  let employeeSource = 'linkedin';

  if (!employeeCount && deal.linkedin_employee_range) {
    employeeCount = estimateEmployeesFromRange(deal.linkedin_employee_range as string | null);
    employeeSource = 'linkedin_range';
  }
  if (!employeeCount && totalWebsiteEmployees > 0) {
    employeeCount = totalWebsiteEmployees;
    employeeSource = 'website';
  }
  if (!employeeCount && deal.team_page_employee_count) {
    employeeCount = Number(deal.team_page_employee_count);
    employeeSource = 'team_page';
  }
  if (!employeeCount) {
    employeeSource = 'none';
  }
  const locationCount = Number(deal.number_of_locations) || 0;

  let revenueScore = 0;
  let ebitdaScore = 0;
  let linkedinBoost = 0;
  let sizeFloor = 0;
  let sizeScore = 0;

  // ── Path A: Has financials ──
  if (hasFinancials) {
    if (revenue >= 100_000_000) revenueScore = 75;
    else if (revenue >= 50_000_000) revenueScore = 70;
    else if (revenue >= 25_000_000) revenueScore = 64;
    else if (revenue >= 10_000_000) revenueScore = 58;
    else if (revenue >= 7_000_000) revenueScore = 50;
    else if (revenue >= 5_000_000) revenueScore = 44;
    else if (revenue >= 3_000_000) revenueScore = 37;
    else if (revenue >= 2_000_000) revenueScore = 28;
    else if (revenue >= 1_000_000) revenueScore = 20;
    else if (revenue >= 500_000) revenueScore = 10;
    else if (revenue > 0) revenueScore = 5;

    if (ebitda >= 5_000_000) ebitdaScore = 15;
    else if (ebitda >= 3_000_000) ebitdaScore = 13;
    else if (ebitda >= 2_000_000) ebitdaScore = 11;
    else if (ebitda >= 1_000_000) ebitdaScore = 9;
    else if (ebitda >= 500_000) ebitdaScore = 7;
    else if (ebitda >= 300_000) ebitdaScore = 5;
    else if (ebitda >= 150_000) ebitdaScore = 3;

    sizeScore = Math.min(90, revenueScore + ebitdaScore);

    // Size floors for large financials
    if (revenue >= 50_000_000) {
      sizeFloor = 90;
    } else if (revenue >= 25_000_000) {
      sizeFloor = 85;
    } else if (revenue >= 10_000_000) {
      sizeFloor = 80;
    } else if (revenue >= 7_000_000) {
      sizeFloor = 75;
    } else if (revenue >= 5_000_000) {
      sizeFloor = 70;
    }

    if (ebitda >= 5_000_000 && sizeFloor < 90) {
      sizeFloor = 90;
    } else if (ebitda >= 3_000_000 && sizeFloor < 85) {
      sizeFloor = 85;
    }

    // Apply financial size floor before industry multiplier
    sizeScore = Math.max(sizeScore, sizeFloor);

    // ── Revenue quality cross-validation ──
    // When both financials and employee data exist, check if revenue is plausible
    if (employeeCount > 0 && revenue > 0) {
      const revenuePerEmployee = revenue / employeeCount;

      // > $10M per employee with very few staff → likely bad data
      if (revenuePerEmployee > 10_000_000 && employeeCount < 25) {
        const penalty = Math.min(20, Math.round(sizeScore * 0.25));
        sizeScore = Math.max(sizeScore - penalty, 10);
        notes.push(
          `rev/emp suspicious ($${Math.round(revenuePerEmployee / 1_000_000)}M/emp, ${employeeCount} emp → -${penalty})`,
        );
      }
      // > $5M per employee with very few staff → flag
      else if (revenuePerEmployee > 5_000_000 && employeeCount < 10) {
        const penalty = Math.min(15, Math.round(sizeScore * 0.2));
        sizeScore = Math.max(sizeScore - penalty, 10);
        notes.push(
          `rev/emp high ($${Math.round(revenuePerEmployee / 1_000_000)}M/emp, ${employeeCount} emp → -${penalty})`,
        );
      }
    }

    // EBITDA margin sanity — margins above 80% are extremely rare outside pure IP/software
    if (revenue > 0 && ebitda > 0) {
      const margin = ebitda / revenue;
      if (margin > 0.8) {
        const ebitdaPenalty = Math.round(ebitdaScore * 0.5);
        ebitdaScore = ebitdaScore - ebitdaPenalty;
        sizeScore = Math.max(Math.min(90, revenueScore + ebitdaScore), sizeFloor);
        notes.push(
          `high EBITDA margin (${Math.round(margin * 100)}% → EBITDA score -${ebitdaPenalty})`,
        );
      }
    }

    const revLabel =
      revenue >= 100_000_000
        ? '$100M+'
        : revenue >= 50_000_000
          ? '$50M+'
          : revenue >= 25_000_000
            ? '$25M+'
            : revenue >= 10_000_000
              ? '$10M+'
              : revenue >= 7_000_000
                ? '$7M+'
                : revenue >= 5_000_000
                  ? '$5M+'
                  : revenue >= 3_000_000
                    ? '$3M+'
                    : revenue >= 2_000_000
                      ? '$2M+'
                      : revenue >= 1_000_000
                        ? '$1M+'
                        : revenue >= 500_000
                          ? '$500K+'
                          : '$0+';
    notes.push(`${revLabel} revenue`);
    if (ebitda > 0) {
      const ebitdaLabel =
        ebitda >= 5_000_000
          ? '$5M+'
          : ebitda >= 3_000_000
            ? '$3M+'
            : ebitda >= 2_000_000
              ? '$2M+'
              : ebitda >= 1_000_000
                ? '$1M+'
                : ebitda >= 500_000
                  ? '$500K+'
                  : ebitda >= 300_000
                    ? '$300K+'
                    : ebitda >= 150_000
                      ? '$150K+'
                      : '<$150K';
      notes.push(`${ebitdaLabel} EBITDA`);
    }

    // ── Path B: No financials ──
  } else {
    // No financials — use proxy signals for size estimation
    let empPts = 0;
    if (employeeCount >= 200) empPts = 60;
    else if (employeeCount >= 100) empPts = 54;
    else if (employeeCount >= 50) empPts = 48;
    else if (employeeCount >= 25) empPts = 42;
    else if (employeeCount >= 15) empPts = 36;
    else if (employeeCount >= 10) empPts = 30;
    else if (employeeCount >= 5) empPts = 21;
    else if (employeeCount >= 3) empPts = 12;
    else if (employeeCount > 0) empPts = 6;

    if (employeeCount > 0) {
      linkedinBoost = empPts;
      const sourceLabel =
        employeeSource === 'linkedin'
          ? 'LinkedIn'
          : employeeSource === 'linkedin_range'
            ? 'LinkedIn range'
            : employeeSource === 'website'
              ? 'Website'
              : 'Team page';
      notes.push(`${sourceLabel}: ~${Math.round(employeeCount)} employees (size proxy)`);
    }

    // Google review fallback — ONLY if zero employees AND <3 locations
    let reviewScore = 0;
    if (employeeCount === 0 && locationCount < 3) {
      const rc = deal.google_review_count || 0;
      if (rc >= 500) reviewScore = 20;
      else if (rc >= 200) reviewScore = 15;
      else if (rc >= 100) reviewScore = 10;
      else if (rc >= 50) reviewScore = 7;
      else if (rc >= 20) reviewScore = 4;
      else if (rc > 0) reviewScore = 2;

      if (rc > 0) {
        notes.push(`Google: ${rc} reviews (fallback)`);
      }
    }

    // Combine and apply location floor
    sizeScore = empPts > 0 ? empPts : reviewScore;

    if (locationCount >= 10) sizeScore = Math.max(sizeScore, 60);
    else if (locationCount >= 5) sizeScore = Math.max(sizeScore, 50);
    else if (locationCount >= 3) sizeScore = Math.max(sizeScore, 40);

    if (locationCount >= 3) {
      notes.push(
        `${locationCount} locations (floor ${locationCount >= 10 ? 60 : locationCount >= 5 ? 50 : 40})`,
      );
    }

    // Baseline floor: enriched deals with some data shouldn't score 0
    // If we have industry, description, or website data, give a minimum baseline
    if (sizeScore === 0) {
      const hasIndustry = !!(deal.industry || deal.category);
      const hasDescription = !!deal.executive_summary;
      const hasWebsite = !!deal.website;
      const hasEnrichment = !!deal.enriched_at;

      let baseline = 0;
      if (hasEnrichment) baseline += 5;
      if (hasIndustry) baseline += 3;
      if (hasDescription) baseline += 2;
      if (hasWebsite) baseline += 2;

      if (baseline > 0) {
        sizeScore = baseline;
        notes.push(
          `Baseline score (no size data yet): enriched=${hasEnrichment}, industry=${hasIndustry}`,
        );
      } else {
        notes.push('No data available for scoring');
      }
    } else {
      notes.push('No financials — using proxy signals');
    }
  }

  // ── Industry multiplier ──
  const industryTier = deal.industry_tier || null;
  let industryMultiplier = 1.0;
  if (industryTier === 1) industryMultiplier = 1.15;
  else if (industryTier === 2) industryMultiplier = 1.0;
  else if (industryTier === 3) industryMultiplier = 0.9;

  const adjustedSizeScore = Math.round(sizeScore * industryMultiplier);

  if (industryTier && industryMultiplier !== 1.0) {
    notes.push(`Tier ${industryTier} industry (${industryMultiplier}x)`);
  }

  // ── Market score (0–10) ──
  let marketScore = 0;
  const city = (deal.address_city || '').toLowerCase();
  const state = (deal.address_state || '').toUpperCase();
  const location = (deal.location || '').toLowerCase();
  const locationText = `${city} ${location}`;

  const majorMetros = [
    'new york',
    'los angeles',
    'chicago',
    'houston',
    'phoenix',
    'philadelphia',
    'san antonio',
    'san diego',
    'dallas',
    'austin',
    'san jose',
    'san francisco',
    'seattle',
    'denver',
    'boston',
    'atlanta',
    'miami',
    'washington',
    'dc',
    'minneapolis',
    'tampa',
    'orlando',
    'detroit',
    'portland',
    'charlotte',
    'nashville',
    'las vegas',
    'baltimore',
    'indianapolis',
    'columbus',
    'jacksonville',
  ];
  const secondaryCities = [
    'raleigh',
    'richmond',
    'sacramento',
    'kansas city',
    'st louis',
    'pittsburgh',
    'cincinnati',
    'milwaukee',
    'oklahoma city',
    'memphis',
    'louisville',
    'tucson',
    'albuquerque',
    'fresno',
    'mesa',
    'omaha',
    'colorado springs',
    'tulsa',
    'arlington',
    'bakersfield',
    'wichita',
    'boise',
    'salt lake',
    'madison',
    'green bay',
    'des moines',
    'knoxville',
    'chattanooga',
    'birmingham',
  ];

  if (majorMetros.some((metro) => locationText.includes(metro))) {
    marketScore += 5;
    notes.push('major metro');
  } else if (secondaryCities.some((c) => locationText.includes(c))) {
    marketScore += 3;
    notes.push('secondary city');
  } else if (city || state) {
    marketScore += 2;
  }

  // Multi-location market signal bonus (separate from location floor)
  if (locationCount >= 3) marketScore += 2;

  const description = (deal.executive_summary || '').toLowerCase();
  const businessModel = (deal.business_model || '').toLowerCase();
  const customerTypes = (deal.customer_types || '').toLowerCase();
  const financialNotes = (deal.financial_notes || '').toLowerCase();
  const ownerGoals = (deal.owner_goals || '').toLowerCase();
  const allText =
    `${deal.category || ''} ${deal.service_mix || ''} ${businessModel} ${description} ${customerTypes} ${financialNotes} ${ownerGoals} ${(deal.services || []).join(' ').toLowerCase()} ${(deal.industry || '').toLowerCase()}`.toLowerCase();

  // Expanded recurring revenue detection — catches contracts, SaaS, insurance DRPs,
  // maintenance agreements, managed services, retainers, and recurring billing patterns
  const recurringPatterns =
    /recurring|subscription|contract|maintenance|managed service|retainer|monthly service|annual service|saas|mrr|arr|drp|insurance referr|preferred vendor|repeat customer|membership|license fee|service agreement|service contract|preventive maintenance|pm contract|ongoing|long.?term agreement|renewal|auto.?renew|recurring revenue/;
  if (recurringPatterns.test(allText)) {
    marketScore += 2;
    notes.push('recurring revenue model');
  }

  marketScore = Math.min(10, marketScore);

  // ── Final score ──
  const totalScore = Math.min(100, Math.max(0, adjustedSizeScore + marketScore));

  return {
    deal_total_score: totalScore,
    deal_size_score: Math.min(90, Math.max(0, sizeScore)),
    revenue_score: hasFinancials ? revenueScore : undefined,
    ebitda_score: hasFinancials ? ebitdaScore : undefined,
    linkedin_boost: employeeCount > 0 ? linkedinBoost : undefined,
    quality_calculation_version: 'v5',
    scoring_notes: notes.length > 0 ? notes.join('; ') : undefined,
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const {
      listingId,
      calculateAll,
      forceRecalculate,
      triggerEnrichment,
      batchSource,
      unscoredOnly,
      globalQueueId,
      offset = 0,
      scoredSoFar = 0,
    } = body;

    let listingsToScore: any[] = [];
    let enrichmentQueued = 0;
    const BATCH_SIZE = 200;

    const queueDealsForEnrichment = async (dealIds: string[], reason: string) => {
      console.log(`Queueing ${dealIds.length} deals for enrichment (${reason})`);
      let queuedCount = 0;
      for (const dealId of dealIds) {
        const { data: existing } = await supabase
          .from('enrichment_queue')
          .select('id')
          .eq('listing_id', dealId)
          .in('status', ['pending', 'processing'])
          .maybeSingle();
        if (!existing) {
          const { error: queueError } = await supabase.from('enrichment_queue').upsert(
            {
              listing_id: dealId,
              status: 'pending',
              attempts: 0,
              queued_at: new Date().toISOString(),
            },
            { onConflict: 'listing_id' },
          );
          if (!queueError) queuedCount++;
        }
      }
      if (queuedCount > 0) console.log(`Queued ${queuedCount} deals for enrichment`);
      return queuedCount;
    };

    // New batch mode: score all deals from a specific source with self-continuation
    if (batchSource) {
      // Use captarget_status to identify CapTarget deals (no "source" column exists)
      let query =
        batchSource === 'captarget'
          ? supabase
              .from('listings')
              .select('*')
              .not('captarget_status', 'is', null)
              .is('deleted_at', null)
              .order('created_at', { ascending: true })
          : supabase
              .from('listings')
              .select('*')
              .eq('deal_source', batchSource)
              .is('deleted_at', null)
              .order('created_at', { ascending: true });

      if (unscoredOnly) {
        query = query.is('deal_total_score', null);
        // When filtering unscored only, always start from 0 since scored deals
        // drop out of the result set after each batch
        query = query.range(0, BATCH_SIZE - 1);
      } else {
        query = query.range(offset, offset + BATCH_SIZE - 1);
      }

      const { data: listings, error: listingsError } = await query;
      if (listingsError) throw new Error('Failed to fetch listings: ' + listingsError.message);
      listingsToScore = listings || [];

      console.log(
        `[batch] Source=${batchSource}, offset=${offset}, fetched=${listingsToScore.length}`,
      );

      if (listingsToScore.length === 0) {
        // Done — mark global queue as completed
        if (globalQueueId) {
          await supabase
            .from('global_activity_queue')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', globalQueueId);
        }
        return new Response(
          JSON.stringify({ success: true, message: 'All deals scored', scored: 0, done: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    } else if (listingId) {
      const { data: listing, error: listingError } = await supabase
        .from('listings')
        .select('*')
        .eq('id', listingId)
        .single();
      if (listingError || !listing) throw new Error('Listing not found');
      listingsToScore = [listing];
    } else if (forceRecalculate) {
      const { data: listings, error: listingsError } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(100);
      if (listingsError) throw new Error('Failed to fetch listings');
      listingsToScore = listings || [];
      console.log(`Force recalculating scores for ${listingsToScore.length} listings`);
      if (triggerEnrichment && listingsToScore.length > 0) {
        const dealIds = listingsToScore.map((l) => l.id);
        console.log(`Resetting enriched_at for ${dealIds.length} deals to force re-enrichment`);
        await supabase.from('listings').update({ enriched_at: null }).in('id', dealIds);
        enrichmentQueued = await queueDealsForEnrichment(dealIds, 'force recalculate all');
      }
    } else if (calculateAll) {
      const { data: listings, error: listingsError } = await supabase
        .from('listings')
        .select('*')
        .is('deal_total_score', null)
        .limit(50);
      if (listingsError) throw new Error('Failed to fetch listings');
      listingsToScore = listings || [];
    } else {
      return new Response(
        JSON.stringify({
          error: 'Must provide listingId, calculateAll, forceRecalculate, or batchSource',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (listingsToScore.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No listings to score', scored: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Scoring ${listingsToScore.length} listings...`);
    let scored = 0;
    let errors = 0;
    const results: unknown[] = [];

    for (const listing of listingsToScore) {
      try {
        const scores = calculateScoresFromData(listing);
        const { error: updateError } = await supabase
          .from('listings')
          .update({
            deal_total_score: scores.deal_total_score,
            deal_size_score: scores.deal_size_score,
            revenue_score: scores.revenue_score,
            ebitda_score: scores.ebitda_score,
            linkedin_boost: scores.linkedin_boost,
            quality_calculation_version: scores.quality_calculation_version,
            scoring_notes: scores.scoring_notes,
          })
          .eq('id', listing.id);
        if (updateError) {
          console.error(`Failed to update listing ${listing.id}:`, updateError);
          errors++;
        } else {
          scored++;
          results.push({ id: listing.id, title: listing.title, scores });
        }
      } catch (e) {
        console.error(`Error scoring listing ${listing.id}:`, e);
        errors++;
      }
    }

    console.log(
      `Scored ${scored} listings, ${errors} errors, ${enrichmentQueued} queued for enrichment`,
    );

    // Update global activity queue progress
    if (globalQueueId) {
      const totalScoredSoFar = scoredSoFar + scored;
      await supabase
        .from('global_activity_queue')
        .update({
          completed_items: totalScoredSoFar,
          failed_items: errors,
        })
        .eq('id', globalQueueId);
    }

    // Self-continuation for batch mode
    if (batchSource && listingsToScore.length === BATCH_SIZE) {
      const nextScoredSoFar = scoredSoFar + scored;
      // For unscoredOnly, keep offset at 0 since scored deals drop out of results
      const nextOffset = unscoredOnly ? 0 : offset + BATCH_SIZE;
      const selfUrl = `${supabaseUrl}/functions/v1/calculate-deal-quality`;
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || supabaseKey;
      console.log(
        `[batch] Continuing at offset ${nextOffset}, scored so far: ${nextScoredSoFar}...`,
      );
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batchSource,
          unscoredOnly,
          globalQueueId,
          offset: nextOffset,
          scoredSoFar: nextScoredSoFar,
        }),
      }).catch((err: unknown) => {
        console.warn('[deal-quality] Continuation trigger failed:', err);
      });
    } else if (batchSource && listingsToScore.length < BATCH_SIZE && globalQueueId) {
      // Last batch — mark complete
      const totalScoredSoFar = scoredSoFar + scored;
      await supabase
        .from('global_activity_queue')
        .update({
          status: 'completed',
          completed_items: totalScoredSoFar,
          failed_items: errors,
          completed_at: new Date().toISOString(),
        })
        .eq('id', globalQueueId);
      console.log(`[batch] Complete! Total scored: ${totalScoredSoFar}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Scored ${scored} deals${errors > 0 ? `, ${errors} errors` : ''}`,
        scored,
        errors,
        enrichmentQueued,
        results: results.slice(0, 10),
        remaining:
          batchSource && listingsToScore.length === BATCH_SIZE
            ? 'Continuing in background...'
            : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Calculate deal quality error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
