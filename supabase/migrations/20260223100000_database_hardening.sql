-- =====================================================================
-- Database Hardening Migration
-- Date: 2026-02-23
-- Purpose: Improve database performance, data integrity, audit logging,
--          and auto-update triggers across the schema.
--
-- Sections:
--   A. Performance indexes on foreign keys and frequently queried columns
--   B. Check constraints for data integrity
--   C. updated_at auto-update triggers for tables missing them
--   D. Audit logging table (enhanced, if not already present)
--   E. Generic audit trigger function for sensitive tables
-- =====================================================================

BEGIN;

-- =====================================================================
-- SECTION A: Performance Indexes
-- Create indexes on foreign keys, status columns, and timestamp columns
-- that are commonly used in WHERE, JOIN, and ORDER BY clauses.
-- All use IF NOT EXISTS to be idempotent.
-- =====================================================================

-- === deals table ===
CREATE INDEX IF NOT EXISTS idx_deals_stage_id ON public.deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_listing_id ON public.deals(listing_id);
CREATE INDEX IF NOT EXISTS idx_deals_connection_request_id ON public.deals(connection_request_id);
CREATE INDEX IF NOT EXISTS idx_deals_inbound_lead_id ON public.deals(inbound_lead_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON public.deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_deals_created_at ON public.deals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON public.deals(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_priority ON public.deals(priority);
CREATE INDEX IF NOT EXISTS idx_deals_source ON public.deals(source);
CREATE INDEX IF NOT EXISTS idx_deals_nda_status ON public.deals(nda_status);
CREATE INDEX IF NOT EXISTS idx_deals_fee_agreement_status ON public.deals(fee_agreement_status);

-- === connection_requests table ===
CREATE INDEX IF NOT EXISTS idx_connection_requests_created_at ON public.connection_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_requests_listing_id ON public.connection_requests(listing_id);
CREATE INDEX IF NOT EXISTS idx_connection_requests_user_id ON public.connection_requests(user_id);

-- === profiles table ===
CREATE INDEX IF NOT EXISTS idx_profiles_approval_status ON public.profiles(approval_status);
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS idx_profiles_buyer_type ON public.profiles(buyer_type);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at) WHERE deleted_at IS NOT NULL;

-- === listings table ===
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON public.listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_deleted_at ON public.listings(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_asking_price ON public.listings(asking_price) WHERE status = 'active';

-- === saved_listings table ===
CREATE INDEX IF NOT EXISTS idx_saved_listings_listing_id ON public.saved_listings(listing_id);
CREATE INDEX IF NOT EXISTS idx_saved_listings_user_id ON public.saved_listings(user_id);

-- === deal_tasks table ===
CREATE INDEX IF NOT EXISTS idx_deal_tasks_status ON public.deal_tasks(status);
CREATE INDEX IF NOT EXISTS idx_deal_tasks_assigned_to ON public.deal_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_deal_tasks_due_date ON public.deal_tasks(due_date) WHERE status IN ('pending', 'in_progress');

-- === deal_activities table ===
CREATE INDEX IF NOT EXISTS idx_deal_activities_activity_type ON public.deal_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_deal_activities_created_at ON public.deal_activities(created_at DESC);

-- === deal_comments table ===
CREATE INDEX IF NOT EXISTS idx_deal_comments_admin_id ON public.deal_comments(admin_id);
CREATE INDEX IF NOT EXISTS idx_deal_comments_created_at ON public.deal_comments(created_at DESC);

-- === feedback_messages table ===
CREATE INDEX IF NOT EXISTS idx_feedback_messages_priority ON public.feedback_messages(priority);

-- === inbound_leads table ===
CREATE INDEX IF NOT EXISTS idx_inbound_leads_source ON public.inbound_leads(source);
CREATE INDEX IF NOT EXISTS idx_inbound_leads_priority_score ON public.inbound_leads(priority_score DESC);

-- === connection_messages table ===
CREATE INDEX IF NOT EXISTS idx_connection_messages_connection_request_id
  ON public.connection_messages(connection_request_id);
CREATE INDEX IF NOT EXISTS idx_connection_messages_created_at
  ON public.connection_messages(created_at DESC);

-- === audit_logs table ===
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operation ON public.audit_logs(operation);

-- === deal_stages table ===
CREATE INDEX IF NOT EXISTS idx_deal_stages_position ON public.deal_stages(position);
CREATE INDEX IF NOT EXISTS idx_deal_stages_is_active ON public.deal_stages(is_active) WHERE is_active = true;

-- === firm_agreements table ===
DO $idx_fa$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'firm_agreements') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_firm_agreements_email_domain ON public.firm_agreements(email_domain)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_firm_agreements_status ON public.firm_agreements(fee_agreement_status)';
  END IF;
END $idx_fa$;

-- === remarketing_buyers table ===
DO $idx_rb$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'remarketing_buyers') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_universe_id ON public.remarketing_buyers(universe_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_email_domain ON public.remarketing_buyers(email_domain)';
  END IF;
END $idx_rb$;

-- === user_notifications table ===
DO $idx_un$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_notifications') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON public.user_notifications(user_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_notifications_is_read ON public.user_notifications(is_read) WHERE is_read = false';
  END IF;
END $idx_un$;

-- === data_room_access table ===
DO $idx_dra$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'data_room_access') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_data_room_access_deal_id ON public.data_room_access(deal_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_data_room_access_marketplace_user ON public.data_room_access(marketplace_user_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_data_room_access_buyer ON public.data_room_access(remarketing_buyer_id)';
  END IF;
END $idx_dra$;


-- =====================================================================
-- SECTION B: Check Constraints for Data Integrity
-- Ensure status fields have valid values, numeric fields are non-negative
-- where appropriate, and text fields meet minimum requirements.
-- All use DO blocks for idempotency.
-- =====================================================================

-- deals.value must be non-negative
DO $chk$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_deals_value_non_negative'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT chk_deals_value_non_negative CHECK (value >= 0);
  END IF;
END $chk$;

-- deal_tasks.status must be valid
DO $chk2$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_deal_tasks_status_valid'
  ) THEN
    ALTER TABLE public.deal_tasks
      ADD CONSTRAINT chk_deal_tasks_status_valid
      CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'));
  END IF;
END $chk2$;

-- deal_tasks.priority must be valid
DO $chk3$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_deal_tasks_priority_valid'
  ) THEN
    ALTER TABLE public.deal_tasks
      ADD CONSTRAINT chk_deal_tasks_priority_valid
      CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
  END IF;
