-- ============================================================================
-- SOURCECO DATA ARCHITECTURE AUDIT v2 — SUPABASE SQL EDITOR VERSION
-- ============================================================================
-- This version is compatible with the Supabase SQL Editor (no psql commands).
-- Run each section individually or copy the entire script.
-- Each query includes a 'section' column for identification.
--
-- Generated: 2026-02-24 (SQL Editor compatible version)
-- ============================================================================


-- ============================================================================
-- SECTION 1a — TABLE EXISTENCE: Required tables (must be PRESENT)
-- ============================================================================
SELECT
  '1a' AS section,
  t.required_table,
  CASE WHEN i.table_name IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS status,
  CASE WHEN i.table_name IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END AS detail
FROM (VALUES
  ('contacts'),
  ('remarketing_buyers'),
  ('remarketing_buyer_contacts'),
  ('firm_agreements'),
  ('firm_members'),
  ('profiles'),
  ('listings'),
  ('remarketing_scores'),
  ('remarketing_outreach'),
  ('deals'),
  ('deal_stages'),
  ('deal_tasks'),
  ('deal_activities'),
  ('data_room_access'),
  ('deal_documents'),
  ('document_release_log'),
  ('document_tracked_links'),
  ('pandadoc_webhook_log'),
  ('connection_requests'),
  ('inbound_leads')
) AS t(required_table)
LEFT JOIN information_schema.tables i
  ON i.table_schema = 'public' AND i.table_name = t.required_table
ORDER BY t.required_table;


-- ============================================================================
-- SECTION 1b — TABLE EXISTENCE: Legacy tables (must be ABSENT)
-- ============================================================================
SELECT
  '1b' AS section,
  t.legacy_table,
  CASE WHEN i.table_name IS NULL THEN 'PASS' ELSE 'FAIL' END AS status,
  CASE WHEN i.table_name IS NULL THEN 'DROPPED' ELSE 'STILL EXISTS' END AS detail
FROM (VALUES
  ('pe_firm_contacts'),
  ('platform_contacts'),
  ('deal_notes'),
  ('listing_messages'),
  ('chat_recommendations'),
  ('chat_smart_suggestions'),
  ('tracker_activity_logs')
) AS t(legacy_table)
LEFT JOIN information_schema.tables i
  ON i.table_schema = 'public' AND i.table_name = t.legacy_table
ORDER BY t.legacy_table;


-- ============================================================================
-- SECTION 2 — CONTACTS TABLE COLUMNS
-- ============================================================================
SELECT
  '2' AS section,
  r.col AS required_column,
  r.expected_type,
  r.expected_nullable,
  c.data_type AS actual_type,
  c.is_nullable AS actual_nullable,
  CASE
    WHEN c.column_name IS NULL THEN 'FAIL: MISSING'
    WHEN c.data_type != r.expected_type THEN 'FAIL: WRONG TYPE (got ' || c.data_type || ')'
    WHEN c.is_nullable != r.expected_nullable THEN 'WARN: NULLABLE MISMATCH (got ' || c.is_nullable || ')'
    ELSE 'PASS'
  END AS status
FROM (VALUES
  ('id', 'uuid', 'NO'),
  ('first_name', 'text', 'NO'),
  ('last_name', 'text', 'YES'),
  ('email', 'text', 'YES'),
  ('phone', 'text', 'YES'),
  ('linkedin_url', 'text', 'YES'),
  ('title', 'text', 'YES'),
  ('contact_type', 'text', 'NO'),
  ('firm_id', 'uuid', 'YES'),
  ('remarketing_buyer_id', 'uuid', 'YES'),
  ('is_primary_at_firm', 'boolean', 'YES'),
  ('profile_id', 'uuid', 'YES'),
  ('listing_id', 'uuid', 'YES'),
  ('is_primary_seller_contact', 'boolean', 'YES'),
  ('nda_signed', 'boolean', 'YES'),
  ('nda_signed_at', 'timestamp with time zone', 'YES'),
  ('fee_agreement_signed', 'boolean', 'YES'),
  ('fee_agreement_signed_at', 'timestamp with time zone', 'YES'),
  ('source', 'text', 'YES'),
  ('notes', 'text', 'YES'),
  ('archived', 'boolean', 'YES'),
  ('created_at', 'timestamp with time zone', 'YES'),
  ('updated_at', 'timestamp with time zone', 'YES')
) AS r(col, expected_type, expected_nullable)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
  AND c.table_name = 'contacts'
  AND c.column_name = r.col
