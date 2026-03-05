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
  total: number;
  isRunning: boolean;
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

export function useBuyerEnrichmentQueue(universeId?: string) {
  const queryClient = useQueryClient();
  const { startOrQueueMajorOp } = useGlobalGateCheck();
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingStartTimeRef = useRef<number | null>(null);
  const lastCompletedRef = useRef<number>(0);
  const wasRunningRef = useRef<boolean>(false);

  const [progress, setProgress] = useState<QueueProgress>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    rateLimited: 0,
    total: 0,
    isRunning: false,
  });

  const [summary, setSummary] = useState<EnrichmentSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Fetch queue status
  const fetchQueueStatus = useCallback(async () => {
    if (!universeId) return;

    try {
      const { data, error } = await supabase
        .from('buyer_enrichment_queue')
        .select('buyer_id, status, rate_limit_reset_at, last_error')
        .eq('universe_id', universeId);

      if (error) throw error;

      const counts = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        rateLimited: 0,
      };

      let rateLimitResetAt: string | undefined;
      const failedItems: Array<{ buyerId: string; error: string }> = [];

      (data || []).forEach(
        (item: {
          buyer_id: string;
          status: string;
          rate_limit_reset_at?: string | null;
          last_error?: string | null;
        }) => {
          if (item.status === 'rate_limited') {
            counts.rateLimited++;
            if (item.rate_limit_reset_at) {
              rateLimitResetAt = item.rate_limit_reset_at;
            }
          } else if (item.status === 'pending') {
            counts.pending++;
          } else if (item.status === 'processing') {
            counts.processing++;
          } else if (item.status === 'completed') {
            counts.completed++;
          } else if (item.status === 'failed') {
            counts.failed++;
            if (item.last_error) {
              failedItems.push({
                buyerId: item.buyer_id,
                error: item.last_error,
              });
            }
          }
        },
      );

      const total =
        counts.pending + counts.processing + counts.completed + counts.failed + counts.rateLimited;
      const isRunning = counts.pending > 0 || counts.processing > 0 || counts.rateLimited > 0;

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
        // Generate summary
        const newSummary: EnrichmentSummary = {
          total,
          successful: counts.completed,
          failed: counts.failed,
          errors: failedItems,
          completedAt: new Date().toISOString(),
        };
        setSummary(newSummary);
        setShowSummary(true);

        // Show toast notification
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
        rateLimitResetAt,
      });

      return { counts, isRunning, failedItems };
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
        if (authError) throw authError;
        const { queued } = await startOrQueueMajorOp({
          operationType: 'buyer_enrichment',
          totalItems: enrichableBuyers.length,
          description: `Enrich ${enrichableBuyers.length} buyers`,
          userId: userData?.user?.id || 'unknown',
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
        const queueItems = enrichableBuyers.map((b) => ({
          buyer_id: b.id,
          universe_id: universeId,
          status: 'pending',
          attempts: 0,
          queued_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from('buyer_enrichment_queue').upsert(queueItems, {
          onConflict: 'buyer_id',
          ignoreDuplicates: false,
        });

        if (error) throw error;

        lastCompletedRef.current = 0;

        setProgress({
          pending: enrichableBuyers.length,
          processing: 0,
          completed: 0,
          failed: 0,
          rateLimited: 0,
          total: enrichableBuyers.length,
          isRunning: true,
        });

        toast.success(`Queued ${enrichableBuyers.length} buyers for enrichment`);

        // Trigger processor immediately
        await triggerProcessor();

        // Start polling and processing intervals
        startPolling();
      } catch (error) {
        toast.error('Failed to queue buyers for enrichment');
      }
    },
    [universeId, triggerProcessor],
  );

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
        console.warn('Enrichment polling timed out after 5 minutes - force stopping');
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

  // Cancel enrichment
  const cancel = useCallback(async () => {
    if (!universeId) return;

    try {
      // Delete pending and rate-limited items
      await supabase
        .from('buyer_enrichment_queue')
        .delete()
        .eq('universe_id', universeId)
        .in('status', ['pending', 'rate_limited']);

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
        total: 0,
        isRunning: false,
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

    // Subscribe to queue changes
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
          fetchQueueStatus();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);
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
    cancel,
    reset,
    fetchQueueStatus,
  };
}
