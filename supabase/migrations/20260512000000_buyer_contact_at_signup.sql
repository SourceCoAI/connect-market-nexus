-- ============================================================================
-- BUYER + CONTACT CREATION AT SIGNUP
--
-- Changes the marketplace sync trigger to fire on profile INSERT (not just
-- approval). This ensures every marketplace user immediately gets:
--   1. A remarketing_buyers row (their company/org)
--   2. A contacts row (them as a person)
--   3. profiles.remarketing_buyer_id linked to the buyer
--
-- Also backfills any existing profiles that don't have associated records.
--
-- Core principle:
--   Buyer = company (PE firm, corporate, family office, etc.)
--   Contact = person (someone who works at a buyer company)
--   Profile = auth identity (login credentials + approval status)
--
-- SAFETY: Additive only. Trigger replaces existing function.
-- ============================================================================


-- ============================================================================
-- PHASE 1: REWRITE SYNC TRIGGER
-- ============================================================================
-- The old trigger fired only on UPDATE when approval_status → 'approved'.
-- The new trigger fires on INSERT (signup) AND on UPDATE (approval).
--
-- On INSERT: Creates buyer + contact + links immediately
-- On UPDATE to approved: No data copying needed (already linked)

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
  -- ── On INSERT: always create buyer + contact ──────────────────────────
  -- ── On UPDATE: only re-sync if approval_status just changed to approved
  --              AND buyer wasn't already linked
  IF TG_OP = 'UPDATE' THEN
    -- If this is an update but NOT an approval change, skip
    IF NOT (NEW.approval_status = 'approved'
            AND (OLD.approval_status IS DISTINCT FROM 'approved')) THEN
      RETURN NEW;
    END IF;
    -- If already linked, skip
    IF NEW.remarketing_buyer_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Extract company name (try company_name first, then company)
  v_company_name := COALESCE(NULLIF(TRIM(NEW.company_name), ''), NULLIF(TRIM(NEW.company), ''));

  -- For individual buyers, use their name as company name
  IF v_company_name IS NULL OR v_company_name = '' THEN
    IF NEW.buyer_type ILIKE '%individual%' THEN
      v_company_name := TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
    END IF;
  END IF;

  IF v_company_name IS NULL OR v_company_name = '' THEN
    RAISE NOTICE 'Skipping buyer sync for profile % — no company name', NEW.id;
    RETURN NEW;
  END IF;

  -- Map marketplace buyer_type (camelCase) to canonical values
  v_buyer_type := CASE
    WHEN NEW.buyer_type ILIKE '%privateequity%'
      OR NEW.buyer_type ILIKE '%private equity%'
      OR NEW.buyer_type ILIKE 'pe%'
      THEN 'private_equity'
    WHEN NEW.buyer_type ILIKE '%holdingcompany%'
      OR NEW.buyer_type ILIKE '%holding company%'
      THEN 'corporate'  -- holding companies are PE-backed corporates
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
    ELSE NULL  -- Unknown → NULL, flagged for review
  END;

  -- Set is_pe_backed for holding companies
  IF NEW.buyer_type ILIKE '%holdingcompany%' OR NEW.buyer_type ILIKE '%holding company%' THEN
    v_is_pe_backed := true;
  END IF;

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

  -- ── STEP 1: Find or create the buyer (company) ─────────────────────

  -- Check for existing buyer by website domain
  IF v_website IS NOT NULL THEN
    SELECT id INTO v_buyer_id
    FROM public.remarketing_buyers
    WHERE archived = false
      AND company_website IS NOT NULL
      AND extract_domain(company_website) = extract_domain(v_website)
    LIMIT 1;
  END IF;

  -- Fall back to company name match
  IF v_buyer_id IS NULL THEN
    SELECT id INTO v_buyer_id
    FROM public.remarketing_buyers
    WHERE archived = false
      AND lower(trim(company_name)) = lower(trim(v_company_name))
    LIMIT 1;
  END IF;

  IF v_buyer_id IS NOT NULL THEN
    -- UPDATE existing buyer — only fill empty fields (priority 80)
    UPDATE public.remarketing_buyers
    SET
      buyer_type = COALESCE(buyer_type, v_buyer_type),
      buyer_type_source = COALESCE(buyer_type_source, 'signup'),
      buyer_type_needs_review = CASE
        WHEN buyer_type IS NULL AND v_buyer_type IS NULL THEN true
        ELSE buyer_type_needs_review
      END,
      is_pe_backed = CASE
        WHEN v_is_pe_backed THEN true
        ELSE is_pe_backed
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
        'type', 'marketplace_signup',
        'profile_id', NEW.id,
        'priority', 80,
        'extracted_at', now()::text
      )),
      data_last_updated = now(),
      updated_at = now()
    WHERE id = v_buyer_id;
  ELSE
    -- INSERT new buyer (the company)
    INSERT INTO public.remarketing_buyers (
      company_name,
      buyer_type,
      buyer_type_source,
      buyer_type_needs_review,
      is_pe_backed,
      thesis_summary,
      target_industries,
      target_geographies,
      company_website,
      buyer_linkedin,
      target_revenue_min,
      target_revenue_max,
      email_domain,
      extraction_sources,
      data_last_updated
    ) VALUES (
      v_company_name,
      v_buyer_type,
      CASE WHEN v_buyer_type IS NOT NULL THEN 'signup' ELSE NULL END,
      CASE WHEN v_buyer_type IS NULL THEN true ELSE false END,
      v_is_pe_backed,
      v_thesis,
      v_industries,
      v_geographies,
      v_website,
      v_linkedin,
      v_rev_min,
      v_rev_max,
      v_email_domain,
      jsonb_build_array(jsonb_build_object(
        'type', 'marketplace_signup',
        'profile_id', NEW.id,
        'priority', 80,
        'extracted_at', now()::text
      )),
      now()
    )
    RETURNING id INTO v_buyer_id;
  END IF;

  -- ── STEP 2: Link profile → buyer ───────────────────────────────────

  IF v_buyer_id IS NOT NULL THEN
    UPDATE public.profiles
    SET remarketing_buyer_id = v_buyer_id
    WHERE id = NEW.id
      AND remarketing_buyer_id IS NULL;
  END IF;

  -- ── STEP 3: Find or create the contact (person) ────────────────────

  -- Check if a contact already exists for this email
  IF NEW.email IS NOT NULL THEN
    SELECT id INTO v_contact_id
    FROM public.contacts
    WHERE lower(email) = lower(NEW.email)
      AND contact_type = 'buyer'
      AND archived = false
    LIMIT 1;
  END IF;

  IF v_contact_id IS NOT NULL THEN
    -- Update existing contact with profile link and buyer link
    UPDATE public.contacts
    SET
      profile_id = COALESCE(profile_id, NEW.id),
      remarketing_buyer_id = COALESCE(remarketing_buyer_id, v_buyer_id),
      first_name = COALESCE(NULLIF(first_name, 'Unknown'), NULLIF(TRIM(NEW.first_name), ''), first_name),
      last_name = COALESCE(NULLIF(last_name, ''), NULLIF(TRIM(NEW.last_name), ''), last_name),
      phone = COALESCE(phone, NULLIF(TRIM(NEW.phone_number), '')),
      linkedin_url = COALESCE(linkedin_url, NULLIF(TRIM(NEW.linkedin_profile), '')),
      title = COALESCE(title, NULLIF(TRIM(NEW.job_title), '')),
      company_name = COALESCE(NULLIF(company_name, ''), v_company_name),
      updated_at = now()
    WHERE id = v_contact_id;
  ELSE
    -- Create new contact for this person
    INSERT INTO public.contacts (
      first_name, last_name, email, phone, linkedin_url, title,
      company_name, contact_type, profile_id, remarketing_buyer_id,
      source, created_at
    ) VALUES (
      COALESCE(NULLIF(TRIM(NEW.first_name), ''), 'Unknown'),
      COALESCE(NULLIF(TRIM(NEW.last_name), ''), ''),
      lower(TRIM(NEW.email)),
      NULLIF(TRIM(NEW.phone_number), ''),
      NULLIF(TRIM(NEW.linkedin_profile), ''),
      NULLIF(TRIM(NEW.job_title), ''),
      v_company_name,
      'buyer',
      NEW.id,
      v_buyer_id,
      'marketplace_signup',
      now()
    )
    ON CONFLICT (lower(email)) WHERE contact_type = 'buyer' AND email IS NOT NULL AND archived = false
    DO UPDATE SET
      profile_id = COALESCE(contacts.profile_id, EXCLUDED.profile_id),
      remarketing_buyer_id = COALESCE(contacts.remarketing_buyer_id, EXCLUDED.remarketing_buyer_id),
      company_name = COALESCE(NULLIF(contacts.company_name, ''), EXCLUDED.company_name),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================================
