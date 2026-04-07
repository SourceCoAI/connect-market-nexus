-- ═══════════════════════════════════════════════════════════════
-- Migration: add_marketplace_queue_fields
-- Date: 2026-04-01
-- Purpose: Adds tracking columns for marketplace queue status on listings,
--          including pushed flag, timestamp, and actor.
-- Tables affected: listings
-- ═══════════════════════════════════════════════════════════════

-- Add marketplace queue tracking fields to listings table
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS pushed_to_marketplace boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pushed_to_marketplace_at timestamptz,
  ADD COLUMN IF NOT EXISTS pushed_to_marketplace_by text;

-- Index for fast marketplace queue lookups
CREATE INDEX IF NOT EXISTS idx_listings_pushed_to_marketplace
  ON listings (pushed_to_marketplace)
  WHERE pushed_to_marketplace = true;

-- Merged from: 20260401000000_deduplicate_contacts.sql
-- ============================================================================
-- MIGRATION: Deduplicate Contacts & Prevent Future Duplicates
-- ============================================================================
-- Problem: The unique indexes on contacts only cover rows WHERE email IS NOT NULL.
-- Contacts without emails bypass all deduplication, causing mass duplication
-- during backfills and from the remarketing_buyer_contacts mirror trigger.
--
-- This migration:
--   1. Identifies duplicate contact groups (by name + type + org/listing)
--   2. Merges non-null data from duplicates into the "keeper" record
--   3. Re-points all FK references from duplicate IDs to keeper IDs
--   4. Archives duplicate records
--   5. Adds name-based unique indexes for contacts without emails
--   6. Updates the mirror trigger to handle null-email deduplication
--   7. Updates the listing sync trigger to handle null-email deduplication
--
-- SAFETY:
--   - Duplicates are ARCHIVED, not deleted (fully reversible)
--   - FK references are re-pointed before archival
--   - All operations are idempotent
-- ============================================================================


-- ============================================================================
-- STEP 1: Build duplicate mapping (duplicate_id → keeper_id)
-- ============================================================================
-- Group contacts by (normalized_name, contact_type, listing_id, remarketing_buyer_id).
-- Within each group, rank by data quality. Rank 1 = keeper, rank > 1 = duplicate.

CREATE TEMP TABLE contact_dedup_map AS
WITH ranked AS (
  SELECT
    id,
    lower(trim(first_name || ' ' || last_name)) AS norm_name,
    contact_type,
    listing_id,
    remarketing_buyer_id,
    email,
    firm_id,
    profile_id,
    is_primary_at_firm,
    is_primary_seller_contact,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY
        lower(trim(first_name || ' ' || last_name)),
        contact_type,
        listing_id,
        remarketing_buyer_id
      ORDER BY
        -- Prefer records with email
        (CASE WHEN email IS NOT NULL THEN 0 ELSE 1 END),
        -- Prefer primary contacts
        (CASE WHEN is_primary_at_firm THEN 0 ELSE 1 END),
        (CASE WHEN is_primary_seller_contact THEN 0 ELSE 1 END),
        -- Prefer records with more linked IDs
        (CASE WHEN firm_id IS NOT NULL THEN 0 ELSE 1 END),
        (CASE WHEN profile_id IS NOT NULL THEN 0 ELSE 1 END),
        -- Keep the oldest record
        created_at ASC
    ) AS rn
  FROM public.contacts
  WHERE archived = false
    AND trim(first_name || ' ' || last_name) != ''
)
SELECT
  dup.id   AS duplicate_id,
  keeper.id AS keeper_id
FROM ranked dup
JOIN ranked keeper
  ON  keeper.norm_name = dup.norm_name
  AND keeper.contact_type = dup.contact_type
  AND keeper.listing_id IS NOT DISTINCT FROM dup.listing_id
  AND keeper.remarketing_buyer_id IS NOT DISTINCT FROM dup.remarketing_buyer_id
  AND keeper.rn = 1
WHERE dup.rn > 1;

