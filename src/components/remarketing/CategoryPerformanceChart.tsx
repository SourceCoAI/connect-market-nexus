import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Briefcase, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CategoryPerformanceChartProps {
  data: {
    geography: number;
    service: number;
    ownerGoals: number;
  };
  className?: string;
}

const categories = [
  {
    key: 'geography' as const,
    label: 'Geography Match',
    icon: MapPin,
    description: 'Location alignment with buyer criteria',
  },
  {
    key: 'service' as const,
    label: 'Service Alignment',
    icon: Briefcase,
    description: 'Industry and service type match',
  },
  {
    key: 'ownerGoals' as const,
    label: 'Owner Goals',
    icon: Target,
    description: 'Transition and outcome expectations',
  },
];

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 70) return 'text-blue-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function getProgressColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 70) return 'bg-blue-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

export function CategoryPerformanceChart({ data, className }: CategoryPerformanceChartProps) {
  const avgScore = Math.round((data.geography + data.service + data.ownerGoals) / 3);

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Category Performance
          </CardTitle>
          <div className="text-right">
            <p className={cn('text-2xl font-bold', getScoreColor(avgScore))}>{avgScore}</p>
            <p className="text-xs text-muted-foreground">Avg. Score</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {categories.map(({ key, label, icon: Icon, description }) => {
          const score = data[key];
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{label}</span>
                </div>
                <span className={cn('font-bold', getScoreColor(score))}>{score}</span>
              </div>
              <div className="relative">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      getProgressColor(score),
                    )}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          );
        })}

        {/* Insights */}
        <div className="pt-4 border-t space-y-2">
          <p className="text-sm font-medium">Insights</p>
          {data.geography >= 80 && (
            <p className="text-xs text-emerald-600">
              ✓ Strong geographic alignment with buyer targets
            </p>
          )}
          {data.service >= 75 && data.ownerGoals >= 75 && (
            <p className="text-xs text-blue-600">
              → Service and goals alignment driving quality matches
            </p>
          )}
          {avgScore < 60 && (
            <p className="text-xs text-red-600">
              ✗ Consider expanding buyer criteria for more matches
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
