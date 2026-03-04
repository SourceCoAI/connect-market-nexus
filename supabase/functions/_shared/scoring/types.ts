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
  size_score: number;
  bonus_score: number;
  fit_signals: string[];
  fit_reason: string;
  tier: Tier;
  source: BuyerSource;
}

/** Inbound request shape for the score-deal-buyers edge function. */
export interface ScoreRequest {
  listingId: string;
  forceRefresh?: boolean;
}

/**
 * Relative weights for each scoring dimension (must sum to 1.0).
 * v1 -- hardcoded; a future version may make these configurable per-deal.
 */
export const SCORE_WEIGHTS = {
  service: 0.4,
  geography: 0.3,
  size: 0.2,
  bonus: 0.1,
} as const;

/** Convenience type for the weights object. */
export type ScoreWeights = typeof SCORE_WEIGHTS;
