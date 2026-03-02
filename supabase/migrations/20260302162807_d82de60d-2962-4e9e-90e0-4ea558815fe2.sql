
-- Drop the old function first (it returned json, we want void)
DROP FUNCTION IF EXISTS public.update_firm_agreement_status(uuid,text,text,text,uuid,text,text,text,text,timestamptz,text,text,uuid,text);

-- Phase A: Add changed_by_name column to audit log
ALTER TABLE public.agreement_audit_log 
ADD COLUMN IF NOT EXISTS changed_by_name text;

-- Recreate with void return + cascade + audit
CREATE OR REPLACE FUNCTION public.update_firm_agreement_status(
  p_firm_id uuid,
  p_agreement_type text,
  p_new_status text,
  p_signed_by_name text DEFAULT NULL,
  p_signed_by_user_id uuid DEFAULT NULL,
  p_document_url text DEFAULT NULL,
  p_redline_notes text DEFAULT NULL,
  p_redline_document_url text DEFAULT NULL,
  p_custom_terms text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_source text DEFAULT 'platform',
  p_scope text DEFAULT 'blanket',
  p_deal_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_old_status text;
  v_admin_name text;
  v_admin_id uuid := auth.uid();
  v_is_signing boolean := (p_new_status = 'signed');
  v_is_unsigning boolean;
BEGIN
  SELECT COALESCE(first_name || ' ' || last_name, email, 'Unknown')
  INTO v_admin_name FROM profiles WHERE id = v_admin_id;

  IF p_agreement_type = 'nda' THEN
    SELECT COALESCE(nda_status, 'not_started') INTO v_old_status FROM firm_agreements WHERE id = p_firm_id;
    v_is_unsigning := (v_old_status = 'signed' AND NOT v_is_signing);

    UPDATE firm_agreements SET
      nda_status = p_new_status,
      nda_signed = v_is_signing,
      nda_signed_at = CASE WHEN v_is_signing THEN COALESCE(nda_signed_at, v_now) ELSE NULL END,
      nda_signed_by = CASE WHEN v_is_signing THEN COALESCE(nda_signed_by, p_signed_by_user_id) ELSE NULL END,
      nda_signed_by_name = CASE WHEN v_is_signing THEN COALESCE(nda_signed_by_name, p_signed_by_name) ELSE NULL END,
      nda_document_url = COALESCE(p_document_url, nda_document_url),
      nda_redline_notes = COALESCE(p_redline_notes, nda_redline_notes),
      nda_redline_document_url = COALESCE(p_redline_document_url, nda_redline_document_url),
      nda_custom_terms = COALESCE(p_custom_terms, nda_custom_terms),
      nda_expires_at = COALESCE(p_expires_at, nda_expires_at),
      nda_source = COALESCE(p_source, nda_source),
      nda_scope = COALESCE(p_scope, nda_scope),
      nda_deal_id = COALESCE(p_deal_id, nda_deal_id),
      updated_at = v_now
    WHERE id = p_firm_id;

    UPDATE profiles SET nda_signed = v_is_signing
    WHERE id IN (SELECT user_id FROM firm_members WHERE firm_id = p_firm_id AND user_id IS NOT NULL);

  ELSIF p_agreement_type = 'fee_agreement' THEN
    SELECT COALESCE(fee_agreement_status, 'not_started') INTO v_old_status FROM firm_agreements WHERE id = p_firm_id;
    v_is_unsigning := (v_old_status = 'signed' AND NOT v_is_signing);

    UPDATE firm_agreements SET
      fee_agreement_status = p_new_status,
      fee_agreement_signed = v_is_signing,
      fee_agreement_signed_at = CASE WHEN v_is_signing THEN COALESCE(fee_agreement_signed_at, v_now) ELSE NULL END,
      fee_agreement_signed_by = CASE WHEN v_is_signing THEN COALESCE(fee_agreement_signed_by, p_signed_by_user_id) ELSE NULL END,
      fee_agreement_signed_by_name = CASE WHEN v_is_signing THEN COALESCE(fee_agreement_signed_by_name, p_signed_by_name) ELSE NULL END,
      fee_agreement_document_url = COALESCE(p_document_url, fee_agreement_document_url),
      fee_agreement_redline_notes = COALESCE(p_redline_notes, fee_agreement_redline_notes),
      fee_agreement_redline_document_url = COALESCE(p_redline_document_url, fee_agreement_redline_document_url),
      fee_agreement_custom_terms = COALESCE(p_custom_terms, fee_agreement_custom_terms),
      fee_agreement_expires_at = COALESCE(p_expires_at, fee_agreement_expires_at),
      fee_agreement_source = COALESCE(p_source, fee_agreement_source),
      fee_agreement_scope = COALESCE(p_scope, fee_agreement_scope),
      fee_agreement_deal_id = COALESCE(p_deal_id, fee_agreement_deal_id),
      updated_at = v_now
    WHERE id = p_firm_id;

    UPDATE profiles SET fee_agreement_signed = v_is_signing
    WHERE id IN (SELECT user_id FROM firm_members WHERE firm_id = p_firm_id AND user_id IS NOT NULL);

  ELSE
    RAISE EXCEPTION 'Invalid agreement_type: %', p_agreement_type;
  END IF;

  -- Always write audit log
  INSERT INTO agreement_audit_log (
    firm_id, agreement_type, old_status, new_status,
    changed_by, changed_by_name, document_url, notes, metadata
  ) VALUES (
    p_firm_id, p_agreement_type, v_old_status, p_new_status,
    v_admin_id, v_admin_name, p_document_url, p_notes,
    jsonb_build_object(
      'source', COALESCE(p_source, 'platform'),
      'signed_by_name', p_signed_by_name,
      'signed_by_user_id', p_signed_by_user_id::text,
      'is_unsigning', COALESCE(v_is_unsigning, false),
      'toggled_at', v_now::text
    )
  );
END;
$$;
