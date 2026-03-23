-- ============================================================================
-- MIGRATION: Add upsert_buyer_contact RPC function
-- ============================================================================
-- Problem: The frontend "Add Contact" mutation uses a plain INSERT which fails
-- when unique constraints are violated (duplicate email or duplicate name+buyer).
-- The mirror trigger already handles ON CONFLICT but the direct insert path doesn't.
--
-- This function mirrors the deduplication logic from mirror_rbc_to_contacts,
-- allowing the frontend to safely add or update buyer contacts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_buyer_contact(
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_linkedin_url TEXT DEFAULT NULL,
  p_is_primary_at_firm BOOLEAN DEFAULT false,
  p_remarketing_buyer_id UUID DEFAULT NULL,
  p_firm_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'remarketing_manual'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := NULLIF(TRIM(lower(p_email)), '');
  v_contact_id UUID;
BEGIN
  IF v_email IS NOT NULL THEN
    -- Has email → upsert by email
    INSERT INTO public.contacts
      (first_name, last_name, email, phone, title, linkedin_url,
       is_primary_at_firm, contact_type, remarketing_buyer_id, firm_id, source)
    VALUES
      (p_first_name, p_last_name, v_email,
       NULLIF(TRIM(p_phone), ''),
       NULLIF(TRIM(p_title), ''),
       NULLIF(TRIM(p_linkedin_url), ''),
       p_is_primary_at_firm, 'buyer', p_remarketing_buyer_id, p_firm_id, p_source)
    ON CONFLICT (lower(email))
      WHERE contact_type = 'buyer' AND email IS NOT NULL AND archived = false
    DO UPDATE SET
      first_name           = EXCLUDED.first_name,
      last_name            = EXCLUDED.last_name,
      remarketing_buyer_id = COALESCE(contacts.remarketing_buyer_id, EXCLUDED.remarketing_buyer_id),
      firm_id              = COALESCE(contacts.firm_id, EXCLUDED.firm_id),
      is_primary_at_firm   = contacts.is_primary_at_firm OR EXCLUDED.is_primary_at_firm,
      phone                = COALESCE(EXCLUDED.phone, contacts.phone),
      linkedin_url         = COALESCE(EXCLUDED.linkedin_url, contacts.linkedin_url),
      title                = COALESCE(EXCLUDED.title, contacts.title),
      updated_at           = now()
    RETURNING id INTO v_contact_id;

  ELSIF p_remarketing_buyer_id IS NOT NULL THEN
    -- No email, has buyer → upsert by (name, remarketing_buyer_id)
    INSERT INTO public.contacts
      (first_name, last_name, email, phone, title, linkedin_url,
       is_primary_at_firm, contact_type, remarketing_buyer_id, firm_id, source)
    VALUES
      (p_first_name, p_last_name, NULL,
       NULLIF(TRIM(p_phone), ''),
       NULLIF(TRIM(p_title), ''),
       NULLIF(TRIM(p_linkedin_url), ''),
       p_is_primary_at_firm, 'buyer', p_remarketing_buyer_id, p_firm_id, p_source)
    ON CONFLICT (lower(trim(first_name)), lower(trim(last_name)), remarketing_buyer_id)
      WHERE contact_type = 'buyer' AND email IS NULL
        AND remarketing_buyer_id IS NOT NULL AND archived = false
    DO UPDATE SET
      firm_id            = COALESCE(contacts.firm_id, EXCLUDED.firm_id),
      is_primary_at_firm = contacts.is_primary_at_firm OR EXCLUDED.is_primary_at_firm,
      phone              = COALESCE(EXCLUDED.phone, contacts.phone),
      linkedin_url       = COALESCE(EXCLUDED.linkedin_url, contacts.linkedin_url),
      title              = COALESCE(EXCLUDED.title, contacts.title),
      updated_at         = now()
    RETURNING id INTO v_contact_id;

  ELSE
    -- No email, no buyer → upsert by name only
    INSERT INTO public.contacts
      (first_name, last_name, email, phone, title, linkedin_url,
       is_primary_at_firm, contact_type, remarketing_buyer_id, firm_id, source)
    VALUES
      (p_first_name, p_last_name, NULL,
       NULLIF(TRIM(p_phone), ''),
       NULLIF(TRIM(p_title), ''),
       NULLIF(TRIM(p_linkedin_url), ''),
       p_is_primary_at_firm, 'buyer', NULL, p_firm_id, p_source)
    ON CONFLICT (lower(trim(first_name)), lower(trim(last_name)))
      WHERE contact_type = 'buyer' AND email IS NULL
        AND remarketing_buyer_id IS NULL AND archived = false
    DO UPDATE SET
      firm_id            = COALESCE(contacts.firm_id, EXCLUDED.firm_id),
      is_primary_at_firm = contacts.is_primary_at_firm OR EXCLUDED.is_primary_at_firm,
      phone              = COALESCE(EXCLUDED.phone, contacts.phone),
      linkedin_url       = COALESCE(EXCLUDED.linkedin_url, contacts.linkedin_url),
      title              = COALESCE(EXCLUDED.title, contacts.title),
      updated_at         = now()
    RETURNING id INTO v_contact_id;
  END IF;

  RETURN v_contact_id;
END;
$$;


-- ============================================================================
-- Also create update_buyer_contact for editing existing contacts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_buyer_contact(
  p_contact_id UUID,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_linkedin_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contacts
  SET
    first_name   = COALESCE(NULLIF(TRIM(p_first_name), ''), first_name),
    last_name    = COALESCE(p_last_name, last_name),
    email        = CASE WHEN p_email IS NOT NULL THEN NULLIF(TRIM(lower(p_email)), '') ELSE email END,
    phone        = CASE WHEN p_phone IS NOT NULL THEN NULLIF(TRIM(p_phone), '') ELSE phone END,
    title        = CASE WHEN p_title IS NOT NULL THEN NULLIF(TRIM(p_title), '') ELSE title END,
    linkedin_url = CASE WHEN p_linkedin_url IS NOT NULL THEN NULLIF(TRIM(p_linkedin_url), '') ELSE linkedin_url END,
    updated_at   = now()
  WHERE id = p_contact_id
    AND archived = false;

  RETURN p_contact_id;
END;
$$;