ORDER BY r.col;


-- ============================================================================
-- SECTION 3a — DEALS TABLE: Existing columns
-- ============================================================================
SELECT
  '3a' AS section,
  r.col AS required_column,
  CASE WHEN c.column_name IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS status,
  c.data_type,
  c.is_nullable
FROM (VALUES
  ('id'), ('listing_id'), ('stage_id'), ('connection_request_id'), ('inbound_lead_id'),
  ('title'), ('description'), ('value'), ('priority'), ('probability'),
  ('contact_name'), ('contact_email'), ('contact_company'), ('contact_phone'), ('contact_role'),
  ('nda_status'), ('fee_agreement_status'),
  ('assigned_to'), ('followed_up'), ('followed_up_at'), ('followed_up_by'),
  ('source'), ('metadata'), ('deal_score'),
  ('buyer_priority_score'), ('meeting_scheduled')
) AS r(col)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
  AND c.table_name = 'deals'
  AND c.column_name = r.col
ORDER BY r.col;


-- ============================================================================
-- SECTION 3b — DEALS TABLE: THREE NEW FK COLUMNS (Critical)
-- ============================================================================
SELECT
  '3b-CRITICAL' AS section,
  r.col AS fk_column,
  CASE
    WHEN c.column_name IS NULL THEN 'CRITICAL FAIL: Migration Step 1 NOT run'
    WHEN c.data_type != 'uuid' THEN 'FAIL: WRONG TYPE (got ' || c.data_type || ')'
    WHEN c.is_nullable != 'YES' THEN 'WARN: Should be nullable'
    ELSE 'PASS'
  END AS status,
  c.data_type,
  c.is_nullable
FROM (VALUES
  ('buyer_contact_id'),
  ('remarketing_buyer_id'),
  ('seller_contact_id')
) AS r(col)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
  AND c.table_name = 'deals'
  AND c.column_name = r.col
ORDER BY r.col;


-- ============================================================================
-- SECTION 4b — FOREIGN KEY CONSTRAINTS: Required FK checks
-- ============================================================================
WITH all_fks AS (
  SELECT
    tc.table_name AS from_table,
    kcu.column_name AS from_column,
    ccu.table_name AS to_table,
    rc.delete_rule
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.referential_constraints AS rc
    ON tc.constraint_name = rc.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = rc.unique_constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
)
SELECT
  '4b' AS section,
  r.from_tbl, r.from_col, r.to_tbl, r.expected_delete,
  CASE
    WHEN f.from_table IS NOT NULL AND f.delete_rule = r.expected_delete THEN 'PASS'
    WHEN f.from_table IS NOT NULL THEN 'WARN: FK exists but delete rule is ' || f.delete_rule || ' (expected ' || r.expected_delete || ')'
    ELSE 'FAIL: MISSING'
  END AS status
FROM (VALUES
  ('contacts', 'remarketing_buyer_id', 'remarketing_buyers', 'SET NULL'),
  ('contacts', 'firm_id', 'firm_agreements', 'SET NULL'),
  ('contacts', 'profile_id', 'profiles', 'SET NULL'),
  ('contacts', 'listing_id', 'listings', 'CASCADE'),
  ('remarketing_buyer_contacts', 'buyer_id', 'remarketing_buyers', 'CASCADE'),
  ('deals', 'listing_id', 'listings', 'CASCADE'),
  ('deals', 'connection_request_id', 'connection_requests', 'SET NULL'),
  ('deals', 'inbound_lead_id', 'inbound_leads', 'SET NULL'),
  ('data_room_access', 'remarketing_buyer_id', 'remarketing_buyers', 'CASCADE'),
  ('remarketing_scores', 'listing_id', 'listings', 'CASCADE'),
  ('remarketing_scores', 'buyer_id', 'remarketing_buyers', 'CASCADE'),
  ('remarketing_outreach', 'buyer_id', 'remarketing_buyers', 'CASCADE'),
  ('remarketing_outreach', 'listing_id', 'listings', 'CASCADE'),
  -- NEW FKs from migration
  ('deals', 'buyer_contact_id', 'contacts', 'SET NULL'),
  ('deals', 'remarketing_buyer_id', 'remarketing_buyers', 'SET NULL'),
  ('deals', 'seller_contact_id', 'contacts', 'SET NULL')
) AS r(from_tbl, from_col, to_tbl, expected_delete)
LEFT JOIN all_fks f
  ON f.from_table = r.from_tbl
  AND f.from_column = r.from_col
  AND f.to_table = r.to_tbl
