-- =============================================================================
-- Migration: Consolidate 4 admin view state tables into 1
-- Part of: Data Architecture Audit Phase 7 (Quick Win)
--
-- Replaces:
--   admin_connection_requests_views
--   admin_deal_sourcing_views
--   admin_owner_leads_views
--   admin_users_views
--
-- With single: admin_view_state (view_type discriminator)
-- =============================================================================

-- 1. Create the unified table
CREATE TABLE IF NOT EXISTS admin_view_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  view_type text NOT NULL CHECK (view_type IN (
    'connection_requests', 'deal_sourcing', 'owner_leads', 'users'
  )),
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(admin_id, view_type)
);

-- 2. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_admin_view_state_admin_id
  ON admin_view_state (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_view_state_type
  ON admin_view_state (view_type);
CREATE INDEX IF NOT EXISTS idx_admin_view_state_last_viewed
  ON admin_view_state (last_viewed_at);

-- 3. RLS — each admin can only see/update their own records
ALTER TABLE admin_view_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_own_view_state_select"
  ON admin_view_state FOR SELECT
  USING (admin_id = auth.uid());

CREATE POLICY "admins_own_view_state_insert"
  ON admin_view_state FOR INSERT
  WITH CHECK (admin_id = auth.uid());

CREATE POLICY "admins_own_view_state_update"
  ON admin_view_state FOR UPDATE
  USING (admin_id = auth.uid());

-- Service role can do anything (for RPCs)
CREATE POLICY "service_role_admin_view_state"
  ON admin_view_state FOR ALL
  TO service_role
  USING (true);

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE admin_view_state;

-- 5. Migrate existing data
INSERT INTO admin_view_state (admin_id, view_type, last_viewed_at, created_at, updated_at)
SELECT admin_id, 'connection_requests', last_viewed_at, created_at, updated_at
FROM admin_connection_requests_views
ON CONFLICT (admin_id, view_type) DO UPDATE SET
  last_viewed_at = GREATEST(admin_view_state.last_viewed_at, EXCLUDED.last_viewed_at);

INSERT INTO admin_view_state (admin_id, view_type, last_viewed_at, created_at, updated_at)
SELECT admin_id, 'deal_sourcing', last_viewed_at, created_at, updated_at
FROM admin_deal_sourcing_views
ON CONFLICT (admin_id, view_type) DO UPDATE SET
  last_viewed_at = GREATEST(admin_view_state.last_viewed_at, EXCLUDED.last_viewed_at);

INSERT INTO admin_view_state (admin_id, view_type, last_viewed_at, created_at, updated_at)
SELECT admin_id, 'owner_leads', last_viewed_at, created_at, updated_at
FROM admin_owner_leads_views
ON CONFLICT (admin_id, view_type) DO UPDATE SET
  last_viewed_at = GREATEST(admin_view_state.last_viewed_at, EXCLUDED.last_viewed_at);

INSERT INTO admin_view_state (admin_id, view_type, last_viewed_at, created_at, updated_at)
SELECT admin_id, 'users', last_viewed_at, created_at, updated_at
FROM admin_users_views
ON CONFLICT (admin_id, view_type) DO UPDATE SET
  last_viewed_at = GREATEST(admin_view_state.last_viewed_at, EXCLUDED.last_viewed_at);

-- 6. Create backward-compatible views (so existing code keeps working during transition)
CREATE OR REPLACE VIEW admin_connection_requests_views_v2 AS
SELECT id, admin_id, last_viewed_at, created_at, updated_at
FROM admin_view_state WHERE view_type = 'connection_requests';

CREATE OR REPLACE VIEW admin_deal_sourcing_views_v2 AS
SELECT id, admin_id, last_viewed_at, created_at, updated_at
FROM admin_view_state WHERE view_type = 'deal_sourcing';

CREATE OR REPLACE VIEW admin_owner_leads_views_v2 AS
SELECT id, admin_id, last_viewed_at, created_at, updated_at
FROM admin_view_state WHERE view_type = 'owner_leads';

CREATE OR REPLACE VIEW admin_users_views_v2 AS
SELECT id, admin_id, last_viewed_at, created_at, updated_at
FROM admin_view_state WHERE view_type = 'users';

-- 7. Update reset function to use new table
CREATE OR REPLACE FUNCTION reset_all_admin_notifications()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE admin_view_state
  SET last_viewed_at = NOW(), updated_at = NOW();
END;
$$;
