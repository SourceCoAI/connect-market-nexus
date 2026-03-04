/**
 * useFirefliesAutoPair
 *
 * Invokes the auto-pair-all-fireflies edge function to match Fireflies
 * transcripts with buyers and deals, and reports pairing results.
 *
 * Returns: { loading, result, runAutoPair }
 *
 * Tables: fireflies_transcripts, buyers, deals (via edge function)
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AutoPairResult {
  success: boolean;
  transcripts_processed: number;
  buyers_paired: number;
  buyers_skipped: number;
  deals_paired: number;
  deals_skipped: number;
  errors?: string[];
}

interface UseFirefliesAutoPairOptions {
  /** Restrict to specific buyer IDs. */
  buyerIds?: string[];
  /** Restrict to specific listing IDs. */
  listingIds?: string[];
  /** Max Fireflies transcripts to process. Default 500. */
  limit?: number;
}

export function useFirefliesAutoPair(options?: UseFirefliesAutoPairOptions) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AutoPairResult | null>(null);
  const queryClient = useQueryClient();

  const runAutoPair = async () => {
    setLoading(true);
    setResult(null);
    const toastId = toast.loading('Syncing all Fireflies transcripts with buyers & deals...');

    try {
      const { data, error } = await supabase.functions.invoke('auto-pair-all-fireflies', {
        body: {
          buyerIds: options?.buyerIds,
          listingIds: options?.listingIds,
          limit: options?.limit,
        },
      });

      if (error) throw error;

      const res = data as AutoPairResult;
      setResult(res);

      const parts: string[] = [];
      if (res.buyers_paired > 0)
        parts.push(`${res.buyers_paired} buyer link${res.buyers_paired !== 1 ? 's' : ''}`);
      if (res.deals_paired > 0)
        parts.push(`${res.deals_paired} deal link${res.deals_paired !== 1 ? 's' : ''}`);

      if (parts.length > 0) {
        toast.success(
          `Auto-paired ${parts.join(' + ')} from ${res.transcripts_processed} transcripts`,
          { id: toastId },
        );
      } else {
        toast.info(`Scanned ${res.transcripts_processed} transcripts — no new matches found`, {
          id: toastId,
        });
      }

      if (res.errors?.length) {
        toast.warning(
          `${res.errors.length} error${res.errors.length !== 1 ? 's' : ''} during pairing`,
        );
      }

      // Invalidate relevant queries so lists refresh
      queryClient.invalidateQueries({ queryKey: ['remarketing'] });
    } catch (error) {
      toast.error(
        error instanceof Error ? `Auto-pair failed: ${error.message}` : 'Auto-pair failed',
        { id: toastId },
      );
    } finally {
      setLoading(false);
    }
  };

  return { loading, result, runAutoPair };
}