ORDER BY r.from_tbl, r.from_col;


-- ============================================================================
-- SECTION 4c — pandadoc_webhook_log contact FK check
-- ============================================================================
SELECT
  '4c' AS section,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = rc.unique_constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'pandadoc_webhook_log'
        AND kcu.column_name = 'contact_id'
        AND ccu.table_name = 'contacts'
    ) THEN 'WARN: FK EXISTS (intentionally added in migration 20260306100000)'
    ELSE 'PASS: ABSENT as expected'
  END AS pandadoc_contact_fk_status;


-- ============================================================================
-- SECTION 5a — UNIQUE INDEXES
-- ============================================================================
SELECT
  '5a' AS section,
  r.idx_name,
  CASE WHEN pi.indexname IS NOT NULL THEN 'PASS' ELSE 'FAIL: MISSING' END AS status,
  pi.indexdef
FROM (VALUES
  ('idx_contacts_buyer_email_unique'),
  ('idx_contacts_seller_email_listing_unique'),
  ('remarketing_scores_listing_buyer_universe_key')
) AS r(idx_name)
LEFT JOIN pg_indexes pi
  ON pi.schemaname = 'public' AND pi.indexname = r.idx_name
ORDER BY r.idx_name;


-- ============================================================================
-- SECTION 5b — firm_members unique index
-- ============================================================================
SELECT '5b' AS section, indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'firm_members'
  AND indexdef ILIKE '%unique%'
ORDER BY indexname;


-- ============================================================================
-- SECTION 5c — Deals performance indexes (NEW)
-- ============================================================================
SELECT
  '5c' AS section,
  r.idx_name,
  CASE WHEN pi.indexname IS NOT NULL THEN 'PASS' ELSE 'FAIL: MISSING' END AS status,
  pi.indexdef
FROM (VALUES
  ('idx_deals_buyer_contact'),
  ('idx_deals_remarketing_buyer_id'),
  ('idx_deals_seller_contact')
) AS r(idx_name)
LEFT JOIN pg_indexes pi
  ON pi.schemaname = 'public' AND pi.indexname = r.idx_name
ORDER BY r.idx_name;


-- ============================================================================
-- SECTION 6a — CONTACTS DISTRIBUTION
-- ============================================================================
SELECT
  '6a' AS section,
  contact_type,
  COUNT(*) AS total,
  COUNT(remarketing_buyer_id) AS has_buyer_org,
  COUNT(firm_id) AS has_firm,
  COUNT(profile_id) AS has_profile,
  COUNT(listing_id) AS has_listing
FROM public.contacts
WHERE archived = false
GROUP BY contact_type
ORDER BY contact_type;


-- ============================================================================
-- SECTION 6b — CONTACTS INTEGRITY CHECKS
-- ============================================================================
WITH integrity_checks AS (
  SELECT 'FAIL: buyers with listing_id' AS check_name,
    COUNT(*) AS count
  FROM public.contacts
  WHERE contact_type = 'buyer' AND listing_id IS NOT NULL AND archived = false

  UNION ALL

  SELECT 'FAIL: sellers with remarketing_buyer_id' AS check_name,
    COUNT(*) AS count
  FROM public.contacts
  WHERE contact_type = 'seller' AND remarketing_buyer_id IS NOT NULL AND archived = false

  UNION ALL

  SELECT 'FAIL: sellers without listing_id' AS check_name,
    COUNT(*) AS count
  FROM public.contacts
  WHERE contact_type = 'seller' AND listing_id IS NULL AND archived = false

  UNION ALL

  SELECT 'WARN: solo buyers (no org, no profile)' AS check_name,
    COUNT(*) AS count
  FROM public.contacts
  WHERE contact_type = 'buyer'
    AND remarketing_buyer_id IS NULL
    AND profile_id IS NULL
    AND archived = false
)
SELECT '6b' AS section, check_name, count FROM integrity_checks WHERE count > 0
UNION ALL
SELECT '6b', 'ALL CHECKS PASSED', 0
WHERE NOT EXISTS (
  SELECT 1 FROM integrity_checks
  WHERE count > 0 AND check_name LIKE 'FAIL%'
);


