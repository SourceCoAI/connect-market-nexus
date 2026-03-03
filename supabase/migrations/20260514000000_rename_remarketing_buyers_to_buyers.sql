-- ============================================================================
-- RENAME remarketing_buyers → buyers
--
-- The remarketing_buyers table holds ALL buyers (marketplace, imported,
-- AI-seeded, manually created). The "remarketing_" prefix is misleading.
--
-- Also renames remarketing_buyer_universes → buyer_universes.
--
-- Creates backward-compatible views so existing queries don't break.
-- All existing code (frontend, edge functions, triggers) continues to
-- work via the views — no FK column renames are needed in this migration.
--
-- SAFETY: Views ensure full backward compatibility. No data is lost.
--         No code changes required to deploy this migration.
-- ============================================================================


-- ============================================================================
-- PHASE 1: RENAME TABLES
-- ============================================================================

-- Rename the main buyers table
ALTER TABLE IF EXISTS public.remarketing_buyers RENAME TO buyers;

-- Rename the universes table
ALTER TABLE IF EXISTS public.remarketing_buyer_universes RENAME TO buyer_universes;


-- ============================================================================
-- PHASE 2: CREATE BACKWARD-COMPATIBLE VIEWS
-- ============================================================================
-- These views allow old code referencing the old table names to keep working.
-- Simple SELECT * views in Postgres are auto-updatable, meaning
-- INSERT, UPDATE, DELETE all pass through transparently to the real table.
--
-- This means:
--   .from('remarketing_buyers').select(...)    → works (reads via view)
--   .from('remarketing_buyers').insert(...)    → works (inserts via view)
--   .from('remarketing_buyers').update(...)    → works (updates via view)
--   .from('remarketing_buyers').delete(...)    → works (deletes via view)
--
-- Trigger functions from migrations 2 & 3 that reference
-- "public.remarketing_buyers" also continue to work via these views.

CREATE OR REPLACE VIEW public.remarketing_buyers AS
  SELECT * FROM public.buyers;

CREATE OR REPLACE VIEW public.remarketing_buyer_universes AS
  SELECT * FROM public.buyer_universes;


-- ============================================================================
-- NOTE ON FK COLUMN RENAMES
-- ============================================================================
-- The remarketing_buyer_id column on profiles, contacts, contact_activities,
-- deals, data_room_access, memo_distribution_log, and buyer_seed_log is NOT
-- renamed in this migration.
--
-- Reason: 260+ code references across 50+ files (frontend + edge functions)
-- would break. The column rename should be done in a FUTURE migration that
-- is deployed alongside the coordinated code changes.
--
-- The FK constraints still work correctly after the table rename because
-- Postgres tracks foreign key targets by OID, not by table name.
-- ============================================================================


-- ============================================================================
-- NOTE ON RLS POLICIES
-- ============================================================================
-- RLS policies on the renamed table continue to work — Postgres tracks
-- policies by table OID, not name. No action needed.
-- ============================================================================


-- ============================================================================
-- Summary:
--   Phase 1: Renamed remarketing_buyers → buyers,
--            remarketing_buyer_universes → buyer_universes
--   Phase 2: Created backward-compatible views for seamless transition
--   Future:  FK column renames (remarketing_buyer_id → buyer_id) deferred
--            to a later migration with coordinated code changes
-- ============================================================================
