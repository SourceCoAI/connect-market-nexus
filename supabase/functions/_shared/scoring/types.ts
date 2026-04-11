// ── Scoring types & constants ──
// Shared across score-deal-buyers, process-scoring-queue, and any future
// consumer of the buyer-scoring pipeline.

import { normalizeBuyerType } from '../buyer-type-definitions.ts';

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
  platform_website: string | null;
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
  /** Whether this buyer is publicly traded */
  is_publicly_traded?: boolean | null;
  /** Summary of transcript-extracted insights (when available) */
  transcript_summary?: string;
}

/** Inbound request shape for the score-deal-buyers edge function. */
export interface ScoreRequest {
  listingId: string;
  forceRefresh?: boolean;
  /** When provided, returns the full scoring breakdown for this specific buyer */
  lookupBuyerId?: string;
}

/**
 * Default relative weights for each scoring dimension (must sum to 1.0).
 *
 * v3 — EBITDA size removed (unreliable for most buyers, inflated scores
 * for wrong-industry matches). Service fit is the dominant signal.
 *
 * v4 — Bonus removed. Bonus signals (fee agreement, appetite, acquisitions)
 * biased recommendations toward existing relationships rather than best-fit
 * buyers. These signals are now display-only badges on the card.
 *
 * H-1 FIX: These are now defaults that can be overridden by per-universe weights.
 *
 * Previous weights for reference:
 *   v1: service: 0.4, geography: 0.3, size: 0.2, bonus: 0.1
 *   v2: service: 0.6, geography: 0.15, size: 0.10, bonus: 0.15
 *   v3: service: 0.7, geography: 0.15, bonus: 0.15
 */
export const DEFAULT_SCORE_WEIGHTS = {
  service: 0.8,
  geography: 0.2,
} as const;

/** @deprecated Use DEFAULT_SCORE_WEIGHTS and getScoreWeights() instead */
export const SCORE_WEIGHTS = DEFAULT_SCORE_WEIGHTS;

/** Mutable weights that can be customized per-universe. */
export interface ScoreWeights {
  service: number;
  geography: number;
}

/**
 * H-1 FIX: Build scoring weights from universe config, falling back to defaults.
 * Universe weights are stored as percentages (e.g., 45 for 45%), converted to decimals.
 *
 * v4: owner_goals_weight (bonus) is accepted for backwards compatibility but ignored.
 * Only service and geography weights affect scoring.
 */
export function getScoreWeights(
  universeWeights?: {
    service_weight?: number | null;
    geography_weight?: number | null;
    owner_goals_weight?: number | null;
  } | null,
): ScoreWeights {
  if (!universeWeights) return { ...DEFAULT_SCORE_WEIGHTS };

  const svc = universeWeights.service_weight;
  const geo = universeWeights.geography_weight;

  // Only use universe weights if both are provided
  if (svc != null && geo != null) {
    const total = svc + geo;
    if (total > 0) {
      return {
        service: svc / total,
        geography: geo / total,
      };
    }
  }

  return { ...DEFAULT_SCORE_WEIGHTS };
}

/**
 * Service fit gate multiplier — crushes composite score for buyers with
 * poor service fit, preventing wrong-industry buyers from ranking high
 * due to geography, fee agreements, or other signals.
 *
 * If service_score falls in a range, the ENTIRE composite score is
 * multiplied by the corresponding factor.
 */
export function getServiceGateMultiplier(serviceScore: number, noData?: boolean): number {
  if (serviceScore === 0) {
    if (noData) return 0.3; // No data — apply penalty but don't eliminate
    return 0.0; // Hard kill — explicitly wrong industry
  }
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
  // Normalize legacy buyer type strings (e.g. 'pe_firm' → 'private_equity')
  const normalized = normalizeBuyerType(buyerType);

  // PE-backed platform company (corporate with PE backing)
  if (normalized === 'corporate' && isPeBacked) return 1;

  // PE firm
  if (normalized === 'private_equity') return 2;

  // Family office
  if (normalized === 'family_office') return 2;

  // Independent sponsor
  if (normalized === 'independent_sponsor') return 3;

  // Search fund
  if (normalized === 'search_fund') return 3;

  // Non-PE operating company (corporate without PE backing)
  if (normalized === 'corporate') return 4;

  // Individual buyer or unknown
  return 5;
}
