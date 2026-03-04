-- ============================================================================
-- CLEANUP: Drop unused columns + fix stale CHECK constraints
-- ============================================================================

-- confidence_level: Added in migration 20260122202458 but never read or written
-- by any edge function, frontend component, or type definition. Zero references.
ALTER TABLE public.buyers
  DROP COLUMN IF EXISTS confidence_level;

-- buyer_type_profiles: CHECK constraint was created in 20260226000000 with the old
-- 7-value enum (pe_firm, platform, strategic, family_office, independent_sponsor,
-- search_fund, other). Migration 20260511000000 updated the buyers table constraint
-- to canonical types but missed this table. Fix to match canonical 6-type enum.
ALTER TABLE public.buyer_type_profiles
  DROP CONSTRAINT IF EXISTS buyer_type_profiles_buyer_type_check;

-- Normalize any existing legacy values before adding new constraint
UPDATE public.buyer_type_profiles
SET buyer_type = 'private_equity'
WHERE buyer_type = 'pe_firm';

UPDATE public.buyer_type_profiles
SET buyer_type = 'corporate'
WHERE buyer_type IN ('platform', 'strategic', 'other');

ALTER TABLE public.buyer_type_profiles
  ADD CONSTRAINT buyer_type_profiles_buyer_type_check
  CHECK (buyer_type IN (
    'private_equity', 'corporate', 'family_office',
    'search_fund', 'independent_sponsor', 'individual_buyer'
  ) OR buyer_type IS NULL);
