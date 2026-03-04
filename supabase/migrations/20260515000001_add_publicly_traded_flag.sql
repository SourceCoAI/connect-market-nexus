-- Migration: Add 'is_publicly_traded' flag to remarketing_buyers and listings
-- Tracks whether a buyer/company is publicly traded.

-- Add to remarketing_buyers (buyer universe companies)
ALTER TABLE remarketing_buyers
  ADD COLUMN IF NOT EXISTS is_publicly_traded boolean DEFAULT false;

-- Add to listings (master deals data)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS is_publicly_traded boolean DEFAULT false;

-- Add index for filtering publicly traded buyers
CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_publicly_traded
  ON remarketing_buyers (is_publicly_traded)
  WHERE is_publicly_traded = true AND archived = false;
