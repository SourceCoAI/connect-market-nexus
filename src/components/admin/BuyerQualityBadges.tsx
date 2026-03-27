import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const TIER_LABELS: Record<number, string> = {
  1: 'Platform Add-On',
  2: 'Committed Capital',
  3: 'Indep. Sponsor',
  4: 'Unverified',
};

const TIER_DESCRIPTIONS: Record<number, string> = {
  1: 'Verified buyer with active platform — highest acquisition intent',
  2: 'Buyer with committed capital and verified fund',
  3: 'Independent sponsor or search fund — flexible capital',
  4: 'Unverified or incomplete buyer profile',
};

export function BuyerTierBadge({
  tier,
  isOverride,
}: {
  tier?: number | null;
  isOverride?: boolean;
}) {
  if (tier == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const label = TIER_LABELS[tier] || TIER_LABELS[4];
  const description = TIER_DESCRIPTIONS[tier] || TIER_DESCRIPTIONS[4];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 cursor-default">
            {isOverride && <span className="text-[10px] text-muted-foreground">★</span>}
            <span className="text-xs font-semibold text-foreground">T{tier}</span>
            <span className="text-[11px] text-muted-foreground">{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px]">
          <p className="text-xs font-medium">Tier {tier}: {label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          {isOverride && (
            <p className="text-[10px] text-muted-foreground mt-1 italic">★ Admin override</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function BuyerTierBadgeFull({
  tier,
  isOverride,
}: {
  tier?: number | null;
  isOverride?: boolean;
}) {
  if (tier == null) {
    return <span className="text-xs text-muted-foreground">Not scored</span>;
  }
  const label = TIER_LABELS[tier] || TIER_LABELS[4];
  return (
    <span className="inline-flex items-center gap-1.5">
      {isOverride && <span className="text-[10px] text-muted-foreground">★</span>}
      <span className="text-sm font-semibold text-foreground">Tier {tier}</span>
      <span className="text-sm text-muted-foreground">· {label}</span>
    </span>
  );
}

export function BuyerScoreBadge({ score, size = 'sm', showLabel = false }: { score?: number | null; size?: 'sm' | 'md' | 'lg' | 'xl'; showLabel?: boolean }) {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const dotColor = score >= 70
    ? 'bg-emerald-500'
    : score >= 40
      ? 'bg-amber-400'
      : 'bg-muted-foreground/40';

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-2xl',
  };

  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2 h-2',
    xl: 'w-2.5 h-2.5',
  };

  const getScoreLabel = (s: number) => {
    if (s >= 70) return 'Strong';
    if (s >= 40) return 'Moderate';
    return 'Weak';
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex flex-col items-center gap-0 cursor-default">
            {showLabel && <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-none mb-0.5">Score</span>}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 font-semibold text-foreground tabular-nums',
                sizeClasses[size],
              )}
            >
              <span className={cn('rounded-full shrink-0', dotColor, dotSizes[size])} />
              {score}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px]">
          <p className="text-xs font-medium">Quality Score: {score}/100 — {getScoreLabel(score)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Computed from buyer type, capital verification, profile completeness, and acquisition signals.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
