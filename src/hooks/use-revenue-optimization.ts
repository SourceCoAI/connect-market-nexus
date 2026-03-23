import { useQuery } from '@tanstack/react-query';
import { supabase, untypedFrom } from '@/integrations/supabase/client';

interface AnalyticsRow {
  id: string;
  listing_id: string;
  unique_views: number;
  saves: number;
  connection_requests: number;
  created_at: string;
  action_type?: string;
  user_id?: string;
}

export interface RevenueOptimization {
  category: string;
  current_avg_commission: number;
  optimal_commission: number;
  potential_revenue_increase: number;
  forecast_level: number;
  market_demand: 'high' | 'medium' | 'low';
  supply_level: 'oversupplied' | 'balanced' | 'undersupplied';
  pricing_recommendation: string;
}

export interface DealVelocityMetrics {
  listing_id: string;
  listing_title: string;
  days_on_market: number;
  velocity_score: number;
  predicted_sale_date: string;
  forecast_level: number;
  acceleration_opportunities: string[];
  bottlenecks: string[];
}

export interface PipelineAnalysis {
  stage: 'lead' | 'qualified' | 'negotiating' | 'closing';
  user_count: number;
  avg_time_in_stage: number;
  conversion_rate: number;
  revenue_potential: number;
  optimization_recommendations: string[];
}

export interface MarketTiming {
  category: string;
  seasonality_factor: number;
  optimal_listing_time: string;
  market_temperature: 'hot' | 'warm' | 'cold';
  demand_forecast: number;
  suggested_pricing_strategy: string;
}

export interface CompetitiveIntelligence {
  category: string;
  our_market_share: number;
  avg_time_to_sale: number;
  competitor_pricing: number;
  our_competitive_advantage: string[];
  threats: string[];
  opportunities: string[];
}

