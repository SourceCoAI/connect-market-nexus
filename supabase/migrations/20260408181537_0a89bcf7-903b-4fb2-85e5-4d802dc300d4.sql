-- Add marketplace_queue_rank column to listings
ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS marketplace_queue_rank INT;

-- Create bulk update RPC for connection request statuses
CREATE OR REPLACE FUNCTION public.bulk_update_connection_request_status(
  request_ids UUID[],
  new_status TEXT,
  admin_notes TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE connection_requests
  SET
    status = new_status,
    decision_notes = COALESCE(admin_notes, decision_notes),
    decision_at = NOW(),
    updated_at = NOW()
  WHERE id = ANY(request_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;