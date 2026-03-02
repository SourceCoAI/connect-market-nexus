import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBackgroundScoringProgress } from "@/hooks/useBackgroundScoringProgress";
import type { SortOption, FilterTab } from "./types";

export function useMatchingData(listingId: string | undefined) {
  const [selectedUniverse, setSelectedUniverse] = useState<string>("");
  const [isScoring, setIsScoring] = useState(false);
  const [scoringProgress, setScoringProgress] = useState(0);

  // New state for enhanced features
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [sortDesc, setSortDesc] = useState(true);
  const [hideDisqualified, setHideDisqualified] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Custom scoring instructions state
  const [customInstructions, setCustomInstructions] = useState("");

  // Geography mode state (critical/preferred/minimal)
  const [geographyMode, setGeographyMode] = useState<'critical' | 'preferred' | 'minimal'>('critical');

  // Background scoring progress hook
  const backgroundScoring = useBackgroundScoringProgress(
    listingId!,
    selectedUniverse !== 'all' ? selectedUniverse : undefined
  );

  // Fetch the listing
  const { data: listing, isLoading: listingLoading } = useQuery({
    queryKey: ['listing', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', listingId!)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!listingId
  });

  // Fetch universes linked to this deal
  const { data: linkedUniverses, refetch: refetchLinkedUniverses } = useQuery({
    queryKey: ['remarketing', 'linked-universes', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_universe_deals')
        .select(`
          universe_id,
          universe:remarketing_buyer_universes(id, name, geography_weight, size_weight, service_weight, owner_goals_weight)
        `)
        .eq('listing_id', listingId!)
        .eq('status', 'active');

      if (error) throw error;
      return (data || []).map(d => d.universe).filter(Boolean) as Array<{
        id: string;
        name: string;
        geography_weight: number;
        size_weight: number;
        service_weight: number;
        owner_goals_weight: number;
      }>;
    },
    enabled: !!listingId
  });


  // Load saved custom instructions for this listing
  const { data: savedAdjustments } = useQuery({
    queryKey: ['deal-scoring-adjustments', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_scoring_adjustments')
        .select('*')
        .eq('listing_id', listingId!)
        .eq('adjustment_type', 'custom_instructions')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!listingId
  });

  // Initialize custom instructions from saved data
  useEffect(() => {
    if (savedAdjustments?.reason) {
      setCustomInstructions(savedAdjustments.reason);
    }
  }, [savedAdjustments]);

  // Default to "all" if linked universes exist
  useEffect(() => {
    if (linkedUniverses && linkedUniverses.length > 0 && !selectedUniverse) {
      setSelectedUniverse('all');
    }
  }, [linkedUniverses, selectedUniverse]);

  // Fetch ALL existing scores for this listing (from all universes)
  const { data: allScores, isLoading: scoresLoading } = useQuery({
    queryKey: ['remarketing', 'scores', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_scores')
        .select(`
          *,
          buyer:remarketing_buyers(
            *,
            contacts:contacts!contacts_remarketing_buyer_id_fkey(id, first_name, last_name, email)
          ),
          universe:remarketing_buyer_universes(id, name)
        `)
        .eq('listing_id', listingId!)
        .order('composite_score', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!listingId
  });

  // Fetch marketplace fee agreements to cross-reference with buyers
  const { data: feeAgreements } = useQuery({
    queryKey: ['firm-agreements-signed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('firm_agreements')
        .select('id, primary_company_name, normalized_company_name, website_domain, email_domain, fee_agreement_signed, fee_agreement_signed_at')
        .eq('fee_agreement_signed', true);

      if (error) throw error;
      return data || [];
    },
  });

  // Build a lookup to match remarketing buyers -> firm fee agreements
  const feeAgreementLookup = useMemo(() => {
    if (!feeAgreements) return new Map<string, { signed: boolean; signedAt: string | null }>();
    const lookup = new Map<string, { signed: boolean; signedAt: string | null }>();

    // Index by normalized name and domain
    const byName = new Map<string, typeof feeAgreements[0]>();
    const byDomain = new Map<string, typeof feeAgreements[0]>();
    for (const fa of feeAgreements) {
      if (fa.normalized_company_name) byName.set(fa.normalized_company_name.toLowerCase(), fa);
      if (fa.website_domain) byDomain.set(fa.website_domain.toLowerCase(), fa);
      if (fa.email_domain) byDomain.set(fa.email_domain.toLowerCase(), fa);
    }

    // Match each score's buyer against firm agreements
    if (allScores) {
      for (const score of allScores) {
        const buyer = score.buyer;
        if (!buyer) continue;

        let match: typeof feeAgreements[0] | undefined;

        // Match by website domain
        if (buyer.company_website) {
          const domain = buyer.company_website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
          match = byDomain.get(domain);
        }
        // Match by email domain
        if (!match && buyer.email_domain) {
          match = byDomain.get(buyer.email_domain.toLowerCase());
        }
        // Match by company name
        if (!match && buyer.company_name) {
          const normalized = buyer.company_name.toLowerCase().replace(/[^a-z0-9]/g, '');
          match = byName.get(normalized);
          // Also try the raw company name
          if (!match) match = byName.get(buyer.company_name.toLowerCase());
        }
        // Match by PE firm name
        if (!match && buyer.pe_firm_name) {
          const peName = buyer.pe_firm_name.toLowerCase().replace(/[^a-z0-9]/g, '');
          match = byName.get(peName);
        }

        if (match) {
          lookup.set(score.id, { signed: true, signedAt: match.fee_agreement_signed_at });
        }
      }
    }

    return lookup;
  }, [feeAgreements, allScores]);

  // Fetch outreach records for this listing
  const { data: outreachRecords, refetch: refetchOutreach } = useQuery({
    queryKey: ['remarketing', 'outreach', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_outreach')
        .select('*')
        .eq('listing_id', listingId!);

      if (error) throw error;
      return data || [];
    },
    enabled: !!listingId
  });

  // Filter scores based on selected universe
  const scores = useMemo(() => {
    if (!allScores) return [];
    if (selectedUniverse === 'all' || !selectedUniverse) {
      return allScores;
    }
    return allScores.filter(s => s.universe_id === selectedUniverse);
  }, [allScores, selectedUniverse]);

  // Compute match counts per universe
  const universeMatchCounts = useMemo(() => {
    if (!allScores || !linkedUniverses) return {};
    const counts: Record<string, number> = {};
    for (const u of linkedUniverses) {
      counts[u.id] = allScores.filter(s => s.universe_id === u.id).length;
    }
    return counts;
  }, [allScores, linkedUniverses]);

  // Compute stats including primary disqualification reason (aligned with spec v2 tiers)
  const stats = useMemo(() => {
    if (!scores) return { qualified: 0, disqualified: 0, strong: 0, approved: 0, passed: 0, total: 0, disqualificationReason: '' };

    const qualified = scores.filter(s => !s.is_disqualified && s.composite_score >= 50 && s.status !== 'passed').length;
    const disqualifiedScores = scores.filter(s => s.is_disqualified || s.composite_score < 35);
    const disqualified = disqualifiedScores.length;
    const strong = scores.filter(s => s.composite_score >= 80).length;
    const approved = scores.filter(s => s.status === 'approved').length;
    const passed = scores.filter(s => s.status === 'passed').length;

    // Compute most common disqualification reason using score-based detection
    const reasons = disqualifiedScores.map(s => {
      if (s.disqualification_reason) return s.disqualification_reason;
      const r = s.fit_reasoning?.toLowerCase() || '';

      // Check for explicit missing data flag first
      if (r.includes('[missing_data:')) return 'insufficient data';

      // Check for explicit enforcement patterns
      if (r.includes('disqualified: deal revenue') || r.includes('below buyer minimum')) return 'size mismatch';
      if (r.includes('dealbreaker: deal includes excluded')) return 'excluded criteria';
      if (r.includes('geography strict:')) return 'geography mismatch';

      // Use individual scores to find the weakest dimension (more accurate than keywords)
      const dimensions = [
        { name: 'size mismatch', score: s.size_score ?? 100 },
        { name: 'no nearby presence', score: s.geography_score ?? 100 },
        { name: 'service mismatch', score: s.service_score ?? 100 },
        { name: 'owner goals mismatch', score: s.owner_goals_score ?? 100 },
      ];
      const weakest = dimensions.reduce((min, d) => d.score < min.score ? d : min, dimensions[0]);
      if (weakest.score < 40) return weakest.name;

      return 'criteria mismatch';
    });

    const reasonCounts = reasons.reduce((acc, r) => ({ ...acc, [r]: (acc[r] || 0) + 1 }), {} as Record<string, number>);
    const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    return { qualified, disqualified, strong, approved, passed, total: scores.length, disqualificationReason: topReason };
  }, [scores]);

  // Get active outreach score IDs
  const activeOutreachScoreIds = useMemo(() => {
    return outreachRecords
      ?.filter(o => !['pending', 'closed_won', 'closed_lost'].includes(o.status ?? ''))
      .map(o => o.score_id) || [];
  }, [outreachRecords]);

  // Count outreach
  const outreachCount = activeOutreachScoreIds.length;


  // Filter and sort scores
  const filteredScores = useMemo(() => {
    if (!scores) return [];

    let filtered = [...scores];

    // Apply tab filter
    if (activeTab === 'approved') {
      filtered = filtered.filter(s => s.status === 'approved');
    } else if (activeTab === 'passed') {
      filtered = filtered.filter(s => s.status === 'passed');
    } else if (activeTab === 'outreach') {
      filtered = filtered.filter(s => activeOutreachScoreIds.includes(s.id));
    }

    // Hide disqualified (only explicitly disqualified buyers, not just low scores)
    if (hideDisqualified) {
      filtered = filtered.filter(s => !s.is_disqualified);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => {
        const buyer = s.buyer;
        if (!buyer) return false;
        const companyName = (buyer.company_name || '').toLowerCase();
        const peFirm = (buyer.pe_firm_name || '').toLowerCase();
        const thesis = (buyer.thesis_summary || '').toLowerCase();
        const location = (buyer.hq_state || '').toLowerCase();
        const city = (buyer.hq_city || '').toLowerCase();
        return companyName.includes(q) || peFirm.includes(q) || thesis.includes(q) || location.includes(q) || city.includes(q);
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'score':
          comparison = (a.composite_score || 0) - (b.composite_score || 0);
          break;
        case 'geography':
          comparison = (a.geography_score || 0) - (b.geography_score || 0);
          break;
        case 'score_geo': {
          // Use actual geography weight ratio instead of hardcoded 60/40
          const activeUniverse = selectedUniverse !== 'all'
            ? linkedUniverses?.find(u => u.id === selectedUniverse)
            : linkedUniverses?.[0];
          const geoRatio = Math.min(0.5, (activeUniverse?.geography_weight || 20) / 100);
          const scoreRatio = 1 - geoRatio;
          const aWeighted = (a.composite_score || 0) * scoreRatio + (a.geography_score || 0) * geoRatio;
          const bWeighted = (b.composite_score || 0) * scoreRatio + (b.geography_score || 0) * geoRatio;
          comparison = aWeighted - bWeighted;
          break;
        }
      }

      return sortDesc ? -comparison : comparison;
    });

    return filtered;
  }, [scores, activeTab, hideDisqualified, sortBy, sortDesc, activeOutreachScoreIds, selectedUniverse, linkedUniverses, searchQuery]);

  // Query existing pipeline deals for this listing's buyers (dedup check)
  const { data: pipelineDeals } = useQuery({
    queryKey: ['pipeline-deals-for-listing', listingId],
    queryFn: async () => {
      if (!listingId) return [];
      const { data, error } = await supabase
        .from('deal_pipeline')
        .select('id, remarketing_buyer_id')
        .eq('listing_id', listingId!)
        .not('remarketing_buyer_id', 'is', null)
        .is('deleted_at', null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!listingId,
  });

  // Map buyer_id -> pipeline deal_id for quick lookup
  const pipelineDealByBuyer = useMemo(() => {
    const map = new Map<string, string>();
    pipelineDeals?.forEach(d => {
      if (d.remarketing_buyer_id) map.set(d.remarketing_buyer_id, d.id);
    });
    return map;
  }, [pipelineDeals]);

  return {
    listing, listingLoading,
    linkedUniverses, refetchLinkedUniverses,
    allScores, scores, scoresLoading, filteredScores,
    feeAgreementLookup, outreachRecords, refetchOutreach,
    stats, outreachCount, universeMatchCounts,
    pipelineDealByBuyer,
    // State
    selectedUniverse, setSelectedUniverse,
    isScoring, setIsScoring,
    scoringProgress, setScoringProgress,
    activeTab, setActiveTab,
    sortBy, setSortBy,
    sortDesc, setSortDesc,
    hideDisqualified, setHideDisqualified,
    searchQuery, setSearchQuery,
    customInstructions, setCustomInstructions,
    geographyMode, setGeographyMode,
    backgroundScoring,
  };
}
