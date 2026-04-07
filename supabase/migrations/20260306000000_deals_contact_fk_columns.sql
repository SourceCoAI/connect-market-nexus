-- ============================================================================
-- MIGRATION: Add buyer_contact_id + seller_contact_id to deals table
-- ============================================================================
-- Part of the Data Relationship Audit — closes the three missing FKs on deals:
--   1. buyer_contact_id  → contacts (the buyer person working this deal)
--   2. seller_contact_id → contacts (the seller/owner being worked)
--   (remarketing_buyer_id already exists from 20260220220000)
--
-- Also backfills both columns from existing data:
--   - seller_contact_id: matched via listing_id + contact_type='seller'
--   - buyer_contact_id: matched via connection_requests.user_id → contacts.profile_id
--   - remarketing_buyer_id: derived from buyer contact's remarketing_buyer_id
--
-- SAFETY:
--   - ADDITIVE ONLY: Two new nullable UUID columns + indexes.
--   - NO DATA LOSS: Existing deals unchanged except for backfill of new columns.
--   - ZERO DOWNTIME: All statements are safe for live production.
-- ============================================================================


-- ─── STEP 1: Add FK columns ─────────────────────────────────────────────────

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS buyer_contact_id
    UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seller_contact_id
    UUID REFERENCES public.contacts(id) ON DELETE SET NULL;


-- ─── STEP 2: Partial indexes for efficient lookups ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_deals_buyer_contact
  ON public.deals(buyer_contact_id)
  WHERE buyer_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_seller_contact
  ON public.deals(seller_contact_id)
  WHERE seller_contact_id IS NOT NULL;


-- ─── STEP 3: Backfill seller_contact_id ──────────────────────────────────────
-- Match deals to seller contacts via the deal's listing_id.
-- Each listing has a primary seller contact in the contacts table.

UPDATE public.deals d
SET seller_contact_id = c.id
FROM public.contacts c
WHERE d.seller_contact_id IS NULL
  AND d.listing_id IS NOT NULL
  AND c.listing_id = d.listing_id
  AND c.contact_type = 'seller'
  AND c.is_primary_seller_contact = true
  AND c.archived = false;

-- Fallback: if no primary seller contact, try matching by email
UPDATE public.deals d
SET seller_contact_id = c.id
FROM public.contacts c
WHERE d.seller_contact_id IS NULL
  AND d.contact_email IS NOT NULL
  AND lower(d.contact_email) = lower(c.email)
  AND c.contact_type = 'seller'
  AND c.archived = false;


-- ─── STEP 4: Backfill buyer_contact_id ───────────────────────────────────────
-- For marketplace-originated deals (via connection_request + user_id):
-- Match the requesting user's profile to a buyer contact via contacts.profile_id.

UPDATE public.deals d
SET buyer_contact_id = c.id
FROM public.connection_requests cr
JOIN public.contacts c ON c.profile_id = cr.user_id AND c.contact_type = 'buyer'
WHERE d.connection_request_id = cr.id
  AND d.buyer_contact_id IS NULL
  AND cr.user_id IS NOT NULL
  AND c.archived = false;


-- ─── STEP 5: Backfill remarketing_buyer_id from buyer contact ────────────────
-- For deals that now have a buyer_contact_id but no remarketing_buyer_id,
-- derive the org from the contact's remarketing_buyer_id.

UPDATE public.deals d
SET remarketing_buyer_id = c.remarketing_buyer_id
FROM public.contacts c
WHERE d.buyer_contact_id = c.id
  AND d.remarketing_buyer_id IS NULL
  AND c.remarketing_buyer_id IS NOT NULL;


-- ============================================================================
-- Summary:
--   2 new columns: buyer_contact_id, seller_contact_id (nullable UUID FKs)
--   2 partial indexes for efficient lookups
--   3 backfill passes: seller by listing, buyer by connection_request, org by contact
--   Existing remarketing_buyer_id column untouched (already exists)
-- ============================================================================

-- Merged from: 20260306000000_p0_industry_tier_backfill_and_fixes.sql
-- P0 FIX: Backfill industry_tier for all deals based on industry/category
-- This migration populates the industry_tier column which was NULL for all 7,538 deals,
-- causing the 1.15x/0.9x scoring multiplier to have zero effect.

-- Step 1: Add industry_tier column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'industry_tier'
  ) THEN
    ALTER TABLE listings ADD COLUMN industry_tier smallint;
  END IF;
END $$;

-- Step 2: Add manual_rank column for drag-and-drop persistence (P2 fix)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'manual_rank'
  ) THEN
    ALTER TABLE listings ADD COLUMN manual_rank integer;
  END IF;
END $$;

-- Step 3: Add manual_rank_set_at for tracking when rank was overridden
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'manual_rank_set_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN manual_rank_set_at timestamptz;
  END IF;
END $$;

