-- Add missing columns used by seed-buyers audit inserts
ALTER TABLE public.buyer_seed_log
  ADD COLUMN IF NOT EXISTS buyer_profile jsonb,
  ADD COLUMN IF NOT EXISTS verification_status text;

-- Relax website requirement for private equity parent records
ALTER TABLE public.buyers
  DROP CONSTRAINT IF EXISTS buyers_website_required;

ALTER TABLE public.buyers
  ADD CONSTRAINT buyers_website_required
  CHECK (
    archived = true
    OR buyer_type = 'private_equity'
    OR (
      company_website IS NOT NULL
      AND btrim(company_website) <> ''
    )
  );