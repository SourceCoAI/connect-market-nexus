-- Add structured contact fields to listings table
-- Replaces the freeform internal_contact_info textarea with
-- separate first name, last name, email, phone, and LinkedIn fields
-- that map directly to the deal's main contact data.

ALTER TABLE listings
ADD COLUMN IF NOT EXISTS main_contact_first_name TEXT,
ADD COLUMN IF NOT EXISTS main_contact_last_name TEXT,
ADD COLUMN IF NOT EXISTS main_contact_linkedin TEXT;

-- Backfill: split existing main_contact_name into first/last
UPDATE listings
SET
  main_contact_first_name = split_part(main_contact_name, ' ', 1),
  main_contact_last_name = CASE
    WHEN position(' ' in coalesce(main_contact_name, '')) > 0
    THEN substring(main_contact_name from position(' ' in main_contact_name) + 1)
    ELSE NULL
  END
WHERE main_contact_name IS NOT NULL
  AND main_contact_first_name IS NULL;

COMMENT ON COLUMN listings.main_contact_first_name IS
'Primary seller contact first name — synced from deal contact';

COMMENT ON COLUMN listings.main_contact_last_name IS
'Primary seller contact last name — synced from deal contact';

COMMENT ON COLUMN listings.main_contact_linkedin IS
'Primary seller contact LinkedIn profile URL — synced from deal contact';