CREATE INDEX idx_dedup_map_dup    ON contact_dedup_map(duplicate_id);
CREATE INDEX idx_dedup_map_keeper ON contact_dedup_map(keeper_id);


-- ============================================================================
-- STEP 2: Merge non-null fields from duplicates into keepers
-- ============================================================================
-- Aggregates across ALL duplicates per keeper to find the first non-null value
-- for each field. Only fills in fields that are NULL on the keeper.

UPDATE public.contacts keeper
SET
  email                    = COALESCE(keeper.email,                    agg.first_email),
  phone                    = COALESCE(keeper.phone,                    agg.first_phone),
  linkedin_url             = COALESCE(keeper.linkedin_url,             agg.first_linkedin),
  title                    = COALESCE(keeper.title,                    agg.first_title),
  firm_id                  = COALESCE(keeper.firm_id,                  agg.first_firm_id),
  remarketing_buyer_id     = COALESCE(keeper.remarketing_buyer_id,     agg.first_rmkt_buyer_id),
  profile_id               = COALESCE(keeper.profile_id,               agg.first_profile_id),
  company_name             = COALESCE(keeper.company_name,             agg.first_company),
  phoneburner_contact_id   = COALESCE(keeper.phoneburner_contact_id,   agg.first_pb_id),
  is_primary_at_firm       = keeper.is_primary_at_firm       OR COALESCE(agg.any_primary_firm, false),
  is_primary_seller_contact= keeper.is_primary_seller_contact OR COALESCE(agg.any_primary_seller, false),
  nda_signed               = keeper.nda_signed               OR COALESCE(agg.any_nda, false),
  nda_signed_at            = COALESCE(keeper.nda_signed_at,            agg.first_nda_at),
  fee_agreement_signed     = keeper.fee_agreement_signed     OR COALESCE(agg.any_fee, false),
  fee_agreement_signed_at  = COALESCE(keeper.fee_agreement_signed_at,  agg.first_fee_at),
  notes = CASE
    WHEN keeper.notes IS NOT NULL AND agg.merged_notes IS NOT NULL
      THEN keeper.notes || E'\n[merged] ' || agg.merged_notes
    ELSE COALESCE(keeper.notes, agg.merged_notes)
  END,
  updated_at = now()
FROM (
  SELECT
    m.keeper_id,
    -- First non-null value per field (ordered by created_at)
    (array_agg(c.email            ORDER BY c.created_at) FILTER (WHERE c.email IS NOT NULL))[1]            AS first_email,
    (array_agg(c.phone            ORDER BY c.created_at) FILTER (WHERE c.phone IS NOT NULL))[1]            AS first_phone,
    (array_agg(c.linkedin_url     ORDER BY c.created_at) FILTER (WHERE c.linkedin_url IS NOT NULL))[1]     AS first_linkedin,
    (array_agg(c.title            ORDER BY c.created_at) FILTER (WHERE c.title IS NOT NULL))[1]            AS first_title,
    (array_agg(c.firm_id          ORDER BY c.created_at) FILTER (WHERE c.firm_id IS NOT NULL))[1]          AS first_firm_id,
    (array_agg(c.remarketing_buyer_id ORDER BY c.created_at) FILTER (WHERE c.remarketing_buyer_id IS NOT NULL))[1] AS first_rmkt_buyer_id,
    (array_agg(c.profile_id       ORDER BY c.created_at) FILTER (WHERE c.profile_id IS NOT NULL))[1]       AS first_profile_id,
    (array_agg(c.company_name     ORDER BY c.created_at) FILTER (WHERE c.company_name IS NOT NULL))[1]     AS first_company,
    (array_agg(c.phoneburner_contact_id ORDER BY c.created_at) FILTER (WHERE c.phoneburner_contact_id IS NOT NULL))[1] AS first_pb_id,
    bool_or(c.is_primary_at_firm)                AS any_primary_firm,
    bool_or(c.is_primary_seller_contact)         AS any_primary_seller,
    bool_or(c.nda_signed)                        AS any_nda,
    (array_agg(c.nda_signed_at ORDER BY c.nda_signed_at) FILTER (WHERE c.nda_signed_at IS NOT NULL))[1] AS first_nda_at,
    bool_or(c.fee_agreement_signed)              AS any_fee,
    (array_agg(c.fee_agreement_signed_at ORDER BY c.fee_agreement_signed_at) FILTER (WHERE c.fee_agreement_signed_at IS NOT NULL))[1] AS first_fee_at,
    string_agg(c.notes, '; ' ORDER BY c.created_at) FILTER (WHERE c.notes IS NOT NULL AND c.notes != '') AS merged_notes
  FROM contact_dedup_map m
  JOIN public.contacts c ON c.id = m.duplicate_id
  GROUP BY m.keeper_id
) agg
WHERE keeper.id = agg.keeper_id;


