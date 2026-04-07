-- Migration: Add 'need_to_show_deal' as the initial introduction status
-- This adds a new first phase before 'outreach_initiated' in the buyer introduction workflow.

-- 1. Drop old constraint and add new one with 'need_to_show_deal'
ALTER TABLE buyer_introductions
  DROP CONSTRAINT IF EXISTS buyer_introductions_introduction_status_check;

ALTER TABLE buyer_introductions
  ADD CONSTRAINT buyer_introductions_introduction_status_check
  CHECK (introduction_status IN ('need_to_show_deal', 'outreach_initiated', 'meeting_scheduled', 'not_a_fit', 'fit_and_interested'));

-- 2. Update views to include new status in the "not yet introduced" group
CREATE OR REPLACE VIEW not_yet_introduced_buyers AS
SELECT
  bi.id, bi.buyer_name, bi.buyer_firm_name,
  bi.buyer_email, bi.buyer_phone, bi.buyer_linkedin_url,
  bi.company_name, bi.targeting_reason,
  bi.expected_deal_size_low, bi.expected_deal_size_high,
  bi.internal_champion, bi.created_at, bi.listing_id,
  COALESCE((SELECT COUNT(*) FROM introduction_activity WHERE buyer_introduction_id = bi.id), 0) as activity_count,
  COALESCE((SELECT MAX(activity_date) FROM introduction_activity WHERE buyer_introduction_id = bi.id), bi.created_at) as last_activity
FROM buyer_introductions bi
WHERE bi.introduction_status IN ('need_to_show_deal', 'outreach_initiated', 'meeting_scheduled')
  AND bi.archived_at IS NULL
ORDER BY bi.created_at DESC;

-- 3. Update the summary view to include new status
CREATE OR REPLACE VIEW buyer_introduction_summary AS
SELECT
  l.id as listing_id,
  l.title as company_name,
  COUNT(CASE WHEN bi.introduction_status = 'need_to_show_deal' THEN 1 END) as need_to_show_deal,
  COUNT(CASE WHEN bi.introduction_status = 'outreach_initiated' THEN 1 END) as pending_introductions,
  COUNT(CASE WHEN bi.introduction_status = 'meeting_scheduled' THEN 1 END) as meetings_scheduled,
  COUNT(CASE WHEN bi.introduction_status = 'fit_and_interested' THEN 1 END) as fit_and_interested_buyers,
  COUNT(CASE WHEN bi.introduction_status = 'not_a_fit' THEN 1 END) as not_a_fit_buyers,
  COUNT(*) as total_tracked_buyers
FROM listings l
LEFT JOIN buyer_introductions bi ON l.id = bi.listing_id
WHERE l.deleted_at IS NULL
GROUP BY l.id, l.title
ORDER BY l.title;

-- Merged from: 20260515000000_backfill_address_from_location.sql
-- Backfill address_city and address_state from the free-text 'location' field
-- for listings that have location data but no structured address fields.
--
-- The location field typically contains "City, ST" format (e.g., "San Antonio, TX").
-- This migration parses those values into the structured address_city/address_state columns
-- so the unified getDisplayLocation() helper always has data to work with.

-- Step 1: Parse "City, ST" pattern from location into address_city/address_state
UPDATE public.listings
SET
  address_city = TRIM(SPLIT_PART(location, ',', 1)),
  address_state = UPPER(TRIM(SPLIT_PART(location, ',', 2)))
WHERE
  address_city IS NULL
  AND address_state IS NULL
  AND location IS NOT NULL
  AND location != 'Unknown'
  AND location != ''
  -- Only match "City, ST" pattern (2-letter state code after comma)
  AND TRIM(SPLIT_PART(location, ',', 2)) ~ '^[A-Za-z]{2}$'
  -- Must have exactly one comma (simple city, state format)
  AND (LENGTH(location) - LENGTH(REPLACE(location, ',', ''))) = 1;

-- Step 2: For listings with geographic_states but no address_state,
-- set address_state from the first geographic state (if it's a single-state listing)
UPDATE public.listings
SET
  address_state = geographic_states[1]
WHERE
  address_state IS NULL
  AND geographic_states IS NOT NULL
  AND array_length(geographic_states, 1) = 1
  AND geographic_states[1] ~ '^[A-Z]{2}$';

-- Merged from: 20260515000000_drop_duplicate_tables_and_columns.sql
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
