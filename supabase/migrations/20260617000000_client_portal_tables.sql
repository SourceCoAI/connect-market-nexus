-- Client Portal: 6 new tables for the portal feature
-- portal_organizations, portal_users, portal_deal_pushes,
-- portal_deal_responses, portal_notifications, portal_activity_log
--
-- IMPORTANT: This migration only creates NEW tables. It does NOT alter
-- any existing table, view, function, trigger, or RLS policy.

-- ══════════════════════════════════════════════════════════════════════
-- 1. portal_organizations
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS portal_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  buyer_id uuid REFERENCES remarketing_buyers(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  relationship_owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  portal_slug text UNIQUE NOT NULL,
  welcome_message text,
  logo_url text,
  preferred_industries text[] DEFAULT '{}',
  preferred_deal_size_min integer,
  preferred_deal_size_max integer,
  preferred_geographies text[] DEFAULT '{}',
  notification_frequency text NOT NULL DEFAULT 'instant' CHECK (notification_frequency IN ('instant', 'daily_digest', 'weekly_digest')),
  auto_reminder_enabled boolean NOT NULL DEFAULT false,
  auto_reminder_days integer DEFAULT 7,
  auto_reminder_max integer DEFAULT 2,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE portal_organizations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_portal_orgs_status ON portal_organizations(status);
CREATE INDEX idx_portal_orgs_buyer_id ON portal_organizations(buyer_id);
CREATE INDEX idx_portal_orgs_relationship_owner ON portal_organizations(relationship_owner_id);
CREATE INDEX idx_portal_orgs_slug ON portal_organizations(portal_slug);

-- ══════════════════════════════════════════════════════════════════════
-- 2. portal_users
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_org_id uuid NOT NULL REFERENCES portal_organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('primary_contact', 'admin', 'viewer')),
  email text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  invite_sent_at timestamptz,
  invite_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE portal_users ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_portal_users_org ON portal_users(portal_org_id);
CREATE INDEX idx_portal_users_profile ON portal_users(profile_id);
CREATE INDEX idx_portal_users_contact ON portal_users(contact_id);
CREATE INDEX idx_portal_users_email ON portal_users(email);

-- ══════════════════════════════════════════════════════════════════════
-- 3. portal_deal_pushes
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS portal_deal_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_org_id uuid NOT NULL REFERENCES portal_organizations(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  pushed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  push_note text,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review', 'viewed', 'interested', 'passed',
    'needs_info', 'reviewing', 'under_nda', 'archived'
  )),
  priority text NOT NULL DEFAULT 'standard' CHECK (priority IN ('standard', 'high', 'urgent')),
  deal_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_viewed_at timestamptz,
  response_due_by timestamptz,
  reminder_count integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE portal_deal_pushes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_portal_pushes_org ON portal_deal_pushes(portal_org_id);
CREATE INDEX idx_portal_pushes_listing ON portal_deal_pushes(listing_id);
CREATE INDEX idx_portal_pushes_pushed_by ON portal_deal_pushes(pushed_by);
CREATE INDEX idx_portal_pushes_status ON portal_deal_pushes(status);
CREATE INDEX idx_portal_pushes_created ON portal_deal_pushes(created_at DESC);

-- ══════════════════════════════════════════════════════════════════════
-- 4. portal_deal_responses
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS portal_deal_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  push_id uuid NOT NULL REFERENCES portal_deal_pushes(id) ON DELETE CASCADE,
  responded_by uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  response_type text NOT NULL CHECK (response_type IN (
    'interested', 'pass', 'need_more_info', 'reviewing', 'internal_review'
  )),
  notes text,
  internal_notes text, -- visible ONLY to SourceCo admins, never to portal users
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE portal_deal_responses ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_portal_responses_push ON portal_deal_responses(push_id);
CREATE INDEX idx_portal_responses_user ON portal_deal_responses(responded_by);

-- ══════════════════════════════════════════════════════════════════════
-- 5. portal_notifications
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  portal_org_id uuid NOT NULL REFERENCES portal_organizations(id) ON DELETE CASCADE,
  push_id uuid REFERENCES portal_deal_pushes(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN (
    'new_deal', 'reminder', 'status_update', 'document_ready', 'welcome', 'digest'
  )),
  channel text NOT NULL DEFAULT 'both' CHECK (channel IN ('email', 'in_app', 'both')),
  subject text,
  body text,
  sent_at timestamptz,
  read_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE portal_notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_portal_notifs_user ON portal_notifications(portal_user_id);