-- ============================================================================
-- STEP 3: Re-point all FK references from duplicate IDs → keeper IDs
-- ============================================================================

-- 3a. data_room_access.contact_id
UPDATE public.data_room_access t
SET contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.contact_id = m.duplicate_id;

-- 3b. remarketing_outreach.contact_id
UPDATE public.remarketing_outreach t
SET contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.contact_id = m.duplicate_id;

-- 3c. document_tracked_links.contact_id
UPDATE public.document_tracked_links t
SET contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.contact_id = m.duplicate_id;

-- 3d. document_release_log.contact_id
UPDATE public.document_release_log t
SET contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.contact_id = m.duplicate_id;

-- 3e. deals.buyer_contact_id
UPDATE public.deals t
SET buyer_contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.buyer_contact_id = m.duplicate_id;

-- 3f. deals.seller_contact_id
UPDATE public.deals t
SET seller_contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.seller_contact_id = m.duplicate_id;

-- 3g. docuseal_webhook_log.contact_id
UPDATE public.docuseal_webhook_log t
SET contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.contact_id = m.duplicate_id;

-- 3h. contact_email_history.contact_id
UPDATE public.contact_email_history t
SET contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.contact_id = m.duplicate_id;

-- 3i. contact_call_history.contact_id
UPDATE public.contact_call_history t
SET contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.contact_id = m.duplicate_id;

-- 3j. contact_linkedin_history.contact_id
UPDATE public.contact_linkedin_history t
SET contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.contact_id = m.duplicate_id;

-- 3k. contact_activities.contact_id
UPDATE public.contact_activities t
SET contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.contact_id = m.duplicate_id;

-- 3l. buyer_introductions.contact_id
UPDATE public.buyer_introductions t
SET contact_id = m.keeper_id
FROM contact_dedup_map m
WHERE t.contact_id = m.duplicate_id;


-- ============================================================================
-- STEP 4: Archive duplicate records
-- ============================================================================

UPDATE public.contacts
SET
  archived = true,
  notes = COALESCE(notes || E'\n', '') || '[archived by dedup migration — merged into keeper]',
  updated_at = now()
WHERE id IN (SELECT duplicate_id FROM contact_dedup_map);


-- ============================================================================
-- STEP 5: Add name-based unique indexes for contacts WITHOUT emails
-- ============================================================================
-- These complement the existing email-based indexes and close the dedup gap.

-- Seller without email: one record per (name, listing) per deal
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_seller_name_listing_unique
  ON public.contacts(lower(trim(first_name)), lower(trim(last_name)), listing_id)
  WHERE contact_type = 'seller'
    AND email IS NULL
    AND archived = false;

-- Buyer without email (with buyer org): one record per (name, buyer org)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_buyer_name_rmkt_unique
  ON public.contacts(lower(trim(first_name)), lower(trim(last_name)), remarketing_buyer_id)
  WHERE contact_type = 'buyer'
    AND email IS NULL
    AND remarketing_buyer_id IS NOT NULL
    AND archived = false;

