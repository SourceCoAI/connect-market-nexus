DROP FUNCTION IF EXISTS public.get_my_agreement_status();

CREATE OR REPLACE FUNCTION public.get_my_agreement_status()
 RETURNS TABLE(
   nda_covered boolean,
   nda_status text,
   nda_coverage_source text,
   nda_firm_name text,
   nda_parent_firm_name text,
   fee_covered boolean,
   fee_status text,
   fee_coverage_source text,
   fee_firm_name text,
   fee_parent_firm_name text,
   firm_id uuid,
   nda_requested_at timestamptz,
   fee_agreement_requested_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_user_email TEXT;
  v_nda RECORD;
  v_fee RECORD;
  v_firm_id UUID;
  v_nda_requested_at TIMESTAMPTZ;
  v_fee_requested_at TIMESTAMPTZ;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF v_user_email IS NULL THEN
    RETURN QUERY SELECT
      false, 'not_started'::TEXT, 'not_covered'::TEXT, NULL::TEXT, NULL::TEXT,
      false, 'not_started'::TEXT, 'not_covered'::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::UUID, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT * INTO v_nda FROM public.check_agreement_coverage(v_user_email, 'nda');
  SELECT * INTO v_fee FROM public.check_agreement_coverage(v_user_email, 'fee_agreement');

  v_firm_id := COALESCE(v_nda.firm_id, v_fee.firm_id);

  IF v_firm_id IS NOT NULL THEN
    SELECT fa.nda_requested_at, fa.fee_agreement_requested_at
    INTO v_nda_requested_at, v_fee_requested_at
    FROM public.firm_agreements fa
    WHERE fa.id = v_firm_id;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_nda.is_covered, false),
    COALESCE(v_nda.agreement_status, 'not_started'),
    COALESCE(v_nda.coverage_source, 'not_covered'),
    v_nda.firm_name,
    v_nda.parent_firm_name,
    COALESCE(v_fee.is_covered, false),
    COALESCE(v_fee.agreement_status, 'not_started'),
    COALESCE(v_fee.coverage_source, 'not_covered'),
    v_fee.firm_name,
    v_fee.parent_firm_name,
    v_firm_id,
    v_nda_requested_at,
    v_fee_requested_at;
  RETURN;
END;
$$;