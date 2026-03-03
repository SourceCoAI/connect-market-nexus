-- Migration: Unified Buyer Classification Taxonomy
--
-- Implements the canonical 6-value buyer_type enum per the Buyer Classification
-- & Entity Architecture spec. Adds classification metadata columns, normalizes
-- legacy values, links platform companies to PE firms via FK, and enforces the
-- enum with a CHECK constraint.
--
-- Safe execution order:
--   1. Add new columns (additive, non-destructive)
--   2. Normalize existing buyer_type values
--   3. Backfill pe_firm_id from pe_firm_name text
--   4. Update CHECK constraint

-- ============================================================================
-- STEP 1: Add classification metadata fields
-- ============================================================================

ALTER TABLE public.remarketing_buyers
  ADD COLUMN IF NOT EXISTS buyer_type_confidence       INTEGER CHECK (buyer_type_confidence BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS buyer_type_reasoning        TEXT,
  ADD COLUMN IF NOT EXISTS buyer_type_source           TEXT CHECK (buyer_type_source IN ('ai_auto','admin_manual','import','signup')),
  ADD COLUMN IF NOT EXISTS buyer_type_needs_review     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyer_type_classified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_type_ai_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS is_pe_backed                BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pe_firm_id                  UUID REFERENCES public.remarketing_buyers(id) ON DELETE SET NULL;

-- Indexes for admin review queue and PE firm lookups
CREATE INDEX IF NOT EXISTS idx_buyers_needs_review
  ON public.remarketing_buyers(buyer_type_needs_review) WHERE buyer_type_needs_review = true;

CREATE INDEX IF NOT EXISTS idx_buyers_pe_firm_id
  ON public.remarketing_buyers(pe_firm_id) WHERE pe_firm_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_buyers_buyer_type
  ON public.remarketing_buyers(buyer_type);

-- ============================================================================
-- STEP 2: Normalize existing buyer_type values to canonical enum
-- ============================================================================

-- Drop the old CHECK constraint so we can write new values
ALTER TABLE public.remarketing_buyers
  DROP CONSTRAINT IF EXISTS remarketing_buyers_buyer_type_check;

-- Private equity normalization
UPDATE public.remarketing_buyers
SET buyer_type = 'private_equity'
WHERE LOWER(TRIM(buyer_type)) IN ('pe_firm', 'pe firm', 'pe', 'private equity', 'private equity firm');

-- Corporate / strategic normalization
UPDATE public.remarketing_buyers
SET buyer_type = 'corporate'
WHERE LOWER(TRIM(buyer_type)) IN ('strategic', 'operating company', 'company', 'corp', 'corporate');

-- Family office normalization
UPDATE public.remarketing_buyers
SET buyer_type = 'family_office'
WHERE LOWER(TRIM(buyer_type)) IN ('fo');

-- Search fund normalization
UPDATE public.remarketing_buyers
SET buyer_type = 'search_fund'
WHERE LOWER(TRIM(buyer_type)) IN ('searcher', 'eta');

-- Independent sponsor normalization
UPDATE public.remarketing_buyers
SET buyer_type = 'independent_sponsor'
WHERE LOWER(TRIM(buyer_type)) IN ('fundless sponsor', 'ind sponsor');

-- Individual buyer normalization
UPDATE public.remarketing_buyers
SET buyer_type = 'individual_buyer'
WHERE LOWER(TRIM(buyer_type)) IN ('individual', 'individual buyer', 'private buyer', 'wealth buyer', 'personal acquisition');

-- Platform -> corporate + PE-backed
UPDATE public.remarketing_buyers
SET buyer_type = 'corporate',
    is_pe_backed = true
WHERE LOWER(TRIM(buyer_type)) = 'platform';

-- "other" and any remaining non-canonical values -> flag for review
UPDATE public.remarketing_buyers
SET buyer_type_needs_review = true
WHERE buyer_type NOT IN ('private_equity', 'corporate', 'family_office', 'search_fund', 'independent_sponsor', 'individual_buyer')
  AND buyer_type IS NOT NULL;

-- Set "other" to NULL so it can pass the new constraint
UPDATE public.remarketing_buyers
SET buyer_type = NULL,
    buyer_type_needs_review = true
WHERE LOWER(TRIM(buyer_type)) = 'other';

-- ============================================================================
-- STEP 3: Backfill pe_firm_id from pe_firm_name text matching
-- ============================================================================

UPDATE public.remarketing_buyers AS platform_co
SET pe_firm_id = pe_firm.id
FROM public.remarketing_buyers pe_firm
WHERE LOWER(TRIM(platform_co.pe_firm_name)) = LOWER(TRIM(pe_firm.company_name))
  AND platform_co.is_pe_backed = true
  AND platform_co.pe_firm_id IS NULL
  AND pe_firm.buyer_type = 'private_equity';

-- ============================================================================
-- STEP 4: Add CHECK constraint for canonical buyer types
-- ============================================================================

-- Null out any remaining invalid values before adding constraint
UPDATE public.remarketing_buyers
SET buyer_type = NULL,
    buyer_type_needs_review = true
WHERE buyer_type IS NOT NULL
  AND buyer_type NOT IN ('private_equity', 'corporate', 'family_office', 'search_fund', 'independent_sponsor', 'individual_buyer');

ALTER TABLE public.remarketing_buyers
  ADD CONSTRAINT remarketing_buyers_buyer_type_check
  CHECK (
    buyer_type IN ('private_equity', 'corporate', 'family_office', 'search_fund', 'independent_sponsor', 'individual_buyer')
    OR buyer_type IS NULL
  );

-- ============================================================================
-- STEP 5: Update buyer_type_profiles table if it exists
-- ============================================================================

ALTER TABLE IF EXISTS public.buyer_type_profiles
  DROP CONSTRAINT IF EXISTS buyer_type_profiles_buyer_type_check;

UPDATE public.buyer_type_profiles
SET buyer_type = 'private_equity'
WHERE LOWER(TRIM(buyer_type)) IN ('pe_firm', 'pe firm', 'pe', 'private equity');

UPDATE public.buyer_type_profiles
SET buyer_type = 'corporate'
WHERE LOWER(TRIM(buyer_type)) IN ('strategic', 'platform', 'corporate');

UPDATE public.buyer_type_profiles
SET buyer_type = NULL
WHERE buyer_type NOT IN ('private_equity', 'corporate', 'family_office', 'search_fund', 'independent_sponsor', 'individual_buyer')
  AND buyer_type IS NOT NULL;

ALTER TABLE IF EXISTS public.buyer_type_profiles
  ADD CONSTRAINT buyer_type_profiles_buyer_type_check
  CHECK (
    buyer_type IN ('private_equity', 'corporate', 'family_office', 'search_fund', 'independent_sponsor', 'individual_buyer')
    OR buyer_type IS NULL
  );