END $chk3$;

-- inbound_leads.status must be valid
DO $chk4$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_inbound_leads_status_valid'
  ) THEN
    ALTER TABLE public.inbound_leads
      ADD CONSTRAINT chk_inbound_leads_status_valid
      CHECK (status IN ('pending', 'mapped', 'converted', 'archived'));
  END IF;
END $chk4$;

-- inbound_leads.email must have a valid format
DO $chk5$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_inbound_leads_email_format'
  ) THEN
    ALTER TABLE public.inbound_leads
      ADD CONSTRAINT chk_inbound_leads_email_format
      CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$');
  END IF;
END $chk5$;

-- inbound_leads.priority_score must be non-negative
DO $chk6$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_inbound_leads_priority_non_negative'
  ) THEN
    ALTER TABLE public.inbound_leads
      ADD CONSTRAINT chk_inbound_leads_priority_non_negative
      CHECK (priority_score >= 0);
  END IF;
END $chk6$;

-- feedback_messages.status must be valid
DO $chk7$ BEGIN
  -- Already has inline CHECK, but let's ensure deal_comments also has constraints
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deal_comments') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.check_constraints
      WHERE constraint_name = 'chk_deal_comments_text_not_empty'
    ) THEN
      EXECUTE 'ALTER TABLE public.deal_comments ADD CONSTRAINT chk_deal_comments_text_not_empty CHECK (length(comment_text) > 0)';
    END IF;
  END IF;
END $chk7$;

-- deals.contact_email format validation (when not empty)
DO $chk8$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_deals_contact_email_format'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT chk_deals_contact_email_format
      CHECK (
        contact_email IS NULL
        OR contact_email = ''
        OR contact_email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
      );
  END IF;
END $chk8$;

-- deals.probability range constraint (already exists inline, adding named for clarity)
-- The deals table already has CHECK (probability >= 0 AND probability <= 100) from creation

-- email_delivery_logs.retry_count non-negative
DO $chk9$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_email_delivery_retry_non_negative'
  ) THEN
    ALTER TABLE public.email_delivery_logs
      ADD CONSTRAINT chk_email_delivery_retry_non_negative
      CHECK (retry_count >= 0);
  END IF;
END $chk9$;

-- email_delivery_logs.status valid values
DO $chk10$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_email_delivery_status_valid'
  ) THEN
    ALTER TABLE public.email_delivery_logs
      ADD CONSTRAINT chk_email_delivery_status_valid
      CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced'));
  END IF;
END $chk10$;


-- =====================================================================
-- SECTION C: Auto-update updated_at Triggers
-- Ensure the update_updated_at_column() function exists, then apply
-- triggers to all tables that have updated_at but lack triggers.
-- =====================================================================

