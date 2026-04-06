// ── Scoring functions ──
// Pure scoring logic extracted from score-deal-buyers for reuse across
// the scoring pipeline (queue workers, batch re-scoring, tests, etc.).

import { SECTOR_SYNONYMS, STATE_REGIONS, expandTerms } from './synonyms.ts';
import type { Tier } from './types.ts';

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

/** Lowercase-trim a nullable string, returning '' for nullish values. */
export function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().trim();
}

/** Title-case a lowercase term for display: "utility services" -> "Utility Services" */
export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalize an array of nullable strings into lowercase-trimmed, non-empty strings. */
export function normArray(arr: string[] | null | undefined): string[] {
  if (!arr) return [];
  return arr.map((s) => norm(s)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// extractDealKeywords
// ---------------------------------------------------------------------------

/**
 * Extracts known sector keywords from a deal's rich-text fields
 * (executive_summary, description, hero_description, investment_thesis,
 * end_market_description) using word-boundary matching against
 * SECTOR_SYNONYMS keys.
 */
export function extractDealKeywords(deal: Record<string, unknown>): string[] {
  const richText = [
    deal.executive_summary,
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

// ---------------------------------------------------------------------------
// scoreService
// ---------------------------------------------------------------------------

/**
 * Score service/industry alignment between a deal and a buyer.
 * Returns 0-100 score and human-readable signal strings.
 */
export function scoreService(
  dealCategories: string[],
  dealIndustry: string,
  buyerServices: string[],
  buyerIndustries: string[],
  buyerIndustryVertical: string,
): { score: number; signals: string[]; noData?: boolean } {
  const rawDealTerms = [...dealCategories, dealIndustry].filter(Boolean);
  const rawBuyerTerms = [...buyerServices, ...buyerIndustries, buyerIndustryVertical].filter(
    Boolean,
  );

  if (rawDealTerms.length === 0 || rawBuyerTerms.length === 0) {
    return { score: 0, signals: [], noData: true }; // No data -- cannot score, don't inflate
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

// ---------------------------------------------------------------------------
// scoreGeography
// ---------------------------------------------------------------------------

/**
 * Score geographic alignment between a deal and a buyer.
 * Returns 0-100 score and human-readable signal strings.
 *
 * Scoring tiers:
 *  100 -- exact state match
 *   80 -- national buyer
 *   60 -- regional overlap
 *    0 -- no geographic data or no overlap
 */
export function scoreGeography(
  dealState: string,
  dealGeoStates: string[],
  buyerGeos: string[],
  buyerFootprint: string[],
  buyerHqState: string,
): { score: number; signals: string[] } {
  const signals: string[] = [];
  const dealStates = [dealState, ...dealGeoStates].filter(Boolean);

  if (dealStates.length === 0) {
    return { score: 0, signals: [] }; // No deal geo data -- cannot score, don't inflate
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

// ---------------------------------------------------------------------------
// scoreSize
// ---------------------------------------------------------------------------

/**
 * Score EBITDA size alignment between a deal and a buyer's target range.
 * Returns 0-100 score and human-readable signal strings.
 *
 * Scoring tiers:
 *  100 -- deal EBITDA within buyer's min/max range
 *   60 -- deal EBITDA within 50% tolerance of range
 *    0 -- outside range or no data
 */
export function scoreSize(
  dealEbitda: number | null,
  buyerMin: number | null,
  buyerMax: number | null,
): { score: number; signals: string[] } {
  const signals: string[] = [];

  if (dealEbitda == null || dealEbitda < 0 || (buyerMin == null && buyerMax == null)) {
    return { score: 0, signals: [] }; // No data or negative EBITDA -- cannot score
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

// ---------------------------------------------------------------------------
// scoreBonus
// ---------------------------------------------------------------------------

/**
 * Score bonus buyer-readiness signals (fee agreement, appetite, track record).
 * Returns 0-100 score and human-readable signal strings.
 */
export function scoreBonus(buyer: {
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

// ---------------------------------------------------------------------------
// classifyTier
// ---------------------------------------------------------------------------

/**
 * Classify a buyer into a tier based on composite score and readiness signals.
 *
 *  'move_now'    -- composite >= 80 AND (fee agreement OR aggressive appetite)
 *  'strong'      -- composite >= 60
 *  'speculative' -- everything else
 */
export function classifyTier(
  compositeScore: number,
  hasFeeAgreement: boolean,
  appetite: string | null,
): Tier {
  if (compositeScore >= 80 && (hasFeeAgreement || norm(appetite) === 'aggressive')) {
    return 'move_now';
  }
  if (compositeScore >= 60) {
    return 'strong';
  }
  return 'speculative';
}
