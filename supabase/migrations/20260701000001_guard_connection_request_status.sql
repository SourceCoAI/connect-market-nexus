-- ============================================================================
-- SECURITY: Prevent non-admin users from changing connection request status
-- ============================================================================
-- The RLS UPDATE policy allows users to update their own connection_requests
-- rows (needed for user_message edits). However, this also allows a buyer
-- to change their own status to 'approved' via a direct .update() call.
--
-- This trigger acts as a column-level guard: only admins (via is_admin())
-- or the service role can change the `status` column. Regular users can
-- still update other columns on their own rows.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_connection_request_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow if status didn't change
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Allow if caller is admin
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Allow service role (triggers, RPCs running as SECURITY DEFINER)
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block non-admin status changes
  RAISE EXCEPTION 'Only admins can change connection request status';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_status_change ON public.connection_requests;
CREATE TRIGGER trg_guard_status_change
  BEFORE UPDATE ON public.connection_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_connection_request_status_change();

COMMENT ON FUNCTION public.guard_connection_request_status_change() IS
  'Security trigger that prevents non-admin users from changing the status '
  'column on connection_requests. Regular users can still update other '
  'columns (e.g. user_message). Admins and service_role are allowed.';
