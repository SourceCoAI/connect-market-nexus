CREATE OR REPLACE FUNCTION public.check_agreement_coverage(p_email text, p_agreement_type text DEFAULT 'nda'::text)
 RETURNS TABLE(is_covered boolean, coverage_source text, firm_id uuid, firm_name text, agreement_status text, signed_by_name text, signed_at timestamp with time zone, parent_firm_name text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_domain TEXT;
  v_is_generic BOOLEAN := false;
  v_firm_id UUID;
  v_parent_buyer_id UUID;
  v_parent_firm_id UUID;
  v_table_exists BOOLEAN;
BEGIN
  v_domain := lower(split_part(p_email, '@', 2));

  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN QUERY SELECT false, 'not_covered'::TEXT, NULL::UUID, NULL::TEXT,
      'not_started'::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Check generic domain blocklist with fallback if table missing
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'generic_email_domains'
  ) INTO v_table_exists;

  IF v_table_exists THEN
    SELECT EXISTS (
      SELECT 1 FROM public.generic_email_domains WHERE generic_email_domains.domain = v_domain
    ) INTO v_is_generic;
  ELSE
    v_is_generic := v_domain = ANY(ARRAY[
      'gmail.com','googlemail.com','yahoo.com','hotmail.com','outlook.com',
      'aol.com','icloud.com','me.com','mac.com','live.com','msn.com',
      'mail.com','zoho.com','yandex.com','gmx.com','gmx.net',
      'protonmail.com','proton.me','pm.me','fastmail.com','tutanota.com','hey.com',
      'comcast.net','att.net','sbcglobal.net','verizon.net','cox.net',
      'charter.net','earthlink.net','bellsouth.net'
    ]);
  END IF;

  -- For NON-generic domains: try direct domain lookup
  IF NOT v_is_generic THEN
    IF p_agreement_type = 'nda' THEN
      RETURN QUERY
      SELECT
        fa.nda_status = 'signed' AND (fa.nda_expires_at IS NULL OR fa.nda_expires_at > now()),
        'direct'::TEXT,
        fa.id,
        fa.primary_company_name,
        fa.nda_status,
        fa.nda_signed_by_name,
        fa.nda_signed_at,
        NULL::TEXT,
        fa.nda_expires_at
      FROM public.firm_agreements fa
      WHERE fa.email_domain = v_domain
         OR fa.website_domain = v_domain
         OR EXISTS (SELECT 1 FROM public.firm_domain_aliases fda WHERE fda.firm_id = fa.id AND fda.domain = v_domain)
      LIMIT 1;
      IF FOUND THEN RETURN; END IF;
    ELSE
      RETURN QUERY
      SELECT
        fa.fee_agreement_status = 'signed' AND (fa.fee_agreement_expires_at IS NULL OR fa.fee_agreement_expires_at > now()),
        'direct'::TEXT,
        fa.id,
        fa.primary_company_name,
        fa.fee_agreement_status,
        fa.fee_agreement_signed_by_name,
        fa.fee_agreement_signed_at,
        NULL::TEXT,
        fa.fee_agreement_expires_at
      FROM public.firm_agreements fa
      WHERE fa.email_domain = v_domain
         OR fa.website_domain = v_domain
         OR EXISTS (SELECT 1 FROM public.firm_domain_aliases fda WHERE fda.firm_id = fa.id AND fda.domain = v_domain)
      LIMIT 1;
      IF FOUND THEN RETURN; END IF;
    END IF;

    -- For NON-generic domains: try PE firm parent lookup
    SELECT rb.pe_firm_id INTO v_parent_buyer_id
    FROM public.remarketing_buyers rb
    WHERE rb.pe_firm_id IS NOT NULL
      AND rb.archived = false
      AND (rb.email_domain = v_domain OR extract_domain(rb.company_website) = v_domain)
    LIMIT 1;

    IF v_parent_buyer_id IS NOT NULL THEN
      IF p_agreement_type = 'nda' THEN
        RETURN QUERY
        SELECT
          fa.nda_status = 'signed' AND (fa.nda_expires_at IS NULL OR fa.nda_expires_at > now()),
          'pe_parent'::TEXT,
          fa.id,
          fa.primary_company_name,
          fa.nda_status,
          fa.nda_signed_by_name,
          fa.nda_signed_at,
          parent_rb.company_name,
          fa.nda_expires_at
        FROM public.remarketing_buyers parent_rb
        LEFT JOIN public.firm_agreements fa ON (
          fa.email_domain = parent_rb.email_domain
          OR fa.website_domain = extract_domain(parent_rb.company_website)
        )
        WHERE parent_rb.id = v_parent_buyer_id
          AND fa.id IS NOT NULL
        LIMIT 1;
        IF FOUND THEN RETURN; END IF;
      ELSE
        RETURN QUERY
        SELECT
          fa.fee_agreement_status = 'signed' AND (fa.fee_agreement_expires_at IS NULL OR fa.fee_agreement_expires_at > now()),
          'pe_parent'::TEXT,
          fa.id,
          fa.primary_company_name,
          fa.fee_agreement_status,
          fa.fee_agreement_signed_by_name,
          fa.fee_agreement_signed_at,
          parent_rb.company_name,
          fa.fee_agreement_expires_at
        FROM public.remarketing_buyers parent_rb
        LEFT JOIN public.firm_agreements fa ON (
          fa.email_domain = parent_rb.email_domain
          OR fa.website_domain = extract_domain(parent_rb.company_website)
        )
        WHERE parent_rb.id = v_parent_buyer_id
          AND fa.id IS NOT NULL
        LIMIT 1;
        IF FOUND THEN RETURN; END IF;
      END IF;
    END IF;
  END IF;

  -- ALWAYS try firm_member lookup (critical for generic domain users like Gmail)
  IF p_agreement_type = 'nda' THEN
    RETURN QUERY
    SELECT
      fa.nda_status = 'signed' AND (fa.nda_expires_at IS NULL OR fa.nda_expires_at > now()),
      'firm_member'::TEXT,
      fa.id,
      fa.primary_company_name,
      fa.nda_status,
      fa.nda_signed_by_name,
      fa.nda_signed_at,
      NULL::TEXT,
      fa.nda_expires_at
    FROM public.firm_members fm
    JOIN public.firm_agreements fa ON fa.id = fm.firm_id
    JOIN public.profiles p ON p.id = fm.user_id
    WHERE p.email = p_email
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  ELSE
    RETURN QUERY
    SELECT
      fa.fee_agreement_status = 'signed' AND (fa.fee_agreement_expires_at IS NULL OR fa.fee_agreement_expires_at > now()),
      'firm_member'::TEXT,
      fa.id,
      fa.primary_company_name,
      fa.fee_agreement_status,
      fa.fee_agreement_signed_by_name,
      fa.fee_agreement_signed_at,
      NULL::TEXT,
      fa.fee_agreement_expires_at
    FROM public.firm_members fm
    JOIN public.firm_agreements fa ON fa.id = fm.firm_id
    JOIN public.profiles p ON p.id = fm.user_id
    WHERE p.email = p_email
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Not covered
  RETURN QUERY SELECT false, 'not_covered'::TEXT, NULL::UUID, NULL::TEXT,
    'not_started'::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT, NULL::TIMESTAMPTZ;
END;
$function$;