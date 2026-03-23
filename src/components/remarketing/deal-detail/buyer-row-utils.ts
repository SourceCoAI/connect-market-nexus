import type { BuyerScore } from '@/hooks/admin/use-new-recommended-buyers';
import type { BuyerIntroduction, ScoreSnapshot } from '@/types/buyer-introductions';
import {
  STATUS_CONFIG,
  TIER_CONFIG,
  SOURCE_BADGE,
  formatBuyerType,
} from './buyer-introduction-constants';

/**
 * Resolves display data for a buyer row by merging live score, persisted snapshot,
 * and raw introduction fields in priority order.
 */
export function resolveBuyerDisplayData(buyer: BuyerIntroduction, score?: BuyerScore) {
  const snap = buyer.score_snapshot as ScoreSnapshot | null;

  const displayName = score?.company_name || buyer.buyer_name;
  const firmName =
    score?.pe_firm_name ||
    snap?.pe_firm_name ||
    (buyer.buyer_firm_name !== buyer.buyer_name ? buyer.buyer_firm_name : null);
  const firmId = score?.pe_firm_id || snap?.pe_firm_id || null;

  const location = score
    ? score.hq_city && score.hq_state
      ? `${score.hq_city}, ${score.hq_state}`
      : score.hq_state || formatBuyerType(score.buyer_type)
    : snap
      ? snap.hq_city && snap.hq_state
        ? `${snap.hq_city}, ${snap.hq_state}`
        : snap.hq_state || formatBuyerType(snap.buyer_type)
      : '';

  const fitReason = score?.fit_reason || snap?.fit_reason || buyer.targeting_reason;
  const fitSignals = score?.fit_signals || snap?.fit_signals || [];
  const tierKey = score?.tier || snap?.tier;
  const tier = tierKey ? TIER_CONFIG[tierKey] : null;
  const sourceKey = score?.source || snap?.source;
  const sourceBadge = sourceKey ? SOURCE_BADGE[sourceKey] || SOURCE_BADGE.scored : null;
  const compositeScore = score?.composite_score ?? snap?.composite_score;
  const hasFeeAgreement = score?.has_fee_agreement ?? snap?.has_fee_agreement ?? false;
  const companyWebsite = score?.platform_website || score?.company_website || snap?.platform_website || snap?.company_website || null;
  const isPubliclyTraded = score?.is_publicly_traded ?? snap?.is_publicly_traded ?? false;
  const statusConfig = STATUS_CONFIG[buyer.introduction_status as keyof typeof STATUS_CONFIG];

  return {
    displayName,
    firmName,
    firmId,
    location,
    fitReason,
    fitSignals,
    tier,
    sourceBadge,
    compositeScore,
    hasFeeAgreement,
    companyWebsite,
    isPubliclyTraded,
    statusConfig,
  };
}

export type BuyerDisplayData = ReturnType<typeof resolveBuyerDisplayData>;