export function useRevenueOptimization(daysBack: number = 90) {
  return useQuery({
    queryKey: ['revenue-optimization', daysBack],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      // Get comprehensive data
      const [
        { data: listings },
        { data: analytics },
        { data: connections },
        { data: saves },
        { data: users },
      ] = await Promise.all([
        supabase
          .from('listings')
          .select('id, title, category, revenue, ebitda, created_at')
          .eq('status', 'active')
          .is('deleted_at', null),
        untypedFrom('listing_analytics')
          .select('id, listing_id, unique_views, saves, connection_requests, created_at')
          .gte('created_at', startDate.toISOString()),
        supabase
          .from('connection_requests')
          .select('id, listing_id, user_id, status, created_at')
          .gte('created_at', startDate.toISOString()),
        supabase
          .from('saved_listings')
          .select('id, listing_id, user_id, created_at')
          .gte('created_at', startDate.toISOString()),
        supabase.from('profiles').select('id').eq('approval_status', 'approved'),
      ]);

      if (!listings || !users)
        return {
          revenueOptimizations: [],
          dealVelocityMetrics: [],
          pipelineAnalysis: [],
          marketTiming: [],
          competitiveIntelligence: [],
        };

      // Revenue Optimization Analysis
      const categoryMap = new Map();
      listings.forEach((listing) => {
        if (!categoryMap.has(listing.category)) {
          categoryMap.set(listing.category, {
            listings: [],
            totalViews: 0,
            totalSaves: 0,
            totalConnections: 0,
          });
        }

        const views =
          (analytics as unknown as AnalyticsRow[])?.filter(
            (a: AnalyticsRow) => a.listing_id === listing.id && a.action_type === 'view',
          ).length || 0;
        const listingSaves = saves?.filter((s) => s.listing_id === listing.id).length || 0;
        const listingConnections =
          connections?.filter((c) => c.listing_id === listing.id).length || 0;

        const categoryData = categoryMap.get(listing.category);
        categoryData.listings.push({
          ...listing,
          views,
          saves: listingSaves,
          connections: listingConnections,
        });
        categoryData.totalViews += views;
        categoryData.totalSaves += listingSaves;
        categoryData.totalConnections += listingConnections;
      });

      const revenueOptimizations: RevenueOptimization[] = Array.from(categoryMap.entries())
        .map(([category, data]) => {
          const avgRevenue =
            data.listings.reduce((sum: number, l: { revenue: number }) => sum + l.revenue, 0) /
            data.listings.length;
          const conversionRate =
            data.totalViews > 0 ? (data.totalConnections / data.totalViews) * 100 : 0;
          const currentCommission = avgRevenue * 0.02; // Assume 2% commission

          // Calculate optimal commission based on performance
          let optimalCommissionRate = 0.02;
          if (conversionRate > 5) optimalCommissionRate = 0.025;
          else if (conversionRate > 10) optimalCommissionRate = 0.03;
          else if (conversionRate < 2) optimalCommissionRate = 0.015;

          const optimalCommission = avgRevenue * optimalCommissionRate;
          const potentialIncrease = (optimalCommission - currentCommission) * data.listings.length;

          // Determine market conditions
          const avgViews = data.totalViews / data.listings.length;
          const marketDemand: 'high' | 'medium' | 'low' =
            avgViews > 20 ? 'high' : avgViews > 10 ? 'medium' : 'low';
          const supplyLevel: 'oversupplied' | 'balanced' | 'undersupplied' =
            data.listings.length > 15
              ? 'oversupplied'
              : data.listings.length > 8
                ? 'balanced'
                : 'undersupplied';

          let pricingRecommendation = '';
          if (marketDemand === 'high' && supplyLevel === 'undersupplied') {
            pricingRecommendation = 'Increase pricing by 10-15% due to high demand and low supply';
          } else if (marketDemand === 'low' && supplyLevel === 'oversupplied') {
            pricingRecommendation = 'Consider competitive pricing or enhanced value proposition';
          } else {
            pricingRecommendation = 'Maintain current pricing with focus on value optimization';
          }

          return {
            category,
            current_avg_commission: Math.round(currentCommission),
            optimal_commission: Math.round(optimalCommission),
            potential_revenue_increase: Math.round(potentialIncrease),
            forecast_level: Math.min(80 + data.listings.length * 2, 95),
            market_demand: marketDemand,
            supply_level: supplyLevel,
            pricing_recommendation: pricingRecommendation,
          };
        })
        .filter((opt) => opt.potential_revenue_increase !== 0)
        .sort((a, b) => b.potential_revenue_increase - a.potential_revenue_increase);

      // Deal Velocity Metrics
      const dealVelocityMetrics: DealVelocityMetrics[] = listings
        .slice(0, 20)
        .map((listing) => {
          const daysOnMarket = Math.floor(
            (Date.now() - new Date(listing.created_at).getTime()) / (1000 * 60 * 60 * 24),
          );
          const views =
            (analytics as unknown as AnalyticsRow[])?.filter(
              (a: AnalyticsRow) => a.listing_id === listing.id && a.action_type === 'view',
            ).length || 0;
          const listingSaves = saves?.filter((s) => s.listing_id === listing.id).length || 0;
          const listingConnections =
            connections?.filter((c) => c.listing_id === listing.id).length || 0;

          // Calculate velocity score (0-100)
          const viewsScore = Math.min((views / 5) * 30, 30);
          const savesScore = Math.min((listingSaves / 3) * 40, 40);
          const connectionsScore = Math.min(listingConnections * 30, 30);
          const velocityScore = viewsScore + savesScore + connectionsScore;

          // Predict sale date based on current velocity
          const avgDaysToSale = 90; // Industry average
          const velocityMultiplier = velocityScore / 50; // Normalize
          const predictedDays = Math.max(avgDaysToSale / velocityMultiplier, 30);
          const predictedSaleDate = new Date(
            Date.now() + predictedDays * 24 * 60 * 60 * 1000,
          ).toISOString();

          // Generate recommendations
          const accelerationOpportunities: string[] = [];
          const bottlenecks: string[] = [];

          if (views < 10) bottlenecks.push('Low visibility - needs better marketing');
          if (listingSaves < 2 && views > 10)
            bottlenecks.push('Low save rate - listing may need optimization');
          if (listingConnections === 0 && listingSaves > 3)
            bottlenecks.push('No connections despite interest - follow up needed');

          if (velocityScore > 70)
            accelerationOpportunities.push('High momentum - consider premium promotion');
          if (listingSaves > 5)
            accelerationOpportunities.push('Strong interest - prioritize follow-ups');
          if (views > 20)
            accelerationOpportunities.push('High visibility - optimize for conversions');

          return {
            listing_id: listing.id,
            listing_title: listing.title,
            days_on_market: daysOnMarket,
            velocity_score: Math.round(velocityScore),
            predicted_sale_date: predictedSaleDate,
            forecast_level: Math.min(60 + velocityScore / 2, 90),
            acceleration_opportunities: accelerationOpportunities,
            bottlenecks: bottlenecks,
          };
        })
        .sort((a, b) => b.velocity_score - a.velocity_score);

      // Pipeline Analysis
      const pipelineAnalysis: PipelineAnalysis[] = [
        {
          stage: 'lead',
          user_count: users.filter((u) => {
            const userViews =
              (analytics as unknown as AnalyticsRow[])?.filter(
                (a: AnalyticsRow) => a.user_id === u.id,
              ).length || 0;
            return userViews > 0 && userViews < 5;
          }).length,
          avg_time_in_stage: 3, // days
          conversion_rate: 35,
          revenue_potential: 150000,
          optimization_recommendations: [
            'Implement lead scoring system',
            'Automated follow-up sequences',
            'Personalized onboarding',
          ],
        },
        {
          stage: 'qualified',
          user_count: users.filter((u) => {
            const userSaves = saves?.filter((s) => s.user_id === u.id).length || 0;
            return userSaves > 0;
          }).length,
          avg_time_in_stage: 7, // days
          conversion_rate: 65,
          revenue_potential: 500000,
          optimization_recommendations: [
            'Accelerate qualification process',
            'Enhanced listing curation',
            'Direct advisor assignment',
          ],
        },
        {
          stage: 'negotiating',
          user_count: connections?.filter((c) => c.status === 'pending').length || 0,
          avg_time_in_stage: 14, // days
          conversion_rate: 80,
          revenue_potential: 800000,
          optimization_recommendations: [
            'Streamline negotiation process',
            'Provide negotiation support',
            'Clear milestone tracking',
          ],
        },
        {
          stage: 'closing',
          user_count: connections?.filter((c) => c.status === 'approved').length || 0,
          avg_time_in_stage: 21, // days
          conversion_rate: 95,
          revenue_potential: 1200000,
          optimization_recommendations: [
            'Expedite due diligence',
            'Legal support optimization',
            'Closing coordination',
          ],
        },
      ];

      // Market Timing Analysis
      const marketTiming: MarketTiming[] = Array.from(categoryMap.entries()).map(
        ([category, data]) => {
          const month = new Date().getMonth();
          const seasonalityFactor = Math.sin((month / 12) * Math.PI * 2) * 0.2 + 1; // Simplified seasonality

          const avgViews = data.totalViews / data.listings.length;
          const marketTemp = avgViews > 15 ? 'hot' : avgViews > 8 ? 'warm' : 'cold';

          return {
            category,
            seasonality_factor: Math.round(seasonalityFactor * 100) / 100,
            optimal_listing_time: marketTemp === 'hot' ? 'Immediate' : 'Within 2 weeks',
            market_temperature: marketTemp,
            demand_forecast: Math.round(avgViews * seasonalityFactor),
            suggested_pricing_strategy:
              marketTemp === 'hot'
                ? 'Premium pricing'
                : marketTemp === 'warm'
                  ? 'Market pricing'
                  : 'Competitive pricing',
          };
        },
      );

      // Competitive Intelligence (simplified)
      const competitiveIntelligence: CompetitiveIntelligence[] = Array.from(
        categoryMap.entries(),
      ).map(([category, data]) => ({
        category,
        our_market_share: Math.min((data.listings.length / 100) * 100, 100), // Simplified
        avg_time_to_sale: 75, // days
        competitor_pricing:
          (data.listings.reduce((sum: number, l: { revenue: number }) => sum + l.revenue, 0) /
            data.listings.length) *
          1.1,
        our_competitive_advantage: [
          'Comprehensive due diligence',
          'Expert advisory support',
          'Streamlined process',
        ],
        threats: ['Increasing competition', 'Market saturation', 'Economic uncertainty'],
        opportunities: [
          'Digital transformation demand',
          'Geographic expansion',
          'Premium service tier',
        ],
      }));

      return {
        revenueOptimizations,
        dealVelocityMetrics,
        pipelineAnalysis,
        marketTiming,
        competitiveIntelligence,
      };
    },
    refetchInterval: 900000, // 15 minutes
  });
}
