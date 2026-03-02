-- ============================================================================
-- SOURCECO REGRESSION TESTS
-- Run in Supabase SQL Editor after any deployment touching:
--   listings, deal_pipeline, marketplace_listings, contacts
-- Expected: all queries return zero rows (unless marked otherwise)
-- ============================================================================

-- TEST 1: No marketplace listings expose confidential company name
-- This will ERROR if internal_company_name column exists on the view = PASS
-- If it returns zero rows without error = column exists but is empty = WARN
-- If it returns rows = FAIL
SELECT id, title, 'FAIL: internal_company_name exposed' AS test
FROM marketplace_listings
WHERE internal_company_name IS NOT NULL
LIMIT 1;


-- TEST 2: All deal_pipeline rows have a valid listing_id
-- Zero rows = PASS (every pipeline deal must reference a listing)
SELECT id, title, 'FAIL: deal_pipeline row has null listing_id' AS test
FROM deal_pipeline
WHERE listing_id IS NULL
  AND deleted_at IS NULL;


-- TEST 3: No marketplace listings have is_internal_deal = true
-- Zero rows = PASS (the view should filter these out, but verify)
SELECT id, title, 'FAIL: internal deal leaking into marketplace_listings' AS test
FROM marketplace_listings
WHERE is_internal_deal = true;


-- TEST 4: marketplace_listings view enforces active status
-- Zero rows = PASS
SELECT id, title, status, 'FAIL: inactive listing in marketplace_listings' AS test
FROM marketplace_listings
WHERE status != 'active';


-- TEST 5: marketplace_listings view enforces not-deleted
-- Zero rows = PASS
SELECT id, title, 'FAIL: deleted listing in marketplace_listings' AS test
FROM marketplace_listings
WHERE deleted_at IS NOT NULL;


-- TEST 6: No deal_pipeline rows have company_address populated
-- If this query ERRORS with "column does not exist" = PASS (column was dropped)
-- Zero rows = column exists but is empty = PASS
-- Rows returned = FAIL
SELECT id, title, 'FAIL: company_address still on deal_pipeline' AS test
FROM deal_pipeline
WHERE company_address IS NOT NULL;


-- TEST 7: Financial data on marketplace listings comes from parent deal when source_deal_id is set
-- Zero rows = PASS (no marketplace listing should have different revenue than its parent deal)
SELECT
  ml.id AS marketplace_listing_id,
  ml.title,
  ml.revenue AS ml_revenue,
  parent.revenue AS parent_revenue,
  'FAIL: financial drift between marketplace listing and parent deal' AS test
FROM listings ml
JOIN listings parent ON parent.id = ml.source_deal_id
WHERE ml.source_deal_id IS NOT NULL
  AND ml.revenue IS DISTINCT FROM parent.revenue
  AND ml.revenue IS NOT NULL
  AND parent.revenue IS NOT NULL;


-- TEST 8: listings sync trigger exists
-- One row = PASS
SELECT trigger_name, 'PASS: sync trigger present' AS test
FROM information_schema.triggers
WHERE trigger_name = 'trg_sync_listing_to_contacts'
  AND event_object_table = 'listings'
  AND event_object_schema = 'public';


-- TEST 9: No orphaned contacts from deal_migration with no corresponding deal
-- Zero rows = PASS
SELECT c.id, c.email, 'WARN: migrated contact has no linked deal' AS test
FROM contacts c
WHERE c.source = 'deal_migration'
  AND NOT EXISTS (
    SELECT 1 FROM deal_pipeline dp
    WHERE dp.buyer_contact_id = c.id
  );


-- TEST 10: deal_pipeline table has all required structural columns
SELECT
  required.column_name,
  CASE WHEN col.column_name IS NOT NULL THEN 'PASS' ELSE 'FAIL: MISSING' END AS status