-- Buyer without email AND without buyer org: one record per name
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_buyer_name_only_unique
  ON public.contacts(lower(trim(first_name)), lower(trim(last_name)))
  WHERE contact_type = 'buyer'
    AND email IS NULL
    AND remarketing_buyer_id IS NULL
    AND archived = false;


-- ============================================================================
-- STEP 6: Replace mirror trigger to handle null-email deduplication
-- ============================================================================
-- The mirror trigger fires when legacy code inserts into remarketing_buyer_contacts.
-- Previously it only deduped by email; now it also dedupes by name when email is NULL.

CREATE OR REPLACE FUNCTION public.mirror_rbc_to_contacts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT;
  v_last_name  TEXT;
  v_email      TEXT;
  v_firm_id    UUID;
BEGIN
  -- Split name into first/last
  v_first_name := COALESCE(NULLIF(TRIM(split_part(NEW.name, ' ', 1)), ''), NEW.name, 'Unknown');
  v_last_name  := CASE
    WHEN position(' ' IN COALESCE(NEW.name, '')) > 0
    THEN TRIM(substring(NEW.name FROM position(' ' IN NEW.name) + 1))
    ELSE ''
  END;

  -- Normalize email
  v_email := NULLIF(TRIM(lower(NEW.email)), '');

  -- Look up firm_id from parent remarketing_buyers record
  SELECT rb.marketplace_firm_id INTO v_firm_id
  FROM public.remarketing_buyers rb
  WHERE rb.id = NEW.buyer_id;

  IF v_email IS NOT NULL THEN
    -- ── Has email → deduplicate by email (existing behavior) ──
    INSERT INTO public.contacts
      (first_name, last_name, email, phone, linkedin_url, title,
       contact_type, remarketing_buyer_id, firm_id,
       is_primary_at_firm, source, notes, created_at)
    VALUES
      (v_first_name, v_last_name, v_email,
       NULLIF(TRIM(NEW.phone), ''),
       NULLIF(TRIM(NEW.linkedin_url), ''),
       NULLIF(TRIM(NEW.role), ''),
       'buyer', NEW.buyer_id, v_firm_id,
       COALESCE(NEW.is_primary, false),
       'remarketing_mirror', NEW.notes,
       COALESCE(NEW.created_at, now()))
    ON CONFLICT (lower(email))
      WHERE contact_type = 'buyer' AND email IS NOT NULL AND archived = false
    DO UPDATE SET
      remarketing_buyer_id = COALESCE(contacts.remarketing_buyer_id, EXCLUDED.remarketing_buyer_id),
      firm_id              = COALESCE(contacts.firm_id, EXCLUDED.firm_id),
      is_primary_at_firm   = contacts.is_primary_at_firm OR EXCLUDED.is_primary_at_firm,
      phone                = COALESCE(EXCLUDED.phone, contacts.phone),
      linkedin_url         = COALESCE(EXCLUDED.linkedin_url, contacts.linkedin_url),
      title                = COALESCE(EXCLUDED.title, contacts.title),
      updated_at           = now();

  ELSIF NEW.buyer_id IS NOT NULL THEN
    -- ── No email, has buyer org → deduplicate by (name, remarketing_buyer_id) ──
    INSERT INTO public.contacts
      (first_name, last_name, email, phone, linkedin_url, title,
       contact_type, remarketing_buyer_id, firm_id,
       is_primary_at_firm, source, notes, created_at)
    VALUES
      (v_first_name, v_last_name, NULL,
       NULLIF(TRIM(NEW.phone), ''),
       NULLIF(TRIM(NEW.linkedin_url), ''),
       NULLIF(TRIM(NEW.role), ''),
       'buyer', NEW.buyer_id, v_firm_id,
       COALESCE(NEW.is_primary, false),
       'remarketing_mirror', NEW.notes,
       COALESCE(NEW.created_at, now()))
    ON CONFLICT (lower(trim(first_name)), lower(trim(last_name)), remarketing_buyer_id)
      WHERE contact_type = 'buyer' AND email IS NULL
        AND remarketing_buyer_id IS NOT NULL AND archived = false
    DO UPDATE SET
      firm_id            = COALESCE(contacts.firm_id, EXCLUDED.firm_id),
      is_primary_at_firm = contacts.is_primary_at_firm OR EXCLUDED.is_primary_at_firm,
      phone              = COALESCE(EXCLUDED.phone, contacts.phone),
      linkedin_url       = COALESCE(EXCLUDED.linkedin_url, contacts.linkedin_url),
      title              = COALESCE(EXCLUDED.title, contacts.title),
      updated_at         = now();

  ELSE
    -- ── No email, no buyer org → deduplicate by name only ──
    INSERT INTO public.contacts
      (first_name, last_name, email, phone, linkedin_url, title,
       contact_type, remarketing_buyer_id, firm_id,
       is_primary_at_firm, source, notes, created_at)
    VALUES
      (v_first_name, v_last_name, NULL,
       NULLIF(TRIM(NEW.phone), ''),
       NULLIF(TRIM(NEW.linkedin_url), ''),
       NULLIF(TRIM(NEW.role), ''),
       'buyer', NULL, v_firm_id,
       COALESCE(NEW.is_primary, false),
       'remarketing_mirror', NEW.notes,
       COALESCE(NEW.created_at, now()))
    ON CONFLICT (lower(trim(first_name)), lower(trim(last_name)))
      WHERE contact_type = 'buyer' AND email IS NULL
        AND remarketing_buyer_id IS NULL AND archived = false
    DO UPDATE SET
      firm_id            = COALESCE(contacts.firm_id, EXCLUDED.firm_id),
      is_primary_at_firm = contacts.is_primary_at_firm OR EXCLUDED.is_primary_at_firm,
      phone              = COALESCE(EXCLUDED.phone, contacts.phone),
      linkedin_url       = COALESCE(EXCLUDED.linkedin_url, contacts.linkedin_url),
      title              = COALESCE(EXCLUDED.title, contacts.title),
      updated_at         = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Re-create trigger (function signature unchanged, so trigger survives)