-- PHASE 2: REPLACE TRIGGERS
-- ============================================================================
-- Drop the old trigger that only fired on UPDATE
DROP TRIGGER IF EXISTS trg_sync_marketplace_buyer_on_approval ON public.profiles;

-- Drop the old function
DROP FUNCTION IF EXISTS public.sync_marketplace_buyer_on_approval();

-- Create new trigger that fires on both INSERT and UPDATE
CREATE TRIGGER trg_sync_marketplace_buyer_on_signup
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_marketplace_buyer_on_signup();


-- ============================================================================
-- PHASE 3: BACKFILL EXISTING PROFILES
-- ============================================================================
-- For existing profiles that don't have a remarketing_buyer_id yet:
-- 1. Find or create a buyer (company) for them
-- 2. Find or create a contact (person) for them
-- 3. Link profiles.remarketing_buyer_id

-- Step 3a: Create remarketing_buyers for profiles without one
-- (Only for profiles with a company name and no existing buyer match)
-- DISTINCT ON prevents duplicate buyers when multiple profiles share a company name
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
  extraction_sources,
  data_last_updated
)
SELECT DISTINCT ON (lower(trim(COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.company), '')))))
  COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.company), '')) AS company_name,
  CASE
    WHEN p.buyer_type ILIKE '%privateequity%' OR p.buyer_type ILIKE '%private equity%' OR p.buyer_type ILIKE 'pe%' THEN 'private_equity'
    WHEN p.buyer_type ILIKE '%corporate%' OR p.buyer_type ILIKE '%strategic%' THEN 'corporate'
    WHEN p.buyer_type ILIKE '%familyoffice%' OR p.buyer_type ILIKE '%family%office%' THEN 'family_office'
    WHEN p.buyer_type ILIKE '%searchfund%' OR p.buyer_type ILIKE '%search%fund%' THEN 'search_fund'
    WHEN p.buyer_type ILIKE '%independentsponsor%' OR p.buyer_type ILIKE '%independent%sponsor%' THEN 'independent_sponsor'
    WHEN p.buyer_type ILIKE '%individual%' THEN 'individual_buyer'
    ELSE NULL
  END AS buyer_type,
  'signup' AS buyer_type_source,
  false AS buyer_type_needs_review,
  COALESCE(NULLIF(TRIM(p.ideal_target_description), ''), NULLIF(TRIM(p.mandate_blurb), '')) AS thesis_summary,
  CASE WHEN p.business_categories IS NOT NULL AND p.business_categories::text != 'null'
         AND jsonb_typeof(p.business_categories::jsonb) = 'array'
    THEN (SELECT ARRAY(SELECT jsonb_array_elements_text(p.business_categories::jsonb)))
    ELSE NULL
  END AS target_industries,
  CASE WHEN p.target_locations IS NOT NULL AND p.target_locations::text != 'null'
         AND jsonb_typeof(p.target_locations::jsonb) = 'array'
    THEN (SELECT ARRAY(SELECT jsonb_array_elements_text(p.target_locations::jsonb)))
    ELSE NULL
  END AS target_geographies,
  NULLIF(TRIM(p.website), '') AS company_website,
  NULLIF(TRIM(p.linkedin_profile), '') AS buyer_linkedin,
  p.target_deal_size_min,
  p.target_deal_size_max,
  CASE WHEN p.email LIKE '%@%' THEN lower(split_part(p.email, '@', 2)) ELSE NULL END AS email_domain,
  jsonb_build_array(jsonb_build_object(
    'type', 'backfill_signup_trigger',
    'profile_id', p.id,
    'priority', 80,
    'extracted_at', now()::text
  ))::jsonb AS extraction_sources,
  now() AS data_last_updated