-- Ensure the function exists (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- daily_metrics: has updated_at, may be missing trigger
DROP TRIGGER IF EXISTS update_daily_metrics_updated_at ON public.daily_metrics;
CREATE TRIGGER update_daily_metrics_updated_at
  BEFORE UPDATE ON public.daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- otp_rate_limits: has updated_at, likely missing trigger
DROP TRIGGER IF EXISTS update_otp_rate_limits_updated_at ON public.otp_rate_limits;
CREATE TRIGGER update_otp_rate_limits_updated_at
  BEFORE UPDATE ON public.otp_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- password_reset_tokens: no updated_at column, skip

-- admin_notifications: no updated_at column, skip

-- deal_stages: has updated_at and trigger from deals migration, ensure it exists
DROP TRIGGER IF EXISTS update_deal_stages_updated_at ON public.deal_stages;
CREATE TRIGGER update_deal_stages_updated_at
  BEFORE UPDATE ON public.deal_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- deal_tasks: has updated_at and trigger from deals migration, ensure it exists
DROP TRIGGER IF EXISTS update_deal_tasks_updated_at ON public.deal_tasks;
CREATE TRIGGER update_deal_tasks_updated_at
  BEFORE UPDATE ON public.deal_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- deal_comments: has updated_at, ensure trigger
DROP TRIGGER IF EXISTS update_deal_comments_updated_at ON public.deal_comments;
CREATE TRIGGER update_deal_comments_updated_at
  BEFORE UPDATE ON public.deal_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Apply to conditionally-existing tables
DO $triggers$ BEGIN
  -- user_notifications
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_notifications')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_notifications' AND column_name = 'updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_user_notifications_updated_at ON public.user_notifications';
    EXECUTE 'CREATE TRIGGER update_user_notifications_updated_at BEFORE UPDATE ON public.user_notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;

  -- firm_agreements
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'firm_agreements')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'firm_agreements' AND column_name = 'updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_firm_agreements_updated_at ON public.firm_agreements';
    EXECUTE 'CREATE TRIGGER update_firm_agreements_updated_at BEFORE UPDATE ON public.firm_agreements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;

  -- firm_members
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'firm_members')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'firm_members' AND column_name = 'updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_firm_members_updated_at ON public.firm_members';
    EXECUTE 'CREATE TRIGGER update_firm_members_updated_at BEFORE UPDATE ON public.firm_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;

  -- collections
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'collections')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'collections' AND column_name = 'updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_collections_updated_at ON public.collections';
    EXECUTE 'CREATE TRIGGER update_collections_updated_at BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;

  -- deal_contacts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deal_contacts')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deal_contacts' AND column_name = 'updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_deal_contacts_updated_at ON public.deal_contacts';
    EXECUTE 'CREATE TRIGGER update_deal_contacts_updated_at BEFORE UPDATE ON public.deal_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;

  -- chat_conversations
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_conversations')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_chat_conversations_updated_at ON public.chat_conversations';
    EXECUTE 'CREATE TRIGGER update_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;

  -- data_room_documents
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'data_room_documents')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'data_room_documents' AND column_name = 'updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_data_room_documents_updated_at ON public.data_room_documents';
    EXECUTE 'CREATE TRIGGER update_data_room_documents_updated_at BEFORE UPDATE ON public.data_room_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;

  -- data_room_access
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'data_room_access')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'data_room_access' AND column_name = 'updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_data_room_access_updated_at ON public.data_room_access';
    EXECUTE 'CREATE TRIGGER update_data_room_access_updated_at BEFORE UPDATE ON public.data_room_access FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;

  -- lead_memos
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_memos')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lead_memos' AND column_name = 'updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_lead_memos_updated_at ON public.lead_memos';
    EXECUTE 'CREATE TRIGGER update_lead_memos_updated_at BEFORE UPDATE ON public.lead_memos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;

  -- contacts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contacts')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts';
    EXECUTE 'CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;
END $triggers$;


-- =====================================================================
-- SECTION D: Audit Logging Table (Enhanced)
-- The audit_logs table already exists from migration 20250716190234.
-- Here we add an enhanced audit_log table with a standardized schema
-- that can be used by the application layer for general audit tracking.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT', 'LOGIN', 'LOGOUT', 'EXPORT')),
  old_data JSONB,
  new_data JSONB,
  performed_by UUID REFERENCES auth.users(id),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit_log
DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;
CREATE POLICY "Admins can view audit log"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Service role can insert into audit_log
DROP POLICY IF EXISTS "Service role can insert audit log" ON public.audit_log;
CREATE POLICY "Service role can insert audit log"
  ON public.audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Admins can insert into audit_log (for client-side logging)
DROP POLICY IF EXISTS "Admins can insert audit log" ON public.audit_log;
CREATE POLICY "Admins can insert audit log"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Indexes for audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON public.audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id ON public.audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_by ON public.audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);

-- Composite index for common query pattern: table + time range
CREATE INDEX IF NOT EXISTS idx_audit_log_table_created
  ON public.audit_log(table_name, created_at DESC);


