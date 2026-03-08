/**
 * BuyerMatchScoreSection.tsx
 *
 * Score display utilities and the inline score breakdown panel for BuyerMatchCard.
 * Includes composite score ring, sub-score grid, tier labels, fit reasoning,
 * disqualification detection, and missing-data analysis.
 *
 * Extracted from BuyerMatchCard.tsx for maintainability.
 */
import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import type { ReMarketingBuyer } from '@/types/remarketing';

// ─── Score color helpers ───

export const getScoreColorClass = (score: number) => {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-500';
};

export const getScoreDot = (score: number) => {
  if (score < 50) return <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1" />;
  return null;
};

// ─── Disqualification logic ───

/** Determine if buyer is disqualified (prefer backend field, fallback to heuristic) */
export const isDisqualified = (scoreData: {
  composite_score: number;
  is_disqualified?: boolean | null;
  fit_reasoning?: string | null;
}) => {
  if (scoreData.is_disqualified != null) return scoreData.is_disqualified;
  if (scoreData.composite_score < 35) return true;
  if (scoreData.fit_reasoning?.toLowerCase().includes('disqualified')) return true;
  return false;
};

/**
 * Get disqualification reason from reasoning text.
 * Uses specific patterns to avoid over-triggering.
 */
export const getDisqualificationReason = (reasoning: string | null, score?: any): string => {
  if (!reasoning) return 'criteria mismatch';
  const lower = reasoning.toLowerCase();

  // Check for explicit missing data flag first (highest priority)
  if (lower.includes('[missing_data:')) {
    return 'insufficient data';
  }

  // Check for explicit disqualification patterns (specific language from enforceHardRules)
  if (
    lower.includes('disqualified: deal revenue') ||
    lower.includes('below buyer minimum') ||
    lower.includes('below minimum')
  ) {
    return 'size mismatch';
  }
  if (lower.includes('dealbreaker: deal includes excluded')) {
    return 'excluded criteria';
  }
  if (lower.includes('geography strict:') || lower.includes('not in buyer targets')) {
    return 'geography mismatch';
  }

  // Use individual scores to determine the weakest dimension (more accurate than keyword matching)
  if (score) {
    const dimensions = [
      { name: 'no nearby presence', score: score.geography_score ?? 100 },
      { name: 'service mismatch', score: score.service_score ?? 100 },
      { name: 'owner goals mismatch', score: score.owner_goals_score ?? 100 },
    ];
    const weakest = dimensions.reduce((min, d) => (d.score < min.score ? d : min), dimensions[0]);
    if (weakest.score < 40) {
      return weakest.name;
    }
  }

  // Fallback to keyword matching with more specific patterns
  if (
    lower.includes('no nearby presence') ||
    lower.includes('no presence in') ||
    lower.includes('distant')
  ) {
    return 'no nearby presence';
  }
  if (
    lower.includes('too small') ||
    lower.includes('too large') ||
    lower.includes('size multiplier: ')
  ) {
    return 'size mismatch';
  }
  if (
    lower.includes('no service overlap') ||
    lower.includes('0% overlap') ||
    lower.includes('weak service')
  ) {
    return 'service mismatch';
  }
  return 'criteria mismatch';
};

// ─── Missing data analysis ───

/** Calculate missing data fields (Whispers parity) */
export const getMissingDataFields = (buyer?: ReMarketingBuyer): string[] => {
  const missing: string[] = [];
  if (!buyer) return ['All buyer data'];

  if ((!buyer.geographic_footprint || buyer.geographic_footprint.length === 0) && !buyer.hq_state) {
    missing.push('HQ location');
  }
  if (!buyer.target_geographies || buyer.target_geographies.length === 0) {
    missing.push('Target geographies');
  }
  if (!buyer.target_revenue_min && !buyer.target_revenue_max) {
    missing.push('Target revenue range');
  }
  if (!buyer.thesis_summary) {
    missing.push('Investment thesis');
  }
  if (!buyer.target_services || buyer.target_services.length === 0) {
    missing.push('Target services');
  }
  if (!buyer.acquisition_appetite) {
    missing.push('Acquisition appetite');
  }
  if (!buyer.recent_acquisitions || buyer.recent_acquisitions.length === 0) {
    missing.push('Recent acquisitions');
  }
  if (!buyer.extraction_sources?.some((s) => s.type === 'transcript')) {
    missing.push('Call quotes');
  }

  return missing;
};

// ─── Display helpers ───

/** Get buyer location display (prefer HQ city/state) */
export const getBuyerLocationDisplay = (buyer?: ReMarketingBuyer): string => {
  if (!buyer) return 'Unknown';
  if (buyer.hq_city && buyer.hq_state) {
    return `${buyer.hq_city}, ${buyer.hq_state}`;
  }
  if (buyer.geographic_footprint && buyer.geographic_footprint.length > 0) {
    return buyer.geographic_footprint.slice(0, 2).join(', ');
  }
  return 'Unknown';
};

/** Get score description for tooltip (aligned with spec tier bands) */
export const getScoreDescription = (score: number, disqualified: boolean): string => {
  if (disqualified) return 'Does not meet minimum criteria - not recommended';
  if (score >= 80) return 'Excellent alignment on key criteria - strong candidate';
  if (score >= 65) return 'Good alignment - solid candidate for outreach';
  if (score >= 50) return 'Partial alignment - worth considering';
  if (score >= 35) return 'Limited alignment - review carefully';
  return 'No alignment - not recommended';
};

