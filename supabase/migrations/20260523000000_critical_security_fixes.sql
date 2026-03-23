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
