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
  buyer_id uuid REFERENCES buyers(id) ON DELETE SET NULL,
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
-- =============================================================================
-- Microsoft Outlook Email Integration
-- Creates tables for email messages, connections, access logging, and
-- contact assignments for the SourceCo remarketing tool.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Contact Assignments Table
--    Tracks which team members are assigned to which contacts/deals.
--    This is the source of truth for email access control.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sourceco_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT contact_or_deal_required CHECK (contact_id IS NOT NULL OR deal_id IS NOT NULL)
);

CREATE INDEX idx_contact_assignments_user ON public.contact_assignments(sourceco_user_id) WHERE is_active = true;
CREATE INDEX idx_contact_assignments_contact ON public.contact_assignments(contact_id) WHERE is_active = true;
CREATE INDEX idx_contact_assignments_deal ON public.contact_assignments(deal_id) WHERE is_active = true;
-- Separate unique indexes for contact-only and deal-only assignments
-- (PostgreSQL treats NULLs as distinct in unique indexes, so a composite
-- index on nullable columns would allow unwanted duplicates)
CREATE UNIQUE INDEX idx_contact_assignments_unique_contact
  ON public.contact_assignments(sourceco_user_id, contact_id)
  WHERE is_active = true AND contact_id IS NOT NULL;

CREATE UNIQUE INDEX idx_contact_assignments_unique_deal
  ON public.contact_assignments(sourceco_user_id, deal_id)
  WHERE is_active = true AND deal_id IS NOT NULL;

ALTER TABLE public.contact_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contact assignments"
  ON public.contact_assignments FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own assignments"
  ON public.contact_assignments FOR SELECT
  USING (auth.uid() = sourceco_user_id AND is_active = true);

-- ---------------------------------------------------------------------------
-- 2. Email Connections Table
--    Stores OAuth connections between team members and their Outlook accounts.
-- ---------------------------------------------------------------------------
CREATE TYPE public.email_connection_status AS ENUM ('active', 'expired', 'revoked', 'error');

CREATE TABLE IF NOT EXISTS public.email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sourceco_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  microsoft_user_id TEXT NOT NULL,
  email_address TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  webhook_subscription_id TEXT,
  webhook_expires_at TIMESTAMPTZ,
  status public.email_connection_status NOT NULL DEFAULT 'active',
  last_sync_at TIMESTAMPTZ,
  last_sync_error_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_connection_per_user UNIQUE (sourceco_user_id)
);

CREATE INDEX idx_email_connections_status ON public.email_connections(status);
CREATE INDEX idx_email_connections_webhook_expires ON public.email_connections(webhook_expires_at)
  WHERE status = 'active';

ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all email connections"
  ON public.email_connections FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own connection"
  ON public.email_connections FOR SELECT
  USING (auth.uid() = sourceco_user_id);

CREATE POLICY "Users can update their own connection"
  ON public.email_connections FOR UPDATE
  USING (auth.uid() = sourceco_user_id)
  WITH CHECK (auth.uid() = sourceco_user_id);

-- ---------------------------------------------------------------------------
-- 3. Email Messages Table
--    Stores synced email messages matched to known contacts.
-- ---------------------------------------------------------------------------
CREATE TYPE public.email_direction AS ENUM ('inbound', 'outbound');

CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  microsoft_message_id TEXT NOT NULL UNIQUE,
  microsoft_conversation_id TEXT,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  sourceco_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction public.email_direction NOT NULL,
  from_address TEXT NOT NULL,
  to_addresses TEXT[] NOT NULL DEFAULT '{}',
  cc_addresses TEXT[] DEFAULT '{}',
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  sent_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  attachment_metadata JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_messages_contact ON public.email_messages(contact_id);
CREATE INDEX idx_email_messages_deal ON public.email_messages(deal_id);
CREATE INDEX idx_email_messages_user ON public.email_messages(sourceco_user_id);
CREATE INDEX idx_email_messages_conversation ON public.email_messages(microsoft_conversation_id);
CREATE INDEX idx_email_messages_sent_at ON public.email_messages(sent_at DESC);
CREATE INDEX idx_email_messages_contact_sent ON public.email_messages(contact_id, sent_at DESC);

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

