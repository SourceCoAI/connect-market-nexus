-- ============================================================================
-- BUYER CLASSIFICATION TAXONOMY
--
-- Unifies buyer_type across three systems (marketplace, remarketing, universe)
-- to a single canonical 6-value enum with classification metadata.
--
-- Phase 1: Add classification metadata columns
-- Phase 2: Normalize existing buyer_type values to canonical enum
-- Phase 3: Backfill pe_firm_id from pe_firm_name text
-- Phase 4: Fix sync trigger to use canonical values
-- Phase 5: Add CHECK constraint (only after normalization verified)
--
-- SAFETY: All changes are additive until Phase 5. Non-destructive.
-- ============================================================================


-- ============================================================================
-- PHASE 1: ADD CLASSIFICATION METADATA FIELDS
-- ============================================================================

ALTER TABLE public.remarketing_buyers
  ADD COLUMN IF NOT EXISTS buyer_type_confidence INTEGER
    CHECK (buyer_type_confidence BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS buyer_type_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS buyer_type_source TEXT
    CHECK (buyer_type_source IN ('ai_auto', 'admin_manual', 'import', 'signup')),
  ADD COLUMN IF NOT EXISTS buyer_type_needs_review BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyer_type_classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_type_ai_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS is_pe_backed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pe_firm_id UUID REFERENCES public.remarketing_buyers(id)
    ON DELETE SET NULL;

-- Index for admin review queue
CREATE INDEX IF NOT EXISTS idx_buyers_needs_review
  ON public.remarketing_buyers(buyer_type_needs_review)
  WHERE buyer_type_needs_review = true;

-- Index for PE firm → platform company lookups
CREATE INDEX IF NOT EXISTS idx_buyers_pe_firm_id
  ON public.remarketing_buyers(pe_firm_id)
  WHERE pe_firm_id IS NOT NULL;


-- ============================================================================
-- PHASE 2: NORMALIZE EXISTING buyer_type VALUES TO CANONICAL ENUM
-- ============================================================================

-- pe_firm variants → private_equity
UPDATE public.remarketing_buyers
SET buyer_type = 'private_equity'
WHERE LOWER(buyer_type) IN (
  'pe_firm', 'pe firm', 'pe', 'private equity', 'private equity firm'
);

-- strategic / operating company → corporate
UPDATE public.remarketing_buyers
SET buyer_type = 'corporate'
WHERE LOWER(buyer_type) IN (
  'strategic', 'operating company', 'company', 'corp', 'corporate'
);

-- family_office variants (already canonical, but handle edge cases)
UPDATE public.remarketing_buyers
SET buyer_type = 'family_office'
WHERE LOWER(buyer_type) IN ('fo', 'family office')
  AND buyer_type != 'family_office';

-- search_fund variants
UPDATE public.remarketing_buyers
SET buyer_type = 'search_fund'
WHERE LOWER(buyer_type) IN ('search fund', 'searcher', 'eta')
  AND buyer_type != 'search_fund';

-- independent_sponsor variants
UPDATE public.remarketing_buyers
SET buyer_type = 'independent_sponsor'
WHERE LOWER(buyer_type) IN ('independent sponsor', 'fundless sponsor', 'ind sponsor')
  AND buyer_type != 'independent_sponsor';

-- individual_buyer variants
UPDATE public.remarketing_buyers
SET buyer_type = 'individual_buyer'
WHERE LOWER(buyer_type) IN (
  'individual', 'individual buyer', 'private buyer',
  'wealth buyer', 'personal acquisition'
);

-- Handle "platform" → corporate + PE-backed
UPDATE public.remarketing_buyers
SET buyer_type = 'corporate',
    is_pe_backed = true
WHERE LOWER(buyer_type) = 'platform';

-- Handle "other" → flag for review instead of guessing
UPDATE public.remarketing_buyers
SET buyer_type_needs_review = true
WHERE buyer_type = 'other' OR buyer_type IS NULL;

-- Set "other" to NULL so it doesn't violate the CHECK constraint later
UPDATE public.remarketing_buyers
SET buyer_type = NULL
WHERE buyer_type = 'other';


-- ============================================================================
-- PHASE 3: BACKFILL pe_firm_id FROM pe_firm_name TEXT
-- ============================================================================

-- Link platform companies to their PE firm records via pe_firm_id FK
UPDATE public.remarketing_buyers AS platform_co
SET pe_firm_id = pe_firm.id
FROM public.remarketing_buyers pe_firm
WHERE LOWER(TRIM(platform_co.pe_firm_name)) = LOWER(TRIM(pe_firm.company_name))
  AND platform_co.is_pe_backed = true
  AND platform_co.pe_firm_id IS NULL
  AND pe_firm.buyer_type = 'private_equity';

-- Also set is_pe_backed for any buyer that has a pe_firm_name but wasn't platform
UPDATE public.remarketing_buyers
SET is_pe_backed = true
WHERE pe_firm_name IS NOT NULL
  AND pe_firm_name != ''
  AND is_pe_backed = false
  AND buyer_type != 'private_equity';


-- ============================================================================
-- PHASE 4: FIX SYNC TRIGGER TO USE CANONICAL VALUES
-- ============================================================================
-- The old trigger mapped marketplace camelCase to legacy remarketing values.
-- This replacement maps to canonical values and sets is_pe_backed properly.

CREATE OR REPLACE FUNCTION public.sync_marketplace_buyer_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_name TEXT;
  v_buyer_type TEXT;
  v_thesis TEXT;
  v_industries TEXT[];
  v_geographies TEXT[];
  v_website TEXT;
  v_linkedin TEXT;
  v_rev_min NUMERIC;
  v_rev_max NUMERIC;
  v_email_domain TEXT;
  v_existing_id UUID;
BEGIN
  -- Only fire when approval_status changes to 'approved'
  IF NEW.approval_status = 'approved' AND
     (OLD.approval_status IS DISTINCT FROM 'approved') THEN

    -- Extract company name (try company_name first, then company)
    v_company_name := COALESCE(NULLIF(TRIM(NEW.company_name), ''), NULLIF(TRIM(NEW.company), ''));
    IF v_company_name IS NULL OR v_company_name = '' THEN
      RAISE NOTICE 'Skipping buyer sync for profile % — no company name', NEW.id;
      RETURN NEW;
    END IF;

    -- Map marketplace buyer_type (camelCase) to canonical remarketing values
    v_buyer_type := CASE
      WHEN NEW.buyer_type ILIKE '%privateequity%'
        OR NEW.buyer_type ILIKE '%private equity%'
        OR NEW.buyer_type ILIKE 'pe%'
        THEN 'private_equity'
      WHEN NEW.buyer_type ILIKE '%corporate%'
        OR NEW.buyer_type ILIKE '%strategic%'
        OR NEW.buyer_type ILIKE '%businessowner%'
        OR NEW.buyer_type ILIKE '%business owner%'
        OR NEW.buyer_type ILIKE '%advisor%'
        THEN 'corporate'
      WHEN NEW.buyer_type ILIKE '%familyoffice%'
        OR NEW.buyer_type ILIKE '%family office%'
        OR NEW.buyer_type ILIKE '%family%office%'
        THEN 'family_office'
      WHEN NEW.buyer_type ILIKE '%searchfund%'
        OR NEW.buyer_type ILIKE '%search fund%'
        OR NEW.buyer_type ILIKE '%search%fund%'
        THEN 'search_fund'
      WHEN NEW.buyer_type ILIKE '%independentsponsor%'
        OR NEW.buyer_type ILIKE '%independent sponsor%'
        OR NEW.buyer_type ILIKE '%independent%sponsor%'
        THEN 'independent_sponsor'
      WHEN NEW.buyer_type ILIKE '%individual%'
        THEN 'individual_buyer'
      ELSE NULL  -- Unknown type → NULL, flagged for review
    END;

    -- Thesis from ideal_target_description or mandate_blurb
    v_thesis := COALESCE(
      NULLIF(TRIM(NEW.ideal_target_description), ''),
      NULLIF(TRIM(NEW.mandate_blurb), ''),
      NULLIF(TRIM(NEW.bio), '')
    );

    -- Extract industries from business_categories JSON
    IF NEW.business_categories IS NOT NULL AND NEW.business_categories::text != 'null' THEN
      IF jsonb_typeof(NEW.business_categories::jsonb) = 'array' THEN
        SELECT ARRAY(
          SELECT jsonb_array_elements_text(NEW.business_categories::jsonb)
        ) INTO v_industries;
      ELSE
        v_industries := ARRAY[NEW.business_categories::jsonb #>> '{}'];
      END IF;
    END IF;

    -- Extract geographies from target_locations JSON
    IF NEW.target_locations IS NOT NULL AND NEW.target_locations::text != 'null' THEN
      IF jsonb_typeof(NEW.target_locations::jsonb) = 'array' THEN
        SELECT ARRAY(
          SELECT jsonb_array_elements_text(NEW.target_locations::jsonb)
        ) INTO v_geographies;
      ELSE
        v_geographies := ARRAY[NEW.target_locations::jsonb #>> '{}'];
      END IF;
    END IF;

    v_website := NULLIF(TRIM(NEW.website), '');
    v_linkedin := NULLIF(TRIM(NEW.linkedin_profile), '');
    v_rev_min := NEW.target_deal_size_min;
    v_rev_max := NEW.target_deal_size_max;

    IF NEW.email IS NOT NULL AND NEW.email LIKE '%@%' THEN
      v_email_domain := lower(split_part(NEW.email, '@', 2));
    END IF;

    -- Check for existing buyer by website domain or company name
    IF v_website IS NOT NULL THEN
      SELECT id INTO v_existing_id
      FROM public.remarketing_buyers
      WHERE archived = false
        AND company_website IS NOT NULL
        AND extract_domain(company_website) = extract_domain(v_website)
      LIMIT 1;
    END IF;

    IF v_existing_id IS NULL THEN
      SELECT id INTO v_existing_id
      FROM public.remarketing_buyers
      WHERE archived = false
        AND lower(trim(company_name)) = lower(trim(v_company_name))
      LIMIT 1;
    END IF;

    IF v_existing_id IS NOT NULL THEN
      -- UPDATE existing buyer — only fill empty fields (priority 80 < transcript 100)
      UPDATE public.remarketing_buyers
      SET
        buyer_type = COALESCE(buyer_type, v_buyer_type),
        buyer_type_source = COALESCE(buyer_type_source, 'signup'),
        buyer_type_needs_review = CASE
          WHEN buyer_type IS NULL AND v_buyer_type IS NULL THEN true
          ELSE buyer_type_needs_review
        END,
        thesis_summary = COALESCE(thesis_summary, v_thesis),
        target_industries = CASE WHEN target_industries IS NULL OR array_length(target_industries, 1) IS NULL
                            THEN v_industries ELSE target_industries END,
        target_geographies = CASE WHEN target_geographies IS NULL OR array_length(target_geographies, 1) IS NULL
                             THEN v_geographies ELSE target_geographies END,
        company_website = COALESCE(company_website, v_website),
        buyer_linkedin = COALESCE(buyer_linkedin, v_linkedin),
        target_revenue_min = COALESCE(target_revenue_min, v_rev_min),
        target_revenue_max = COALESCE(target_revenue_max, v_rev_max),
        email_domain = COALESCE(email_domain, v_email_domain),
        extraction_sources = COALESCE(extraction_sources, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'type', 'marketplace_profile',
          'profile_id', NEW.id,
          'priority', 80,
          'extracted_at', now()::text,
          'fields_extracted', jsonb_build_array(
            'buyer_type', 'thesis_summary', 'target_industries',
            'target_geographies', 'company_website', 'buyer_linkedin'
          )
        )),
        data_last_updated = now(),
        updated_at = now()
      WHERE id = v_existing_id;

      RAISE NOTICE 'Updated existing remarketing_buyer % from marketplace profile %', v_existing_id, NEW.id;
    ELSE
      -- INSERT new buyer
      INSERT INTO public.remarketing_buyers (
        company_name,
        buyer_type,
        buyer_type_source,
        buyer_type_needs_review,
        thesis_summary,
        target_industries,
        target_geographies,
        company_website,
        buyer_linkedin,
        target_revenue_min,
        target_revenue_max,
        email_domain,
        data_completeness,
        extraction_sources,
        data_last_updated
      ) VALUES (
        v_company_name,
        v_buyer_type,
        CASE WHEN v_buyer_type IS NOT NULL THEN 'signup' ELSE NULL END,
        CASE WHEN v_buyer_type IS NULL THEN true ELSE false END,
        v_thesis,
        v_industries,
        v_geographies,
        v_website,
        v_linkedin,
        v_rev_min,
        v_rev_max,
        v_email_domain,
        'low',
        jsonb_build_array(jsonb_build_object(
          'type', 'marketplace_profile',
          'profile_id', NEW.id,
          'priority', 80,
          'extracted_at', now()::text,
          'fields_extracted', jsonb_build_array(
            'company_name', 'buyer_type', 'thesis_summary', 'target_industries',
            'target_geographies', 'company_website', 'buyer_linkedin'
          )
        )),
        now()
      );

      RAISE NOTICE 'Created new remarketing_buyer from marketplace profile %', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_sync_marketplace_buyer_on_approval ON public.profiles;
CREATE TRIGGER trg_sync_marketplace_buyer_on_approval
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_marketplace_buyer_on_approval();


-- ============================================================================
-- PHASE 5: DROP OLD CHECK CONSTRAINT AND ADD NEW ONE
-- ============================================================================
-- The old CHECK was: buyer_type IN ('pe_firm','platform','strategic','family_office','other')
-- Drop it first, then add the new canonical constraint.

-- Drop old constraint (name may vary — try both possible names)
ALTER TABLE public.remarketing_buyers
  DROP CONSTRAINT IF EXISTS remarketing_buyers_buyer_type_check;
ALTER TABLE public.remarketing_buyers
  DROP CONSTRAINT IF EXISTS buyer_type_valid_enum;

-- Add new CHECK constraint allowing canonical values + NULL
ALTER TABLE public.remarketing_buyers
  ADD CONSTRAINT buyer_type_valid_enum CHECK (
    buyer_type IN (
      'private_equity', 'corporate', 'family_office',
      'search_fund', 'independent_sponsor', 'individual_buyer'
    ) OR buyer_type IS NULL
  );


-- ============================================================================
-- Summary:
--   Phase 1: 8 new columns + 2 indexes on remarketing_buyers
--   Phase 2: Normalized all legacy buyer_type values to 6 canonical values
--   Phase 3: Backfilled pe_firm_id FK from pe_firm_name text match
--   Phase 4: Fixed sync trigger to map marketplace camelCase → canonical values
--   Phase 5: Replaced old CHECK constraint with new 6-value enum
-- ============================================================================
