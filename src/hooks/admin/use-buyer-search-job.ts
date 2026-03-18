import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BuyerSearchJob {
  id: string;
  listing_id: string;
  listing_name: string | null;
  status: 'pending' | 'searching' | 'scoring' | 'completed' | 'failed';
  progress_pct: number;
  progress_message: string | null;
  buyers_found: number;
  buyers_inserted: number;
  buyers_updated: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

const POLL_INTERVAL = 2000;
/** If a job hasn't been updated in this many ms, consider it stale/crashed */
const STALE_JOB_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Creates a buyer search job record and polls for progress updates.
 * The seed-buyers edge function updates the job row as it progresses.
 */
export function useBuyerSearchJob(listingId: string) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [job, setJob] = useState<BuyerSearchJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountCheckedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    const { data, error } = await supabase
      .from('buyer_search_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error) {
      console.error('Error polling buyer search job:', error);
      return; // keep polling, don't wipe job state
    }

    if (data) {
      // Detect stale jobs — if the job hasn't been updated in 3 minutes,
      // the edge function likely crashed without updating the job record.
      const updatedAt = data.updated_at || data.created_at;
      const isStale = updatedAt &&
        Date.now() - new Date(updatedAt).getTime() > STALE_JOB_TIMEOUT_MS &&
        data.status !== 'completed' && data.status !== 'failed';

      if (isStale) {
        const staleJob: BuyerSearchJob = {
          ...(data as BuyerSearchJob),
          status: 'failed',
          progress_message: 'The search appears to have stopped unexpectedly. Please try again.',
          error: 'Job timed out — no progress update received',
        };
        setJob(staleJob);
        stopPolling();
        return;
      }

      setJob(data as BuyerSearchJob);
      if (data.status === 'completed' || data.status === 'failed') {
        stopPolling();
        if (data.status === 'completed') {
          setTimeout(() => {
            setJob(null);
            setActiveJobId(null);
          }, 8000);
        }
      }
    }
  }, [stopPolling]);

  // Resume polling for any active job on mount
  useEffect(() => {
    if (mountCheckedRef.current || !listingId) return;
    mountCheckedRef.current = true;

    const resumeActiveJob = async () => {
      const { data, error } = await supabase
        .from('buyer_search_jobs')
        .select('*')
        .eq('listing_id', listingId)
        .in('status', ['pending', 'searching', 'scoring'])
        .order('created_at', { ascending: false })
        .maybeSingle();

      if (error) {
        console.error('Error checking for active buyer search job:', error);
        return;
      }

      if (data) {
        // Don't resume stale jobs — treat them as failed
        const updatedAt = data.updated_at || data.created_at;
        const isStale = updatedAt &&
          Date.now() - new Date(updatedAt).getTime() > STALE_JOB_TIMEOUT_MS;

        if (isStale) {
          // Show as failed without polling
          setJob({
            ...(data as BuyerSearchJob),
            status: 'failed',
            progress_message: 'The previous search stopped unexpectedly. Please try again.',
            error: 'Job timed out — no progress update received',
          });
          return;
        }

        setJob(data as BuyerSearchJob);
        setActiveJobId(data.id);
      }
    };

    resumeActiveJob();
  }, [listingId]);

  // Start polling when activeJobId is set
  useEffect(() => {
    if (!activeJobId) return;
    pollJob(activeJobId);
    pollRef.current = setInterval(() => pollJob(activeJobId), POLL_INTERVAL);
    return stopPolling;
  }, [activeJobId, pollJob, stopPolling]);

  /** Create a new job record and start polling */
  const createJob = useCallback(async (listingName?: string): Promise<string> => {
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('buyer_search_jobs')
      .insert({
        listing_id: listingId,
        listing_name: listingName || null,
        status: 'pending',
        progress_pct: 0,
        progress_message: 'Initializing AI buyer search…',
        created_by: user?.user?.id || null,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('Failed to create buyer search job:', error);
      throw new Error('Failed to create search job');
    }

    const jobId = data.id as string;
    setActiveJobId(jobId);
    return jobId;
  }, [listingId]);

  /** Dismiss the progress UI */
  const dismiss = useCallback(() => {
    stopPolling();
    setJob(null);
    setActiveJobId(null);
  }, [stopPolling]);

  return { job, createJob, dismiss, isActive: !!activeJobId };
}
