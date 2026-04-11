import { Card, CardContent } from '@/components/ui/card';
import { Building2, Star, Target, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';

type KpiFilter = 'priority' | 'needs_scoring' | null;

interface SourceCoKPICardsProps {
  totalDeals: number;
  priorityDeals: number;
  avgScore: number;
  needsScoring: number;
  activeFilter?: KpiFilter;
  onCardClick?: (filter: KpiFilter) => void;
}

export function SourceCoKPICards({
  totalDeals,
  priorityDeals,
  avgScore,
  needsScoring,
  activeFilter,
  onCardClick,
}: SourceCoKPICardsProps) {
  const clickable = !!onCardClick;

  return (
    <div className="grid grid-cols-4 gap-4">
      <Card
        className={cn(
          clickable && 'cursor-pointer transition-shadow hover:shadow-md',
          activeFilter === null && clickable && 'ring-2 ring-cyan-500',
        )}
        onClick={() => onCardClick?.(activeFilter === null ? null : null)}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 rounded-lg">
              <Building2 className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Opportunities</p>
              <p className="text-2xl font-bold">{totalDeals}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card
        className={cn(
          clickable && 'cursor-pointer transition-shadow hover:shadow-md',
          activeFilter === 'priority' && 'ring-2 ring-amber-500',
        )}
        onClick={() => onCardClick?.(activeFilter === 'priority' ? null : 'priority')}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Star className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Priority Opportunities</p>
              <p className="text-2xl font-bold text-amber-600">{priorityDeals}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Target className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Quality Score</p>
              <p className="text-2xl font-bold">
                {avgScore}
                <span className="text-base font-normal text-muted-foreground">/100</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card
        className={cn(
          clickable && 'cursor-pointer transition-shadow hover:shadow-md',
          activeFilter === 'needs_scoring' && 'ring-2 ring-cyan-500',
        )}
        onClick={() => onCardClick?.(activeFilter === 'needs_scoring' ? null : 'needs_scoring')}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 rounded-lg">
              <Calculator className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Needs Scoring</p>
              <p className="text-2xl font-bold text-cyan-600">{needsScoring}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
