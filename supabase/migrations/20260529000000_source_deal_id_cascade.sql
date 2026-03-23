-- Fix source_deal_id FK to cascade SET NULL on delete.
-- Prevents dangling references when a source deal is removed.
DO $$
BEGIN
  -- Drop existing constraint if it exists (name may vary)
  ALTER TABLE public.listings
    DROP CONSTRAINT IF EXISTS listings_source_deal_id_fkey;
EXCEPTION WHEN undefined_object THEN
  NULL; -- Constraint didn't exist, that's fine
END $$;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_source_deal_id_fkey
  FOREIGN KEY (source_deal_id) REFERENCES public.listings(id) ON DELETE SET NULL;
