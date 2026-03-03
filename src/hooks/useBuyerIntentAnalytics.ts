import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";

export interface BuyerIntentData {
  // Intent distribution
  intentDistribution: Array<{
    intent: string;
    count: number;
    percentage: number;
  }>;
  
  // Capital readiness
  capitalReadiness: {
    deployingNow: number;
    raisingCapital: number;
    exploring: number;
    notSpecified: number;
  };
  
  // Buyer type x intent heatmap
  buyerTypeIntent: Array<{
    buyerType: string;
    intent: string;
    count: number;
  }>;
  
  // Intent trend over time
  intentTrend: Array<{
    date: string;
    activelyBuying: number;
    exploring: number;
    other: number;
  }>;
  
  // Mandate keywords
  mandateKeywords: Array<{
    keyword: string;
    count: number;
  }>;
  
  // Summary stats
  totalBuyers: number;
  readyToBuyCount: number;
  avgEngagementScore: number;
}

export function useBuyerIntentAnalytics(timeRangeDays: number = 30) {
  return useQuery({
    queryKey: ['buyer-intent-analytics', timeRangeDays],
    queryFn: async (): Promise<BuyerIntentData> => {
      const now = new Date();
      const startDate = subDays(now, timeRangeDays);
      
      // Fetch profiles with intent data
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select(`
          id,
          buyer_type,
          deal_intent,
          corpdev_intent,
          owner_intent,
          deploying_capital_now,
          mandate_blurb,
          created_at,
          approval_status
        `)
        .eq('approval_status', 'approved')
        .eq('is_admin', false);
      
      if (error) throw error;
      
      const buyers = profiles || [];
      
      // Calculate intent distribution
      const intentCounts: Record<string, number> = {};
      buyers.forEach(b => {
        const intent = b.deal_intent || 'Not specified';
        intentCounts[intent] = (intentCounts[intent] || 0) + 1;
      });
      
      const totalBuyers = buyers.length;
      const intentDistribution = Object.entries(intentCounts)
        .map(([intent, count]) => ({
          intent: formatIntentLabel(intent),
          count,
          percentage: totalBuyers > 0 ? (count / totalBuyers) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);
      
      // Capital readiness
      const capitalReadiness = {
        deployingNow: buyers.filter(b => b.deploying_capital_now === 'yes' || b.deploying_capital_now === 'Yes').length,
        raisingCapital: buyers.filter(b => b.deploying_capital_now === 'raising' || b.deploying_capital_now === 'Raising capital').length,
        exploring: buyers.filter(b => b.deploying_capital_now === 'exploring' || b.deploying_capital_now === 'Just exploring').length,
        notSpecified: buyers.filter(b => !b.deploying_capital_now).length,
      };
      
      // Buyer type x intent heatmap
      const buyerTypeIntentMap: Record<string, Record<string, number>> = {};
      buyers.forEach(b => {
        const type = formatBuyerType(b.buyer_type || 'Unknown');
        const intent = formatIntentLabel(b.deal_intent || 'Not specified');
        
        if (!buyerTypeIntentMap[type]) {
          buyerTypeIntentMap[type] = {};
        }
        buyerTypeIntentMap[type][intent] = (buyerTypeIntentMap[type][intent] || 0) + 1;
      });
      
      const buyerTypeIntent: Array<{ buyerType: string; intent: string; count: number }> = [];
      Object.entries(buyerTypeIntentMap).forEach(([buyerType, intents]) => {
        Object.entries(intents).forEach(([intent, count]) => {
          buyerTypeIntent.push({ buyerType, intent, count });
        });
      });
      
      // Intent trend over time (group by week)
      const recentBuyers = buyers.filter(b => new Date(b.created_at) >= startDate);
      const trendMap: Record<string, { activelyBuying: number; exploring: number; other: number }> = {};
      
      recentBuyers.forEach(b => {
        const date = new Date(b.created_at);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const key = weekStart.toISOString().split('T')[0];
        
        if (!trendMap[key]) {
          trendMap[key] = { activelyBuying: 0, exploring: 0, other: 0 };
        }
        
        const intent = (b.deal_intent || '').toLowerCase();
        if (intent.includes('active') || intent.includes('deploying')) {
          trendMap[key].activelyBuying++;
        } else if (intent.includes('explor') || intent.includes('learn')) {
          trendMap[key].exploring++;
        } else {
          trendMap[key].other++;
        }
      });
      
      const intentTrend = Object.entries(trendMap)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      // Mandate keywords extraction
      const keywordCounts: Record<string, number> = {};
      const stopWords = new Set(['and', 'or', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'we', 'our', 'i', 'my']);
      
      buyers.forEach(b => {
        if (b.mandate_blurb) {
          const words = b.mandate_blurb
            .toLowerCase()
            .replace(/[^a-z\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.has(w));
          
          words.forEach(word => {
            keywordCounts[word] = (keywordCounts[word] || 0) + 1;
          });
        }
      });
      
      const mandateKeywords = Object.entries(keywordCounts)
        .map(([keyword, count]) => ({ keyword, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);
      
      // Calculate ready to buy count
      const readyToBuyCount = buyers.filter(b => {
        const intent = (b.deal_intent || '').toLowerCase();
        const capital = (b.deploying_capital_now || '').toLowerCase();
        return intent.includes('active') || capital === 'yes';
      }).length;
      
      // Fetch engagement scores for average
      const { data: engagementScores, error: engagementScoresError } = await supabase
        .from('engagement_scores')
        .select('score')
        .not('score', 'is', null);
      if (engagementScoresError) throw engagementScoresError;
      
      const scores = engagementScores || [];
      const avgEngagementScore = scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
        : 0;
      
      return {
        intentDistribution,
        capitalReadiness,
        buyerTypeIntent,
        intentTrend,
        mandateKeywords,
        totalBuyers,
        readyToBuyCount,
        avgEngagementScore,
      };
    },
    staleTime: 60000,
    refetchInterval: 300000,
  });
}

function formatIntentLabel(intent: string): string {
  if (!intent || intent === 'Not specified') return 'Not specified';
  
  // Capitalize and clean up
  return intent
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatBuyerType(type: string): string {
  const typeMap: Record<string, string> = {
    // Marketplace camelCase values (from profiles.buyer_type)
    'corporate': 'Corporate',
    'privateEquity': 'Private Equity',
    'familyOffice': 'Family Office',
    'searchFund': 'Search Fund',
    'individual': 'Individual',
    'independentSponsor': 'Independent Sponsor',
    'advisor': 'Advisor',
    'businessOwner': 'Business Owner',
    // Canonical snake_case values (from remarketing_buyers.buyer_type)
    'private_equity': 'Private Equity',
    'family_office': 'Family Office',
    'search_fund': 'Search Fund',
    'independent_sponsor': 'Independent Sponsor',
    'individual_buyer': 'Individual',
  };

  return typeMap[type] || type;
}
