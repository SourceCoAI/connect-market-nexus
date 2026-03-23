import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Sliders, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScoreRecord {
  composite_score: number;
  tier: string;
  geography_score?: number;
  service_score?: number;
  owner_goals_score?: number;
}

interface ScoreCalibrationChartProps {
  scores: ScoreRecord[];
  targetTierAPercentage?: number;
  className?: string;
}

const tierColors: Record<string, string> = {
  A: 'hsl(142, 76%, 36%)', // emerald
  B: 'hsl(221, 83%, 53%)', // blue
  C: 'hsl(38, 92%, 50%)', // amber
  D: 'hsl(0, 72%, 51%)', // red
};

export function ScoreCalibrationChart({
  scores,
  targetTierAPercentage = 20,
  className,
}: ScoreCalibrationChartProps) {
  const { distribution, categoryStats, tierStats } = useMemo(() => {
    // Create score distribution buckets (0-10, 10-20, etc.)
    const buckets: Record<
      string,
      { count: number; tierA: number; tierB: number; tierC: number; tierD: number }
    > = {};
    for (let i = 0; i <= 90; i += 10) {
      buckets[`${i}-${i + 10}`] = { count: 0, tierA: 0, tierB: 0, tierC: 0, tierD: 0 };
    }

    scores.forEach((score) => {
      const bucket = Math.floor(score.composite_score / 10) * 10;
      const key = `${bucket}-${bucket + 10}`;
      if (buckets[key]) {
        buckets[key].count++;
        if (score.tier === 'A') buckets[key].tierA++;
        else if (score.tier === 'B') buckets[key].tierB++;
        else if (score.tier === 'C') buckets[key].tierC++;
        else buckets[key].tierD++;
      }
    });

    const dist = Object.entries(buckets).map(([range, data]) => ({
      range,
      count: data.count,
      tierA: data.tierA,
      tierB: data.tierB,
      tierC: data.tierC,
      tierD: data.tierD,
      dominantTier: data.tierA > 0 ? 'A' : data.tierB > 0 ? 'B' : data.tierC > 0 ? 'C' : 'D',
    }));

    // Category averages
    const catStats = {
      geography:
        scores.reduce((sum, s) => sum + (s.geography_score || 0), 0) / (scores.length || 1),
      service: scores.reduce((sum, s) => sum + (s.service_score || 0), 0) / (scores.length || 1),
      ownerGoals:
        scores.reduce((sum, s) => sum + (s.owner_goals_score || 0), 0) / (scores.length || 1),
    };

    // Tier stats
    const tierA = scores.filter((s) => s.tier === 'A').length;
    const tierB = scores.filter((s) => s.tier === 'B').length;
    const tierC = scores.filter((s) => s.tier === 'C').length;
    const tierD = scores.filter((s) => s.tier === 'D').length;

    return {
      distribution: dist,
      categoryStats: catStats,
      tierStats: {
        tierA: { count: tierA, percentage: (tierA / (scores.length || 1)) * 100 },
        tierB: { count: tierB, percentage: (tierB / (scores.length || 1)) * 100 },
        tierC: { count: tierC, percentage: (tierC / (scores.length || 1)) * 100 },
        tierD: { count: tierD, percentage: (tierD / (scores.length || 1)) * 100 },
      },
    };
  }, [scores]);

  const isCalibrated = Math.abs(tierStats.tierA.percentage - targetTierAPercentage) < 5;

  if (scores.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
          No scores to calibrate
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5" />
              Score Calibration
            </CardTitle>
            <CardDescription>
              Distribution of {scores.length.toLocaleString()} scores by tier
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              isCalibrated
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200',
            )}
          >
            <Target className="h-3 w-3 mr-1" />
            {isCalibrated ? 'Well Calibrated' : 'Needs Tuning'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribution} barCategoryGap="10%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="range"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value, name) => [value, name]}
                labelFormatter={(label) => `Score Range: ${label}`}
              />
              <Bar dataKey="tierA" stackId="a" name="Tier A" fill={tierColors.A} />
              <Bar dataKey="tierB" stackId="a" name="Tier B" fill={tierColors.B} />
              <Bar dataKey="tierC" stackId="a" name="Tier C" fill={tierColors.C} />
              <Bar
                dataKey="tierD"
                stackId="a"
                name="Tier D"
                fill={tierColors.D}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tier Breakdown */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Tier Distribution</span>
            <span className="text-xs text-muted-foreground">
              Target: {targetTierAPercentage}% Tier A
            </span>
          </div>
          <div className="flex gap-2">
            {(['A', 'B', 'C', 'D'] as const).map((tier) => (
              <div
                key={tier}
                className="flex-1 p-2 rounded-lg text-center"
                style={{ backgroundColor: `${tierColors[tier]}20` }}
              >
                <div className="text-lg font-bold" style={{ color: tierColors[tier] }}>
                  {tierStats[`tier${tier}` as keyof typeof tierStats].percentage.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Tier {tier}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Performance */}
        <div className="mt-4 pt-4 border-t">
          <span className="text-sm font-medium mb-3 block">Category Averages</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'geography', label: 'Geography' },
              { key: 'service', label: 'Service' },
              { key: 'ownerGoals', label: 'Goals' },
            ].map((cat) => (
              <div key={cat.key} className="text-center">
                <div className="text-lg font-semibold">
                  {Math.round(categoryStats[cat.key as keyof typeof categoryStats])}
                </div>
                <div className="text-xs text-muted-foreground">{cat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ScoreCalibrationChart;