FROM public.profiles p
WHERE p.remarketing_buyer_id IS NULL
  AND p.deleted_at IS NULL
  AND COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.company), '')) IS NOT NULL
  -- Only for profiles without an existing buyer match
  AND NOT EXISTS (
    SELECT 1 FROM public.remarketing_buyers rb
    WHERE rb.archived = false
      AND (
        (rb.company_website IS NOT NULL AND p.website IS NOT NULL
         AND rb.company_website != '' AND p.website != ''
         AND extract_domain(rb.company_website) = extract_domain(p.website))
        OR lower(trim(rb.company_name)) = lower(trim(COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.company), ''))))
      )
  )
ORDER BY lower(trim(COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.company), '')))), p.created_at DESC
ON CONFLICT DO NOTHING;


-- Step 3b: Link profiles to existing buyers (by website domain or company name)
UPDATE public.profiles p
SET remarketing_buyer_id = rb.id
FROM public.remarketing_buyers rb
WHERE p.remarketing_buyer_id IS NULL
  AND p.deleted_at IS NULL
  AND rb.archived = false
  AND (
    -- Match by website domain
    (p.website IS NOT NULL AND p.website != ''
     AND rb.company_website IS NOT NULL AND rb.company_website != ''
     AND extract_domain(p.website) = extract_domain(rb.company_website))
    OR
    -- Match by company name
    lower(trim(COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.company), '')))) = lower(trim(rb.company_name))
  );


