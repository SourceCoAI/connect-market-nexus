-- Add deal_sources text[] column so a single listing can belong to
-- multiple lead-source pipelines (e.g. both SourceCo and CapTarget).
-- The existing deal_source column is kept for backward compatibility
-- and updated via trigger to stay in sync.

-- 1. Add the new column
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS deal_sources text[] DEFAULT '{}';

-- 2. Backfill from existing deal_source
UPDATE public.listings
SET deal_sources = ARRAY[deal_source]
WHERE deal_source IS NOT NULL
  AND (deal_sources IS NULL OR deal_sources = '{}');

-- 3. GIN index for @> (contains) queries
CREATE INDEX IF NOT EXISTS idx_listings_deal_sources
  ON public.listings USING gin (deal_sources);

-- 4. Keep deal_source in sync: whenever deal_sources changes,
--    set deal_source to the first element (for backward compat).
CREATE OR REPLACE FUNCTION public.sync_deal_source_from_sources()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.deal_sources IS NOT NULL AND array_length(NEW.deal_sources, 1) > 0 THEN
    NEW.deal_source := NEW.deal_sources[1];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deal_source ON public.listings;
CREATE TRIGGER trg_sync_deal_source
  BEFORE INSERT OR UPDATE OF deal_sources ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_deal_source_from_sources();
