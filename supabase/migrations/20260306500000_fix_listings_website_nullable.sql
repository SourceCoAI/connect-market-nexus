-- Fix: Make listings.website nullable
-- The website column was NOT NULL, causing valuation lead deal creation to fail
-- when a lead has no website or non-generic email domain.
-- Many internal deals (valuation calculator leads) legitimately have no website.

ALTER TABLE listings ALTER COLUMN website DROP NOT NULL;
ALTER TABLE listings ALTER COLUMN website SET DEFAULT '';

-- Backfill: update any existing empty-string websites to NULL for cleanliness
UPDATE listings SET website = NULL WHERE website = '';
