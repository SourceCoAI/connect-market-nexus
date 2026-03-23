/**
 * useReMarketingAnalytics
 *
 * Aggregates remarketing analytics data including tier distribution, scoring
 * trends, funnel stages, universe performance, and category averages across
 * all remarketing scores, buyers, and universes.
 *
 * Returns: { data, isLoading, error } (via useQuery wrapping ReMarketingAnalyticsData)
 *
 * Tables: remarketing_scores, buyers, buyer_universes, outreach_records
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays, format } from 'date-fns';

export interface TierDistribution {
  tier: string;
  count: number;
  percentage: number;
}

export interface ScoringTrend {
  date: string;
  scores: number;
  avgScore: number;
  tierA: number;
  tierB: number;
  tierC: number;
  tierD: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
  percentage: number;
  conversionRate?: number;
}

export interface UniversePerformance {
  id: string;
  name: string;
  totalScores: number;
  avgScore: number;
  tierACount: number;
  tierBCount: number;
  conversionRate: number;
}

export interface ReMarketingAnalyticsData {
  summary: {
    totalScores: number;
    totalBuyers: number;
    totalUniverses: number;
    avgCompositeScore: number;
    tierAPercentage: number;
    scoresLast7Days: number;
    scoresLast30Days: number;
    activeOutreach: number;
  };
  tierDistribution: TierDistribution[];
  scoringTrends: ScoringTrend[];
  funnel: FunnelStage[];
  universePerformance: UniversePerformance[];
  categoryAverages: {
    geography: number;
    service: number;
    ownerGoals: number;
  };
}

export function useReMarketingAnalytics(daysBack: number = 30) {
  return useQuery({
    queryKey: ['remarketing-analytics', daysBack],
    queryFn: async (): Promise<ReMarketingAnalyticsData> => {
      const startDate = subDays(new Date(), daysBack);

      // Fetch all scores
      const { data: allScores, error: scoresError } = await supabase
        .from('remarketing_scores')
        .select('*')
        .order('created_at', { ascending: false });

      if (scoresError) throw scoresError;

      // Fetch scores with universe info for period
      const { data: periodScores, error: periodScoresError } = await supabase
        .from('remarketing_scores')
        .select(
          `
          *,
          universe:buyer_universes(id, name)
        `,
        )
        .gte('created_at', startDate.toISOString());
      if (periodScoresError) throw periodScoresError;

      // Fetch buyers count
      const { count: buyerCount } = await supabase
        .from('buyers')
        .select('*', { count: 'exact', head: true })
        .eq('archived', false);

      // Fetch universes
      const { data: universes, error: universesError } = await supabase
        .from('buyer_universes')
        .select('id, name')
        .eq('archived', false);
      if (universesError) throw universesError;

      // Fetch outreach records
      const { data: outreachData, error: outreachDataError } = await supabase
        .from('outreach_records')
        .select('*');
      if (outreachDataError) throw outreachDataError;

      const scores = allScores || [];
      const period = periodScores || [];
      const outreach = outreachData || [];

      // Calculate tier distribution
      const tierCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
      scores.forEach((s) => {
        if (s.tier && tierCounts[s.tier] !== undefined) {
          tierCounts[s.tier]++;
        }
      });

      const tierDistribution: TierDistribution[] = Object.entries(tierCounts).map(
        ([tier, count]) => ({
          tier,
          count,
          percentage: scores.length > 0 ? (count / scores.length) * 100 : 0,
        }),
      );

      // Calculate scoring trends by day
      const trendMap = new Map<
        string,
        {
          scores: number;
          totalScore: number;
          tierA: number;
          tierB: number;
          tierC: number;
          tierD: number;
        }
      >();

      // Initialize all days in the range
      for (let i = daysBack - 1; i >= 0; i--) {
        const dateKey = format(subDays(new Date(), i), 'yyyy-MM-dd');
        trendMap.set(dateKey, { scores: 0, totalScore: 0, tierA: 0, tierB: 0, tierC: 0, tierD: 0 });
      }

      period.forEach((score) => {
        const dateKey = format(new Date(score.created_at), 'yyyy-MM-dd');
        const existing = trendMap.get(dateKey);
        if (existing) {
          existing.scores++;
          existing.totalScore += score.composite_score;
          if (score.tier === 'A') existing.tierA++;
          if (score.tier === 'B') existing.tierB++;
          if (score.tier === 'C') existing.tierC++;
          if (score.tier === 'D') existing.tierD++;
        }
      });

      const scoringTrends: ScoringTrend[] = Array.from(trendMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, data]) => ({
          date: format(new Date(date), 'MMM d'),
          scores: data.scores,
          avgScore: data.scores > 0 ? Math.round(data.totalScore / data.scores) : 0,
          tierA: data.tierA,
          tierB: data.tierB,
          tierC: data.tierC,
          tierD: data.tierD,
        }));

      // Calculate funnel stages
      const totalScored = scores.length;
      const tierAB = scores.filter((s) => s.tier === 'A' || s.tier === 'B').length;
      const contacted = outreach.filter((o) => o.contacted_at).length;
      const ndaSigned = outreach.filter((o) => o.nda_signed_at).length;
      const meetingScheduled = outreach.filter((o) => o.meeting_scheduled_at).length;
      const won = outreach.filter((o) => o.outcome === 'won').length;

      const funnel: FunnelStage[] = [
        {
          stage: 'Scored',
          count: totalScored,
          percentage: 100,
          conversionRate: totalScored > 0 ? (tierAB / totalScored) * 100 : 0,
        },
        {
          stage: 'Tier A/B',
          count: tierAB,
          percentage: totalScored > 0 ? (tierAB / totalScored) * 100 : 0,
          conversionRate: tierAB > 0 ? (contacted / tierAB) * 100 : 0,
        },
        {
          stage: 'Contacted',
          count: contacted,
          percentage: totalScored > 0 ? (contacted / totalScored) * 100 : 0,
          conversionRate: contacted > 0 ? (ndaSigned / contacted) * 100 : 0,
        },
        {
          stage: 'NDA Signed',
          count: ndaSigned,
          percentage: totalScored > 0 ? (ndaSigned / totalScored) * 100 : 0,
          conversionRate: ndaSigned > 0 ? (meetingScheduled / ndaSigned) * 100 : 0,
        },
        {
          stage: 'Meeting',
          count: meetingScheduled,
          percentage: totalScored > 0 ? (meetingScheduled / totalScored) * 100 : 0,
          conversionRate: meetingScheduled > 0 ? (won / meetingScheduled) * 100 : 0,
        },
        {
          stage: 'Won',
          count: won,
          percentage: totalScored > 0 ? (won / totalScored) * 100 : 0,
        },
      ];

      // Calculate universe performance
      const universeMap = new Map<
        string,
        {
          name: string;
          scores: number[];
          tierA: number;
          tierB: number;
          contacted: number;
        }
      >();

      (universes || []).forEach((u) => {
        universeMap.set(u.id, { name: u.name, scores: [], tierA: 0, tierB: 0, contacted: 0 });
      });

      scores.forEach((score) => {
        if (score.universe_id && universeMap.has(score.universe_id)) {
          const u = universeMap.get(score.universe_id)!;
          u.scores.push(score.composite_score);
          if (score.tier === 'A') u.tierA++;
          if (score.tier === 'B') u.tierB++;
        }
      });

      outreach.forEach((o) => {
        if (o.universe_id && universeMap.has(o.universe_id) && o.contacted_at) {
          universeMap.get(o.universe_id)!.contacted++;
        }
      });

      const universePerformance: UniversePerformance[] = Array.from(universeMap.entries())
        .map(([id, data]) => ({
          id,
          name: data.name,
          totalScores: data.scores.length,
          avgScore:
            data.scores.length > 0
              ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
              : 0,
          tierACount: data.tierA,
          tierBCount: data.tierB,
          conversionRate: data.scores.length > 0 ? (data.contacted / data.scores.length) * 100 : 0,
        }))
        .filter((u) => u.totalScores > 0)
        .sort((a, b) => b.avgScore - a.avgScore);

      // Calculate category averages
      const categoryTotals = { geography: 0, service: 0, ownerGoals: 0 };
      let categoryCount = 0;

      scores.forEach((s) => {
        if (s.geography_score !== null) {
          categoryTotals.geography += s.geography_score;
          categoryTotals.service += s.service_score || 0;
          categoryTotals.ownerGoals += s.owner_goals_score || 0;
          categoryCount++;
        }
      });

      const categoryAverages = {
        geography: categoryCount > 0 ? Math.round(categoryTotals.geography / categoryCount) : 0,
        service: categoryCount > 0 ? Math.round(categoryTotals.service / categoryCount) : 0,
        ownerGoals: categoryCount > 0 ? Math.round(categoryTotals.ownerGoals / categoryCount) : 0,
      };

      // Calculate summary
      const avgScore =
        scores.length > 0
          ? Math.round(scores.reduce((a, s) => a + s.composite_score, 0) / scores.length)
          : 0;

      const last7Days = subDays(new Date(), 7);
      const last30Days = subDays(new Date(), 30);

      const scoresLast7Days = scores.filter((s) => new Date(s.created_at) >= last7Days).length;
      const scoresLast30Days = scores.filter((s) => new Date(s.created_at) >= last30Days).length;

      const activeOutreach = outreach.filter((o) => o.contacted_at && !o.outcome).length;

      return {
        summary: {
          totalScores: scores.length,
          totalBuyers: buyerCount || 0,
          totalUniverses: universes?.length || 0,
          avgCompositeScore: avgScore,
          tierAPercentage: tierDistribution.find((t) => t.tier === 'A')?.percentage || 0,
          scoresLast7Days,
          scoresLast30Days,
          activeOutreach,
        },
        tierDistribution,
        scoringTrends,
        funnel,
        universePerformance,
        categoryAverages,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
