-- Add 'paused' status to buyer_enrichment_queue check constraint
-- This enables pause/resume support for buyer enrichment operations.

ALTER TABLE public.buyer_enrichment_queue
  DROP CONSTRAINT IF EXISTS buyer_enrichment_queue_status_check;

ALTER TABLE public.buyer_enrichment_queue
  ADD CONSTRAINT buyer_enrichment_queue_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rate_limited', 'paused'));
