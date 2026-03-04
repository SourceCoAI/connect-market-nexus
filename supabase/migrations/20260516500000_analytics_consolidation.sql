-- Phase 7: Analytics Consolidation
-- Drops the dead engagement_scores table, creates a dedicated analytics schema,
-- and introduces a unified analytics.events table for all new analytics writes.
--
-- Migration plan:
--   - The existing analytics tables (page_views, user_events, search_analytics,
--     listing_analytics, etc.) remain in public and are NOT moved in this migration.
--   - They will be migrated to the analytics schema in a follow-up AFTER
--     analytics.events has been proven in production and all write paths have
--     been switched over.
--   - Backward-compatible views are intentionally omitted here because no tables
--     are being moved yet. They will be created in the follow-up migration.
--
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS / DROP POLICY IF EXISTS).

BEGIN;

-- ============================================================================
-- 1. Drop dead engagement_scores table
-- ============================================================================
-- Audit findings:
--   - Only 2 references (both stale: types.ts codegen + useBuyerIntentAnalytics fallback)
--   - Zero active writes — the function that populated it (update_engagement_scores)
--     was already dropped in 20260303000000_drop_dead_objects_phase2.sql
--   - Safe to remove.

DROP TABLE IF EXISTS public.engagement_scores CASCADE;

-- ============================================================================
-- 2. Create analytics schema
-- ============================================================================
-- Separates analytics concerns from the core public schema, making it easier
-- to apply different retention policies, permissions, and maintenance windows.

CREATE SCHEMA IF NOT EXISTS analytics;

-- Grant usage so authenticated users and service_role can access objects in the schema
GRANT USAGE ON SCHEMA analytics TO authenticated;
GRANT USAGE ON SCHEMA analytics TO service_role;
GRANT USAGE ON SCHEMA analytics TO anon;

-- ============================================================================
-- 3. Create unified analytics.events table
-- ============================================================================
-- This table will eventually replace the overlapping user_events table.
-- It is intentionally flexible: entity_id is text (not uuid) so it can hold
-- page paths, composite keys, or external IDs alongside standard UUIDs.

CREATE TABLE IF NOT EXISTS analytics.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id uuid,
  event_type text NOT NULL,
  event_category text,   -- 'page_view', 'search', 'listing_interaction', 'user_action'
  entity_type text,      -- 'listing', 'deal', 'buyer', 'page'
  entity_id text,        -- flexible ID (can be uuid or page path)
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE analytics.events IS 'Unified analytics events table (Phase 7). Will eventually replace public.user_events once all write paths are migrated.';
COMMENT ON COLUMN analytics.events.event_category IS 'High-level category: page_view, search, listing_interaction, user_action';
COMMENT ON COLUMN analytics.events.entity_type IS 'Type of entity the event relates to: listing, deal, buyer, page';
COMMENT ON COLUMN analytics.events.entity_id IS 'Flexible identifier — can be a uuid, page path, or external ID';

-- ============================================================================
-- 4. Indexes on analytics.events
-- ============================================================================

-- Primary query pattern: filter by event_type, order by time
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
  ON analytics.events (event_type, created_at DESC);

-- Per-user event timeline
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created
  ON analytics.events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Entity lookups (e.g. "all events for listing X")
CREATE INDEX IF NOT EXISTS idx_analytics_events_entity
  ON analytics.events (entity_type, entity_id)
  WHERE entity_type IS NOT NULL;

-- Session reconstruction
CREATE INDEX IF NOT EXISTS idx_analytics_events_session
  ON analytics.events (session_id)
  WHERE session_id IS NOT NULL;

-- Time-range scans (retention cleanup, date-range dashboards)
CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON analytics.events (created_at);

-- ============================================================================
-- 5. Row Level Security on analytics.events
-- ============================================================================

ALTER TABLE analytics.events ENABLE ROW LEVEL SECURITY;

-- Service role: full access (edge functions, server-side writes)
-- Note: service_role bypasses RLS by default in Supabase, but an explicit
-- policy keeps things self-documenting and protects against config changes.
DROP POLICY IF EXISTS "analytics_events_service_role" ON analytics.events;
CREATE POLICY "analytics_events_service_role"
  ON analytics.events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins: read-only access to all events
DROP POLICY IF EXISTS "analytics_events_admin_read" ON analytics.events;
CREATE POLICY "analytics_events_admin_read"
  ON analytics.events
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Regular users: can only see their own events
DROP POLICY IF EXISTS "analytics_events_own_read" ON analytics.events;
CREATE POLICY "analytics_events_own_read"
  ON analytics.events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Regular users: can insert their own events (client-side tracking)
DROP POLICY IF EXISTS "analytics_events_own_insert" ON analytics.events;
CREATE POLICY "analytics_events_own_insert"
  ON analytics.events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 6. Grant table-level permissions
-- ============================================================================

GRANT ALL ON analytics.events TO service_role;
GRANT SELECT, INSERT ON analytics.events TO authenticated;

-- ============================================================================
-- 7. Migration plan comment
-- ============================================================================
-- The existing analytics-related tables in public are:
--
--   public.page_views          — page view tracking
--   public.user_events         — general user event log
--   public.search_analytics    — search query analytics
--   public.listing_analytics   — listing-level aggregate metrics (TABLE, not MV)
--
-- These tables are NOT moved or aliased in this migration. Moving them carries
-- risk (foreign keys, RLS policies, existing queries, edge functions).
-- The plan is:
--
--   Phase 7a (this migration):
--     - Create analytics schema + analytics.events table
--     - New analytics writes start going to analytics.events
--
--   Phase 7b (follow-up, after production validation):
--     - Create backward-compatible views in public pointing to analytics schema
--     - Migrate existing data from public.user_events -> analytics.events
--     - Switch remaining read paths
--     - Drop public.user_events once fully cut over
--
-- This two-phase approach ensures zero downtime and easy rollback.

COMMIT;
