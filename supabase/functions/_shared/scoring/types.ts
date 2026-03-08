// ── Scoring types & constants ──
// Shared across score-deal-buyers, process-scoring-queue, and any future
// consumer of the buyer-scoring pipeline.

/** Tier classification for scored buyers. */
export type Tier = 'move_now' | 'strong' | 'speculative';

/** Origin of the buyer record. */
export type BuyerSource = 'ai_seeded' | 'marketplace' | 'scored';

/** Full scored-buyer payload returned by the scoring pipeline. */
export interface BuyerScore {
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
  size_score?: number;
  bonus_score: number;
  fit_signals: string[];
  fit_reason: string;
  tier: Tier;
  source: BuyerSource;
  /** Buyer type priority used for ranking among equally-scored buyers */
  buyer_type_priority?: number;
  /** Whether this buyer is PE-backed (for display purposes) */
  is_pe_backed?: boolean;
}

/** Inbound request shape for the score-deal-buyers edge function. */
export interface ScoreRequest {
  listingId: string;
  forceRefresh?: boolean;
}

/**
 * Relative weights for each scoring dimension (must sum to 1.0).
 *
 * v3 — EBITDA size removed (unreliable for most buyers, inflated scores
 * for wrong-industry matches). Service fit is the dominant signal.
 *
 * Previous weights for reference:
 *   v1: service: 0.4, geography: 0.3, size: 0.2, bonus: 0.1
 *   v2: service: 0.6, geography: 0.15, size: 0.10, bonus: 0.15
 */
export const SCORE_WEIGHTS = {
  service: 0.7,
  geography: 0.15,
  bonus: 0.15,
} as const;

/** Convenience type for the weights object. */
export type ScoreWeights = typeof SCORE_WEIGHTS;

/**
 * Service fit gate multiplier — crushes composite score for buyers with
 * poor service fit, preventing wrong-industry buyers from ranking high
 * due to geography, fee agreements, or other signals.
 *
 * If service_score falls in a range, the ENTIRE composite score is
 * multiplied by the corresponding factor.
 */
export function getServiceGateMultiplier(serviceScore: number): number {
  if (serviceScore === 0) return 0.0; // Hard kill — explicitly wrong industry
  if (serviceScore <= 20) return 0.4; // Completely unrelated services
  if (serviceScore <= 40) return 0.6; // Weak adjacency at best
  if (serviceScore <= 60) return 0.8; // Partial overlap, some adjacency
  if (serviceScore <= 80) return 0.9; // Good alignment, minor gaps
  return 1.0; // Strong or exact service match
}

/**
 * Buyer type priority order for ranking among equally-scored buyers.
 * Lower number = higher priority.
 *
 * 1. PE-backed platforms — highest-probability introductions
 * 2. PE firms & family offices — financial sponsors with capital
 * 3. Independent sponsors & search funds — need to raise per-deal
 * 4. Non-PE operating companies — legitimate but lower priority
 */
export function getBuyerTypePriority(buyerType: string | null, isPeBacked: boolean): number {
  // PE-backed platform company (corporate with PE backing)
  if (buyerType === 'corporate' && isPeBacked) return 1;

  // PE firm
  if (buyerType === 'private_equity') return 2;

  // Family office
  if (buyerType === 'family_office') return 2;

  // Independent sponsor
  if (buyerType === 'independent_sponsor') return 3;

  // Search fund
  if (buyerType === 'search_fund') return 3;

  // Non-PE operating company (corporate without PE backing)
  if (buyerType === 'corporate') return 4;

  // Individual buyer or unknown
  return 5;
}
