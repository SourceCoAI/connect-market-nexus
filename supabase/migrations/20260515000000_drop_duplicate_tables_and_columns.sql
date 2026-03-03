-- ============================================================================
-- DROP DUPLICATE TABLES
--
-- Removes legacy tables found in the CTO audit:
--
-- 1. buyer_contacts: Superseded by unified "contacts" table (20260228000000)
--    with mirror trigger from remarketing_buyer_contacts (20260306300000).
--    All frontend reads migrated to contacts table.
--
-- 2. buyer_deal_scores: Legacy scoring table. Modern system uses
--    remarketing_scores exclusively. Marked "(legacy)" since 20260203.
--
-- NOTE: The duplicate columns (need_buyer_universe, need_owner_contact) were
-- already dropped in migration 20260513000000. This migration only handles
-- the remaining legacy tables.
--
-- SAFETY:
--   - CASCADE handles any remaining FK constraints.
--   - All frontend code changes deployed alongside this migration.
-- ============================================================================


-- ============================================================================
-- DROP LEGACY TABLES
-- ============================================================================

-- buyer_deal_scores: Legacy scoring table. All frontend and edge function
-- code now uses remarketing_scores. The delete_listing_cascade function
-- references this table but uses IF EXISTS / try-catch patterns.
DROP TABLE IF EXISTS public.buyer_deal_scores CASCADE;

-- buyer_contacts: Legacy contact table predating the remarketing system.
-- All reads migrated to unified contacts table. The remarketing_buyer_contacts
-- table remains (with mirror trigger to contacts) for legacy write paths.
DROP TABLE IF EXISTS public.buyer_contacts CASCADE;


-- ============================================================================
-- Summary:
--   2 tables dropped:  buyer_deal_scores, buyer_contacts
-- ============================================================================
