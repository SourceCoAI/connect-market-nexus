/**
 * Deal Scoring Algorithm v5 — Portable Module
 *
 * Pure function, no Deno/Supabase deps. Mirrors the edge function
 * in supabase/functions/calculate-deal-quality/index.ts exactly.
 *
 * IMPORTANT: Keep this in sync with the edge function. If you change
 * scoring logic here, update the edge function too (and vice versa).
 */

export interface DealInput {
  revenue?: number | null;
  ebitda?: number | null;
  linkedin_employee_count?: number | null;
  linkedin_employee_range?: string | null;
  full_time_employees?: number | null;
  part_time_employees?: number | null;
  team_page_employee_count?: number | null;
  number_of_locations?: number | null;
  google_review_count?: number | null;
  google_rating?: number | null;
  industry_tier?: number | null;
  address_city?: string | null;
  address_state?: string | null;
  location?: string | null;
  description?: string | null;
  executive_summary?: string | null;
  business_model?: string | null;
  category?: string | null;
  service_mix?: string | null;
  industry?: string | null;
  website?: string | null;
  enriched_at?: string | null;
}

export interface DealScoreResult {
  deal_total_score: number;
  deal_size_score: number;
  revenue_score?: number;
  ebitda_score?: number;
  linkedin_boost?: number;
  quality_calculation_version: string;
  scoring_notes?: string;
}

// Parse linkedin_employee_range strings like "11-50 employees" → midpoint estimate
export function estimateEmployeesFromRange(range: string | null): number {
  if (!range) return 0;
  const cleaned = range.replace(/,/g, '').toLowerCase();
  const plusMatch = cleaned.match(/(\d+)\+/);
  if (plusMatch) return parseInt(plusMatch[1], 10) * 1.2;
  const rangeMatch = cleaned.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch)
    return Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2);
  const singleMatch = cleaned.match(/^(\d+)/);
  if (singleMatch) return parseInt(singleMatch[1], 10);
  return 0;
}

// M-17 FIX: Financial normalization assumes small numbers are shorthand:
//   val < 1000  → treated as millions (e.g., 5 → $5M)
//   val < 100K  → treated as thousands (e.g., 5000 → $5M)
//   val >= 100K → treated as raw dollars
// Added guard: values under 1 are likely data entry errors, not $500K+ companies.
function normalizeFinancial(val: number): number {
  if (val <= 0) return 0;
  if (val < 1) return 0; // M-17: sub-$1 values are likely errors, not $500K+
  if (val < 1000) return Math.round(val * 1_000_000);
  if (val < 100000) return Math.round(val * 1_000);
  return val;
}

const MAJOR_METROS = [
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

const SECONDARY_CITIES = [
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

export function calculateDealScore(deal: DealInput): DealScoreResult {
  const notes: string[] = [];

  const revenue = normalizeFinancial(deal.revenue || 0);
  const ebitda = normalizeFinancial(deal.ebitda || 0);
  const hasFinancials = revenue > 0 || ebitda > 0;

  // Employee waterfall: LinkedIn count → LinkedIn range → website (FT+PT) → team page
  const totalWebsiteEmployees = (deal.full_time_employees || 0) + (deal.part_time_employees || 0);
  let employeeCount = deal.linkedin_employee_count || 0;
  let employeeSource = 'linkedin';

  if (!employeeCount && deal.linkedin_employee_range) {
    employeeCount = estimateEmployeesFromRange(deal.linkedin_employee_range);
    employeeSource = 'linkedin_range';
  }
  if (!employeeCount && totalWebsiteEmployees > 0) {
    employeeCount = totalWebsiteEmployees;
    employeeSource = 'website';
  }
  if (!employeeCount && deal.team_page_employee_count) {
    employeeCount = deal.team_page_employee_count;
    employeeSource = 'team_page';
  }
  if (!employeeCount) {
    employeeSource = 'none';
  }

  const locationCount = deal.number_of_locations || 0;

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
    // Employee scoring
    let empScore = 0;
    if (employeeCount >= 200) empScore = 60;
    else if (employeeCount >= 100) empScore = 54;
    else if (employeeCount >= 50) empScore = 48;
    else if (employeeCount >= 25) empScore = 42;
    else if (employeeCount >= 15) empScore = 36;
    else if (employeeCount >= 10) empScore = 30;
    else if (employeeCount >= 5) empScore = 21;
    else if (employeeCount >= 3) empScore = 12;
    else if (employeeCount > 0) empScore = 6;

    if (employeeCount > 0) {
      linkedinBoost = empScore;
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
    sizeScore = empScore > 0 ? empScore : reviewScore;

    if (locationCount >= 10) sizeScore = Math.max(sizeScore, 60);
    else if (locationCount >= 5) sizeScore = Math.max(sizeScore, 50);
    else if (locationCount >= 3) sizeScore = Math.max(sizeScore, 40);

    if (locationCount >= 3) {
      notes.push(
        `${locationCount} locations (floor ${locationCount >= 10 ? 60 : locationCount >= 5 ? 50 : 40})`,
      );
    }

    // Baseline floor for deals with some data but no size signals
    if (sizeScore === 0) {
      const hasIndustry = !!(deal.industry || deal.category);
      const hasDescription = !!(deal.description || deal.executive_summary);
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

  if (MAJOR_METROS.some((metro) => locationText.includes(metro))) {
    marketScore += 5;
    notes.push('major metro');
  } else if (SECONDARY_CITIES.some((c) => locationText.includes(c))) {
    marketScore += 3;
    notes.push('secondary city');
  } else if (city || state) {
    marketScore += 2;
  }

  if (locationCount >= 3) marketScore += 2;

  const desc = (deal.description || deal.executive_summary || '').toLowerCase();
  const businessModel = (deal.business_model || '').toLowerCase();
  const allText =
    `${deal.category || ''} ${deal.service_mix || ''} ${businessModel} ${desc}`.toLowerCase();
  if (/recurring|subscription|contract|maintenance|managed/.test(allText)) {
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
