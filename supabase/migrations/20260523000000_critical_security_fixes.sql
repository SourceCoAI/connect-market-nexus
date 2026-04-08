-- Critical Security Fixes Migration
-- Addresses audit gaps C-4, C-5, C-6, C-8

-- ============================================================
-- C-5 FIX: Clear all existing plaintext passwords from referral_partners.
-- The application code has been updated to stop writing this column.
-- ============================================================
UPDATE public.referral_partners
SET share_password_plaintext = NULL
WHERE share_password_plaintext IS NOT NULL;

-- ============================================================
-- C-6 FIX: Add archived_at column to referral_partners so archive
-- no longer destructively overwrites the notes field.
-- ============================================================
ALTER TABLE public.referral_partners
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- Backfill: any partner already marked inactive with '[ARCHIVED]' notes
-- should have archived_at set and notes restored to empty
UPDATE public.referral_partners
SET archived_at = updated_at, notes = NULL
WHERE notes = '[ARCHIVED]' AND is_active = false;

-- ============================================================
-- C-4 FIX: Add unsubscribed flag to buyers table for CAN-SPAM compliance.
-- This allows a unified unsubscribe list across email providers.
-- ============================================================
ALTER TABLE public.buyers
ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.buyers
ADD COLUMN IF NOT EXISTS email_unsubscribed_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================================
-- C-8 FIX: Replace hardcoded owner email with a configurable app_settings row.
-- The owner role can now be transferred by updating this setting.
-- ============================================================
INSERT INTO public.app_settings (key, value)
VALUES ('platform_owner_email', '"ahaile14@gmail.com"')
ON CONFLICT (key) DO NOTHING;

-- Replace the hardcoded manage_user_role function with one that reads from app_settings
CREATE OR REPLACE FUNCTION public.manage_user_role(
  target_email TEXT,
  new_role TEXT,
  reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  owner_email TEXT;
BEGIN
  -- C-8 FIX: Read owner email from app_settings instead of hardcoding
  SELECT value::TEXT INTO owner_email FROM public.app_settings WHERE key = 'platform_owner_email';
  -- Strip JSON quotes if present
  owner_email := TRIM(BOTH '"' FROM owner_email);

  IF owner_email IS NULL THEN
    RAISE EXCEPTION 'Platform owner email not configured in app_settings';
  END IF;

  -- Prevent changing the owner's role away from owner
  IF target_email = owner_email AND new_role != 'owner' THEN
    RAISE EXCEPTION 'Cannot change the owner role of the platform owner. Update platform_owner_email in app_settings to transfer ownership.';
  END IF;

  -- Prevent assigning owner role to non-owner
  IF new_role = 'owner' AND target_email != owner_email THEN
    RAISE EXCEPTION 'Only the configured platform owner (%) can have the owner role. Update platform_owner_email in app_settings first.', owner_email;
  END IF;

  -- Update the role (use subquery to handle potential duplicates)
  UPDATE public.user_roles
  SET role = new_role, reason = manage_user_role.reason, granted_at = NOW()
  WHERE user_id = (SELECT id FROM auth.users WHERE email = target_email);

  IF NOT FOUND THEN
    INSERT INTO public.user_roles (user_id, role, reason)
    SELECT id, new_role, manage_user_role.reason
    FROM auth.users WHERE email = target_email;
  END IF;
END;
$$;

-- Merged from: 20260523000000_fix_audit_trigger_dropped_column.sql
-- ============================================================================
-- FIX: audit_buyer_changes trigger references dropped deal_breakers column
--
-- The deal_breakers column was dropped in migration 20260221000000 but the
-- audit trigger (created in 20260203_audit_logging.sql) still references it
-- at line 181: OLD.deal_breakers IS DISTINCT FROM NEW.deal_breakers
--
-- This causes EVERY UPDATE on the buyers table to fail, including the
-- buyer CSV import's "link to universe" operation.
--
-- Fix: Recreate the function without the deal_breakers reference.
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_buyer_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_sensitive_fields TEXT[] := ARRAY['thesis_summary', 'target_geographies', 'target_revenue_min', 'target_revenue_max'];
  v_changed_sensitive BOOLEAN := false;
BEGIN
  -- Check if any sensitive fields changed
  IF TG_OP = 'UPDATE' THEN
    v_changed_sensitive := (
      OLD.thesis_summary IS DISTINCT FROM NEW.thesis_summary OR
      OLD.target_geographies IS DISTINCT FROM NEW.target_geographies OR
      OLD.target_revenue_min IS DISTINCT FROM NEW.target_revenue_min OR
      OLD.target_revenue_max IS DISTINCT FROM NEW.target_revenue_max
    );
  END IF;

  -- Only log if sensitive fields changed or it's a create/delete
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' OR v_changed_sensitive THEN
    PERFORM log_audit_event(
      auth.uid(),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true),
      LOWER(TG_OP),
      'buyer',
      COALESCE(NEW.id, OLD.id),
      CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) END,
      CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) END,
      NULL
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
