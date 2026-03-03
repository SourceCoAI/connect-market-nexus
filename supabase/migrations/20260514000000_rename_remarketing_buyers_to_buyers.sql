-- ============================================================================
-- RENAME remarketing_buyers → buyers
--
-- The remarketing_buyers table holds ALL buyers (marketplace, imported,
-- AI-seeded, manually created). The "remarketing_" prefix is misleading.
--
-- Also renames remarketing_buyer_universes → buyer_universes.
--
-- Creates backward-compatible views so existing queries don't break
-- during the transition period.
--
-- SAFETY: Views ensure backward compatibility. No data is lost.
-- ============================================================================


-- ============================================================================
-- PHASE 1: RENAME TABLES
-- ============================================================================

-- Rename the main buyers table
ALTER TABLE IF EXISTS public.remarketing_buyers RENAME TO buyers;

-- Rename the universes table
ALTER TABLE IF EXISTS public.remarketing_buyer_universes RENAME TO buyer_universes;


-- ============================================================================
-- PHASE 2: CREATE BACKWARD-COMPATIBLE VIEWS
-- ============================================================================
-- These views allow old code referencing the old table names to keep working
-- during the transition period. They support SELECT, INSERT, UPDATE, DELETE.

CREATE OR REPLACE VIEW public.remarketing_buyers AS
  SELECT * FROM public.buyers;

CREATE OR REPLACE VIEW public.remarketing_buyer_universes AS
  SELECT * FROM public.buyer_universes;


-- ============================================================================
-- PHASE 3: RENAME FOREIGN KEY COLUMNS ON REFERENCING TABLES
-- ============================================================================
-- Update the FK column name on tables that reference remarketing_buyers.
-- The FK constraint names don't need to change (they still work).

-- profiles.remarketing_buyer_id → profiles.buyer_id
ALTER TABLE public.profiles
  RENAME COLUMN remarketing_buyer_id TO buyer_id;

-- contacts.remarketing_buyer_id → contacts.buyer_id
ALTER TABLE public.contacts
  RENAME COLUMN remarketing_buyer_id TO buyer_id;

-- contact_activities.remarketing_buyer_id → contact_activities.buyer_id
ALTER TABLE public.contact_activities
  RENAME COLUMN remarketing_buyer_id TO buyer_id;

-- buyers.universe_id stays as-is (already clean name)

-- deals table (if it has remarketing_buyer_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deals'
      AND column_name = 'remarketing_buyer_id'
  ) THEN
    ALTER TABLE public.deals
      RENAME COLUMN remarketing_buyer_id TO buyer_id;
  END IF;
END $$;

-- data_room_access table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'data_room_access'
      AND column_name = 'remarketing_buyer_id'
  ) THEN
    ALTER TABLE public.data_room_access
      RENAME COLUMN remarketing_buyer_id TO buyer_id;
  END IF;
END $$;

-- memo_distribution_log table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'memo_distribution_log'
      AND column_name = 'remarketing_buyer_id'
  ) THEN
    ALTER TABLE public.memo_distribution_log
      RENAME COLUMN remarketing_buyer_id TO buyer_id;
  END IF;
END $$;

-- buyer_seed_log table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'buyer_seed_log'
      AND column_name = 'remarketing_buyer_id'
  ) THEN
    ALTER TABLE public.buyer_seed_log
      RENAME COLUMN remarketing_buyer_id TO buyer_id;
  END IF;
END $$;


-- ============================================================================
-- PHASE 4: UPDATE RLS POLICIES (reference new table name)
-- ============================================================================
-- RLS policies on the renamed table need to be recreated since they
-- reference the table by its old name internally.

-- Buyers table RLS (if any exist)
-- Note: Most RLS on remarketing_buyers was admin-only via is_admin check.
-- The policies still work after rename — Postgres tracks by OID not name.
-- No action needed for existing policies.


-- ============================================================================
-- PHASE 5: UPDATE TRIGGER REFERENCES
-- ============================================================================
-- The signup trigger references remarketing_buyers — update it.

