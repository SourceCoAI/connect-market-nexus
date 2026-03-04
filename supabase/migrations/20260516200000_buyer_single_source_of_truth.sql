-- ============================================================================
-- BUYER SINGLE-SOURCE-OF-TRUTH FIX — PHASE 1
--
-- Problem: Buyer data is scattered across profiles, remarketing_buyers, and
-- contacts with no canonical RPC to join them.  Frontend code reads stale
-- copies in profiles (company, buyer_type, deal-size) instead of the
-- authoritative remarketing_buyers record.
--
-- This migration:
--   1. Creates get_buyer_profile(uuid)          — joined RPC
--   2. Normalizes profiles.buyer_type enums     — camelCase → snake_case
--   3. Creates compute_buyer_priority(uuid)     — reads from buyers, not profiles
--   4. Deprecates redundant profiles columns    — COMMENT ON COLUMN
--
-- SAFETY:  All operations are idempotent (CREATE OR REPLACE, IF NOT EXISTS,
--          UPDATE … WHERE).  No destructive DDL.
-- ============================================================================


-- ============================================================================
-- SECTION 1: get_buyer_profile(p_user_id uuid)
-- ============================================================================
-- Returns a single joined row combining:
--   • Personal info   from profiles  (id, first_name, last_name, email, etc.)
--   • Org/buyer info  from remarketing_buyers  (company_name, buyer_type, etc.)
--   • Agreement info  from contacts  (nda_signed, fee_agreement_signed)
--
-- Join path:
--   profiles.remarketing_buyer_id = remarketing_buyers.id
--   contacts.profile_id = profiles.id  AND  contacts.contact_type = 'buyer'
--
-- The p_user_id parameter is the profile id (auth user UUID).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_buyer_profile(p_user_id uuid)
RETURNS TABLE (
  -- Personal (profiles)
  id                    uuid,
  first_name            text,
  last_name             text,
  email                 text,
  phone_number          text,
  avatar_url            text,
  -- Organization (remarketing_buyers)
  buyer_id              uuid,
  company_name          text,
  buyer_type            text,
  thesis_summary        text,
  target_revenue_min    numeric,
  target_revenue_max    numeric,
  geographic_focus      text[],
  -- Agreement (contacts)
  nda_signed            boolean,
  fee_agreement_signed  boolean
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Personal
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.phone_number,
    p.avatar_url,
    -- Organization
    rb.id              AS buyer_id,
    rb.company_name,
    rb.buyer_type,
    rb.thesis_summary,
    rb.target_revenue_min,
    rb.target_revenue_max,
    rb.target_geographies  AS geographic_focus,
    -- Agreement
    COALESCE(c.nda_signed, false)            AS nda_signed,
    COALESCE(c.fee_agreement_signed, false)  AS fee_agreement_signed
  FROM public.profiles p
  LEFT JOIN public.remarketing_buyers rb
    ON rb.id = p.remarketing_buyer_id
  LEFT JOIN public.contacts c
    ON c.profile_id = p.id
   AND c.contact_type = 'buyer'
   AND c.archived = false
  WHERE p.id = p_user_id
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_buyer_profile(uuid) IS
  'Phase 1 buyer SSOT RPC.  Returns a single joined row of profiles + '
  'remarketing_buyers + contacts for a given user_id.  Replaces scattered '
  'frontend queries that read stale copies from profiles.';


-- ============================================================================
-- SECTION 2: Normalize buyer_type enums in profiles (camelCase → snake_case)
-- ============================================================================
-- The marketplace signup form stores camelCase values (e.g. 'privateEquity').
-- The canonical enum in remarketing_buyers uses snake_case ('private_equity').
-- Normalize profiles to match so existing triggers and lookups work cleanly.
--
-- Only rows whose buyer_type matches a known camelCase pattern are updated.
-- This is idempotent — re-running has no effect on already-normalized rows.
-- ============================================================================

UPDATE public.profiles
SET buyer_type = 'private_equity'
WHERE buyer_type = 'privateEquity';

UPDATE public.profiles
SET buyer_type = 'family_office'
WHERE buyer_type = 'familyOffice';

UPDATE public.profiles
SET buyer_type = 'search_fund'
WHERE buyer_type = 'searchFund';

UPDATE public.profiles
SET buyer_type = 'strategic_acquirer'
WHERE buyer_type = 'strategicAcquirer';

UPDATE public.profiles
SET buyer_type = 'independent_sponsor'
WHERE buyer_type = 'independentSponsor';

UPDATE public.profiles
SET buyer_type = 'holding_company'
WHERE buyer_type = 'holdingCompany';


-- ============================================================================
-- SECTION 3: compute_buyer_priority(p_user_id uuid)
-- ============================================================================
-- Computes a buyer priority score (0–100) from the remarketing_buyers table
-- directly, removing the trigger dependency on profiles.buyer_type.
--
-- Scoring rubric (mirrors calculate_buyer_priority_score but reads from
-- remarketing_buyers via profiles.remarketing_buyer_id):
--   buyer_type:       private_equity 30, family_office 25, corporate 20,
--                     search_fund 15, independent_sponsor 10, else 5
--   target_revenue:   max > 10M → 25, > 5M → 20, > 2M → 15, > 1M → 10, else 5
--   thesis_summary:   present → 10
--   target_geographies: present → 5
--   target_industries:  present → 5
--   registered user:    always true here → 10
--   company_name:       present → 5
--   Capped at 100.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_buyer_priority(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_score       integer := 0;
  v_buyer_type  text;
  v_company     text;
  v_thesis      text;
  v_rev_max     numeric;
  v_geos        text[];
  v_industries  text[];
BEGIN
  -- Read from the authoritative buyers table, not profiles
  SELECT
    rb.buyer_type,
    rb.company_name,
    rb.thesis_summary,
    rb.target_revenue_max,
    rb.target_geographies,
    rb.target_industries
  INTO
    v_buyer_type,
    v_company,
    v_thesis,
    v_rev_max,
    v_geos,
    v_industries
  FROM public.profiles p
  JOIN public.remarketing_buyers rb ON rb.id = p.remarketing_buyer_id
  WHERE p.id = p_user_id;

  -- If no buyer record found, return 0
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Buyer type score
  v_score := v_score + CASE
    WHEN v_buyer_type = 'private_equity'      THEN 30
    WHEN v_buyer_type = 'family_office'        THEN 25
    WHEN v_buyer_type = 'corporate'            THEN 20
    WHEN v_buyer_type = 'search_fund'          THEN 15
    WHEN v_buyer_type = 'independent_sponsor'  THEN 10
    ELSE 5
  END;

  -- Revenue range score
  v_score := v_score + CASE
    WHEN v_rev_max > 10000000 THEN 25
    WHEN v_rev_max > 5000000  THEN 20
    WHEN v_rev_max > 2000000  THEN 15
    WHEN v_rev_max > 1000000  THEN 10
    ELSE 5
  END;

  -- Thesis present
  IF v_thesis IS NOT NULL AND v_thesis != '' THEN
    v_score := v_score + 10;
  END IF;

  -- Geographic focus present
  IF v_geos IS NOT NULL AND array_length(v_geos, 1) > 0 THEN
    v_score := v_score + 5;
  END IF;

  -- Industry targets present
  IF v_industries IS NOT NULL AND array_length(v_industries, 1) > 0 THEN
    v_score := v_score + 5;
  END IF;

  -- Registered user bonus (always true — they have a profile)
  v_score := v_score + 10;

  -- Company name present
  IF v_company IS NOT NULL AND v_company != '' THEN
    v_score := v_score + 5;
  END IF;

  RETURN LEAST(v_score, 100);
END;
$$;

COMMENT ON FUNCTION public.compute_buyer_priority(uuid) IS
  'Computes buyer priority score (0–100) from remarketing_buyers (the SSOT), '
  'replacing the legacy trigger that reads profiles.buyer_type.  '
  'Mirrors calculate_buyer_priority_score scoring rubric.';


-- ============================================================================
-- SECTION 4: Deprecation comments on redundant profiles columns
-- ============================================================================
-- These columns on profiles are legacy copies of data whose authoritative
-- source is now remarketing_buyers (for org data) or contacts (for agreements).
-- They remain for backward compatibility but should NOT be read for new code.
--
-- Phase 2 will add a sync trigger to keep them in sync; Phase 3 will drop them.
-- ============================================================================

COMMENT ON COLUMN public.profiles.company IS
  'DEPRECATED (Phase 1 SSOT fix, 2026-05-16).  Use remarketing_buyers.company_name via profiles.remarketing_buyer_id instead.';

COMMENT ON COLUMN public.profiles.company_name IS
  'DEPRECATED (Phase 1 SSOT fix, 2026-05-16).  Use remarketing_buyers.company_name via profiles.remarketing_buyer_id instead.';

COMMENT ON COLUMN public.profiles.buyer_type IS
  'DEPRECATED (Phase 1 SSOT fix, 2026-05-16).  Use remarketing_buyers.buyer_type via profiles.remarketing_buyer_id instead.';

COMMENT ON COLUMN public.profiles.target_deal_size_min IS
  'DEPRECATED (Phase 1 SSOT fix, 2026-05-16).  Use remarketing_buyers.target_revenue_min via profiles.remarketing_buyer_id instead.';

COMMENT ON COLUMN public.profiles.target_deal_size_max IS
  'DEPRECATED (Phase 1 SSOT fix, 2026-05-16).  Use remarketing_buyers.target_revenue_max via profiles.remarketing_buyer_id instead.';

COMMENT ON COLUMN public.profiles.ideal_target_description IS
  'DEPRECATED (Phase 1 SSOT fix, 2026-05-16).  Use remarketing_buyers.thesis_summary via profiles.remarketing_buyer_id instead.';


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