-- =====================================================================
-- SECTION E: Generic Audit Trigger Function
-- A reusable trigger function that logs changes to the audit_log table.
-- Can be applied to any table that needs audit tracking.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.generic_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, new_data, performed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log if data actually changed
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, performed_by)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, performed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Apply audit trigger to the deals table (high-value business data)
DROP TRIGGER IF EXISTS audit_deals_trigger ON public.deals;
CREATE TRIGGER audit_deals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.generic_audit_trigger();

-- Apply audit trigger to listings table (core business data)
DROP TRIGGER IF EXISTS audit_listings_trigger ON public.listings;
CREATE TRIGGER audit_listings_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.generic_audit_trigger();

-- Apply audit trigger to connection_requests (deal flow tracking)
DROP TRIGGER IF EXISTS audit_connection_requests_trigger ON public.connection_requests;
CREATE TRIGGER audit_connection_requests_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.connection_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.generic_audit_trigger();


-- =====================================================================
-- SECTION F: Database Health Check Function
-- A stored procedure that returns database health metrics.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.database_health_check()
RETURNS TABLE (
  check_name TEXT,
  check_status TEXT,
  check_value TEXT,
  checked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Auth guard: admin-only
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY

  -- Total table count
  SELECT
    'total_tables'::TEXT,
    'ok'::TEXT,
    COUNT(*)::TEXT,
    NOW()
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'

  UNION ALL

  -- Total index count
  SELECT
    'total_indexes'::TEXT,
    'ok'::TEXT,
    COUNT(*)::TEXT,
    NOW()
  FROM pg_indexes
  WHERE schemaname = 'public'

  UNION ALL

  -- Tables with RLS enabled
  SELECT
    'tables_with_rls'::TEXT,
    'ok'::TEXT,
    COUNT(*)::TEXT,
    NOW()
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  WHERE t.schemaname = 'public' AND c.relrowsecurity = true

  UNION ALL

  -- Database size
  SELECT
    'database_size'::TEXT,
    'ok'::TEXT,
    pg_size_pretty(pg_database_size(current_database())),
    NOW()

  UNION ALL

  -- Active connections
  SELECT
    'active_connections'::TEXT,
    CASE WHEN COUNT(*) > 80 THEN 'warning' ELSE 'ok' END,
    COUNT(*)::TEXT,
    NOW()
  FROM pg_stat_activity
  WHERE state = 'active';
END;
$$;

COMMIT;

-- Merged from: 20260223100000_rename_user_role_to_viewer.sql
-- Migration: Rename 'user' role to 'viewer' in user_roles table
-- This eliminates confusion between marketplace buyers (profiles.role = 'buyer')
-- and internal team members who had role = 'user' in user_roles.

-- 1. Update existing rows
UPDATE public.user_roles
SET role = 'viewer'
WHERE role = 'user';

-- 2. Replace the check constraint so 'user' is no longer valid
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('owner', 'admin', 'moderator', 'viewer'));

-- 3. Recreate get_user_role() to return 'viewer' instead of 'user' as default
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  SELECT role INTO _role
  FROM public.user_roles
  WHERE user_id = _user_id;

  RETURN COALESCE(_role, 'viewer');
END;
$$;

-- 4. Add get_my_role() — lets the current user fetch their own role without needing
--    another user's ID.  Used by the client auth context.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  SELECT role INTO _role
  FROM public.user_roles
  WHERE user_id = auth.uid();

  RETURN COALESCE(_role, 'viewer');
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- 5. Update change_user_role() to validate new role set
CREATE OR REPLACE FUNCTION public.change_user_role(
  _target_user_id uuid,
  _new_role text,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_role text;
BEGIN
  -- Validate the new role value
  IF _new_role NOT IN ('owner', 'admin', 'moderator', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role: %. Must be owner, admin, moderator, or viewer.', _new_role;
  END IF;

  -- Only owners can change roles
  SELECT role INTO _caller_role
  FROM public.user_roles
  WHERE user_id = auth.uid();

  IF _caller_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only owners can change user roles';
  END IF;

  -- Upsert the role (explicit cast: text → app_role enum)
  INSERT INTO public.user_roles (user_id, role, granted_by, reason)
  VALUES (_target_user_id, _new_role::app_role, auth.uid(), _reason)
  ON CONFLICT (user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    granted_by = EXCLUDED.granted_by,
    granted_at = now(),
    reason = EXCLUDED.reason;

  -- Log the change
  INSERT INTO public.permission_audit_log (user_id, changed_by, old_role, new_role, reason)
  VALUES (
    _target_user_id,
    auth.uid(),
    (SELECT role FROM public.user_roles WHERE user_id = _target_user_id),
    _new_role::app_role,
    _reason
  );
END;
$$;
