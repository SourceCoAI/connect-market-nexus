-- Drop old function signature first
DROP FUNCTION IF EXISTS public.get_user_firm_agreement_status(uuid);

-- Recreate with expanded return type including doc URLs and signed_by_name
CREATE OR REPLACE FUNCTION public.get_user_firm_agreement_status(p_user_id uuid)
 RETURNS TABLE(
   firm_id uuid, firm_name text,
   nda_signed boolean, nda_status text, nda_docuseal_status text,
   nda_signed_at timestamptz, nda_signed_by_name text,
   nda_signed_document_url text, nda_document_url text,
   fee_agreement_signed boolean, fee_agreement_status text,
   fee_docuseal_status text, fee_agreement_signed_at timestamptz,
   fee_agreement_signed_by_name text,
   fee_signed_document_url text, fee_agreement_document_url text
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_firm_id uuid;
BEGIN
  v_firm_id := resolve_user_firm_id(p_user_id);
  
  IF v_firm_id IS NULL THEN
    RETURN QUERY SELECT
      NULL::uuid, NULL::text, false, 'not_started'::text, NULL::text, NULL::timestamptz, NULL::text,
      NULL::text, NULL::text,
      false, 'not_started'::text, NULL::text, NULL::timestamptz, NULL::text,
      NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    fa.id,
    fa.primary_company_name,
    fa.nda_signed,
    fa.nda_status::text,
    fa.nda_docuseal_status,
    fa.nda_signed_at,
    fa.nda_signed_by_name,
    fa.nda_signed_document_url,
    fa.nda_document_url,
    fa.fee_agreement_signed,
    fa.fee_agreement_status::text,
    fa.fee_docuseal_status,
    fa.fee_agreement_signed_at,
    fa.fee_agreement_signed_by_name,
    fa.fee_signed_document_url,
    fa.fee_agreement_document_url
  FROM firm_agreements fa
  WHERE fa.id = v_firm_id;
END;
$function$;