-- ============================================================================
-- SECTION 7a — BUYER IDENTITY CHAIN: Coverage
-- ============================================================================
SELECT
  '7a' AS section,
  COUNT(*) AS total_buyer_contacts,
  COUNT(c.remarketing_buyer_id) AS linked_to_buyer_org,
  COUNT(c.firm_id) AS linked_to_firm_agreement,
  COUNT(c.profile_id) AS linked_to_platform_login,
  COUNT(rb.marketplace_firm_id) AS buyer_org_has_firm_link
FROM public.contacts c
LEFT JOIN public.remarketing_buyers rb ON rb.id = c.remarketing_buyer_id
WHERE c.contact_type = 'buyer' AND c.archived = false;


-- ============================================================================
-- SECTION 7b — BUYER IDENTITY CHAIN: Sample end-to-end join
-- ============================================================================
SELECT
  '7b' AS section,
  c.first_name || ' ' || c.last_name AS person,
  rb.company_name AS buyer_org,
  fa.primary_company_name AS firm_name,
  fa.nda_status,
  fa.fee_agreement_status,
  p.email AS platform_login
FROM public.contacts c
LEFT JOIN public.remarketing_buyers rb ON rb.id = c.remarketing_buyer_id
LEFT JOIN public.firm_agreements fa ON fa.id = c.firm_id
LEFT JOIN public.profiles p ON p.id = c.profile_id
WHERE c.contact_type = 'buyer' AND c.archived = false
LIMIT 10;


-- ============================================================================
-- SECTION 8a — SELLER CONTACT CHAIN: Coverage
-- ============================================================================
SELECT
  '8a' AS section,
  COUNT(*) AS total_seller_contacts,
  COUNT(listing_id) AS has_listing,
  COUNT(*) FILTER (WHERE is_primary_seller_contact = true) AS primary_contacts,
  COUNT(*) FILTER (WHERE listing_id IS NULL) AS orphaned
FROM public.contacts
WHERE contact_type = 'seller' AND archived = false;


-- ============================================================================
-- SECTION 8b — SELLER CONTACT CHAIN: Listing sync check
-- ============================================================================
SELECT
  '8b' AS section,
  l.title AS listing_title,
  l.main_contact_email AS listing_flat_email,
  c.email AS contact_email,
  CASE
    WHEN l.main_contact_email IS NULL AND c.email IS NULL THEN 'PASS: Both NULL'
    WHEN lower(l.main_contact_email) = lower(c.email) THEN 'PASS: In sync'
    ELSE 'FAIL: OUT OF SYNC'
  END AS sync_status
FROM public.contacts c
JOIN public.listings l ON l.id = c.listing_id
WHERE c.contact_type = 'seller'
  AND c.is_primary_seller_contact = true
  AND c.archived = false
ORDER BY sync_status DESC
LIMIT 20;


-- ============================================================================
-- SECTION 9a — DEALS BACKFILL: Overview by source
-- ============================================================================
SELECT
  '9a' AS section,
  source,
  COUNT(*) AS total,
  COUNT(contact_email) AS has_seller_email,
  COUNT(connection_request_id) AS from_marketplace,
  COUNT(inbound_lead_id) AS from_inbound
FROM public.deals
GROUP BY source
ORDER BY total DESC;


-- ============================================================================
-- SECTION 9b — DEALS BACKFILL: Seller contact matchable
-- ============================================================================
SELECT '9b' AS section, COUNT(*) AS seller_contacts_matchable
FROM public.deals d
JOIN public.contacts c
  ON lower(d.contact_email) = lower(c.email)
  AND c.contact_type = 'seller'
  AND c.archived = false
WHERE d.contact_email IS NOT NULL;


