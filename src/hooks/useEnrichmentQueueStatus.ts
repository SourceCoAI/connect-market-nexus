import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 10000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes

type EnrichmentQueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface UseEnrichmentQueueStatusOptions {
  listingId: string | null;
  enabled: boolean;
  onComplete?: (status: 'completed' | 'failed') => void;
}

/**
 * Polls enrichment_queue for a specific listing_id and fires a toast +
 * invalidates the deal query when the job transitions to completed/failed.
 */
export function useEnrichmentQueueStatus({
  listingId,
  enabled,
  onComplete,
}: UseEnrichmentQueueStatusOptions) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startedAtRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled || !listingId) return;

    startedAtRef.current = Date.now();

    const poll = async () => {
      // Stop after max duration with user notification
      if (startedAtRef.current && Date.now() - startedAtRef.current > MAX_POLL_DURATION_MS) {
        stopPolling();
        toast.warning('Enrichment is taking longer than expected. Refresh the page to check status.', { duration: 8000 });
        onComplete?.('failed');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('enrichment_queue')
          .select('status, last_error, completed_at')
          .eq('listing_id', listingId)
          .order('queued_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.warn('[EnrichmentQueueStatus] Poll error:', error);
          return;
        }

        if (!data) return;

        const status = data.status as EnrichmentQueueStatus;

        if (status === 'completed') {
          stopPolling();
          toast.success('Deal enrichment complete — data updated', { duration: 5000 });
          queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', listingId] });
          queryClient.invalidateQueries({
            queryKey: ['remarketing', 'deal-transcripts', listingId],
          });
          onComplete?.('completed');
        } else if (status === 'failed') {
          stopPolling();
          const errMsg = data.last_error || 'Unknown error';
          toast.error('Deal enrichment failed', { description: errMsg, duration: 8000 });
          onComplete?.('failed');
        }
      } catch (err) {
        console.warn('[EnrichmentQueueStatus] Unexpected poll error:', err);
      }
    };

    // Start polling
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => stopPolling();
  }, [enabled, listingId, queryClient, stopPolling, onComplete]);

  return { stopPolling };
}
