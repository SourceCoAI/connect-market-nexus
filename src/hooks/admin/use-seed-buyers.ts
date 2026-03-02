import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SeedBuyerResult {
  buyer_id: string;
  company_name: string;
  action: 'inserted' | 'enriched_existing' | 'probable_duplicate' | 'cached';
  why_relevant: string;
  was_new_record: boolean;
}

export interface SeedBuyersResponse {
  seeded_buyers: SeedBuyerResult[];
  total: number;
  inserted?: number;
  enriched_existing?: number;
  probable_duplicates?: number;
  cached: boolean;
  seeded_at: string;
  cache_key: string;
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

interface SeedBuyersParams {
  listingId: string;
  maxBuyers?: number;
  forceRefresh?: boolean;
}

/** Extract the real error message from a Supabase FunctionsHttpError */
async function extractEdgeFunctionError(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const ctx = (error as { context: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) return body.error + (body.details ? `: ${body.details}` : '');
        return JSON.stringify(body);
      }
    } catch {
      // Fall through
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Validate edge function response shape to prevent cache corruption */
function validateSeedResult(data: unknown): SeedBuyersResponse {
  const d = data as SeedBuyersResponse;
  if (!d || !Array.isArray(d.seeded_buyers) || typeof d.total !== 'number') {
    throw new Error('Unexpected response shape from seed-buyers');
  }
  return d;
}

export function useSeedBuyers() {
  const queryClient = useQueryClient();

  return useMutation<SeedBuyersResponse, Error, SeedBuyersParams>({
    mutationFn: async ({ listingId, maxBuyers, forceRefresh }) => {
      const { data, error } = await supabase.functions.invoke('seed-buyers', {
        body: { listingId, maxBuyers, forceRefresh },
      });
      if (error) {
        const msg = await extractEdgeFunctionError(error);
        throw new Error(msg);
      }
      return validateSeedResult(data);
    },
    onSuccess: (_data, variables) => {
      // Invalidate recommended buyers so the list refreshes with newly seeded buyers
      queryClient.invalidateQueries({
        queryKey: ['new-recommended-buyers', variables.listingId],
      });
    },
  });
}
