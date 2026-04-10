-- ============================================================================
-- MIGRATION: Freeze shared utility functions
-- ============================================================================
-- Part of the database-duplicates remediation plan tracked in
-- DATABASE_DUPLICATES_AUDIT_2026-04-09.md §3.
--
-- Two generic helpers have been CREATE OR REPLACE'd repeatedly across the
-- migration history with identical bodies:
--
--   * public.update_updated_at_column()  — 6 redefinitions
--   * public.is_admin(uuid)              — 3 redefinitions
--
-- This migration re-declares each one final time with a FROZEN marker in
-- the function comment. Reviewers should reject any future migration that
-- redefines either of these without a strong reason.
--
-- No behavioral change. This migration is safe to run multiple times.
-- ============================================================================


-- ─── update_updated_at_column ──────────────────────────────────────────────
-- Generic BEFORE UPDATE trigger helper used by dozens of tables to refresh
-- their updated_at column. Behaviorally identical to every prior definition.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column() IS
  'FROZEN as of 20260625. Generic BEFORE UPDATE helper — do not redefine '
  'without updating DATABASE_DUPLICATES_AUDIT_2026-04-09.md §3. '
  'Used as the trigger body for every updated_at column in the public schema.';


-- ─── is_admin(uuid) ─────────────────────────────────────────────────────────
-- RLS helper used everywhere. The canonical body is from
-- 20260224200000_fix_moderator_is_admin_and_audit_policy.sql — it must
-- include the 'moderator' role alongside 'admin' and 'owner'.

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id = is_admin.user_id
      AND role IN ('admin', 'owner', 'moderator')
  )
$$;

COMMENT ON FUNCTION public.is_admin(uuid) IS
  'FROZEN as of 20260625. Source of truth: checks user_roles for '
  'admin/owner/moderator role. Do not redefine without updating '
  'DATABASE_DUPLICATES_AUDIT_2026-04-09.md §3. The profiles.is_admin '
  'flag is auto-synced via sync_is_admin_flag() trigger for backward '
  'compatibility with RLS policies that read the flat column.';
