import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { invokeEdgeFunction } from '@/lib/invoke-edge-function';

export interface BuyerScore {
  buyer_id: string;
  company_name: string;
  pe_firm_name: string | null;
  pe_firm_id: string | null;
  buyer_type: string | null;
  hq_state: string | null;
  hq_city: string | null;
  has_fee_agreement: boolean;
  acquisition_appetite: string | null;
  company_website: string | null;
  platform_website: string | null;
  is_publicly_traded: boolean | null;
  is_pe_backed: boolean;
  composite_score: number;
  service_score: number;
  geography_score: number;
  size_score: number;
  bonus_score: number;
  fit_signals: string[];
  fit_reason: string;
  tier: 'move_now' | 'strong' | 'speculative';
  source: 'ai_seeded' | 'marketplace' | 'scored';
  /** Buyer type priority for ranking (1=PE-backed platform, 2=PE/FO, 3=IS/SF, 4=Operating, 5=Other) */
  buyer_type_priority?: number;
  /** Summary of transcript-extracted insights (when available) */
  transcript_summary?: string;
}

export interface RecommendedBuyersResult {
  buyers: BuyerScore[];
  total: number;
  cached: boolean;
  scored_at: string;
}

/** Validate edge function response shape to prevent cache corruption */
function validateResult(data: unknown): RecommendedBuyersResult {
  const d = data as RecommendedBuyersResult;
  if (!d || !Array.isArray(d.buyers) || typeof d.total !== 'number') {
    throw new Error('Unexpected response shape from score-deal-buyers');
  }
  return d;
}

export interface BuyerLookupResult {
  lookup: true;
  buyer_id: string;
  score: BuyerScore | null;
  rank: number | null;
  total_scored: number;
  status: string;
  was_rejected: boolean;
  was_niche_rejected: boolean;
}

export function useNewRecommendedBuyers(listingId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<RecommendedBuyersResult>({
    queryKey: ['new-recommended-buyers', listingId],
    queryFn: async () => {
      const data = await invokeEdgeFunction<RecommendedBuyersResult>('score-deal-buyers', {
        body: { listingId },
        maxRetries: 2,
      });
      return validateResult(data);
    },
    enabled: !!listingId,
    staleTime: 4 * 60 * 60 * 1000, // 4 hours — matches server cache
    retry: 1,
  });

  const refresh = useCallback(async () => {
    const data = await invokeEdgeFunction<RecommendedBuyersResult>('score-deal-buyers', {
      body: { listingId, forceRefresh: true },
      maxRetries: 2,
    });
    const validated = validateResult(data);
    queryClient.setQueryData(['new-recommended-buyers', listingId], validated);
    return validated;
  }, [listingId, queryClient]);

  /** Look up a specific buyer's full scoring breakdown for this deal */
  const lookupBuyer = useCallback(async (buyerId: string): Promise<BuyerLookupResult> => {
    const data = await invokeEdgeFunction<BuyerLookupResult>('score-deal-buyers', {
      body: { listingId, lookupBuyerId: buyerId },
      maxRetries: 1,
    });
    return data;
  }, [listingId]);

  return { ...query, refresh, lookupBuyer };
}
