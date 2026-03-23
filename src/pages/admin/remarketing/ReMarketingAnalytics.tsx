import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useReMarketingAnalytics } from '@/hooks/useReMarketingAnalytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MatchingFunnel,
  TierDistributionChart,
  ScoringTrendsChart,
  CategoryPerformanceChart,
  UniversePerformanceTable,
  DecisionHistoryChart,
  ScoreCalibrationChart,
} from '@/components/remarketing';
import {
  BarChart3,
  Users,
  Target,
  TrendingUp,
  Activity,
  RefreshCw,
  ArrowLeft,
  Brain,
  Sliders,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { TimeframeSelector } from '@/components/filters/TimeframeSelector';
import { useTimeframe } from '@/hooks/use-timeframe';
import { differenceInDays } from 'date-fns';

const ReMarketingAnalytics = () => {
  const { timeframe, setTimeframe, dateRange } = useTimeframe('last_30d');
  // Compute daysBack for backward compat with hooks that expect a number
  const daysBack = dateRange.from ? differenceInDays(new Date(), dateRange.from) : 365;
  const [activeTab, setActiveTab] = useState('overview');
  const { data, isLoading, error, refetch } = useReMarketingAnalytics(daysBack);

  // Fetch learning history for decision chart
  const { data: learningHistory } = useQuery({
    queryKey: ['remarketing', 'learning-history', daysBack],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyer_learning_history')
        .select('action, created_at, composite_score, pass_category')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch all scores for calibration chart
  const { data: allScores } = useQuery({
    queryKey: ['remarketing', 'all-scores-calibration'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_scores')
        .select('composite_score, tier, geography_score, service_score, owner_goals_score');
      if (error) throw error;
      return data;
    },
  });

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-destructive mb-4">Failed to load analytics data</p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/remarketing">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Remarketing Analytics</h1>
            <p className="text-muted-foreground text-sm">Performance metrics and funnel analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TimeframeSelector value={timeframe} onChange={setTimeframe} compact />
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading ? (
          Array(4)
            .fill(0)
            .map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Target className="h-4 w-4" />
                  <span className="text-sm">Total Scores</span>
                </div>
                <p className="text-2xl font-bold">{data?.summary.totalScores.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  +{data?.summary.scoresLast7Days} this week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm">Avg Score</span>
                </div>
                <p className="text-2xl font-bold">{data?.summary.avgCompositeScore}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data?.summary.tierAPercentage.toFixed(1)}% Tier A
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="h-4 w-4" />
                  <span className="text-sm">Buyers</span>
                </div>
                <p className="text-2xl font-bold">{data?.summary.totalBuyers}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data?.summary.totalUniverses} universes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Activity className="h-4 w-4" />
                  <span className="text-sm">Active Outreach</span>
                </div>
                <p className="text-2xl font-bold">{data?.summary.activeOutreach}</p>
                <p className="text-xs text-muted-foreground mt-1">In progress</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs for different analytics views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="learning" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Learning
          </TabsTrigger>
          <TabsTrigger value="calibration" className="flex items-center gap-2">
            <Sliders className="h-4 w-4" />
            Calibration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Main Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {isLoading ? (
              <>
                <Card>
                  <CardContent className="p-6">
                    <Skeleton className="h-[350px]" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <Skeleton className="h-[350px]" />
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <MatchingFunnel data={data?.funnel || []} />
                <ScoringTrendsChart data={data?.scoringTrends || []} />
              </>
            )}
          </div>

          {/* Secondary Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <>
                <Card>
                  <CardContent className="p-6">
                    <Skeleton className="h-[300px]" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <Skeleton className="h-[300px]" />
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <TierDistributionChart data={data?.tierDistribution || []} />
                <CategoryPerformanceChart
                  data={data?.categoryAverages || { geography: 0, service: 0, ownerGoals: 0 }}
                  className="md:col-span-2 lg:col-span-2"
                />
              </>
            )}
          </div>

          {/* Universe Performance Table */}
          {isLoading ? (
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-[300px]" />
              </CardContent>
            </Card>
          ) : (
            <UniversePerformanceTable data={data?.universePerformance || []} />
          )}
        </TabsContent>

        <TabsContent value="learning" className="space-y-6 mt-6">
          {/* Decision History Chart */}
          <DecisionHistoryChart
            decisions={(learningHistory || []).map((h) => ({
              action: h.action as 'approved' | 'passed',
              created_at: h.created_at || new Date().toISOString(),
              composite_score: h.composite_score || undefined,
              pass_category: h.pass_category,
            }))}
            daysBack={daysBack}
          />
        </TabsContent>

        <TabsContent value="calibration" className="space-y-6 mt-6">
          {/* Score Calibration Chart */}
          <ScoreCalibrationChart
            scores={(allScores || []).map((s) => ({
              composite_score: s.composite_score,
              tier: s.tier || 'D',
              geography_score: s.geography_score || undefined,
              service_score: s.service_score || undefined,
              owner_goals_score: s.owner_goals_score || undefined,
            }))}
            targetTierAPercentage={20}
          />

          {/* Category Performance with additional context */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CategoryPerformanceChart
              data={data?.categoryAverages || { geography: 0, service: 0, ownerGoals: 0 }}
            />
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Calibration Guidelines</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium">Target Distribution</p>
                  <p className="text-muted-foreground">
                    Aim for ~20% Tier A, 30% Tier B, 35% Tier C, 15% Tier D
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium">Score Thresholds</p>
                  <p className="text-muted-foreground">A: 80+, B: 65-79, C: 50-64, D: &lt;50</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium">Weight Adjustment</p>
                  <p className="text-muted-foreground">
                    If too many Tier A, reduce geography weight. If too few, increase service
                    weights.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReMarketingAnalytics;
