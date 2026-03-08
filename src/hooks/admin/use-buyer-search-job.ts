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

/**
 * Creates a buyer search job record and polls for progress updates.
 * The seed-buyers edge function updates the job row as it progresses.
 */
export function useBuyerSearchJob(listingId: string) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [job, setJob] = useState<BuyerSearchJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    const { data } = await (supabase as any)
      .from('buyer_search_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    if (data) {
      setJob(data as BuyerSearchJob);
      if (data.status === 'completed' || data.status === 'failed') {
        stopPolling();
        // Auto-clear after 8 seconds on completion
        if (data.status === 'completed') {
          setTimeout(() => {
            setJob(null);
            setActiveJobId(null);
          }, 8000);
        }
      }
    }
  }, [stopPolling]);

  // Start polling when activeJobId is set
  useEffect(() => {
    if (!activeJobId) return;
    // Immediate first poll
    pollJob(activeJobId);
    pollRef.current = setInterval(() => pollJob(activeJobId), POLL_INTERVAL);
    return stopPolling;
  }, [activeJobId, pollJob, stopPolling]);

  /** Create a new job record and start polling */
  const createJob = useCallback(async (listingName?: string): Promise<string> => {
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
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
