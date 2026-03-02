import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCallback } from 'react';

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
  composite_score: number;
  service_score: number;
  geography_score: number;
  size_score: number;
  bonus_score: number;
  fit_signals: string[];
  fit_reason: string;
  tier: 'move_now' | 'strong' | 'speculative';
  source: 'ai_seeded' | 'marketplace' | 'scored';
}

export interface RecommendedBuyersResult {
  buyers: BuyerScore[];
  total: number;
  cached: boolean;
  scored_at: string;
}

/** Extract the real error message from a Supabase FunctionsHttpError */
async function extractEdgeFunctionError(error: unknown): Promise<string> {
  // FunctionsHttpError has a context property with the Response object
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const ctx = (error as { context: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) return body.error + (body.details ? `: ${body.details}` : '');
        return JSON.stringify(body);
      }
    } catch {
      // Fall through to generic message
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Validate edge function response shape to prevent cache corruption */
function validateResult(data: unknown): RecommendedBuyersResult {
  const d = data as RecommendedBuyersResult;
  if (!d || !Array.isArray(d.buyers) || typeof d.total !== 'number') {
    throw new Error('Unexpected response shape from score-deal-buyers');
  }
  return d;
}

export function useNewRecommendedBuyers(listingId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<RecommendedBuyersResult>({
    queryKey: ['new-recommended-buyers', listingId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('score-deal-buyers', {
        body: { listingId },
      });
      if (error) {
        const msg = await extractEdgeFunctionError(error);
        throw new Error(msg);
      }
      return validateResult(data);
    },
    enabled: !!listingId,
    staleTime: 4 * 60 * 60 * 1000, // 4 hours — matches server cache
    retry: 1,
  });

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('score-deal-buyers', {
      body: { listingId, forceRefresh: true },
    });
    if (error) {
      const msg = await extractEdgeFunctionError(error);
      throw new Error(msg);
    }
    const validated = validateResult(data);
    queryClient.setQueryData(['new-recommended-buyers', listingId], validated);
    return validated;
  }, [listingId, queryClient]);

  return { ...query, refresh };
}
