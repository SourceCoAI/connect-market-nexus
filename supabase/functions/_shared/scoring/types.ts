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
 * Default relative weights for each scoring dimension (must sum to 1.0).
 * H-1 FIX: These are now defaults that can be overridden by per-universe weights.
 */
export const DEFAULT_SCORE_WEIGHTS = {
  service: 0.4,
  geography: 0.3,
  size: 0.2,
  bonus: 0.1,
} as const;

/** @deprecated Use DEFAULT_SCORE_WEIGHTS and getScoreWeights() instead */
export const SCORE_WEIGHTS = DEFAULT_SCORE_WEIGHTS;

/** Mutable weights that can be customized per-universe. */
export interface ScoreWeights {
  service: number;
  geography: number;
  size: number;
  bonus: number;
}

/**
 * H-1 FIX: Build scoring weights from universe config, falling back to defaults.
 * Universe weights are stored as percentages (e.g., 45 for 45%), converted to decimals.
 */
export function getScoreWeights(
  universeWeights?: {
    service_weight?: number | null;
    geography_weight?: number | null;
    size_weight?: number | null;
    owner_goals_weight?: number | null;
  } | null,
): ScoreWeights {
  if (!universeWeights) return { ...DEFAULT_SCORE_WEIGHTS };

  const svc = universeWeights.service_weight;
  const geo = universeWeights.geography_weight;
  const sz = universeWeights.size_weight;
  const bonus = universeWeights.owner_goals_weight;

  // Only use universe weights if all are provided
  if (svc != null && geo != null && sz != null && bonus != null) {
    const total = svc + geo + sz + bonus;
    if (total > 0) {
      return {
        service: svc / total,
        geography: geo / total,
        size: sz / total,
        bonus: bonus / total,
      };
    }
  }

  return { ...DEFAULT_SCORE_WEIGHTS };
}
