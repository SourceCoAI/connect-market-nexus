
-- Fix 1: Clean up stale pushed_to_marketplace flag on published listings
UPDATE listings 
SET pushed_to_marketplace = false 
WHERE is_internal_deal = false 
  AND pushed_to_marketplace = true;

-- Fix 2: Fix get_user_firm_agreement_status RPC to remove non-existent column references
CREATE OR REPLACE FUNCTION public.get_user_firm_agreement_status(p_user_id uuid)
RETURNS TABLE(
  firm_id uuid,
  primary_company_name text,
  nda_signed boolean,
  nda_status text,
  nda_pandadoc_status text,
  nda_pandadoc_document_id text,
  nda_signed_at timestamptz,
  nda_signed_by_name text,
  nda_pandadoc_signed_url text,
  nda_signed_document_url text,
  nda_document_url text,
  fee_agreement_signed boolean,
  fee_agreement_status text,
  fee_pandadoc_status text,
  fee_pandadoc_document_id text,
  fee_agreement_signed_at timestamptz,
  fee_agreement_signed_by_name text,
  fee_pandadoc_signed_url text,
  fee_signed_document_url text,
  fee_agreement_document_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_firm_id uuid;
BEGIN
  v_firm_id := resolve_user_firm_id(p_user_id);

  IF v_firm_id IS NULL THEN
    RETURN QUERY SELECT
      NULL::uuid, NULL::text,
      false, 'not_started'::text,
      NULL::text, NULL::text,
      NULL::timestamptz, NULL::text,
      NULL::text, NULL::text, NULL::text,
      false, 'not_started'::text,
      NULL::text, NULL::text,
      NULL::timestamptz, NULL::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    fa.id,
    fa.primary_company_name,
    fa.nda_signed,
    fa.nda_status::text,
    fa.nda_pandadoc_status,
    fa.nda_pandadoc_document_id,
    fa.nda_signed_at,
    fa.nda_signed_by_name,
    NULL::text,  -- nda_pandadoc_signed_url (column does not exist)
    fa.nda_signed_document_url,
    fa.nda_document_url,
    fa.fee_agreement_signed,
    fa.fee_agreement_status::text,
    fa.fee_pandadoc_status,
    fa.fee_pandadoc_document_id,
    fa.fee_agreement_signed_at,
    fa.fee_agreement_signed_by_name,
    NULL::text,  -- fee_pandadoc_signed_url (column does not exist)
    fa.fee_signed_document_url,
    fa.fee_agreement_document_url
  FROM firm_agreements fa
  WHERE fa.id = v_firm_id;
END;
$$;
