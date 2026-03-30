import { Listing, User } from '@/types';

export interface MatchReason {
  type: 'sector' | 'geography' | 'size' | 'acquisition_type';
  label: string;
  detail: string;
  matched: boolean;
}

export interface MatchResult {
  score: number;
  reasons: MatchReason[];
  /** Normalised 0-100 percentage based on the maximum achievable score. */
  percentage: number;
}

/**
 * Maximum raw score a listing can achieve (category 3 + location 2 + revenue 2 + ebitda 2 + acq type 1 + recency 1 = 11).
 * We exclude recency from the denominator because it is not a profile-criteria match.
 */
const MAX_CRITERIA_SCORE = 10;

/**
 * Compute a match score between a buyer's profile criteria and a listing.
 *
 * This is the single source of truth extracted from MatchedDealsSection so that
 * both the marketplace cards and the listing detail page can reuse it.
 */
export function computeMatchScore(
  listing: Listing,
  buyerCategories: string[],
  buyerLocations: string[],
  revenueMin: number | null,
  revenueMax: number | null,
  ebitdaMin: number | null,
  ebitdaMax: number | null,
  dealIntent: string | null,
): MatchResult {
  let score = 0;
  const reasons: MatchReason[] = [];

  // ── Category match (3 pts) ──────────────────────────────────────────
  const listingCategories = listing.categories?.length ? listing.categories : [listing.category];
  const categoryOverlap =
    buyerCategories.length > 0 &&
    listingCategories.some((c) =>
      buyerCategories.some((bc) => bc.toLowerCase() === c?.toLowerCase()),
    );
  if (categoryOverlap) {
    score += 3;
    reasons.push({
      type: 'sector',
      label: 'Sector match',
      detail: `${listing.category} aligns with your focus`,
      matched: true,
    });
  } else if (buyerCategories.length > 0) {
    reasons.push({
      type: 'sector',
      label: 'Sector',
      detail: `${listing.category} is outside your target sectors`,
      matched: false,
    });
  }

  // ── Location match (2 pts) ──────────────────────────────────────────
  const listingLocation = listing.location?.toLowerCase() || '';
  const locationMatch =
    buyerLocations.length > 0 &&
    buyerLocations.some(
      (loc) =>
        listingLocation.includes(loc.toLowerCase()) || loc.toLowerCase().includes(listingLocation),
    );
  if (locationMatch) {
    score += 2;
    reasons.push({
      type: 'geography',
      label: 'Geographic match',
      detail: `${listing.location} is in your target area`,
      matched: true,
    });
  } else if (buyerLocations.length > 0) {
    reasons.push({
      type: 'geography',
      label: 'Geography',
      detail: `${listing.location} is outside your target regions`,
      matched: false,
    });
  }

  // ── Revenue fit (2 pts) ─────────────────────────────────────────────
  const revMin = revenueMin != null ? parseFloat(String(revenueMin)) : null;
  const revMax = revenueMax != null ? parseFloat(String(revenueMax)) : null;
  if (listing.revenue != null && (revMin != null || revMax != null)) {
    const inRange =
      (revMin == null || listing.revenue >= revMin) && (revMax == null || listing.revenue <= revMax);
    if (inRange) {
      score += 2;
      reasons.push({
        type: 'size',
        label: 'Revenue fit',
        detail: 'Revenue within your target range',
        matched: true,
      });
    } else {
      reasons.push({
        type: 'size',
        label: 'Revenue',
        detail: 'Revenue outside your target range',
        matched: false,
      });
    }
  }

  // ── EBITDA fit (2 pts) ──────────────────────────────────────────────
  const ebMin = ebitdaMin != null ? parseFloat(String(ebitdaMin)) : null;
  const ebMax = ebitdaMax != null ? parseFloat(String(ebitdaMax)) : null;
  if (listing.ebitda != null && (ebMin != null || ebMax != null)) {
    const inRange = (ebMin == null || listing.ebitda >= ebMin) && (ebMax == null || listing.ebitda <= ebMax);
    if (inRange) {
      score += 2;
      reasons.push({
        type: 'size',
        label: 'EBITDA fit',
        detail: 'EBITDA within your target range',
        matched: true,
      });
    } else {
      reasons.push({
        type: 'size',
        label: 'EBITDA',
        detail: 'EBITDA outside your target range',
        matched: false,
      });
    }
  }

  // ── Acquisition type fit (1 pt) ─────────────────────────────────────
  if (dealIntent && listing.acquisition_type) {
    const intentLower = dealIntent.toLowerCase();
    const typeLower = listing.acquisition_type.toLowerCase();
    const typeMatch =
      intentLower === 'either' ||
      intentLower === typeLower ||
      (intentLower.includes('platform') && typeLower.includes('platform')) ||
      (intentLower.includes('add') && typeLower.includes('add'));
    if (typeMatch) {
      score += 1;
      reasons.push({
        type: 'acquisition_type',
        label: 'Acquisition type fit',
        detail: `Matches your ${dealIntent} strategy`,
        matched: true,
      });
    } else {
      reasons.push({
        type: 'acquisition_type',
        label: 'Acquisition type',
        detail: `${listing.acquisition_type} differs from your ${dealIntent} preference`,
        matched: false,
      });
    }
  }

  // ── Recency boost (up to 1 pt, informational only) ──────────────────
  const daysSinceCreated =
    (Date.now() - new Date(listing.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCreated < 7) score += 1;
  else if (daysSinceCreated < 14) score += 0.5;

  const percentage = MAX_CRITERIA_SCORE > 0 ? Math.round((score / MAX_CRITERIA_SCORE) * 100) : 0;

  return { score, reasons, percentage: Math.min(percentage, 100) };
}

/**
 * Extract the buyer's matching criteria from the user profile into a
 * normalised shape that `computeMatchScore` expects.
 */
export function extractBuyerCriteria(user: User | null) {
  if (!user) {
    return {
      buyerCategories: [] as string[],
      buyerLocations: [] as string[],
      revenueMin: null as number | null,
      revenueMax: null as number | null,
      ebitdaMin: null as number | null,
      ebitdaMax: null as number | null,
      dealIntent: null as string | null,
      criteriaCount: 0,
    };
  }

  const buyerCategories: string[] = Array.isArray(user.business_categories)
    ? user.business_categories
    : [];

  const buyerLocations: string[] = Array.isArray(user.target_locations)
    ? user.target_locations
    : typeof user.target_locations === 'string'
      ? [user.target_locations]
      : [];

  const revenueMin = user.revenue_range_min != null ? parseFloat(String(user.revenue_range_min)) : null;
  const revenueMax = user.revenue_range_max != null ? parseFloat(String(user.revenue_range_max)) : null;
  const ebitdaMin = user.ebitda_min != null ? parseFloat(String(user.ebitda_min)) : null;
  const ebitdaMax = user.ebitda_max != null ? parseFloat(String(user.ebitda_max)) : null;
  const dealIntent = user.deal_intent || null;

  const criteriaCount = [
    buyerCategories.length > 0,
    buyerLocations.length > 0,
    revenueMin != null || revenueMax != null,
    ebitdaMin != null || ebitdaMax != null,
    dealIntent,
  ].filter(Boolean).length;

  return {
    buyerCategories,
    buyerLocations,
    revenueMin,
    revenueMax,
    ebitdaMin,
    ebitdaMax,
    dealIntent,
    criteriaCount,
  };
}

/**
 * Returns a badge label + colour class for a given match percentage.
 * Returns null when there's no meaningful match or not enough criteria.
 */
export function getMatchBadge(percentage: number): {
  label: string;
  colorClass: string;
} | null {
  if (percentage >= 80)
    return {
      label: 'Strong Match',
      colorClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    };
  if (percentage >= 60)
    return { label: 'Good Match', colorClass: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (percentage >= 40)
    return { label: 'Partial Match', colorClass: 'bg-slate-100 text-slate-600 border-slate-200' };
  return null;
}