-- Admins see everything
CREATE POLICY "Admins can manage all email messages"
  ON public.email_messages FOR ALL
  USING (public.is_admin(auth.uid()));

-- Team members see emails for contacts/deals they are assigned to
CREATE POLICY "Users can view emails for assigned contacts"
  ON public.email_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_assignments ca
      WHERE ca.sourceco_user_id = auth.uid()
        AND ca.is_active = true
        AND (
          ca.contact_id = email_messages.contact_id
          OR ca.deal_id = email_messages.deal_id
        )
    )
  );

-- Users can insert emails they sent (sourceco_user_id must match)
CREATE POLICY "Users can insert their own sent emails"
  ON public.email_messages FOR INSERT
  WITH CHECK (auth.uid() = sourceco_user_id);

-- ---------------------------------------------------------------------------
-- 4. Email Access Log (Audit Trail)
-- ---------------------------------------------------------------------------
CREATE TYPE public.email_access_action AS ENUM ('viewed', 'sent', 'replied');

CREATE TABLE IF NOT EXISTS public.email_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sourceco_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_message_id UUID REFERENCES public.email_messages(id) ON DELETE SET NULL,
  action public.email_access_action NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_email_access_log_user ON public.email_access_log(sourceco_user_id);
CREATE INDEX idx_email_access_log_message ON public.email_access_log(email_message_id);
CREATE INDEX idx_email_access_log_accessed ON public.email_access_log(accessed_at DESC);

ALTER TABLE public.email_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all access logs"
  ON public.email_access_log FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can insert their own access logs"
  ON public.email_access_log FOR INSERT
  WITH CHECK (auth.uid() = sourceco_user_id);

CREATE POLICY "Users can view their own access logs"
  ON public.email_access_log FOR SELECT
  USING (auth.uid() = sourceco_user_id);

-- ---------------------------------------------------------------------------
-- 5. Helper function: Check if user has access to a contact's emails
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_email_access(
  _user_id UUID,
  _contact_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Admins always have access
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_admin = true) THEN
    RETURN true;
  END IF;

  -- Check contact assignment
  RETURN EXISTS (
    SELECT 1 FROM public.contact_assignments
    WHERE sourceco_user_id = _user_id
      AND contact_id = _contact_id
      AND is_active = true
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Updated_at trigger for email_connections
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_email_connection_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_email_connections_updated_at
  BEFORE UPDATE ON public.email_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_email_connection_timestamp();

-- Merged from: 20260617000000_rls_security_fixes.sql
-- RLS & Security Fixes from buyer experience audit

-- #82: Drop overly broad listings SELECT policy
-- "Approved users can view listings" bypasses buyer_type visibility filter
-- The buyer-type-aware policy already covers approved users properly
DROP POLICY IF EXISTS "Approved users can view listings" ON listings;

-- #83: Remove duplicate connection_requests policies
DROP POLICY IF EXISTS "Users can view their own connection requests" ON connection_requests;
DROP POLICY IF EXISTS "Users can insert own connection requests" ON connection_requests;

-- #84: Protect sensitive profile fields from non-admin self-update
CREATE OR REPLACE FUNCTION protect_sensitive_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  NEW.approval_status := OLD.approval_status;
  NEW.is_admin := OLD.is_admin;
  NEW.buyer_quality_score := OLD.buyer_quality_score;
  NEW.buyer_quality_score_last_calculated := OLD.buyer_quality_score_last_calculated;
  NEW.buyer_tier := OLD.buyer_tier;
  NEW.admin_tier_override := OLD.admin_tier_override;
  NEW.admin_override_note := OLD.admin_override_note;
  NEW.role := OLD.role;
  NEW.email_verified := OLD.email_verified;
  NEW.remarketing_buyer_id := OLD.remarketing_buyer_id;
  NEW.platform_signal_detected := OLD.platform_signal_detected;
  NEW.platform_signal_source := OLD.platform_signal_source;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON profiles;
CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_sensitive_profile_fields();
