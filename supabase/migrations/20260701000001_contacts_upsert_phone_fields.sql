-- ============================================================================
-- MIGRATION: Update contacts_upsert RPC for structured phone fields
-- ============================================================================
-- Extends contacts_upsert() to handle mobile_phone_1/2/3, office_phone,
-- and phone_source fields. The legacy `phone` column is still written for
-- backward compatibility but new callers should use the structured fields.
-- ============================================================================

-- Update resolve_contact_identity to also check mobile_phone_1
CREATE OR REPLACE FUNCTION public.resolve_contact_identity(
  p_email         TEXT DEFAULT NULL,
  p_linkedin_url  TEXT DEFAULT NULL,
  p_phone         TEXT DEFAULT NULL,
  p_firm_id       UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  -- 1. email match (strongest key for buyers)
  IF p_email IS NOT NULL AND trim(p_email) <> '' THEN
    SELECT id INTO v_contact_id
    FROM public.contacts
    WHERE lower(email) = lower(trim(p_email))
      AND deleted_at IS NULL
      AND merged_into_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_contact_id IS NOT NULL THEN
      RETURN v_contact_id;
    END IF;
  END IF;

  -- 2. linkedin_url match (strong for PE / strategic contacts)
  IF p_linkedin_url IS NOT NULL AND trim(p_linkedin_url) <> '' THEN
    SELECT id INTO v_contact_id
    FROM public.contacts
    WHERE lower(linkedin_url) = lower(trim(p_linkedin_url))
      AND deleted_at IS NULL
      AND merged_into_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_contact_id IS NOT NULL THEN
      RETURN v_contact_id;
    END IF;
  END IF;

  -- 3. phone + firm_id tuple (weakest — only resolves within a firm scope)
  --    Check both legacy phone and mobile_phone_1
  IF p_phone IS NOT NULL AND trim(p_phone) <> '' AND p_firm_id IS NOT NULL THEN
    SELECT id INTO v_contact_id
    FROM public.contacts
    WHERE (lower(phone) = lower(trim(p_phone))
           OR lower(mobile_phone_1) = lower(trim(p_phone)))
      AND firm_id = p_firm_id
      AND deleted_at IS NULL
      AND merged_into_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_contact_id IS NOT NULL THEN
      RETURN v_contact_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;


-- Update contacts_upsert to handle structured phone fields
CREATE OR REPLACE FUNCTION public.contacts_upsert(
  p_identity   JSONB,
  p_fields     JSONB,
  p_source     TEXT DEFAULT 'manual',
  p_enrichment JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_contact_id   UUID;
  v_existing     public.contacts%ROWTYPE;
  v_new_row      public.contacts%ROWTYPE;
  v_event_type   TEXT;
  v_is_insert    BOOLEAN;
  v_old_json     JSONB;
  v_new_json     JSONB;
  v_changed      TEXT[];
BEGIN
  -- 1. Identity resolution --------------------------------------------------
  v_contact_id := public.resolve_contact_identity(
    (p_identity->>'email')::TEXT,
    (p_identity->>'linkedin_url')::TEXT,
    (p_identity->>'phone')::TEXT,
    NULLIF((p_identity->>'firm_id')::TEXT, '')::UUID
  );

  v_is_insert := v_contact_id IS NULL;

  -- Fallback: use fields if identity was empty
  IF v_is_insert AND (p_fields ? 'email' OR p_fields ? 'linkedin_url') THEN
    v_contact_id := public.resolve_contact_identity(
      (p_fields->>'email')::TEXT,
      (p_fields->>'linkedin_url')::TEXT,
      (p_fields->>'phone')::TEXT,
      NULLIF((p_fields->>'firm_id')::TEXT, '')::UUID
    );
    v_is_insert := v_contact_id IS NULL;
  END IF;

  -- 2. Load existing row (for UPDATE branch and old_values snapshot) --------
  IF NOT v_is_insert THEN
    SELECT * INTO v_existing FROM public.contacts WHERE id = v_contact_id;
    v_old_json := to_jsonb(v_existing);
  END IF;

  -- 3. Branch: INSERT or UPDATE --------------------------------------------
  IF v_is_insert THEN
    -- Require at minimum a first_name and one of email/linkedin_url
    IF COALESCE(p_fields->>'first_name', '') = '' THEN
      RAISE EXCEPTION 'contacts_upsert: first_name is required for new contacts';
    END IF;

    IF COALESCE(p_fields->>'email', '') = ''
       AND COALESCE(p_fields->>'linkedin_url', '') = '' THEN
      RAISE EXCEPTION 'contacts_upsert: new contacts require at least one of email or linkedin_url';
    END IF;

    INSERT INTO public.contacts (
      first_name, last_name, email, phone, linkedin_url, title,
      mobile_phone_1, mobile_phone_2, mobile_phone_3, office_phone, phone_source,
      contact_type, firm_id, remarketing_buyer_id, profile_id, listing_id,
      is_primary_at_firm, is_primary_seller_contact,
      nda_signed, nda_signed_at, fee_agreement_signed, fee_agreement_signed_at,
      confidence, last_enriched_at, last_enrichment_source,
      role_category, priority_level,
      source, notes
    ) VALUES (
      COALESCE(p_fields->>'first_name', 'Unknown'),
      COALESCE(p_fields->>'last_name', ''),
      NULLIF(lower(trim(p_fields->>'email')), ''),
      NULLIF(trim(p_fields->>'phone'), ''),
      NULLIF(trim(p_fields->>'linkedin_url'), ''),
      NULLIF(trim(p_fields->>'title'), ''),
      NULLIF(trim(COALESCE(p_fields->>'mobile_phone_1', p_fields->>'phone')), ''),
      NULLIF(trim(p_fields->>'mobile_phone_2'), ''),
      NULLIF(trim(p_fields->>'mobile_phone_3'), ''),
      NULLIF(trim(p_fields->>'office_phone'), ''),
      COALESCE(NULLIF(p_fields->>'phone_source', ''), p_source),
      COALESCE(p_fields->>'contact_type', 'buyer'),
      NULLIF(p_fields->>'firm_id', '')::UUID,
      NULLIF(p_fields->>'remarketing_buyer_id', '')::UUID,
      NULLIF(p_fields->>'profile_id', '')::UUID,
      NULLIF(p_fields->>'listing_id', '')::UUID,
      COALESCE((p_fields->>'is_primary_at_firm')::BOOLEAN, false),
      COALESCE((p_fields->>'is_primary_seller_contact')::BOOLEAN, false),
      COALESCE((p_fields->>'nda_signed')::BOOLEAN, false),
      (p_fields->>'nda_signed_at')::TIMESTAMPTZ,
      COALESCE((p_fields->>'fee_agreement_signed')::BOOLEAN, false),
      (p_fields->>'fee_agreement_signed_at')::TIMESTAMPTZ,
      CASE
        WHEN p_enrichment IS NOT NULL THEN COALESCE(p_enrichment->>'confidence', 'unverified')
        ELSE COALESCE(p_fields->>'confidence', 'unverified')
      END,
      CASE WHEN p_enrichment IS NOT NULL THEN now() ELSE NULL END,
      CASE WHEN p_enrichment IS NOT NULL THEN p_enrichment->>'provider' ELSE NULL END,
      NULLIF(p_fields->>'role_category', ''),
      NULLIF((p_fields->>'priority_level')::SMALLINT, 0),
      p_source,
      NULLIF(p_fields->>'notes', '')
    )
    RETURNING id INTO v_contact_id;

    v_event_type := CASE WHEN p_enrichment IS NOT NULL THEN 'enrichment' ELSE 'create' END;

  ELSE
    -- UPDATE branch — COALESCE keeps existing values when p_fields doesn't
    -- provide a new one. Enrichment writes also stamp the freshness columns.
    UPDATE public.contacts
    SET
      first_name   = COALESCE(NULLIF(p_fields->>'first_name', ''),   first_name),
      last_name    = COALESCE(NULLIF(p_fields->>'last_name', ''),    last_name),
      email        = COALESCE(NULLIF(lower(trim(p_fields->>'email')), ''), email),
      phone        = COALESCE(NULLIF(trim(p_fields->>'phone'), ''),  phone),
      linkedin_url = COALESCE(NULLIF(trim(p_fields->>'linkedin_url'), ''), linkedin_url),
      title        = COALESCE(NULLIF(trim(p_fields->>'title'), ''),  title),
      mobile_phone_1 = COALESCE(NULLIF(trim(p_fields->>'mobile_phone_1'), ''), mobile_phone_1),
      mobile_phone_2 = COALESCE(NULLIF(trim(p_fields->>'mobile_phone_2'), ''), mobile_phone_2),
      mobile_phone_3 = COALESCE(NULLIF(trim(p_fields->>'mobile_phone_3'), ''), mobile_phone_3),
      office_phone   = COALESCE(NULLIF(trim(p_fields->>'office_phone'), ''),   office_phone),
      phone_source   = COALESCE(NULLIF(p_fields->>'phone_source', ''),         phone_source),
      firm_id      = COALESCE(NULLIF(p_fields->>'firm_id', '')::UUID, firm_id),
      remarketing_buyer_id = COALESCE(NULLIF(p_fields->>'remarketing_buyer_id', '')::UUID, remarketing_buyer_id),
      profile_id   = COALESCE(NULLIF(p_fields->>'profile_id', '')::UUID, profile_id),
      listing_id   = COALESCE(NULLIF(p_fields->>'listing_id', '')::UUID, listing_id),
      contact_type = COALESCE(NULLIF(p_fields->>'contact_type', ''), contact_type),
      role_category   = COALESCE(NULLIF(p_fields->>'role_category', ''), role_category),
      priority_level  = COALESCE(NULLIF((p_fields->>'priority_level')::SMALLINT, 0), priority_level),
      notes        = COALESCE(NULLIF(p_fields->>'notes', ''), notes),
      confidence   = CASE
        WHEN p_enrichment IS NOT NULL THEN COALESCE(p_enrichment->>'confidence', confidence)
        ELSE confidence
      END,
      last_enriched_at = CASE
        WHEN p_enrichment IS NOT NULL THEN now()
        ELSE last_enriched_at
      END,
      last_enrichment_source = CASE
        WHEN p_enrichment IS NOT NULL THEN p_enrichment->>'provider'
        ELSE last_enrichment_source
      END,
      updated_at = now()
    WHERE id = v_contact_id;

    v_event_type := CASE WHEN p_enrichment IS NOT NULL THEN 'enrichment' ELSE 'update' END;
  END IF;

  -- 4. Load the post-write row for new_values snapshot ---------------------
  SELECT * INTO v_new_row FROM public.contacts WHERE id = v_contact_id;
  v_new_json := to_jsonb(v_new_row);

  -- 5. Compute changed fields for history ---------------------------------
  IF v_old_json IS NOT NULL THEN
    SELECT array_agg(key)
    INTO v_changed
    FROM jsonb_object_keys(v_new_json) AS key
    WHERE v_old_json->key IS DISTINCT FROM v_new_json->key;
  END IF;

  -- 6. Append history row --------------------------------------------------
  INSERT INTO public.contact_events (
    contact_id,
    event_type,
    provider,
    confidence,
    source_query,
    old_values,
    new_values,
    changed_fields,
    performed_by,
    performed_at
  )
  VALUES (
    v_contact_id,
    v_event_type,
    COALESCE(p_enrichment->>'provider', p_source),
    p_enrichment->>'confidence',
    p_enrichment->>'source_query',
    v_old_json,
    v_new_json,
    v_changed,
    auth.uid(),
    now()
  );

  RETURN v_contact_id;
END;
$$;

COMMENT ON FUNCTION public.contacts_upsert(JSONB, JSONB, TEXT, JSONB) IS
  'Single write entry point for public.contacts. Resolves identity via '
  'resolve_contact_identity(), performs INSERT or UPDATE, and appends a '
  'history row to contact_events atomically. Supports structured phone '
  'fields: mobile_phone_1/2/3, office_phone, phone_source.';
