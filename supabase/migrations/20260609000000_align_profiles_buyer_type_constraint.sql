-- Align profiles.buyer_type CHECK constraint with canonical buyer type enum.
--
-- The old constraint (chk_profiles_buyer_type_valid) only allowed 4 values:
--   ('individual', 'corporate', 'fund', 'family_office')
-- which is incompatible with the canonical 6-value enum established in
-- migration 20260511000000_buyer_classification_taxonomy.
--
-- The signup flow stores camelCase values (privateEquity, familyOffice, etc.)
-- while the canonical enum uses snake_case. This migration accepts BOTH
-- formats so existing data stays valid while new signups can use either.
--
-- NOTE: profiles.buyer_type is deprecated per 20260516200000 — the
-- authoritative buyer_type lives on remarketing_buyers. This constraint
-- update prevents insert failures for new buyer types in the interim.

-- Drop the outdated constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_buyer_type_valid;

-- Add an expanded constraint that accepts both legacy camelCase (signup)
-- and canonical snake_case values
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_buyer_type_valid CHECK (
    buyer_type IS NULL
    OR buyer_type IN (
      -- Canonical snake_case (matches remarketing_buyers)
      'private_equity', 'corporate', 'family_office',
      'search_fund', 'independent_sponsor', 'individual_buyer',
      -- Legacy camelCase (marketplace signup form)
      'privateEquity', 'familyOffice', 'searchFund',
      'individual', 'independentSponsor', 'advisor', 'businessOwner',
      -- Historical value from early migration
      'fund'
    )
  );