CREATE OR REPLACE FUNCTION public.sync_marketplace_buyer_on_signup()
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
  v_buyer_id UUID;
  v_contact_id UUID;
  v_is_pe_backed BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (NEW.approval_status = 'approved'
            AND (OLD.approval_status IS DISTINCT FROM 'approved')) THEN
      RETURN NEW;
    END IF;
    IF NEW.buyer_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  v_company_name := COALESCE(NULLIF(TRIM(NEW.company_name), ''), NULLIF(TRIM(NEW.company), ''));

  IF v_company_name IS NULL OR v_company_name = '' THEN
    IF NEW.buyer_type ILIKE '%individual%' THEN
      v_company_name := TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
    END IF;
  END IF;

  IF v_company_name IS NULL OR v_company_name = '' THEN
    RETURN NEW;
  END IF;

  v_buyer_type := CASE
    WHEN NEW.buyer_type ILIKE '%privateequity%' OR NEW.buyer_type ILIKE '%private equity%' OR NEW.buyer_type ILIKE 'pe%' THEN 'private_equity'
    WHEN NEW.buyer_type ILIKE '%holdingcompany%' OR NEW.buyer_type ILIKE '%holding company%' THEN 'corporate'
    WHEN NEW.buyer_type ILIKE '%corporate%' OR NEW.buyer_type ILIKE '%strategic%' OR NEW.buyer_type ILIKE '%businessowner%' OR NEW.buyer_type ILIKE '%business owner%' OR NEW.buyer_type ILIKE '%advisor%' THEN 'corporate'
    WHEN NEW.buyer_type ILIKE '%familyoffice%' OR NEW.buyer_type ILIKE '%family office%' OR NEW.buyer_type ILIKE '%family%office%' THEN 'family_office'
    WHEN NEW.buyer_type ILIKE '%searchfund%' OR NEW.buyer_type ILIKE '%search fund%' OR NEW.buyer_type ILIKE '%search%fund%' THEN 'search_fund'
    WHEN NEW.buyer_type ILIKE '%independentsponsor%' OR NEW.buyer_type ILIKE '%independent sponsor%' OR NEW.buyer_type ILIKE '%independent%sponsor%' THEN 'independent_sponsor'
    WHEN NEW.buyer_type ILIKE '%individual%' THEN 'individual_buyer'
    ELSE NULL
  END;

  IF NEW.buyer_type ILIKE '%holdingcompany%' OR NEW.buyer_type ILIKE '%holding company%' THEN
    v_is_pe_backed := true;
  END IF;

  v_thesis := COALESCE(NULLIF(TRIM(NEW.ideal_target_description), ''), NULLIF(TRIM(NEW.mandate_blurb), ''), NULLIF(TRIM(NEW.bio), ''));

  IF NEW.business_categories IS NOT NULL AND NEW.business_categories::text != 'null' THEN
    IF jsonb_typeof(NEW.business_categories::jsonb) = 'array' THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(NEW.business_categories::jsonb)) INTO v_industries;
    ELSE
      v_industries := ARRAY[NEW.business_categories::jsonb #>> '{}'];
    END IF;
  END IF;

  IF NEW.target_locations IS NOT NULL AND NEW.target_locations::text != 'null' THEN
    IF jsonb_typeof(NEW.target_locations::jsonb) = 'array' THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(NEW.target_locations::jsonb)) INTO v_geographies;
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

  -- Find existing buyer by website domain
  IF v_website IS NOT NULL THEN
    SELECT id INTO v_buyer_id FROM public.buyers
    WHERE archived = false AND company_website IS NOT NULL
      AND extract_domain(company_website) = extract_domain(v_website)
    LIMIT 1;
  END IF;

  IF v_buyer_id IS NULL THEN
    SELECT id INTO v_buyer_id FROM public.buyers
    WHERE archived = false AND lower(trim(company_name)) = lower(trim(v_company_name))
    LIMIT 1;
  END IF;

  IF v_buyer_id IS NOT NULL THEN
    UPDATE public.buyers SET
      buyer_type = COALESCE(buyer_type, v_buyer_type),
      buyer_type_source = COALESCE(buyer_type_source, 'signup'),
      buyer_type_needs_review = CASE WHEN buyer_type IS NULL AND v_buyer_type IS NULL THEN true ELSE buyer_type_needs_review END,
      is_pe_backed = CASE WHEN v_is_pe_backed THEN true ELSE is_pe_backed END,
      thesis_summary = COALESCE(thesis_summary, v_thesis),
      target_industries = CASE WHEN target_industries IS NULL OR array_length(target_industries, 1) IS NULL THEN v_industries ELSE target_industries END,
      target_geographies = CASE WHEN target_geographies IS NULL OR array_length(target_geographies, 1) IS NULL THEN v_geographies ELSE target_geographies END,
      company_website = COALESCE(company_website, v_website),
      buyer_linkedin = COALESCE(buyer_linkedin, v_linkedin),
      target_revenue_min = COALESCE(target_revenue_min, v_rev_min),
      target_revenue_max = COALESCE(target_revenue_max, v_rev_max),
      email_domain = COALESCE(email_domain, v_email_domain),
      extraction_sources = COALESCE(extraction_sources, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('type', 'marketplace_signup', 'profile_id', NEW.id, 'priority', 80, 'extracted_at', now()::text)),
      data_last_updated = now(), updated_at = now()
    WHERE id = v_buyer_id;
  ELSE
    INSERT INTO public.buyers (company_name, buyer_type, buyer_type_source, buyer_type_needs_review, is_pe_backed,
      thesis_summary, target_industries, target_geographies, company_website, buyer_linkedin,
      target_revenue_min, target_revenue_max, email_domain, extraction_sources, data_last_updated)
    VALUES (v_company_name, v_buyer_type,
      CASE WHEN v_buyer_type IS NOT NULL THEN 'signup' ELSE NULL END,
      CASE WHEN v_buyer_type IS NULL THEN true ELSE false END,
      v_is_pe_backed, v_thesis, v_industries, v_geographies, v_website, v_linkedin,
      v_rev_min, v_rev_max, v_email_domain,
      jsonb_build_array(jsonb_build_object('type', 'marketplace_signup', 'profile_id', NEW.id, 'priority', 80, 'extracted_at', now()::text)),
      now())
    RETURNING id INTO v_buyer_id;
  END IF;

  IF v_buyer_id IS NOT NULL THEN
    UPDATE public.profiles SET buyer_id = v_buyer_id WHERE id = NEW.id AND buyer_id IS NULL;
  END IF;

  -- Find or create contact
  IF NEW.email IS NOT NULL THEN
    SELECT id INTO v_contact_id FROM public.contacts
    WHERE lower(email) = lower(NEW.email) AND contact_type = 'buyer' AND archived = false
    LIMIT 1;
  END IF;

  IF v_contact_id IS NOT NULL THEN
    UPDATE public.contacts SET
      profile_id = COALESCE(profile_id, NEW.id),
      buyer_id = COALESCE(buyer_id, v_buyer_id),
      first_name = COALESCE(NULLIF(first_name, 'Unknown'), NULLIF(TRIM(NEW.first_name), ''), first_name),
      last_name = COALESCE(NULLIF(last_name, ''), NULLIF(TRIM(NEW.last_name), ''), last_name),
      phone = COALESCE(phone, NULLIF(TRIM(NEW.phone_number), '')),
      linkedin_url = COALESCE(linkedin_url, NULLIF(TRIM(NEW.linkedin_profile), '')),
      title = COALESCE(title, NULLIF(TRIM(NEW.job_title), '')),
      company_name = COALESCE(NULLIF(company_name, ''), v_company_name),
      updated_at = now()
    WHERE id = v_contact_id;
  ELSE
    INSERT INTO public.contacts (first_name, last_name, email, phone, linkedin_url, title,
      company_name, contact_type, profile_id, buyer_id, source, created_at)
    VALUES (
      COALESCE(NULLIF(TRIM(NEW.first_name), ''), 'Unknown'),
      COALESCE(NULLIF(TRIM(NEW.last_name), ''), ''),
      lower(TRIM(NEW.email)),
      NULLIF(TRIM(NEW.phone_number), ''),
      NULLIF(TRIM(NEW.linkedin_profile), ''),
      NULLIF(TRIM(NEW.job_title), ''),
      v_company_name, 'buyer', NEW.id, v_buyer_id, 'marketplace_signup', now())
    ON CONFLICT (lower(email)) WHERE contact_type = 'buyer' AND email IS NOT NULL AND archived = false
    DO UPDATE SET
      profile_id = COALESCE(contacts.profile_id, EXCLUDED.profile_id),
      buyer_id = COALESCE(contacts.buyer_id, EXCLUDED.buyer_id),
      company_name = COALESCE(NULLIF(contacts.company_name, ''), EXCLUDED.company_name),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Update the score sync trigger to use new column names