-- ============================================================================
-- SECTION 9c — DEALS BACKFILL: Buyer contact matchable
-- ============================================================================
SELECT '9c' AS section, COUNT(*) AS buyer_contacts_matchable
FROM public.deals d
JOIN public.connection_requests cr ON cr.id = d.connection_request_id
JOIN public.contacts c ON c.profile_id = cr.user_id
WHERE d.connection_request_id IS NOT NULL
  AND c.contact_type = 'buyer'
  AND c.archived = false;


-- ============================================================================
-- SECTION 10a — LEGACY TABLE: remarketing_buyer_contacts stats
-- ============================================================================
SELECT
  '10a' AS section,
  COUNT(*) AS total_legacy_contacts,
  COUNT(DISTINCT buyer_id) AS distinct_buyers,
  MIN(created_at) AS oldest_record,
  MAX(created_at) AS most_recent_write
FROM public.remarketing_buyer_contacts;


-- ============================================================================
-- SECTION 10b — LEGACY TABLE: Backfill coverage
-- ============================================================================
SELECT
  '10b' AS section,
  COUNT(*) AS legacy_total,
  COUNT(c.id) AS found_in_unified_contacts,
  COUNT(*) FILTER (WHERE c.id IS NULL) AS missing_from_unified
FROM public.remarketing_buyer_contacts rbc
LEFT JOIN public.contacts c
  ON lower(c.email) = lower(rbc.email)
  AND c.contact_type = 'buyer'
  AND c.archived = false
WHERE rbc.email IS NOT NULL;


-- ============================================================================
-- SECTION 11a — PANDADOC: Event summary
-- ============================================================================
SELECT
  '11a' AS section,
  event_type,
  document_type,
  COUNT(*) AS events,
  COUNT(DISTINCT submission_id) AS unique_submissions
FROM public.pandadoc_webhook_log
GROUP BY event_type, document_type
ORDER BY document_type, event_type;


-- ============================================================================
-- SECTION 11b — PANDADOC: Completed signings joined to firm_agreements
-- ============================================================================
SELECT
  '11b' AS section,
  dwl.submission_id,
  dwl.document_type,
  dwl.event_type,
  fa.primary_company_name AS firm,
  fa.nda_status,
  fa.fee_agreement_status
FROM public.pandadoc_webhook_log dwl
LEFT JOIN public.firm_agreements fa
  ON fa.nda_pandadoc_document_id = dwl.submission_id
  OR fa.fee_pandadoc_document_id = dwl.submission_id
WHERE dwl.event_type ILIKE '%completed%' OR dwl.event_type ILIKE '%signed%'
ORDER BY dwl.created_at DESC
LIMIT 20;


-- ============================================================================
-- SECTION 11c — PANDADOC: Orphaned signing events
-- ============================================================================
SELECT
  '11c' AS section,
  COUNT(*) FILTER (WHERE fa.id IS NOT NULL) AS joinable_to_firm,
  COUNT(*) FILTER (WHERE fa.id IS NULL) AS orphaned_no_firm_match,
  COUNT(*) AS total_completed
FROM public.pandadoc_webhook_log dwl
LEFT JOIN public.firm_agreements fa
  ON fa.nda_pandadoc_document_id = dwl.submission_id
  OR fa.fee_pandadoc_document_id = dwl.submission_id
WHERE dwl.event_type ILIKE '%completed%' OR dwl.event_type ILIKE '%signed%';


