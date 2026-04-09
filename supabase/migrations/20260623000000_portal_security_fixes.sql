-- =============================================================================
-- Migration: Portal Security Fixes
-- Date: 2026-06-23
-- Description: Fixes multiple security and integrity issues found in portal audit
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FIX: Viewer role can submit deal responses (privilege escalation)
--    Restrict INSERT on portal_deal_responses to admin and primary_contact roles.
--    Viewers should not be able to submit responses.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Portal users can insert responses in own org" ON portal_deal_responses;
CREATE POLICY "Portal users can insert responses in own org"
  ON portal_deal_responses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portal_deal_pushes p
      JOIN portal_users pu ON pu.portal_org_id = p.portal_org_id
      WHERE p.id = push_id
        AND pu.profile_id = auth.uid()
        AND pu.is_active = true
        AND pu.role IN ('admin', 'primary_contact')
    )
  );

-- -----------------------------------------------------------------------------
-- 2. FIX: Portal users can spoof admin messages
--    Enforce sender_type = 'portal_user' for portal user inserts so they
--    cannot impersonate admin senders.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Portal users can insert messages in own org" ON portal_deal_messages;
CREATE POLICY "Portal users can insert messages in own org"
  ON portal_deal_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'portal_user'
    AND EXISTS (
      SELECT 1 FROM portal_users
      WHERE portal_users.portal_org_id = portal_deal_messages.portal_org_id
        AND portal_users.profile_id = auth.uid()
        AND portal_users.is_active = true
    )
  );

-- -----------------------------------------------------------------------------
-- 3. FIX: Portal users can update any column on deal pushes
--    Add a BEFORE UPDATE trigger that restricts non-admin users to only
--    modifying status, first_viewed_at, and updated_at columns.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_portal_push_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Admins can change anything
  IF is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Portal users can only change: status, first_viewed_at, updated_at
  IF NEW.push_note IS DISTINCT FROM OLD.push_note
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.deal_snapshot IS DISTINCT FROM OLD.deal_snapshot
    OR NEW.pushed_by IS DISTINCT FROM OLD.pushed_by
    OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
    OR NEW.portal_org_id IS DISTINCT FROM OLD.portal_org_id
    OR NEW.response_due_by IS DISTINCT FROM OLD.response_due_by
    OR NEW.reminder_count IS DISTINCT FROM OLD.reminder_count
    OR NEW.last_reminder_at IS DISTINCT FROM OLD.last_reminder_at
    OR NEW.data_room_access_token IS DISTINCT FROM OLD.data_room_access_token
  THEN
    RAISE EXCEPTION 'Portal users can only update status and view tracking fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_portal_push_update ON portal_deal_pushes;
CREATE TRIGGER trg_check_portal_push_update
  BEFORE UPDATE ON portal_deal_pushes
  FOR EACH ROW
  EXECUTE FUNCTION check_portal_push_update();

-- -----------------------------------------------------------------------------
-- 4. FIX: portal_deal_messages admin policy uses profiles.is_admin column
--         instead of the is_admin() function
--    Replace with correct function-based check for consistent admin resolution.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can manage all portal messages" ON portal_deal_messages;
CREATE POLICY "Admins can manage all portal messages"
  ON portal_deal_messages FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. FIX: contact_assignments references deleted 'deals' table
--    Re-point the foreign key to the correct deal_pipeline table.
-- -----------------------------------------------------------------------------

ALTER TABLE public.contact_assignments
  DROP CONSTRAINT IF EXISTS contact_assignments_deal_id_fkey;
ALTER TABLE public.contact_assignments
  ADD CONSTRAINT contact_assignments_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal_pipeline(id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- 6. FIX: Missing indexes for portal query performance
--    Add composite indexes on the most common portal query patterns.
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_portal_deal_pushes_org_status
  ON portal_deal_pushes(portal_org_id, status);

CREATE INDEX IF NOT EXISTS idx_portal_users_org_active
  ON portal_users(portal_org_id, is_active);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_user_read
  ON portal_notifications(portal_user_id, read_at);

CREATE INDEX IF NOT EXISTS idx_portal_deal_messages_push_created
  ON portal_deal_messages(push_id, created_at);

-- -----------------------------------------------------------------------------
-- 7. FIX: Track invite_accepted_at on first portal login
--    New RPC the frontend calls after portal authentication to record
--    first-login acceptance and last-login timestamps.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.track_portal_login(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT po.id INTO v_org_id
  FROM portal_organizations po
  WHERE po.portal_slug = p_slug AND po.deleted_at IS NULL
  LIMIT 1;

  IF v_org_id IS NULL THEN RETURN; END IF;

  UPDATE portal_users
  SET
    last_login_at = now(),
    invite_accepted_at = COALESCE(invite_accepted_at, now()),
    updated_at = now()
  WHERE portal_org_id = v_org_id
    AND profile_id = v_user_id
    AND is_active = true;
END;
$$;
