-- Add deal_sources array column to support deals appearing in multiple pipelines.
-- Keeps existing deal_source column for backward compatibility with edge functions.

ALTER TABLE listings ADD COLUMN IF NOT EXISTS deal_sources text[] DEFAULT '{}';

-- Backfill from existing deal_source values
UPDATE listings
SET deal_sources = ARRAY[deal_source]
WHERE deal_source IS NOT NULL
  AND deal_source <> ''
  AND (deal_sources IS NULL OR deal_sources = '{}');

-- GIN index for fast @> (contains) queries
CREATE INDEX IF NOT EXISTS idx_listings_deal_sources ON listings USING GIN (deal_sources);