-- ============================================================================
-- SECTION 12b — PERFORMANCE INDEXES: Required check
-- ============================================================================
WITH required_indexes AS (
  SELECT * FROM (VALUES
    ('contacts', 'firm_id', 'idx_contacts_firm'),
    ('contacts', 'remarketing_buyer_id', 'idx_contacts_buyer'),
    ('contacts', 'profile_id', 'idx_contacts_profile'),
    ('contacts', 'listing_id', 'idx_contacts_listing'),
    ('contacts', 'lower(email)', 'idx_contacts_email'),
    ('contacts', 'contact_type', 'idx_contacts_type'),
    ('remarketing_buyers', 'marketplace_firm_id', 'idx_remarketing_buyers_marketplace_firm_id'),
    ('remarketing_scores', 'listing_id', 'idx_remarketing_scores_listing'),
    ('remarketing_scores', 'buyer_id', 'idx_remarketing_scores_buyer'),
    ('remarketing_outreach', 'buyer_id', 'idx_remarketing_outreach_buyer'),
    ('remarketing_outreach', 'listing_id', 'idx_remarketing_outreach_listing'),
    ('data_room_access', 'remarketing_buyer_id', 'idx_data_room_access_remarketing_buyer'),
    ('firm_agreements', 'email_domain', 'idx_firm_agreements_email_domain')
  ) AS t(tbl, col_desc, expected_name)
)
SELECT
  '12b' AS section,
  ri.tbl,
  ri.col_desc,
  ri.expected_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = ri.tbl
        AND (indexname = ri.expected_name OR indexdef ILIKE '%' || ri.col_desc || '%')
    ) THEN 'PASS'
    ELSE 'FAIL: MISSING'
  END AS status
FROM required_indexes ri
ORDER BY ri.tbl, ri.col_desc;


-- ============================================================================
-- SECTION 13 — ROW LEVEL SECURITY
-- ============================================================================
SELECT
  '13' AS section,
  t.tbl AS table_name,
  CASE
    WHEN pt.rowsecurity THEN 'PASS: RLS ENABLED'
    ELSE 'FAIL: RLS DISABLED'
  END AS rls_status
FROM (VALUES
  ('contacts'),
  ('remarketing_buyers'),
  ('firm_agreements'),
  ('firm_members'),
  ('data_room_access'),
  ('deal_documents'),
  ('document_release_log'),
  ('pandadoc_webhook_log'),
  ('deals'),
  ('listings'),
  ('profiles'),
  ('remarketing_scores'),
  ('remarketing_outreach'),
  ('remarketing_buyer_contacts')
) AS t(tbl)
LEFT JOIN pg_tables pt
  ON pt.schemaname = 'public' AND pt.tablename = t.tbl
ORDER BY t.tbl;


-- ============================================================================
-- SECTION 14b — TRIGGERS: Seller contact sync
-- ============================================================================
SELECT
  '14b' AS section,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND trigger_name = 'trg_sync_seller_contact'
        AND event_object_table = 'contacts'
    ) THEN 'PASS: trg_sync_seller_contact EXISTS on contacts'
    ELSE 'FAIL: trg_sync_seller_contact MISSING'
  END AS trigger_status;


-- ============================================================================
-- SECTION 14c — TRIGGERS: Legacy mirror trigger
-- ============================================================================
SELECT
  '14c' AS section,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND trigger_name = 'trg_mirror_rbc_to_contacts'
        AND event_object_table = 'remarketing_buyer_contacts'
    ) THEN 'PASS: trg_mirror_rbc_to_contacts EXISTS (legacy writes mirrored)'
    ELSE 'WARN: trg_mirror_rbc_to_contacts NOT FOUND (legacy writes NOT mirrored)'
  END AS mirror_trigger_status;


-- ============================================================================
-- SECTION 15a — DATA INTEGRITY: Orphaned buyer contacts
-- ============================================================================
SELECT '15a' AS section, COUNT(*) AS orphaned_buyer_contacts
FROM public.contacts
WHERE contact_type = 'buyer'
  AND archived = false
  AND remarketing_buyer_id IS NULL
  AND profile_id IS NULL
  AND firm_id IS NULL;


-- ============================================================================
-- SECTION 15b — DATA INTEGRITY: Seller contacts with no listing
-- ============================================================================
SELECT '15b' AS section, COUNT(*) AS orphaned_seller_contacts
FROM public.contacts
WHERE contact_type = 'seller'
  AND listing_id IS NULL
  AND archived = false;


-- ============================================================================
-- SECTION 15c — DATA INTEGRITY: Buyer orgs with no contacts
-- ============================================================================
SELECT '15c' AS section, COUNT(*) AS buyer_orgs_no_contacts
FROM public.remarketing_buyers rb
WHERE rb.archived = false
  AND NOT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.remarketing_buyer_id = rb.id
      AND c.archived = false
  );