CREATE INDEX idx_portal_notifs_org ON portal_notifications(portal_org_id);
CREATE INDEX idx_portal_notifs_push ON portal_notifications(push_id);
CREATE INDEX idx_portal_notifs_read ON portal_notifications(read_at) WHERE read_at IS NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 6. portal_activity_log
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS portal_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_org_id uuid NOT NULL REFERENCES portal_organizations(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('portal_user', 'admin')),
  action text NOT NULL CHECK (action IN (
    'deal_pushed', 'deal_viewed', 'response_submitted',
    'document_downloaded', 'message_sent', 'login',
    'settings_changed', 'reminder_sent', 'user_invited',
    'user_deactivated', 'portal_created', 'portal_archived',
    'converted_to_pipeline'
  )),
  push_id uuid REFERENCES portal_deal_pushes(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE portal_activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_portal_activity_org ON portal_activity_log(portal_org_id);
CREATE INDEX idx_portal_activity_actor ON portal_activity_log(actor_id);
CREATE INDEX idx_portal_activity_action ON portal_activity_log(action);
CREATE INDEX idx_portal_activity_push ON portal_activity_log(push_id);
CREATE INDEX idx_portal_activity_created ON portal_activity_log(created_at DESC);

-- ══════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ══════════════════════════════════════════════════════════════════════

-- Helper: check if current user is a portal member for a given org
CREATE OR REPLACE FUNCTION is_portal_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portal_users
    WHERE portal_org_id = org_id
      AND profile_id = auth.uid()
      AND is_active = true
  );
$$;

-- ── portal_organizations ─────────────────────────────────────────────
CREATE POLICY "Admins can manage all portal orgs"
  ON portal_organizations FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Portal users can view own org"
  ON portal_organizations FOR SELECT TO authenticated
  USING (is_portal_member(id) AND deleted_at IS NULL);

-- ── portal_users ─────────────────────────────────────────────────────
CREATE POLICY "Admins can manage all portal users"
  ON portal_users FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Portal users can view own org users"
  ON portal_users FOR SELECT TO authenticated
  USING (is_portal_member(portal_org_id));

-- ── portal_deal_pushes ───────────────────────────────────────────────
CREATE POLICY "Admins can manage all portal pushes"
  ON portal_deal_pushes FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Portal users can view own org pushes"
  ON portal_deal_pushes FOR SELECT TO authenticated
  USING (is_portal_member(portal_org_id));

CREATE POLICY "Portal users can update push status in own org"
  ON portal_deal_pushes FOR UPDATE TO authenticated
  USING (is_portal_member(portal_org_id))
  WITH CHECK (is_portal_member(portal_org_id));

-- ── portal_deal_responses ────────────────────────────────────────────
-- Portal users can see responses but NOT the internal_notes field.
-- internal_notes filtering is enforced at the application layer via
-- a view or by selecting specific columns.
CREATE POLICY "Admins can manage all portal responses"
  ON portal_deal_responses FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Portal users can view responses in own org"
  ON portal_deal_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM portal_deal_pushes p
      WHERE p.id = push_id AND is_portal_member(p.portal_org_id)
    )
  );

CREATE POLICY "Portal users can insert responses in own org"
  ON portal_deal_responses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portal_deal_pushes p
      WHERE p.id = push_id AND is_portal_member(p.portal_org_id)
    )
  );

-- ── portal_notifications ─────────────────────────────────────────────
CREATE POLICY "Admins can manage all portal notifications"
  ON portal_notifications FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Portal users can view own notifications"
  ON portal_notifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM portal_users pu
      WHERE pu.id = portal_user_id
        AND pu.profile_id = auth.uid()
        AND pu.is_active = true
    )
  );

CREATE POLICY "Portal users can update own notifications"
  ON portal_notifications FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM portal_users pu
      WHERE pu.id = portal_user_id
        AND pu.profile_id = auth.uid()
        AND pu.is_active = true
    )
  );

-- ── portal_activity_log ──────────────────────────────────────────────
-- Admin-only for SELECT/UPDATE/DELETE. Both admins and portal users can INSERT
-- (portal users log their own actions like response_submitted, deal_viewed).
CREATE POLICY "Admins can manage all portal activity"
  ON portal_activity_log FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Portal users can insert own org activity"
  ON portal_activity_log FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portal_users pu
      WHERE pu.profile_id = auth.uid()
        AND pu.portal_org_id = portal_org_id
        AND pu.is_active = true
    )
  );

CREATE POLICY "Service role can insert portal activity"
  ON portal_activity_log FOR INSERT TO service_role
  WITH CHECK (true);