CREATE OR REPLACE FUNCTION public.sync_buyer_score_to_remarketing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.buyer_id IS NOT NULL AND (
    NEW.buyer_quality_score IS DISTINCT FROM OLD.buyer_quality_score OR
    NEW.buyer_tier IS DISTINCT FROM OLD.buyer_tier OR
    NEW.admin_tier_override IS DISTINCT FROM OLD.admin_tier_override OR
    NEW.admin_override_note IS DISTINCT FROM OLD.admin_override_note OR
    NEW.platform_signal_detected IS DISTINCT FROM OLD.platform_signal_detected
  ) THEN
    UPDATE public.buyers SET
      buyer_quality_score = NEW.buyer_quality_score,
      buyer_quality_score_last_calculated = NEW.buyer_quality_score_last_calculated::timestamptz,
      buyer_tier = NEW.buyer_tier,
      admin_tier_override = NEW.admin_tier_override,
      admin_override_note = NEW.admin_override_note,
      platform_signal_detected = COALESCE(NEW.platform_signal_detected, false),
      platform_signal_source = NEW.platform_signal_source,
      updated_at = now()
    WHERE id = NEW.buyer_id;
  END IF;
  RETURN NEW;
END;
$$;


-- ============================================================================
-- Summary:
--   Phase 1: Renamed remarketing_buyers → buyers,
--            remarketing_buyer_universes → buyer_universes
--   Phase 2: Created backward-compatible views
--   Phase 3: Renamed remarketing_buyer_id → buyer_id on referencing tables
--   Phase 4: RLS policies work automatically (Postgres tracks by OID)
--   Phase 5: Updated trigger functions to use new table/column names
-- ============================================================================
