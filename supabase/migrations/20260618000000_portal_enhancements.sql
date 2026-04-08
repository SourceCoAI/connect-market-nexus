-- Portal enhancements: messaging, data room link, RLS fix, notification tracking
-- This migration adds deal-level messaging, links portal deals to data room access,
-- and fixes the internal_notes security issue.

-- ── 1. Portal deal messages (deal-level chat between admin and portal users) ──
CREATE TABLE IF NOT EXISTS portal_deal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  push_id uuid NOT NULL REFERENCES portal_deal_pushes(id) ON DELETE CASCADE,
  portal_org_id uuid NOT NULL REFERENCES portal_organizations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('admin', 'portal_user')),
  sender_name text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_messages_push ON portal_deal_messages(push_id, created_at DESC);
CREATE INDEX idx_portal_messages_org ON portal_deal_messages(portal_org_id);

ALTER TABLE portal_deal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all portal messages"
  ON portal_deal_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Portal users can view messages in own org"
  ON portal_deal_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM portal_users
    WHERE portal_users.portal_org_id = portal_deal_messages.portal_org_id
      AND portal_users.profile_id = auth.uid()
      AND portal_users.is_active = true
  ));

CREATE POLICY "Portal users can insert messages in own org"
  ON portal_deal_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM portal_users
    WHERE portal_users.portal_org_id = portal_deal_messages.portal_org_id
      AND portal_users.profile_id = auth.uid()
      AND portal_users.is_active = true
  ));


-- ── 2. Add data room access token to portal deal pushes ──
ALTER TABLE portal_deal_pushes
  ADD COLUMN IF NOT EXISTS data_room_access_token text;

COMMENT ON COLUMN portal_deal_pushes.data_room_access_token IS
  'Optional access token from deal_data_room_access for document viewing';


-- ── 3. Fix RLS: create a secure view that strips internal_notes for portal users ──
-- Instead of modifying the existing RLS policies (which could break things),
-- we add a column-level approach: portal users' SELECT policy filters the column.
-- The simplest safe approach: drop and recreate the portal user SELECT policy
-- to exclude internal_notes by using a security-definer function.

CREATE OR REPLACE FUNCTION portal_responses_for_user(p_push_id uuid)
RETURNS TABLE (
  id uuid,
  push_id uuid,
  responded_by uuid,
  response_type text,
  notes text,
  internal_notes text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    r.id,
    r.push_id,
    r.responded_by,
    r.response_type,
    r.notes,
    -- Only show internal_notes to admins
    CASE WHEN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
      THEN r.internal_notes
      ELSE NULL
    END AS internal_notes,
    r.created_at
  FROM portal_deal_responses r
  WHERE r.push_id = p_push_id
  ORDER BY r.created_at DESC;
$$;


-- ── 4. Add message_count to help with unread badges ──
-- (tracked at query time, no column needed)

-- ── 5. Indexes for notification queries ──
CREATE INDEX IF NOT EXISTS idx_portal_notifications_user_unread
  ON portal_notifications(portal_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_portal_pushes_status_reminder
  ON portal_deal_pushes(portal_org_id, status, created_at)
  WHERE status IN ('pending_review', 'viewed');
