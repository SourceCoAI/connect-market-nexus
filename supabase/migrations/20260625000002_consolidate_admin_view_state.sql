-- ============================================================================
-- MIGRATION: Consolidate admin "last viewed" state into admin_view_state
-- ============================================================================
-- Part of the database-duplicates remediation plan tracked in
-- DATABASE_DUPLICATES_AUDIT_2026-04-09.md §1.1.
--
-- The unified `admin_view_state` table was introduced in
-- 20260516000000_add_sourceco_to_dashboard_stats.sql (lines 172–216) along
-- with a backfill from all four legacy per-view tables. Since then:
--
--   * src/lib/data-access/admin.ts (markAdminViewAsViewed / read helpers)
--     queries only admin_view_state (lines 22, 41, 64).
--   * All five use-unviewed-*.ts hooks read admin_view_state.
--   * Zero edge functions reference the legacy tables (grep confirmed).
--   * The backward-compat views admin_*_views_v2 have no src/ callers
--     (grep confirmed — they exist only in the auto-generated
--     src/integrations/supabase/types.ts).
--
-- This migration finishes the consolidation by:
--   1. Catch-up backfill — copy any rows written to the legacy tables
--      after the 20260516 cutover (in case a stale writer landed).
--   2. Dropping the backward-compat v2 views.
--   3. Dropping the four legacy tables.
--
-- Rollback: the 20260516 migration still contains the full CREATE TABLE
-- and initial backfill for all four legacy tables. Re-running it would
-- rebuild the legacy shape (empty).
-- ============================================================================


-- ─── 1. Catch-up backfill ──────────────────────────────────────────────────
-- Any rows written to the legacy tables after the 20260516 cutover will be
-- copied forward using the same GREATEST(last_viewed_at) conflict logic.
-- Guarded by table existence so this migration is idempotent on a schema
-- where the legacy tables have already been dropped.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name = 'admin_connection_requests_views') THEN
    INSERT INTO public.admin_view_state
      (admin_id, view_type, last_viewed_at, created_at, updated_at)
    SELECT admin_id, 'connection_requests', last_viewed_at, created_at, updated_at
    FROM public.admin_connection_requests_views
    ON CONFLICT (admin_id, view_type) DO UPDATE SET
      last_viewed_at = GREATEST(admin_view_state.last_viewed_at, EXCLUDED.last_viewed_at),
      updated_at = now();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name = 'admin_deal_sourcing_views') THEN
    INSERT INTO public.admin_view_state
      (admin_id, view_type, last_viewed_at, created_at, updated_at)
    SELECT admin_id, 'deal_sourcing', last_viewed_at, created_at, updated_at
    FROM public.admin_deal_sourcing_views
    ON CONFLICT (admin_id, view_type) DO UPDATE SET
      last_viewed_at = GREATEST(admin_view_state.last_viewed_at, EXCLUDED.last_viewed_at),
      updated_at = now();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name = 'admin_owner_leads_views') THEN
    INSERT INTO public.admin_view_state
      (admin_id, view_type, last_viewed_at, created_at, updated_at)
    SELECT admin_id, 'owner_leads', last_viewed_at, created_at, updated_at
    FROM public.admin_owner_leads_views
    ON CONFLICT (admin_id, view_type) DO UPDATE SET
      last_viewed_at = GREATEST(admin_view_state.last_viewed_at, EXCLUDED.last_viewed_at),
      updated_at = now();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name = 'admin_users_views') THEN
    INSERT INTO public.admin_view_state
      (admin_id, view_type, last_viewed_at, created_at, updated_at)
    SELECT admin_id, 'users', last_viewed_at, created_at, updated_at
    FROM public.admin_users_views
    ON CONFLICT (admin_id, view_type) DO UPDATE SET
      last_viewed_at = GREATEST(admin_view_state.last_viewed_at, EXCLUDED.last_viewed_at),
      updated_at = now();
  END IF;
END $$;


-- ─── 2. Drop backward-compat v2 views ─────────────────────────────────────
-- Introduced in 20260516 as a transitional shim; zero callers today.

DROP VIEW IF EXISTS public.admin_connection_requests_views_v2;
DROP VIEW IF EXISTS public.admin_deal_sourcing_views_v2;
DROP VIEW IF EXISTS public.admin_owner_leads_views_v2;
DROP VIEW IF EXISTS public.admin_users_views_v2;


-- ─── 3. Drop the four legacy tables ───────────────────────────────────────
-- CASCADE is explicitly avoided: if anything still depends on these tables
-- the drop should fail loudly so we can investigate rather than silently
-- breaking a dependent object.

DROP TABLE IF EXISTS public.admin_connection_requests_views;
DROP TABLE IF EXISTS public.admin_deal_sourcing_views;
DROP TABLE IF EXISTS public.admin_owner_leads_views;
DROP TABLE IF EXISTS public.admin_users_views;


-- ─── 4. Document the canonical table ──────────────────────────────────────

COMMENT ON TABLE public.admin_view_state IS
  'Unified per-admin "last viewed" state, discriminated by view_type. '
  'Replaces the legacy admin_connection_requests_views, admin_deal_sourcing_views, '
  'admin_owner_leads_views, and admin_users_views tables (dropped 20260625). '
  'See DATABASE_DUPLICATES_AUDIT_2026-04-09.md §1.1 for history.';