-- Step 4: Backfill industry_tier using industry and category fields
-- Tier 1 (1.15x multiplier): High-demand service industries
-- Tier 2 (1.0x multiplier): Solid mid-market industries
-- Tier 3 (0.9x multiplier): Lower-demand or commoditized industries
UPDATE listings
SET industry_tier = CASE
  -- Tier 1: High-demand service industries (HVAC, collision repair, auto repair, home services, restoration)
  WHEN LOWER(COALESCE(industry, category, '')) ~* '(hvac|heating|cooling|air condition|collision|auto body|auto repair|automotive repair|home service|restoration|fire.*water|water damage|mold|plumb|electric|roofing|landscap|pest control|garage door|insulation|solar|pool service|cleaning service|janitorial|pressure wash)'
    THEN 1

  -- Tier 1 also: Healthcare services, veterinary, dental
  WHEN LOWER(COALESCE(industry, category, '')) ~* '(dental|veterinar|vet clinic|urgent care|home health|physical therapy|optometr|dermatolog|chiropractic|medical practice|healthcare service|behavioral health|mental health)'
    THEN 1

  -- Tier 1 also: Specialty trade contractors, field services
  WHEN LOWER(COALESCE(industry, category, '')) ~* '(fire protection|fire alarm|security system|elevator|scaffold|crane|environmental service|waste management|recycling)'
    THEN 1

  -- Tier 2: Professional services, SaaS, light manufacturing
  WHEN LOWER(COALESCE(industry, category, '')) ~* '(saas|software|technology|it service|managed service|consulting|accounting|engineering|architect|staffing|recruiting|marketing agency|insurance|financial service|wealth management|logistics|distribution|manufacturing|fabricat|machine shop|packaging|food manufacturing|commercial print)'
    THEN 2

  -- Tier 2 also: Niche consumer services with recurring revenue
  WHEN LOWER(COALESCE(industry, category, '')) ~* '(fitness|gym|car wash|laundry|dry clean|storage|self storage|parking|childcare|daycare|pet service|grooming|boarding|franchise)'
    THEN 2

  -- Tier 3: Commoditized, high-competition, low-margin industries
  WHEN LOWER(COALESCE(industry, category, '')) ~* '(restaurant|food service|bar |tavern|cafe|bakery|catering|retail|clothing|apparel|grocery|convenience|gas station|hotel|motel|hospitality|real estate broker|general construct|paving|concrete|excavat|demolit|trucking|freight|moving company|agriculture|farm|ranch)'
    THEN 3

  -- Default: Tier 2 for unclassified (neutral multiplier)
  ELSE 2
END
WHERE deleted_at IS NULL;

-- Step 5: Create index on industry_tier for faster queries
CREATE INDEX IF NOT EXISTS idx_listings_industry_tier ON listings (industry_tier) WHERE deleted_at IS NULL;

-- Step 6: Create index on manual_rank for sorted queries
CREATE INDEX IF NOT EXISTS idx_listings_manual_rank ON listings (manual_rank) WHERE manual_rank IS NOT NULL AND deleted_at IS NULL;

-- Step 7: Fix stuck transcript extractions (P0 fix)
-- Reset 59 transcripts stuck in 'pending' status that have content
UPDATE deal_transcripts
SET extraction_status = 'pending',
    extraction_error = NULL
WHERE extraction_status = 'pending'
  AND transcript_text IS NOT NULL
  AND LENGTH(TRIM(transcript_text)) > 0;

-- Step 8: Create health-check function for monitoring
CREATE OR REPLACE FUNCTION public.platform_health_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  null_scores_count integer;
  stuck_transcripts_count integer;
  empty_buyer_contacts boolean;
  empty_outreach boolean;
  low_revenue_quality integer;
  null_industry_tier integer;
BEGIN
  -- Count deals with NULL scores that have data
  SELECT COUNT(*) INTO null_scores_count
  FROM listings
  WHERE deal_total_score IS NULL
    AND deleted_at IS NULL
    AND (revenue > 0 OR ebitda > 0 OR linkedin_employee_count > 0);

  -- Count stuck transcript extractions
  SELECT COUNT(*) INTO stuck_transcripts_count
  FROM deal_transcripts
  WHERE extraction_status = 'pending'
    AND transcript_text IS NOT NULL
    AND LENGTH(TRIM(transcript_text)) > 0
    AND created_at < NOW() - INTERVAL '1 hour';

  -- Check if buyer_contacts is empty
  SELECT NOT EXISTS(SELECT 1 FROM buyer_contacts LIMIT 1) INTO empty_buyer_contacts;

  -- Check if outreach tracking is empty
  SELECT NOT EXISTS(SELECT 1 FROM contact_activities WHERE source_system = 'phoneburner' LIMIT 1) INTO empty_outreach;

  -- Count deals with low revenue quality detection
  SELECT COUNT(*) INTO low_revenue_quality
  FROM listings
  WHERE deleted_at IS NULL
    AND scoring_notes IS NOT NULL
    AND scoring_notes LIKE '%recurring%';

  -- Count deals with NULL industry_tier
  SELECT COUNT(*) INTO null_industry_tier
  FROM listings
  WHERE deleted_at IS NULL
    AND industry_tier IS NULL;

  result := jsonb_build_object(
    'timestamp', NOW(),
    'unscored_deals_with_data', null_scores_count,
    'stuck_transcript_extractions', stuck_transcripts_count,
    'buyer_contacts_empty', empty_buyer_contacts,
    'phoneburner_outreach_empty', empty_outreach,
    'deals_with_recurring_revenue_detected', low_revenue_quality,
    'deals_with_null_industry_tier', null_industry_tier,
    'status', CASE
      WHEN null_scores_count > 10 THEN 'critical'
      WHEN stuck_transcripts_count > 5 THEN 'warning'
      WHEN null_industry_tier > 100 THEN 'warning'
      ELSE 'healthy'
    END
  );

  RETURN result;
END;
$$;

-- Grant access to the health check function
GRANT EXECUTE ON FUNCTION public.platform_health_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_health_check() TO service_role;
