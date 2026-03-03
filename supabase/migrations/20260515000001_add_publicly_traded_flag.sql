-- Migration: Add 'is_publicly_traded' flag to buyers and listings
-- Tracks whether a buyer/company is publicly traded.
-- Note: 'remarketing_buyers' is now a view over the 'buyers' table
-- (renamed in 20260514000000). We must ALTER the real table, then
-- recreate the view to pick up the new column.

-- 1. Add column to the real 'buyers' table
ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS is_publicly_traded boolean DEFAULT false;

-- 2. Recreate the backward-compatible view so it includes the new column
DROP VIEW IF EXISTS remarketing_buyers;
CREATE VIEW remarketing_buyers AS SELECT * FROM buyers;

-- 3. Add to listings (master deals data)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS is_publicly_traded boolean DEFAULT false;

-- 4. Add index for filtering publicly traded buyers
CREATE INDEX IF NOT EXISTS idx_buyers_publicly_traded
  ON buyers (is_publicly_traded)
  WHERE is_publicly_traded = true AND archived = false;
