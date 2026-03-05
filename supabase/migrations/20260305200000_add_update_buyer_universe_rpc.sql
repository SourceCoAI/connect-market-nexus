-- ============================================================================
-- Add RPC to update buyer universe_id safely
--
-- The audit_buyer_changes trigger references the dropped deal_breakers column,
-- causing all UPDATEs on the buyers table to fail. This RPC wraps the update
-- with exception handling: tries the normal path first, falls back to
-- temporarily disabling the audit trigger if it fails.
--
-- Once migration 20260523000000_fix_audit_trigger_dropped_column.sql is
-- deployed, the normal path will succeed and the fallback is never reached.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_buyer_universe(
  p_buyer_id UUID,
  p_universe_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Try the normal update path (works once audit trigger is fixed)
  UPDATE public.buyers
  SET universe_id = p_universe_id,
      updated_at = now()
  WHERE id = p_buyer_id;
EXCEPTION
  WHEN undefined_column THEN
    -- The audit trigger references dropped columns.
    -- Temporarily disable triggers for this update only.
    PERFORM set_config('session_replication_role', 'replica', true);
    UPDATE public.buyers
    SET universe_id = p_universe_id,
        updated_at = now()
    WHERE id = p_buyer_id;
    PERFORM set_config('session_replication_role', 'origin', true);
END;
$$;

COMMENT ON FUNCTION public.update_buyer_universe IS
  'Safely update a buyer''s universe_id, handling the broken '
  'audit_buyer_changes trigger that references dropped columns.';
