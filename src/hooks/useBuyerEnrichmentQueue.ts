import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useGlobalGateCheck } from '@/hooks/remarketing/useGlobalActivityQueue';

export interface QueueProgress {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  rateLimited: number;
  paused: number;
  total: number;
  isRunning: boolean;
  isPaused: boolean;
  rateLimitResetAt?: string;
}

export interface EnrichmentSummary {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{ buyerId: string; buyerName?: string; error: string }>;
  completedAt: string;
}

const POLL_INTERVAL_MS = 10000;
const PROCESS_INTERVAL_MS = 30000; // 30s — backup trigger; processor self-chains for continuous processing
const MAX_POLLING_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours — 190 buyers at ~20s each
const REALTIME_DEBOUNCE_MS = 2000; // Debounce realtime events to prevent fetch storms during bulk enrichment

export function useBuyerEnrichmentQueue(universeId?: string) {
  const queryClient = useQueryClient();
  const { startOrQueueMajorOp } = useGlobalGateCheck();
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingStartTimeRef = useRef<number | null>(null);
  const lastCompletedRef = useRef<number>(0);
  const wasRunningRef = useRef<boolean>(false);
  const realtimeDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const [progress, setProgress] = useState<QueueProgress>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    rateLimited: 0,
    paused: 0,
    total: 0,
    isRunning: false,
    isPaused: false,
  });

  const [summary, setSummary] = useState<EnrichmentSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Fetch queue status using lightweight count queries instead of fetching all rows
  const fetchQueueStatus = useCallback(async () => {
    if (!universeId) return;

    try {
      // Use parallel count queries grouped by status — much lighter than fetching all rows
      const [pendingRes, processingRes, completedRes, failedRes, rateLimitedRes, pausedRes] =
        await Promise.all([
          supabase.from('buyer_enrichment_queue').select('id', { count: 'exact', head: true }).eq('universe_id', universeId).eq('status', 'pending'),
          supabase.from('buyer_enrichment_queue').select('id', { count: 'exact', head: true }).eq('universe_id', universeId).eq('status', 'processing'),
          supabase.from('buyer_enrichment_queue').select('id', { count: 'exact', head: true }).eq('universe_id', universeId).eq('status', 'completed'),
          supabase.from('buyer_enrichment_queue').select('id', { count: 'exact', head: true }).eq('universe_id', universeId).eq('status', 'failed'),
          supabase.from('buyer_enrichment_queue').select('id, rate_limit_reset_at', { count: 'exact' }).eq('universe_id', universeId).eq('status', 'rate_limited').limit(1),
          supabase.from('buyer_enrichment_queue').select('id', { count: 'exact', head: true }).eq('universe_id', universeId).eq('status', 'paused'),
        ]);

      const counts = {
        pending: pendingRes.count || 0,
        processing: processingRes.count || 0,
        completed: completedRes.count || 0,
        failed: failedRes.count || 0,
        rateLimited: rateLimitedRes.count || 0,
        paused: pausedRes.count || 0,
      };

      let rateLimitResetAt: string | undefined;
      if (rateLimitedRes.data?.[0]?.rate_limit_reset_at) {
        rateLimitResetAt = rateLimitedRes.data[0].rate_limit_reset_at;
      }

      const total =
        counts.pending + counts.processing + counts.completed + counts.failed + counts.rateLimited + counts.paused;
      const isRunning = counts.pending > 0 || counts.processing > 0 || counts.rateLimited > 0;
      const isPaused = counts.paused > 0 && !isRunning;

      // Invalidate buyer queries when new completions happen
      if (counts.completed > lastCompletedRef.current) {
        lastCompletedRef.current = counts.completed;
        await queryClient.invalidateQueries({
          queryKey: ['remarketing', 'buyers', 'universe', universeId],
          refetchType: 'active',
        });
      }

      // Detect completion: was running, now stopped, and we have results
      if (wasRunningRef.current && !isRunning && total > 0) {
        // Only fetch failed item details at completion time (not every poll)
        const { data: failedData } = await supabase
          .from('buyer_enrichment_queue')
          .select('buyer_id, last_error')
          .eq('universe_id', universeId)
          .eq('status', 'failed')
          .not('last_error', 'is', null)
          .limit(50);

        const failedItems = (failedData || []).map(
          (item: { buyer_id: string; last_error: string | null }) => ({
            buyerId: item.buyer_id,
            error: item.last_error || 'Unknown error',
          }),
        );

        const newSummary: EnrichmentSummary = {
          total,
          successful: counts.completed,
          failed: counts.failed,
          errors: failedItems,
          completedAt: new Date().toISOString(),
        };
        setSummary(newSummary);
        setShowSummary(true);

        if (counts.failed > 0) {
          toast.warning(
            `Enrichment completed: ${counts.completed} successful, ${counts.failed} failed`,
            {
              action: {
                label: 'View Details',
                onClick: () => setShowSummary(true),
              },
            },
          );
        } else {
          toast.success(`Enrichment completed: ${counts.completed} buyers enriched`);
        }
      }

      wasRunningRef.current = isRunning;

      setProgress({
        ...counts,
        total,
        isRunning,
        isPaused,
        rateLimitResetAt,
      });

      return { counts, isRunning };
    } catch (error) {
      console.error('Error fetching buyer queue status:', error);
    }
  }, [universeId, queryClient]);

  // Trigger the background processor
  const triggerProcessor = useCallback(async () => {
    try {
      await supabase.functions.invoke('process-buyer-enrichment-queue');
    } catch (error) {
      console.warn(
        '[useBuyerEnrichmentQueue] Processor trigger failed, will retry on next interval:',
        error,
      );
    }
  }, []);

  // Start polling for status updates
  const startPolling = useCallback(() => {
    // Clear existing intervals
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);

    // Track polling start time
    pollingStartTimeRef.current = Date.now();

    // Poll for status
    pollIntervalRef.current = setInterval(async () => {
      const result = await fetchQueueStatus();

      // Check if we've exceeded the max polling duration (safety timeout)
      const pollingDuration = Date.now() - (pollingStartTimeRef.current || 0);
      const timedOut = pollingDuration > MAX_POLLING_DURATION_MS;

      if (timedOut) {
        console.warn('Enrichment polling timed out after 4 hours - force stopping');
        toast.warning('Enrichment process timed out. Some items may still be processing.', {
          description: 'Please refresh to see the latest status',
        });
      }

      if ((result && !result.isRunning) || timedOut) {
        // Stop polling when done or timed out
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);
        pollIntervalRef.current = null;
        processingIntervalRef.current = null;
        pollingStartTimeRef.current = null;
      }
    }, POLL_INTERVAL_MS);

    // Trigger processor periodically
    processingIntervalRef.current = setInterval(triggerProcessor, PROCESS_INTERVAL_MS);
  }, [fetchQueueStatus, triggerProcessor]);

  // Pause buyer enrichment
  const pause = useCallback(async () => {
    if (!universeId) return;

    try {
      // Pause pending items (they won't be picked up by the processor)
      await supabase
        .from('buyer_enrichment_queue')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('universe_id', universeId)
        .eq('status', 'pending');

      // Mark the global activity queue operation as paused
      await supabase
        .from('global_activity_queue')
        .update({ status: 'paused' })
        .eq('operation_type', 'buyer_enrichment')
        .eq('status', 'running');

      await fetchQueueStatus();
      toast.info('Enrichment paused', {
        description: 'In-progress buyers will finish. Remaining buyers are paused.',
      });
    } catch (error) {
      console.error('Failed to pause enrichment:', error);
    }
  }, [universeId, fetchQueueStatus]);

  // Resume buyer enrichment
  const resume = useCallback(async () => {
    if (!universeId) return;

    try {
      // Resume paused items back to pending
      await supabase
        .from('buyer_enrichment_queue')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('universe_id', universeId)
        .eq('status', 'paused');

      // Mark the global activity queue operation as running
      await supabase
        .from('global_activity_queue')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('operation_type', 'buyer_enrichment')
        .eq('status', 'paused');

      // Trigger processor immediately
      await triggerProcessor();
      startPolling();

      await fetchQueueStatus();
      toast.success('Enrichment resumed');
    } catch (error) {
      console.error('Failed to resume enrichment:', error);
    }
  }, [universeId, fetchQueueStatus, triggerProcessor, startPolling]);

  // Queue buyers for enrichment
  const queueBuyers = useCallback(
    async (
      buyers: Array<{
        id: string;
        platform_website?: string | null;
        pe_firm_website?: string | null;
        company_website?: string | null;
      }>,
    ) => {
      if (!universeId) {
        toast.error('Universe ID required for queue-based enrichment');
        return;
      }

      // Filter to buyers with websites
      const enrichableBuyers = buyers.filter(
        (b) => b.platform_website || b.pe_firm_website || b.company_website,
      );

      if (enrichableBuyers.length === 0) {
        toast.info('No buyers with websites to enrich');
        return;
      }

      try {
        // Gate check: register as major operation
        const { data: userData, error: authError } = await supabase.auth.getUser();
        if (authError) throw new Error(authError.message || 'Authentication failed');
        if (!userData?.user?.id) throw new Error('User session expired. Please sign in again.');
        const { queued } = await startOrQueueMajorOp({
          operationType: 'buyer_enrichment',
          totalItems: enrichableBuyers.length,
          description: `Enrich ${enrichableBuyers.length} buyers`,
          userId: userData.user.id,
        });
        if (queued) {
          // Another major op is running — ours was queued and will auto-start later
          return;
        }

        // Clear any existing queue items for this universe first (for "enrich all" scenario)
        await supabase
          .from('buyer_enrichment_queue')
          .delete()
          .eq('universe_id', universeId)
          .in('status', ['pending', 'rate_limited', 'failed']);

        // Insert new queue items using upsert to handle duplicates
        // Batch in chunks to avoid hitting PostgREST request size limits
        const BATCH_SIZE = 100;
        const now = new Date().toISOString();
        const queueItems = enrichableBuyers.map((b) => ({
          buyer_id: b.id,
          universe_id: universeId,
          status: 'pending',
          attempts: 0,
          queued_at: now,
        }));

        for (let i = 0; i < queueItems.length; i += BATCH_SIZE) {
          const batch = queueItems.slice(i, i + BATCH_SIZE);
          const { error } = await supabase.from('buyer_enrichment_queue').upsert(batch, {
            onConflict: 'buyer_id',
            ignoreDuplicates: false,
          });
          if (error) throw error;
        }

        lastCompletedRef.current = 0;

        setProgress({
          pending: enrichableBuyers.length,
          processing: 0,
          completed: 0,
          failed: 0,
          rateLimited: 0,
          paused: 0,
          total: enrichableBuyers.length,
          isRunning: true,
          isPaused: false,
        });

        toast.success(`Queued ${enrichableBuyers.length} buyers for enrichment`);

        // Trigger processor immediately
        await triggerProcessor();

        // Start polling and processing intervals
        startPolling();
      } catch (error: unknown) {
        console.error('Failed to queue buyers for enrichment:', error);
        // PostgrestError has .message but doesn't extend Error — check for it explicitly
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? String((error as { message: unknown }).message)
              : 'Unknown error';
        toast.error(`Failed to queue buyers for enrichment: ${message}`);
      }
    },
    [universeId, triggerProcessor, startPolling, startOrQueueMajorOp],
  );

  // Cancel enrichment
  const cancel = useCallback(async () => {
    if (!universeId) return;

    try {
      // Delete pending, paused, and rate-limited items
      await supabase
        .from('buyer_enrichment_queue')
        .delete()
        .eq('universe_id', universeId)
        .in('status', ['pending', 'rate_limited', 'paused']);

      // Mark the global activity queue operation as cancelled so it doesn't
      // block future major operations (BUG-C6 fix)
      await supabase
        .from('global_activity_queue')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        .eq('operation_type', 'buyer_enrichment')
        .in('status', ['running', 'queued']);

      // Clear intervals
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);
      pollIntervalRef.current = null;
      processingIntervalRef.current = null;
      pollingStartTimeRef.current = null;

      await fetchQueueStatus();
      toast.info('Enrichment cancelled');
    } catch (error) {
      console.error('Failed to cancel enrichment:', error);
    }
  }, [universeId, fetchQueueStatus]);

  // Reset progress
  const reset = useCallback(async () => {
    if (!universeId) return;

    try {
      // Delete all queue items for this universe
      await supabase.from('buyer_enrichment_queue').delete().eq('universe_id', universeId);

      setProgress({
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        rateLimited: 0,
        paused: 0,
        total: 0,
        isRunning: false,
        isPaused: false,
      });

      lastCompletedRef.current = 0;
    } catch (error) {
      console.error('Failed to reset queue:', error);
    }
  }, [universeId]);

  // Fetch initial status and subscribe to changes
  useEffect(() => {
    if (!universeId) return;

    fetchQueueStatus().then((result) => {
      if (result?.isRunning) {
        // Resume polling if there's active work
        startPolling();
      }
    });

    // Subscribe to queue changes (debounced to prevent fetch storms during bulk enrichment)
    const channel = supabase
      .channel(`buyer-enrichment-queue:${universeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'buyer_enrichment_queue',
          filter: `universe_id=eq.${universeId}`,
        },
        () => {
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => {
            fetchQueueStatus();
          }, REALTIME_DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, [universeId, fetchQueueStatus, startPolling]);

  // Dismiss summary
  const dismissSummary = useCallback(() => {
    setShowSummary(false);
  }, []);

  return {
    progress,
    summary,
    showSummary,
    dismissSummary,
    queueBuyers,
    pause,
    resume,
    cancel,
    reset,
    fetchQueueStatus,
  };
}
