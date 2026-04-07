-- Contact Table Consolidation
-- 1. Rename frozen remarketing_buyer_contacts (no code reads it)
-- 2. Add contact_id FK to contact_list_members for unified contacts linkage
-- 3. Backfill contact_id by email match
-- 4. Auto-resolve trigger on insert

-- Step 1: Deprecate the frozen legacy table
ALTER TABLE IF EXISTS remarketing_buyer_contacts
  RENAME TO _deprecated_remarketing_buyer_contacts;

-- Step 2: Add contact_id FK to contact_list_members
ALTER TABLE contact_list_members
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- Step 3: Backfill contact_id by email match
UPDATE contact_list_members clm
SET contact_id = sub.cid
FROM (
  SELECT DISTINCT ON (lower(c.email))
    c.id AS cid, lower(c.email) AS email_lower
  FROM contacts c
  WHERE c.archived = false AND c.email IS NOT NULL
  ORDER BY lower(c.email), c.updated_at DESC
) sub
WHERE lower(clm.contact_email) = sub.email_lower
  AND clm.contact_id IS NULL;

-- Step 4: Index for efficient JOINs
CREATE INDEX IF NOT EXISTS idx_contact_list_members_contact_id
  ON contact_list_members(contact_id)
  WHERE contact_id IS NOT NULL;

-- Step 5: Auto-resolve contact_id on insert
CREATE OR REPLACE FUNCTION resolve_contact_list_member_contact_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contact_id IS NULL AND NEW.contact_email IS NOT NULL THEN
    SELECT c.id INTO NEW.contact_id
    FROM contacts c
    WHERE lower(c.email) = lower(NEW.contact_email)
      AND c.archived = false
    ORDER BY c.updated_at DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resolve_contact_id ON contact_list_members;
CREATE TRIGGER trg_resolve_contact_id
  BEFORE INSERT OR UPDATE OF contact_email
  ON contact_list_members
  FOR EACH ROW
  EXECUTE FUNCTION resolve_contact_list_member_contact_id();
