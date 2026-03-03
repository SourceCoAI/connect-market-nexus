-- Add remarketing_buyer_id column to buyer_introductions so we can track
-- which remarketing_buyers row an introduction originated from, WITHOUT
-- mis-using contact_id (which has FK to contacts).
--
-- Previously the Accept flow was storing remarketing_buyers.id into
-- contact_id, violating the contacts FK constraint.

ALTER TABLE buyer_introductions
  ADD COLUMN IF NOT EXISTS remarketing_buyer_id uuid;

-- Index for the dedup check (hide already-accepted buyers from recommendations)
CREATE INDEX IF NOT EXISTS idx_buyer_introductions_remarketing_buyer
  ON buyer_introductions (remarketing_buyer_id)
  WHERE remarketing_buyer_id IS NOT NULL;

-- Back-fill: move any contact_id values that reference remarketing_buyers
-- (and NOT contacts) into the new column, then clear contact_id.
UPDATE buyer_introductions bi
SET remarketing_buyer_id = bi.contact_id,
    contact_id = NULL
WHERE bi.contact_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM remarketing_buyers rb WHERE rb.id = bi.contact_id)
  AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = bi.contact_id);
