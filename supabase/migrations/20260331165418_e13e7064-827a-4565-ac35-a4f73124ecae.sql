CREATE OR REPLACE FUNCTION public.sync_marketplace_buyer_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_is_generic_domain BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (NEW.approval_status = 'approved'
            AND (OLD.approval_status IS DISTINCT FROM 'approved')) THEN
      RETURN NEW;
    END IF;
    IF NEW.remarketing_buyer_id IS NOT NULL THEN
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
    RAISE NOTICE 'Skipping buyer sync for profile % — no company name', NEW.id;
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

  v_thesis := COALESCE(
    NULLIF(TRIM(NEW.ideal_target_description), ''),
    NULLIF(TRIM(NEW.mandate_blurb), ''),
    NULLIF(TRIM(NEW.bio), '')
  );

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

  -- Check if generic email domain
  v_is_generic_domain := v_email_domain IN (
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.au',
    'hotmail.com', 'hotmail.se', 'outlook.com', 'aol.com',
    'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com',
    'mail.com', 'zoho.com', 'yandex.com', 'gmx.com', 'gmx.net',
    'inbox.com', 'rocketmail.com', 'ymail.com',
    'protonmail.com', 'proton.me', 'pm.me', 'fastmail.com',
    'tutanota.com', 'hey.com',
    'comcast.net', 'att.net', 'sbcglobal.net', 'verizon.net',
    'cox.net', 'charter.net', 'earthlink.net', 'optonline.net',
    'frontier.com', 'windstream.net', 'mediacombb.net', 'bellsouth.net'
  );

  -- STEP 1: Find or create the buyer (company)

  IF v_website IS NOT NULL THEN
    SELECT id INTO v_buyer_id
    FROM public.remarketing_buyers
    WHERE archived = false
      AND company_website IS NOT NULL
      AND extract_domain(company_website) = extract_domain(v_website)
    LIMIT 1;
  END IF;

  IF v_buyer_id IS NULL THEN
    SELECT id INTO v_buyer_id
    FROM public.remarketing_buyers
    WHERE archived = false
      AND lower(trim(company_name)) = lower(trim(v_company_name))
    LIMIT 1;
  END IF;

  -- Fall back to email domain match (skip for generic domains)
  IF v_buyer_id IS NULL AND v_email_domain IS NOT NULL AND NOT v_is_generic_domain THEN
    SELECT id INTO v_buyer_id
    FROM public.remarketing_buyers
    WHERE archived = false
      AND email_domain = v_email_domain
    LIMIT 1;
  END IF;

  IF v_buyer_id IS NOT NULL THEN
    UPDATE public.remarketing_buyers
    SET
      buyer_type = COALESCE(buyer_type, v_buyer_type),
      buyer_type_source = COALESCE(buyer_type_source, 'signup'),
      buyer_type_needs_review = CASE
        WHEN buyer_type IS NULL AND v_buyer_type IS NULL THEN true
        ELSE buyer_type_needs_review
      END,
      is_pe_backed = CASE WHEN v_is_pe_backed THEN true ELSE is_pe_backed END,
      thesis_summary = COALESCE(thesis_summary, v_thesis),
      target_industries = CASE WHEN target_industries IS NULL OR array_length(target_industries, 1) IS NULL
                          THEN v_industries ELSE target_industries END,
      target_geographies = CASE WHEN target_geographies IS NULL OR array_length(target_geographies, 1) IS NULL
                           THEN v_geographies ELSE target_geographies END,
      company_website = COALESCE(company_website, v_website),
      buyer_linkedin = COALESCE(buyer_linkedin, v_linkedin),
      target_revenue_min = COALESCE(target_revenue_min, v_rev_min),
      target_revenue_max = COALESCE(target_revenue_max, v_rev_max),
      email_domain = COALESCE(email_domain, CASE WHEN v_is_generic_domain THEN NULL ELSE v_email_domain END),
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
    -- INSERT new buyer with exception handler for unique violations
    BEGIN
      INSERT INTO public.remarketing_buyers (
        company_name, buyer_type, buyer_type_source, buyer_type_needs_review,
        is_pe_backed, thesis_summary, target_industries, target_geographies,
        company_website, buyer_linkedin, target_revenue_min, target_revenue_max,
        email_domain, extraction_sources, data_last_updated
      ) VALUES (
        v_company_name, v_buyer_type,
        CASE WHEN v_buyer_type IS NOT NULL THEN 'signup' ELSE NULL END,
        CASE WHEN v_buyer_type IS NULL THEN true ELSE false END,
        v_is_pe_backed, v_thesis, v_industries, v_geographies,
        v_website, v_linkedin, v_rev_min, v_rev_max,
        CASE WHEN v_is_generic_domain THEN NULL ELSE v_email_domain END,
        jsonb_build_array(jsonb_build_object(
          'type', 'marketplace_signup',
          'profile_id', NEW.id,
          'priority', 80,
          'extracted_at', now()::text
        )),
        now()
      )
      RETURNING id INTO v_buyer_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_buyer_id
      FROM public.remarketing_buyers
      WHERE archived = false
        AND (
          (v_email_domain IS NOT NULL AND NOT v_is_generic_domain AND email_domain = v_email_domain)
          OR lower(trim(company_name)) = lower(trim(v_company_name))
        )
      LIMIT 1;

      IF v_buyer_id IS NULL THEN
        RAISE NOTICE 'sync_marketplace_buyer_on_signup: unique_violation but no match found for profile %, skipping', NEW.id;
        RETURN NEW;
      END IF;
    END;
  END IF;

  -- STEP 2: Link profile → buyer
  IF v_buyer_id IS NOT NULL THEN
    UPDATE public.profiles
    SET remarketing_buyer_id = v_buyer_id
    WHERE id = NEW.id
      AND remarketing_buyer_id IS NULL;
  END IF;

  -- STEP 3: Find or create the contact (person)
  IF NEW.email IS NOT NULL THEN
    SELECT id INTO v_contact_id
    FROM public.contacts
    WHERE lower(email) = lower(NEW.email)
      AND contact_type = 'buyer'
      AND archived = false
    LIMIT 1;
  END IF;

  IF v_contact_id IS NOT NULL THEN
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