DROP TRIGGER IF EXISTS trg_mirror_rbc_to_contacts ON public.remarketing_buyer_contacts;
CREATE TRIGGER trg_mirror_rbc_to_contacts
  AFTER INSERT ON public.remarketing_buyer_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_rbc_to_contacts();


-- ============================================================================
-- STEP 7: Replace listing sync trigger to handle null-email deduplication
-- ============================================================================
-- When listings flat fields are updated, the trigger syncs to the seller contact.
-- Previously it only deduped by (email, listing_id); now also by (name, listing_id).

CREATE OR REPLACE FUNCTION public.sync_listing_contact_to_contacts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT;
  v_last_name  TEXT;
  v_email      TEXT;
BEGIN
  -- Only act when main_contact fields actually changed
  IF (NEW.main_contact_name IS DISTINCT FROM OLD.main_contact_name
      OR NEW.main_contact_email IS DISTINCT FROM OLD.main_contact_email
      OR NEW.main_contact_phone IS DISTINCT FROM OLD.main_contact_phone
      OR NEW.main_contact_title IS DISTINCT FROM OLD.main_contact_title)
  THEN
    -- Update the existing primary seller contact if one exists
    UPDATE public.contacts
    SET
      first_name = COALESCE(
        NULLIF(TRIM(split_part(NEW.main_contact_name, ' ', 1)), ''),
        NEW.main_contact_name, first_name),
      last_name = CASE
        WHEN position(' ' IN COALESCE(NEW.main_contact_name, '')) > 0
        THEN TRIM(substring(NEW.main_contact_name FROM position(' ' IN NEW.main_contact_name) + 1))
        ELSE last_name END,
      email = COALESCE(NULLIF(TRIM(lower(NEW.main_contact_email)), ''), email),
      phone = COALESCE(NULLIF(TRIM(NEW.main_contact_phone), ''), phone),
      title = COALESCE(NULLIF(TRIM(NEW.main_contact_title), ''), title),
      updated_at = now()
    WHERE listing_id = NEW.id
      AND is_primary_seller_contact = true
      AND contact_type = 'seller';

    -- If no primary seller contact exists, create one
    IF NOT FOUND AND NEW.main_contact_name IS NOT NULL AND TRIM(NEW.main_contact_name) != '' THEN
      v_first_name := COALESCE(
        NULLIF(TRIM(split_part(NEW.main_contact_name, ' ', 1)), ''),
        NEW.main_contact_name);
      v_last_name := CASE
        WHEN position(' ' IN NEW.main_contact_name) > 0
        THEN TRIM(substring(NEW.main_contact_name FROM position(' ' IN NEW.main_contact_name) + 1))
        ELSE '' END;
      v_email := NULLIF(TRIM(lower(NEW.main_contact_email)), '');

      IF v_email IS NOT NULL THEN
        -- Has email → deduplicate by (email, listing_id)
        INSERT INTO public.contacts
          (first_name, last_name, email, phone, title,
           contact_type, listing_id, is_primary_seller_contact, source)
        VALUES (
          v_first_name, v_last_name, v_email,
          NULLIF(TRIM(NEW.main_contact_phone), ''),
          NULLIF(TRIM(NEW.main_contact_title), ''),
          'seller', NEW.id, true, 'listing_sync')
        ON CONFLICT (lower(email), listing_id)
          WHERE contact_type = 'seller' AND email IS NOT NULL AND archived = false
          DO NOTHING;
      ELSE
        -- No email → deduplicate by (name, listing_id)
        INSERT INTO public.contacts
          (first_name, last_name, email, phone, title,
           contact_type, listing_id, is_primary_seller_contact, source)
        VALUES (
          v_first_name, v_last_name, NULL,
          NULLIF(TRIM(NEW.main_contact_phone), ''),
          NULLIF(TRIM(NEW.main_contact_title), ''),
          'seller', NEW.id, true, 'listing_sync')
        ON CONFLICT (lower(trim(first_name)), lower(trim(last_name)), listing_id)
          WHERE contact_type = 'seller' AND email IS NULL AND archived = false
          DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-create trigger