-- Step 3c: Create contacts for profiles that don't have one yet
INSERT INTO public.contacts (
  first_name, last_name, email, phone, linkedin_url, title,
  company_name, contact_type, profile_id, remarketing_buyer_id,
  source, created_at
)
SELECT
  COALESCE(NULLIF(TRIM(p.first_name), ''), 'Unknown'),
  COALESCE(NULLIF(TRIM(p.last_name), ''), ''),
  lower(TRIM(p.email)),
  NULLIF(TRIM(p.phone_number), ''),
  NULLIF(TRIM(p.linkedin_profile), ''),
  NULLIF(TRIM(p.job_title), ''),
  COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.company), ''), ''),
  'buyer',
  p.id,
  p.remarketing_buyer_id,
  'backfill_signup_trigger',
  p.created_at
FROM public.profiles p
WHERE p.deleted_at IS NULL
  AND p.email IS NOT NULL
  -- Only for profiles without an existing contact
  AND NOT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.profile_id = p.id
      AND c.archived = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE lower(c.email) = lower(TRIM(p.email))
      AND c.contact_type = 'buyer'
      AND c.archived = false
  )
ON CONFLICT (lower(email)) WHERE contact_type = 'buyer' AND email IS NOT NULL AND archived = false
DO UPDATE SET
  profile_id = COALESCE(contacts.profile_id, EXCLUDED.profile_id),
  remarketing_buyer_id = COALESCE(contacts.remarketing_buyer_id, EXCLUDED.remarketing_buyer_id),
  updated_at = now();


-- Step 3d: Link contacts to buyers where contact has profile but no buyer link
UPDATE public.contacts c
SET remarketing_buyer_id = p.remarketing_buyer_id
FROM public.profiles p
WHERE c.profile_id = p.id
  AND c.remarketing_buyer_id IS NULL
  AND p.remarketing_buyer_id IS NOT NULL
  AND c.archived = false;


-- ============================================================================
-- Summary:
--   Phase 1: New trigger function sync_marketplace_buyer_on_signup()
--            Fires on INSERT + UPDATE, creates buyer + contact + links
--   Phase 2: Replaced old approval-only trigger with signup trigger
--   Phase 3: Backfilled buyers, contacts, and links for existing profiles
-- ============================================================================
