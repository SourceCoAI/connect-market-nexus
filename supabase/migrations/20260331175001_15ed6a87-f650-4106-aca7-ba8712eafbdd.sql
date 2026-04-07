-- 1. Recreate generic_email_domains table if missing
CREATE TABLE IF NOT EXISTS public.generic_email_domains (
  domain TEXT PRIMARY KEY
);

-- 2. Seed common generic domains (idempotent)
INSERT INTO public.generic_email_domains (domain) VALUES
  ('gmail.com'),('googlemail.com'),('yahoo.com'),('yahoo.com.au'),
  ('hotmail.com'),('hotmail.se'),('outlook.com'),('aol.com'),
  ('icloud.com'),('me.com'),('mac.com'),('live.com'),('msn.com'),
  ('mail.com'),('zoho.com'),('yandex.com'),('gmx.com'),('gmx.net'),
  ('inbox.com'),('rocketmail.com'),('ymail.com'),
  ('protonmail.com'),('proton.me'),('pm.me'),('fastmail.com'),
  ('tutanota.com'),('hey.com'),
  ('comcast.net'),('att.net'),('sbcglobal.net'),('verizon.net'),
  ('cox.net'),('charter.net'),('earthlink.net'),('optonline.net'),
  ('frontier.com'),('windstream.net'),('mediacombb.net'),('bellsouth.net'),
  ('webxio.pro'),('leabro.com'),('coursora.com')
ON CONFLICT (domain) DO NOTHING;

-- 3. Enable RLS
ALTER TABLE public.generic_email_domains ENABLE ROW LEVEL SECURITY;

-- 4. Read-only policy for all
DROP POLICY IF EXISTS "Allow read access to generic_email_domains" ON public.generic_email_domains;
CREATE POLICY "Allow read access to generic_email_domains"
  ON public.generic_email_domains FOR SELECT
  USING (true);

-- 5. Grant read access
GRANT SELECT ON public.generic_email_domains TO authenticated, anon;

-- 6. Recreate check_agreement_coverage with hardened generic-domain fallback
CREATE OR REPLACE FUNCTION public.check_agreement_coverage(
  p_email TEXT,
  p_agreement_type TEXT DEFAULT 'nda'
)
RETURNS TABLE(
  is_covered BOOLEAN,
  coverage_source TEXT,
  firm_id UUID,
  firm_name TEXT,
  agreement_status TEXT,
  signed_by_name TEXT,
  signed_at TIMESTAMPTZ,
  parent_firm_name TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

  IF v_is_generic THEN
    RETURN QUERY SELECT false, 'not_covered'::TEXT, NULL::UUID, NULL::TEXT,
      'not_started'::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Direct domain lookup
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

  -- PE firm parent lookup
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

  -- Firm member lookup
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