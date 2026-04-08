-- ============================================================================
-- BULK UPDATE CONNECTION REQUEST STATUS
-- Date: 2026-04-08
-- Purpose: Allow admins to update many connection request statuses in one call
--          instead of one-by-one, preventing rate limits and timeouts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_connection_request_status(
  request_ids uuid[],
  new_status text,
  admin_notes text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_user_id uuid;
  admin_is_admin boolean;
  updated_count integer;
BEGIN
  -- Auth check
  admin_user_id := auth.uid();
  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Admin check
  SELECT is_admin INTO admin_is_admin FROM public.profiles WHERE id = admin_user_id;
  IF NOT COALESCE(admin_is_admin, false) THEN
    RAISE EXCEPTION 'Only admins can update connection requests';
  END IF;

  -- Validate status
  IF new_status NOT IN ('pending', 'approved', 'rejected', 'on_hold') THEN
    RAISE EXCEPTION 'Invalid status value: %', new_status;
  END IF;

  -- Bulk update with proper attribution
  UPDATE public.connection_requests
  SET
    status = new_status,
    updated_at = NOW(),
    admin_comment = COALESCE(admin_notes, admin_comment),
    decision_at = CASE WHEN new_status IN ('approved', 'rejected') THEN NOW() ELSE NULL END,
    approved_by = CASE WHEN new_status = 'approved' THEN admin_user_id ELSE NULL END,
    approved_at = CASE WHEN new_status = 'approved' THEN NOW() ELSE NULL END,
    rejected_by = CASE WHEN new_status = 'rejected' THEN admin_user_id ELSE NULL END,
    rejected_at = CASE WHEN new_status = 'rejected' THEN NOW() ELSE NULL END,
    on_hold_by = CASE WHEN new_status = 'on_hold' THEN admin_user_id ELSE NULL END,
    on_hold_at = CASE WHEN new_status = 'on_hold' THEN NOW() ELSE NULL END
  WHERE id = ANY(request_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION public.bulk_update_connection_request_status(uuid[], text, text) IS
  'Bulk update connection request statuses in a single transaction. Returns the number of rows updated.';
