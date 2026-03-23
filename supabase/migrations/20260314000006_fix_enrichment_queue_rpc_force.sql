-- Finding 21: Add 'force' column to claim_enrichment_queue_items RETURNING clause
-- The RPC was missing the force column, causing forced re-enrichments to be
-- skipped when claimed via the RPC path (force was always undefined).
CREATE OR REPLACE FUNCTION claim_enrichment_queue_items(
  batch_size INTEGER DEFAULT 5,
  max_attempts INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  listing_id UUID,
  status TEXT,
  attempts INTEGER,
  queued_at TIMESTAMPTZ,
  force BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT eq.id
    FROM public.enrichment_queue eq
    WHERE eq.status = 'pending'
      AND eq.attempts < max_attempts
    ORDER BY eq.queued_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.enrichment_queue eq
  SET
    status = 'processing',
    attempts = eq.attempts + 1,
    started_at = NOW(),
    updated_at = NOW()
  FROM claimed
  WHERE eq.id = claimed.id
  RETURNING eq.id, eq.listing_id, eq.status, eq.attempts, eq.queued_at, eq.force;
END;
$$;