-- ============================================================================
-- SECTION 15d — DATA INTEGRITY: Unlinked firm agreements
-- ============================================================================
SELECT '15d' AS section, COUNT(*) AS unlinked_firm_agreements
FROM public.firm_agreements fa
WHERE NOT EXISTS (
  SELECT 1 FROM public.remarketing_buyers rb
  WHERE rb.marketplace_firm_id = fa.id
    AND rb.archived = false
);


-- ============================================================================
-- SECTION 15e — DATA INTEGRITY: Orphaned deals (no listing)
-- ============================================================================
SELECT '15e' AS section, COUNT(*) AS deals_no_listing
FROM public.deals d
WHERE d.listing_id IS NULL;


-- ============================================================================
-- SECTION 15f — DATA INTEGRITY: Deals FK column coverage (KEY METRIC)
-- ============================================================================
SELECT
  '15f-KEY' AS section,
  COUNT(*) AS total_deals,
  COUNT(buyer_contact_id) AS has_buyer_contact,
  COUNT(remarketing_buyer_id) AS has_buyer_org,
  COUNT(seller_contact_id) AS has_seller_contact,
  ROUND(COUNT(buyer_contact_id)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS buyer_contact_pct,
  ROUND(COUNT(seller_contact_id)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS seller_contact_pct
FROM public.deals;


-- ============================================================================
-- SECTION 16 — AI COMMAND CENTER QUERY TESTS
-- ============================================================================

-- Test 1: Buyer outreach by deal
SELECT
  '16-test1' AS section,
  rb.company_name,
  ro.status,
  ro.contacted_at,
  ro.contact_method
FROM public.remarketing_outreach ro
JOIN public.remarketing_buyers rb ON rb.id = ro.buyer_id
JOIN public.listings l ON l.id = ro.listing_id
WHERE l.title ILIKE '%collision%' OR l.title ILIKE '%test%'
LIMIT 5;

-- Test 2: Pipeline by buyer contact (requires buyer_contact_id)
SELECT
  '16-test2' AS section,
  c.first_name || ' ' || c.last_name AS buyer_contact,
  rb.company_name AS buyer_org,
  ds.name AS pipeline_stage,
  d.nda_status,
  d.fee_agreement_status
FROM public.deals d
LEFT JOIN public.contacts c ON c.id = d.buyer_contact_id
LEFT JOIN public.remarketing_buyers rb ON rb.id = d.remarketing_buyer_id
LEFT JOIN public.deal_stages ds ON ds.id = d.stage_id
WHERE d.buyer_contact_id IS NOT NULL OR d.remarketing_buyer_id IS NOT NULL
LIMIT 5;

-- Test 3: Seller contact by deal (requires seller_contact_id)
SELECT
  '16-test3' AS section,
  l.title AS deal,
  c.first_name || ' ' || c.last_name AS seller_name,
  c.email AS seller_email,
  c.phone AS seller_phone,
  d.nda_status,
  d.fee_agreement_status
FROM public.deals d
JOIN public.listings l ON l.id = d.listing_id
LEFT JOIN public.contacts c ON c.id = d.seller_contact_id
WHERE d.seller_contact_id IS NOT NULL
LIMIT 5;

-- Test 4: NDA signer by firm
SELECT
  '16-test4' AS section,
  fa.primary_company_name AS firm,
  fa.nda_status,
  fa.nda_signed_at,
  fa.nda_pandadoc_document_id,
  c.first_name || ' ' || c.last_name AS contact_at_firm
FROM public.firm_agreements fa
LEFT JOIN public.contacts c
  ON c.firm_id = fa.id
  AND c.contact_type = 'buyer'
  AND c.archived = false
WHERE fa.nda_status = 'signed'
LIMIT 5;

-- Test 5: Data room access by buyer
SELECT
  '16-test5' AS section,
  rb.company_name,
  l.title AS deal,
  dra.can_view_teaser,
  dra.can_view_full_memo,
  dra.can_view_data_room,
  dra.granted_at
FROM public.data_room_access dra
JOIN public.remarketing_buyers rb ON rb.id = dra.remarketing_buyer_id
JOIN public.listings l ON l.id = dra.deal_id
WHERE dra.revoked_at IS NULL
LIMIT 5;


-- ============================================================================
-- AUDIT COMPLETE — Review all section results above
-- All 16 sections executed. Look for FAIL status in any row.
-- ============================================================================