export const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return null;
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(0)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value}`;
};

/** Get fit label based on score (aligned with spec tier bands) */
export const getFitLabel = (score: number, disqualified: boolean): string => {
  if (disqualified) return 'DISQUALIFIED:';
  if (score >= 80) return 'Strong fit:';
  if (score >= 65) return 'Good fit:';
  if (score >= 50) return 'Fair fit:';
  return 'Poor fit:';
};

/** Determine reasoning panel background */
export const getReasoningBackground = (compositeScore: number, disqualified: boolean) => {
  if (disqualified) return 'bg-red-50 border-red-200';
  if (compositeScore >= 80) return 'bg-emerald-50 border-emerald-200';
  if (compositeScore >= 65) return 'bg-blue-50 border-blue-200';
  if (compositeScore >= 50) return 'bg-amber-50 border-amber-200';
  return 'bg-muted/50 border-border';
};

/** Score ring color */
export const getScoreRingColor = (compositeScore: number, disqualified: boolean) => {
  if (disqualified) return 'border-red-300 bg-red-50 text-red-600';
  if (compositeScore >= 80) return 'border-emerald-400 bg-emerald-50 text-emerald-700';
  if (compositeScore >= 65) return 'border-blue-400 bg-blue-50 text-blue-700';
  if (compositeScore >= 50) return 'border-amber-400 bg-amber-50 text-amber-700';
  if (compositeScore >= 35) return 'border-orange-400 bg-orange-50 text-orange-600';
  return 'border-red-300 bg-red-50 text-red-600';
};

export const getTierLabel = (compositeScore: number, disqualified: boolean) => {
  if (disqualified) return 'DQ';
  if (compositeScore >= 80) return 'A';
  if (compositeScore >= 65) return 'B';
  if (compositeScore >= 50) return 'C';
  if (compositeScore >= 35) return 'D';
  return 'F';
};

// ─── Score Breakdown Panel ───

interface ScoreBreakdownPanelProps {
  score: {
    composite_score: number;
    geography_score: number;
    service_score: number;
    owner_goals_score: number;
    size_multiplier?: number | null;
    service_multiplier?: number | null;
    thesis_alignment_bonus?: number | null;
    needs_review?: boolean | null;
    fit_reasoning: string | null;
  };
  disqualified: boolean;
  buyerFootprint: string;
  dealLocation?: string;
}

export const ScoreBreakdownPanel = ({
  score,
  disqualified,
  buyerFootprint,
  dealLocation,
}: ScoreBreakdownPanelProps) => {
  return (
    <>
      {/* AI Reasoning with Fit Label */}
      <p className={cn('text-sm mb-4', disqualified ? 'text-red-700' : 'text-foreground')}>
        {getFitLabel(score.composite_score, disqualified)}{' '}
        {score.fit_reasoning || 'No reasoning available'}
      </p>

      {/* Inline Score Breakdown - Services (45%), Geography (30%), Owner Goals (25%) */}
      <div className="grid grid-cols-3 gap-4 mb-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            Services
            {score.service_multiplier != null && score.service_multiplier < 1.0 && (
              <span className="ml-1 text-orange-600">
                ({(score.service_multiplier * 100).toFixed(0)}% gate)
              </span>
            )}
          </p>
          <p className={cn('text-lg font-bold', getScoreColorClass(score.service_score))}>
            {getScoreDot(score.service_score)}
            {Math.round(score.service_score)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Geography</p>
          <p className={cn('text-lg font-bold', getScoreColorClass(score.geography_score))}>
            {getScoreDot(score.geography_score)}
            {Math.round(score.geography_score)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Owner Goals</p>
          <p className={cn('text-lg font-bold', getScoreColorClass(score.owner_goals_score))}>
            {getScoreDot(score.owner_goals_score)}
            {Math.round(score.owner_goals_score)}%
          </p>
        </div>
      </div>

      {/* Thesis Alignment Bonus */}
      {score.thesis_alignment_bonus != null && score.thesis_alignment_bonus > 0 && (
        <p className="text-xs text-primary mb-2">
          +{score.thesis_alignment_bonus} thesis alignment bonus
        </p>
      )}

      {/* Needs Review Badge */}
      {score.needs_review && (
        <div className="flex items-center gap-2 text-xs text-amber-600 mb-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Needs review — borderline score</span>
        </div>
      )}

      {/* Buyer Footprint Context */}
      <p className="text-xs text-muted-foreground">
        Buyer footprint: {buyerFootprint} → Deal: {dealLocation || 'Unknown'}
      </p>

      {/* Disqualification Warning */}
      {disqualified &&
        (() => {
          const reason = getDisqualificationReason(score.fit_reasoning, score);
          const isDataIssue = reason === 'insufficient data';
          return (
            <div
              className={`mt-3 flex items-center gap-2 text-xs ${isDataIssue ? 'text-amber-600' : 'text-red-600'}`}
            >
              <AlertCircle className="h-4 w-4" />
              <span>
                {isDataIssue
                  ? 'Low confidence — insufficient data for scoring'
                  : `Reason: ${reason}`}
              </span>
            </div>
          );
        })()}
    </>
  );
};
