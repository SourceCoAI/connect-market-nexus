-- Phase 8: Unmatched activity recovery + lazy re-matching
-- Adds matching_status column to contact_activities, backfills orphans,
-- creates an index for quick filtering, and adds a trigger for lazy re-matching.

-- 1. Add matching_status column
ALTER TABLE contact_activities
  ADD COLUMN IF NOT EXISTS matching_status text DEFAULT 'matched'
  CHECK (matching_status IN ('matched', 'unmatched', 'manually_linked'));

-- 2. Backfill orphans (activities with no listing, buyer, or contact link)
UPDATE contact_activities SET matching_status = 'unmatched'
WHERE listing_id IS NULL AND remarketing_buyer_id IS NULL
  AND contact_id IS NULL AND activity_type IN ('call_completed', 'callback_scheduled', 'call_attempt');

-- 3. Index for fast lookups of unmatched activities
CREATE INDEX IF NOT EXISTS idx_ca_unmatched ON contact_activities(matching_status, created_at DESC)
  WHERE matching_status = 'unmatched';

-- 4. Lazy re-matching trigger: when a new contact is created with a listing_id,
--    check if any unmatched activities match by email and link them.
CREATE OR REPLACE FUNCTION attempt_lazy_rematch() RETURNS trigger AS $$
BEGIN
  -- Match by email
  IF NEW.email IS NOT NULL AND NEW.listing_id IS NOT NULL THEN
    UPDATE contact_activities SET
      contact_id = NEW.id,
      listing_id = NEW.listing_id,
      remarketing_buyer_id = NEW.remarketing_buyer_id,
      matching_status = 'matched'
    WHERE matching_status = 'unmatched'
      AND contact_email = NEW.email
      AND contact_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create trigger on contacts table
DROP TRIGGER IF EXISTS trg_lazy_rematch_contacts ON contacts;
CREATE TRIGGER trg_lazy_rematch_contacts
  AFTER INSERT ON contacts FOR EACH ROW
  WHEN (NEW.listing_id IS NOT NULL)
  EXECUTE FUNCTION attempt_lazy_rematch();