DROP TRIGGER IF EXISTS trg_sync_listing_to_contacts ON public.listings;
CREATE TRIGGER trg_sync_listing_to_contacts
  AFTER UPDATE ON public.listings
  FOR EACH ROW
  WHEN (
    OLD.main_contact_name IS DISTINCT FROM NEW.main_contact_name
    OR OLD.main_contact_email IS DISTINCT FROM NEW.main_contact_email
    OR OLD.main_contact_phone IS DISTINCT FROM NEW.main_contact_phone
    OR OLD.main_contact_title IS DISTINCT FROM NEW.main_contact_title
  )
  EXECUTE FUNCTION public.sync_listing_contact_to_contacts();


-- ============================================================================
-- STEP 8: Clean up temp table
-- ============================================================================

DROP TABLE IF EXISTS contact_dedup_map;


-- ============================================================================
-- Summary
-- ============================================================================
-- Data cleanup:
--   - Duplicate contacts identified by (name, type, listing_id, remarketing_buyer_id)
--   - Non-null fields merged from duplicates into keeper records
--   - FK references re-pointed across 12 tables
--   - Duplicates archived (not deleted)
--
-- Prevention (3 new unique indexes):
--   - idx_contacts_seller_name_listing_unique: (name, listing_id) for sellers w/o email
--   - idx_contacts_buyer_name_rmkt_unique: (name, remarketing_buyer_id) for buyers w/o email
--   - idx_contacts_buyer_name_only_unique: (name) for buyers w/o email or buyer org
--
-- Updated triggers:
--   - mirror_rbc_to_contacts: now handles null-email via name-based ON CONFLICT
--   - sync_listing_contact_to_contacts: now handles null-email via name-based ON CONFLICT
-- ============================================================================
