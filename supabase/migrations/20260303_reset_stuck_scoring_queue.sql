-- One-time cleanup: mark stuck scoring queue items as failed.
-- These were queued before process-scoring-queue edge function existed,
-- so they were never processed. Marking as 'failed' preserves audit trail
-- and allows users to re-click "Score Buyers" to queue fresh items.

UPDATE public.remarketing_scoring_queue
SET status     = 'failed',
    last_error = 'cleared: process-scoring-queue worker did not exist when queued',
    updated_at = now()
WHERE status IN ('pending', 'processing');