FROM (VALUES
  ('id'), ('title'), ('listing_id'), ('stage_id'), ('connection_request_id'),
  ('buyer_contact_id'), ('seller_contact_id'), ('remarketing_buyer_id'),
  ('nda_status'), ('fee_agreement_status'), ('assigned_to'),
  ('source'), ('priority'), ('probability'), ('expected_close_date'),
  ('meeting_scheduled'), ('followed_up'), ('created_at'), ('updated_at')
) AS required(column_name)
LEFT JOIN information_schema.columns col
  ON col.table_schema = 'public'
  AND col.table_name = 'deal_pipeline'
  AND col.column_name = required.column_name
ORDER BY required.column_name;


-- ============================================================================
-- SECTION 1 — TABLE RENAME VERIFICATION
-- ============================================================================

-- 1.1 — Table exists with new name
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline'
  ) THEN 'PASS: deal_pipeline EXISTS' ELSE 'FAIL: deal_pipeline MISSING' END AS result;

-- 1.2 — Old table name is gone
SELECT
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'deals'
  ) THEN 'PASS: deals table correctly absent' ELSE 'FAIL: deals table still exists' END AS result;

-- 1.3 — All FK constraints on child tables point to deal_pipeline
SELECT
  tc.table_name AS child_table,
  tc.constraint_name,
  CASE
    WHEN ccu.table_name = 'deal_pipeline' THEN 'PASS'
    ELSE 'FAIL — points to: ' || ccu.table_name
  END AS status
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_schema = 'public'
  AND ccu.table_name IN ('deal_pipeline', 'deals')
ORDER BY tc.table_name;

-- 1.4 — RLS policies exist on deal_pipeline, not deals
SELECT
  tablename,
  policyname,
  CASE WHEN tablename = 'deal_pipeline' THEN 'PASS' ELSE 'FAIL — policy on wrong table' END AS status
FROM pg_policies
WHERE tablename IN ('deal_pipeline', 'deals')
  AND schemaname = 'public'
ORDER BY tablename, policyname;

-- 1.5 — No triggers remain on old deals table
SELECT
  trigger_name,
  event_object_table,
  CASE
    WHEN event_object_table = 'deal_pipeline' THEN 'PASS'
    WHEN event_object_table = 'deals' THEN 'FAIL — trigger still on old table name'
    ELSE 'INFO'
  END AS status
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('deal_pipeline', 'deals');


-- ============================================================================
-- SECTION 2 — DUPLICATE COLUMN REMOVAL
-- ============================================================================

-- 2.1 — Duplicate contact columns are dropped
SELECT
  expected.column_name,
  CASE
    WHEN col.column_name IS NULL THEN 'PASS: column absent (correctly dropped)'
    ELSE 'FAIL: column still exists — ' || col.column_name
  END AS status
FROM (VALUES
  ('contact_name'),
  ('contact_email'),
  ('contact_company'),
  ('contact_phone'),
  ('contact_role'),
  ('company_address')
) AS expected(column_name)
LEFT JOIN information_schema.columns col
  ON col.table_schema = 'public'
  AND col.table_name = 'deal_pipeline'
  AND col.column_name = expected.column_name
ORDER BY expected.column_name;

-- 2.2 — deal_pipeline still has correct FK columns
SELECT
  required.column_name,
  col.data_type,
  CASE WHEN col.column_name IS NOT NULL THEN 'PASS: present' ELSE 'FAIL: MISSING' END AS status
FROM (VALUES
  ('buyer_contact_id'),
  ('seller_contact_id'),
  ('connection_request_id'),
  ('remarketing_buyer_id'),
  ('listing_id')
) AS required(column_name)
LEFT JOIN information_schema.columns col
  ON col.table_schema = 'public'
  AND col.table_name = 'deal_pipeline'
  AND col.column_name = required.column_name
ORDER BY required.column_name;

-- 2.5 — Data integrity: no orphaned buyer contact data
SELECT COUNT(*) AS orphaned_deals
FROM deal_pipeline dp
WHERE dp.connection_request_id IS NULL
  AND dp.buyer_contact_id IS NULL
  AND dp.remarketing_buyer_id IS NULL
  AND dp.listing_id IS NOT NULL;

-- Verify contacts from migration landed correctly
SELECT COUNT(*) AS migrated_contacts
FROM contacts
WHERE source = 'deal_migration';


-- ============================================================================
-- SECTION 3 — LISTINGS SOURCE OF TRUTH
-- ============================================================================

