-- ============================================================================
-- DROP DUPLICATE TABLES AND COLUMNS
--
-- Removes three categories of duplication found in the CTO audit:
--
-- 1. TABLES: buyer_contacts, buyer_deal_scores
--    - buyer_contacts: Superseded by unified "contacts" table (20260228000000)
--      with mirror trigger from remarketing_buyer_contacts (20260306300000).
--      All frontend reads migrated to contacts table.
--    - buyer_deal_scores: Legacy scoring table. Modern system uses
--      remarketing_scores exclusively. Marked "(legacy)" since 20260203.
--
-- 2. COLUMNS: listings.need_buyer_universe, listings.need_owner_contact
--    - need_buyer_universe: Replaced by needs_buyer_search (20260513000000)
--      which includes audit trail (needs_buyer_search_at, needs_buyer_search_by).
--      All frontend code migrated to use needs_buyer_search.
--    - need_owner_contact: Replaced by needs_owner_contact with audit trail.
--      Zero frontend reads of the old column.
--
-- SAFETY:
--   - Backfills run BEFORE drops to preserve any data only in old columns.
--   - CASCADE handles any remaining FK constraints.
--   - All frontend code changes deployed alongside this migration.
-- ============================================================================


-- ============================================================================
-- PHASE 1: BACKFILL — Merge old flag values into canonical columns
-- ============================================================================
-- If need_buyer_universe is true but needs_buyer_search is not, copy the flag.
-- This catches any deals that were flagged via the old column but never via the new one.

UPDATE public.listings
SET
  needs_buyer_search = true,
  needs_buyer_search_at = COALESCE(needs_buyer_search_at, updated_at, now())
WHERE need_buyer_universe = true
  AND (needs_buyer_search IS NULL OR needs_buyer_search = false);

-- Same for need_owner_contact → needs_owner_contact
UPDATE public.listings
SET
  needs_owner_contact = true,
  needs_owner_contact_at = COALESCE(needs_owner_contact_at, updated_at, now())
WHERE need_owner_contact = true
  AND (needs_owner_contact IS NULL OR needs_owner_contact = false);


-- ============================================================================
-- PHASE 2: DROP DUPLICATE COLUMNS FROM LISTINGS
-- ============================================================================

ALTER TABLE public.listings
  DROP COLUMN IF EXISTS need_buyer_universe,
  DROP COLUMN IF EXISTS need_owner_contact;


-- ============================================================================
-- PHASE 3: DROP LEGACY TABLES
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
-- PHASE 4: CLEAN UP ORPHANED RLS POLICIES AND FUNCTIONS
-- ============================================================================
-- These were on the dropped tables — Postgres drops them automatically with
-- CASCADE, but we include explicit drops for documentation clarity.

-- (Policies auto-dropped by CASCADE above)
-- DROP POLICY IF EXISTS "Admins can view buyer_deal_scores" ON public.buyer_deal_scores;
-- DROP POLICY IF EXISTS "Admins can manage buyer_deal_scores" ON public.buyer_deal_scores;
-- DROP POLICY IF EXISTS "Admins can view buyer_contacts" ON public.buyer_contacts;
-- DROP POLICY IF EXISTS "Admins can manage buyer_contacts" ON public.buyer_contacts;


-- ============================================================================
-- Summary:
--   2 columns dropped: need_buyer_universe, need_owner_contact (from listings)
--   2 tables dropped:  buyer_deal_scores, buyer_contacts
--   Data preserved:    Backfilled into canonical columns before drop
-- ============================================================================
