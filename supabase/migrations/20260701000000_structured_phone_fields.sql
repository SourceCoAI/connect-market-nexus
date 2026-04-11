-- ============================================================================
-- MIGRATION: Add structured phone fields to contacts table
-- ============================================================================
-- Adds mobile_phone_1/2/3, office_phone, and phone_source columns to the
-- contacts table to support:
--   - Phone type distinction (mobile vs. office)
--   - Multiple phone numbers per contact (up to 3 mobile + 1 office)
--   - Source tracking for phone data provenance
--
-- The existing `phone` column is preserved for backward compatibility.
-- A trigger keeps `phone` in sync as a computed fallback from the structured
-- fields (first non-null of mobile_phone_1 → 2 → 3 → office_phone).
--
-- Backfill: copies existing phone values to mobile_phone_1 with
-- phone_source = 'backfill'.
-- ============================================================================

-- 1. Add new columns
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS mobile_phone_1 TEXT,
  ADD COLUMN IF NOT EXISTS mobile_phone_2 TEXT,
  ADD COLUMN IF NOT EXISTS mobile_phone_3 TEXT,
  ADD COLUMN IF NOT EXISTS office_phone TEXT,
  ADD COLUMN IF NOT EXISTS phone_source TEXT;

-- 2. Backfill existing phone → mobile_phone_1
UPDATE public.contacts
SET
  mobile_phone_1 = phone,
  phone_source = 'backfill'
WHERE phone IS NOT NULL
  AND phone <> ''
  AND mobile_phone_1 IS NULL;

-- 3. Index for "needs mobile phone" filter — fast lookup for contacts
--    that still need phone enrichment
CREATE INDEX IF NOT EXISTS idx_contacts_needs_mobile
  ON public.contacts(contact_type)
  WHERE mobile_phone_1 IS NULL
    AND deleted_at IS NULL
    AND merged_into_id IS NULL;

-- 4. Trigger to keep legacy `phone` column in sync
--    Sets phone = COALESCE(mobile_phone_1, mobile_phone_2, mobile_phone_3, office_phone)
--    on every INSERT or UPDATE so existing code that reads `phone` continues working.
CREATE OR REPLACE FUNCTION public.sync_phone_from_structured()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone := COALESCE(
    NULLIF(NEW.mobile_phone_1, ''),
    NULLIF(NEW.mobile_phone_2, ''),
    NULLIF(NEW.mobile_phone_3, ''),
    NULLIF(NEW.office_phone, ''),
    NEW.phone  -- preserve existing phone if no structured fields set
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_phone_from_structured ON public.contacts;
CREATE TRIGGER trg_sync_phone_from_structured
  BEFORE INSERT OR UPDATE OF mobile_phone_1, mobile_phone_2, mobile_phone_3, office_phone
  ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_phone_from_structured();

-- 5. Column comments
COMMENT ON COLUMN public.contacts.mobile_phone_1 IS
  'Primary mobile/cell number. Preferred dial number for PhoneBurner.';
COMMENT ON COLUMN public.contacts.mobile_phone_2 IS
  'Secondary mobile number.';
COMMENT ON COLUMN public.contacts.mobile_phone_3 IS
  'Tertiary mobile number.';
COMMENT ON COLUMN public.contacts.office_phone IS
  'Office/main line/switchboard. Usually not dialable for direct outreach.';
COMMENT ON COLUMN public.contacts.phone_source IS
  'Origin of the phone data: blitz, clay, prospeo, apollo_import, manual, backfill, etc.';