-- 3.1 — Company address columns exist on listings
SELECT
  required.column_name,
  col.data_type,
  CASE WHEN col.column_name IS NOT NULL THEN 'PASS' ELSE 'FAIL: MISSING' END AS status
FROM (VALUES
  ('street_address'),
  ('address_city'),
  ('address_state'),
  ('address_zip'),
  ('address_country')
) AS required(column_name)
LEFT JOIN information_schema.columns col
  ON col.table_schema = 'public'
  AND col.table_name = 'listings'
  AND col.column_name = required.column_name;

-- 3.2 — Seller contact columns exist on listings
SELECT
  required.column_name,
  col.data_type,
  CASE WHEN col.column_name IS NOT NULL THEN 'PASS' ELSE 'FAIL: MISSING' END AS status
FROM (VALUES
  ('main_contact_name'),
  ('main_contact_email'),
  ('main_contact_phone'),
  ('main_contact_title')
) AS required(column_name)
LEFT JOIN information_schema.columns col
  ON col.table_schema = 'public'
  AND col.table_name = 'listings'
  AND col.column_name = required.column_name;

-- 3.3 — Sync trigger from listings → contacts is intact
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  'PASS: trigger present' AS status
FROM information_schema.triggers
WHERE trigger_name = 'trg_sync_listing_to_contacts'
  AND event_object_schema = 'public'
  AND event_object_table = 'listings';

-- 3.4 — Financial sync trigger from deal → marketplace listing is intact
SELECT
  trigger_name,
  event_object_table,
  'PASS: trigger present' AS status
FROM information_schema.triggers
WHERE trigger_name = 'trg_sync_deal_financials'
  AND event_object_schema = 'public'
  AND event_object_table = 'listings';

-- 3.5 — marketplace_listings view exists
SELECT viewname, 'PASS: view present' AS status
FROM pg_views
WHERE schemaname = 'public' AND viewname = 'marketplace_listings';

-- 3.5b — Sensitive columns are NOT in the view
SELECT column_name,
  'FAIL: confidential column exposed in marketplace_listings view' AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'marketplace_listings'
  AND column_name IN (
    'internal_company_name',
    'company_website',
    'main_contact_name',
    'main_contact_email',
    'main_contact_phone',
    'internal_notes',
    'internal_salesforce_link',
    'internal_deal_memo_link',
    'street_address',
    'address_city',
    'address_zip'
  );

-- 3.6 — marketplace_listings view enforces is_internal_deal = false
SELECT pg_get_viewdef('public.marketplace_listings', true) AS view_definition;
-- Manually verify the returned definition contains: is_internal_deal = false


-- ============================================================================
-- SECTION 4 — DEAD COLUMN CLEANUP
-- ============================================================================

-- 4.1 — Dead columns are absent from listings
SELECT
  expected.column_name,
  CASE
    WHEN col.column_name IS NULL THEN 'PASS: correctly absent'
    ELSE 'FAIL: dead column still present — ' || col.column_name
  END AS status
FROM (VALUES
  ('seller_interest_analyzed_at'),
  ('seller_interest_notes'),
  ('lead_source_id'),
  ('manual_rank_set_at')
) AS expected(column_name)
LEFT JOIN information_schema.columns col
  ON col.table_schema = 'public'
  AND col.table_name = 'listings'
  AND col.column_name = expected.column_name
ORDER BY expected.column_name;


-- ============================================================================
-- SECTION 5 — source_deal_id ARCHITECTURE
-- ============================================================================

-- 5.1 — Column exists
SELECT
  col.column_name,
  col.data_type,
  'PASS: column present' AS col_status
FROM information_schema.columns col
WHERE col.table_schema = 'public'
  AND col.table_name = 'listings'
  AND col.column_name = 'source_deal_id';

-- 5.1b — Index exists
SELECT
  indexname,
  'PASS: index present' AS idx_status
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'listings'
  AND indexname = 'idx_listings_source_deal_id';

-- 5.2 — Self-referential FK is intact
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column,
  'PASS: self-referential FK intact' AS status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'listings'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'source_deal_id';
