import { cn } from '@/lib/utils';
import { MapPin, Briefcase, Target, TrendingUp, Building2, Settings2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface ScoreBreakdownProps {
  geography: number;
  size: number;
  service: number;
  ownerGoals: number;
  acquisition?: number;
  portfolio?: number;
  businessModel?: number;
  thesisBonus?: number;
  weights?: {
    geography: number;
    size: number;
    service: number;
    ownerGoals: number;
  };
  showWeights?: boolean;
  showSecondary?: boolean;
  compact?: boolean;
  className?: string;
}

const getScoreColor = (score: number) => {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 70) return 'text-lime-600';
  if (score >= 60) return 'text-amber-600';
  if (score >= 50) return 'text-orange-600';
  return 'text-red-600';
};

const getScoreBgColor = (score: number) => {
  if (score >= 80) return 'bg-emerald-100';
  if (score >= 70) return 'bg-lime-100';
  if (score >= 60) return 'bg-amber-100';
  if (score >= 50) return 'bg-orange-100';
  return 'bg-red-100';
};

const primaryCategories = [
  { key: 'service', label: 'Services', icon: Briefcase },
  { key: 'geography', label: 'Geography', icon: MapPin },
  { key: 'ownerGoals', label: 'Owner Goals', icon: Target },
] as const;

const secondaryCategories = [
  { key: 'acquisition', label: 'Acquisition Fit', icon: TrendingUp },
  { key: 'portfolio', label: 'Portfolio Synergy', icon: Building2 },
  { key: 'businessModel', label: 'Business Model', icon: Settings2 },
] as const;

export const ScoreBreakdown = ({
  geography,
  size,
  service,
  ownerGoals,
  acquisition,
  portfolio,
  businessModel,
  thesisBonus,
  weights,
  showWeights = false,
  showSecondary = true,
  compact = false,
  className,
}: ScoreBreakdownProps) => {
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const scores = { geography, size, service, ownerGoals, acquisition, portfolio, businessModel };
  const defaultWeights = { geography: 30, size: 0, service: 45, ownerGoals: 25 };
  const actualWeights = weights || defaultWeights;

  const hasSecondaryScores =
    acquisition !== undefined || portfolio !== undefined || businessModel !== undefined;

  if (compact) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        {primaryCategories.map(({ key, label: _label, icon: Icon }) => {
          const score = scores[key];
          return (
            <div key={key} className="flex items-center gap-1">
              <Icon className="h-3 w-3 text-muted-foreground" />
              <span className={cn('text-sm font-medium', getScoreColor(score))}>
                {Math.round(score)}
              </span>
            </div>
          );
        })}
        {thesisBonus != null && thesisBonus > 0 && (
          <div className="flex items-center gap-1 text-primary">
            <span className="text-xs">+{thesisBonus}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Primary Scores */}
      <div className="grid grid-cols-3 gap-3">
        {primaryCategories.map(({ key, label, icon: Icon }) => {
          const score = scores[key];
          const weight = actualWeights[key];

          return (
            <div key={key} className={cn('rounded-lg p-3', getScoreBgColor(score))}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={cn('text-xl font-bold', getScoreColor(score))}>
                  {Math.round(score)}
                </span>
                {showWeights && <span className="text-xs text-muted-foreground">({weight}%)</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Thesis Bonus */}
      {thesisBonus != null && thesisBonus > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 text-primary">
          <TrendingUp className="h-4 w-4" />
          <span className="text-sm font-medium">Thesis Match Bonus: +{thesisBonus} points</span>
        </div>
      )}

      {/* Secondary Scores (Collapsible) */}
      {showSecondary && hasSecondaryScores && (
        <Collapsible open={secondaryOpen} onOpenChange={setSecondaryOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', secondaryOpen && 'rotate-180')}
            />
            <span>Advanced Scoring Factors</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-3 gap-3">
              {secondaryCategories.map(({ key, label, icon: Icon }) => {
                const score = scores[key];
                if (score === undefined) return null;

                return (
                  <div key={key} className={cn('rounded-lg p-3 border', getScoreBgColor(score))}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    </div>
                    <span className={cn('text-lg font-bold', getScoreColor(score))}>
                      {Math.round(score)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

export default ScoreBreakdown;
