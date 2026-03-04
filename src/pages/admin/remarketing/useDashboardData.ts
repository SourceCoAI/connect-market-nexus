/**
 * useDashboardData.ts
 *
 * Data fetching hooks for the ReMarketing Dashboard page.
 * Encapsulates the main RPC call, universe queries, and derived metrics.
 *
 * Extracted from ReMarketingDashboard.tsx for maintainability.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───

export type Timeframe = 'today' | '7d' | '14d' | '30d' | '90d' | 'all';

export interface DashboardStats {
  cards: Record<string, number>;
  new_by_source: Record<string, number>;
  all_by_source: Record<string, number>;
  team: Array<Record<string, unknown>>;
  score_dist: Record<string, number>;
  top_deals: Array<Record<string, unknown>>;
  weekly: Record<string, number>;
  recent_activity: Array<Record<string, unknown>>;
}

export interface UniverseMetric {
  id: string;
  name: string;
  totalScored: number;
  approved: number;
  buyers: number;
}

// ─── Helpers ───

export function getFromDate(tf: Timeframe): string | null {
  if (tf === 'all') return null;
  const now = new Date();
  const days = tf === 'today' ? 1 : tf === '7d' ? 7 : tf === '14d' ? 14 : tf === '30d' ? 30 : 90;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export function scorePillClass(score: number | null): string {
  if (score == null) return 'bg-gray-100 text-gray-600';
  if (score >= 80) return 'bg-emerald-100 text-emerald-800';
  if (score >= 60) return 'bg-blue-100 text-blue-800';
  if (score >= 40) return 'bg-amber-100 text-amber-800';
  if (score >= 20) return 'bg-orange-100 text-orange-800';
  return 'bg-gray-100 text-gray-600';
}

export function initials(first: string | null, last: string | null): string {
  return `${(first || '?')[0]}${(last || '')[0] || ''}`.toUpperCase();
}

export function formatWeekLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Source colors ───

export const SOURCE_COLORS: Record<string, string> = {
  captarget: '#2563eb',
  gp_partners: '#ea580c',
  sourceco: '#0891b2',
  referral: '#7c3aed',
  marketplace: '#16a34a',
  valuation_calculator: '#10b981',
  manual: '#94a3b8',
};

export const SOURCE_LABELS: Record<string, string> = {
  captarget: 'CapTarget',
  gp_partners: 'GP Partners',
  sourceco: 'SourceCo',
  referral: 'Referral',
  marketplace: 'Marketplace',
  valuation_calculator: 'Calculator',
  manual: 'Manual',
};

// ─── Timeframe options ───

export const TF_OPTIONS: { key: Timeframe; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7d' },
  { key: '14d', label: '14d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'all', label: 'All' },
];

// ─── Hook ───

export function useDashboardData(timeframe: Timeframe) {
  const fromDate = getFromDate(timeframe);

  // Single RPC call replaces 8+ sequential batch fetches
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard', 'remarketing-stats', fromDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_remarketing_dashboard_stats', {
        p_from_date: fromDate ?? undefined,
      });
      if (error) throw error;
      return data as unknown as DashboardStats;
    },
    staleTime: 30_000,
  });

  // Buyer universes (small dataset)
  const { data: universes, isLoading: universesLoading } = useQuery({
    queryKey: ['dashboard', 'universes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyer_universes')
        .select('id, name')
        .eq('archived', false);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  // Scores per universe (small dataset)
  const { data: scoreData } = useQuery({
    queryKey: ['dashboard', 'scores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_scores')
        .select('universe_id, status');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  // Buyers per universe (small dataset)
  const { data: buyerData } = useQuery({
    queryKey: ['dashboard', 'buyers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyers')
        .select('universe_id')
        .eq('archived', false);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  // Extract metrics from RPC result
  const cards = stats?.cards;
  const newBySource = stats?.new_by_source || {};
  const allBySource = stats?.all_by_source || {};
  const teamData = stats?.team || [];
  const scoreDist = stats?.score_dist;
  const topDeals = stats?.top_deals || [];
  const weeklyData = stats?.weekly || {};
  const recentActivity = stats?.recent_activity || [];

  // Universe metrics
  const universeMetrics = useMemo<UniverseMetric[] | null>(() => {
    if (!universes || !scoreData || !buyerData) return null;
    return universes
      .map((u) => {
        const scores = scoreData.filter((s) => s.universe_id === u.id);
        const approved = scores.filter((s) => s.status === 'approved').length;
        const buyers = buyerData.filter((b) => b.universe_id === u.id).length;
        return { ...u, totalScored: scores.length, approved, buyers };
      })
      .sort((a, b) => b.approved - a.approved);
  }, [universes, scoreData, buyerData]);

  // Score buckets from RPC
  const scoreBuckets = scoreDist
    ? [
        { label: '80–100', tag: 'Top Tier', color: '#16a34a', count: scoreDist.tier_80_100 || 0 },
        { label: '60–79', tag: 'Strong', color: '#2563eb', count: scoreDist.tier_60_79 || 0 },
        { label: '40–59', tag: 'Average', color: '#ca8a04', count: scoreDist.tier_40_59 || 0 },
        { label: '20–39', tag: 'Below Avg', color: '#ea580c', count: scoreDist.tier_20_39 || 0 },
        { label: '0–19', tag: 'Low', color: '#94a3b8', count: scoreDist.tier_0_19 || 0 },
      ]
    : [];

  return {
    loading: statsLoading,
    universesLoading,
    cards,
    newBySource,
    allBySource,
    teamData,
    topDeals,
    weeklyData,
    recentActivity,
    scoreBuckets,
    universeMetrics,
  };
}
