-- ============================================================================
-- MIGRATION: Add structured phone columns to contacts
-- ============================================================================
-- Part of Item 3 (CSV round-trip): replaces the single `phone` TEXT column
-- with structured phone fields to support multi-phone contacts, PhoneBurner
-- integration, and CSV export/import fidelity.
--
-- The existing `phone` column is preserved and backfilled to `mobile_phone_1`.
-- New columns:
--   mobile_phone_1  — primary mobile (backfilled from existing phone)
--   mobile_phone_2  — secondary mobile
--   mobile_phone_3  — tertiary mobile
--   office_phone    — office/landline
--   phone_source    — where the phone data came from (manual, enrichment, csv, etc.)
-- ============================================================================

-- 1. Add new columns
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS mobile_phone_1 TEXT,
  ADD COLUMN IF NOT EXISTS mobile_phone_2 TEXT,
  ADD COLUMN IF NOT EXISTS mobile_phone_3 TEXT,
  ADD COLUMN IF NOT EXISTS office_phone   TEXT,
  ADD COLUMN IF NOT EXISTS phone_source   TEXT;

COMMENT ON COLUMN public.contacts.mobile_phone_1 IS 'Primary mobile phone number';
COMMENT ON COLUMN public.contacts.mobile_phone_2 IS 'Secondary mobile phone number';
COMMENT ON COLUMN public.contacts.mobile_phone_3 IS 'Tertiary mobile phone number';
COMMENT ON COLUMN public.contacts.office_phone   IS 'Office / landline phone number';
COMMENT ON COLUMN public.contacts.phone_source   IS 'Source of phone data: manual, enrichment, csv_import, phoneburner, etc.';

-- 2. Backfill: copy existing `phone` → `mobile_phone_1` where not already set
UPDATE public.contacts
SET mobile_phone_1 = phone,
    phone_source = 'backfill'
WHERE phone IS NOT NULL
  AND phone <> ''
  AND mobile_phone_1 IS NULL;

-- 3. Create index for phone-based identity resolution on the new column
CREATE INDEX IF NOT EXISTS idx_contacts_mobile_phone_1_firm
  ON public.contacts (lower(mobile_phone_1), firm_id)
  WHERE mobile_phone_1 IS NOT NULL
    AND deleted_at IS NULL
    AND merged_into_id IS NULL;
