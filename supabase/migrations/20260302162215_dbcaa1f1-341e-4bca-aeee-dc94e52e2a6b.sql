
-- ============================================================================
-- Phase 1: Canonical firm resolution functions
-- ============================================================================

-- resolve_user_firm_id: single source of truth for user→firm mapping
CREATE OR REPLACE FUNCTION public.resolve_user_firm_id(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_firm_id uuid;
BEGIN
  -- Priority 1: most recent active connection_request with non-null firm_id
  SELECT firm_id INTO v_firm_id
  FROM connection_requests
  WHERE user_id = p_user_id
    AND firm_id IS NOT NULL
    AND status IN ('approved', 'pending', 'on_hold')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_firm_id IS NOT NULL THEN
    RETURN v_firm_id;
  END IF;

  -- Priority 2: most recent firm_members by added_at
  SELECT firm_id INTO v_firm_id
  FROM firm_members
  WHERE user_id = p_user_id
  ORDER BY added_at DESC
  LIMIT 1;

  RETURN v_firm_id;
END;
$$;

-- get_user_firm_agreement_status: returns firm_id + NDA/Fee fields
CREATE OR REPLACE FUNCTION public.get_user_firm_agreement_status(p_user_id uuid)
RETURNS TABLE(
  firm_id uuid,
  firm_name text,
  nda_signed boolean,
  nda_status text,
  nda_docuseal_status text,
  nda_signed_at timestamptz,
  fee_agreement_signed boolean,
  fee_agreement_status text,
  fee_docuseal_status text,
  fee_agreement_signed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_firm_id uuid;
BEGIN
  v_firm_id := resolve_user_firm_id(p_user_id);
  
  IF v_firm_id IS NULL THEN
    RETURN QUERY SELECT
      NULL::uuid, NULL::text, false, 'not_started'::text, NULL::text, NULL::timestamptz,
      false, 'not_started'::text, NULL::text, NULL::timestamptz;
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
    fa.fee_agreement_signed,
    fa.fee_agreement_status::text,
    fa.fee_docuseal_status,
    fa.fee_agreement_signed_at
  FROM firm_agreements fa
  WHERE fa.id = v_firm_id;
END;
$$;

-- ============================================================================
-- Phase 2: Data remediation — normalize malformed email_domain values
-- ============================================================================

-- Fix email_domain containing full emails: extract domain part
-- Generic domains get nulled out, non-generic get the domain extracted
DO $$
DECLARE
  v_generic_domains text[] := ARRAY['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'mail.com', 'protonmail.com'];
  r RECORD;
  v_domain text;
BEGIN
  FOR r IN
    SELECT id, email_domain, metadata
    FROM firm_agreements
    WHERE email_domain LIKE '%@%'
  LOOP
    -- Extract domain from email
    v_domain := split_part(r.email_domain, '@', 2);
    
    -- Save old value in metadata for audit
    UPDATE firm_agreements
    SET 
      email_domain = CASE 
        WHEN v_domain = ANY(v_generic_domains) THEN NULL 
        ELSE v_domain 
      END,
      metadata = COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object(
        'remediation_old_email_domain', r.email_domain,
        'remediation_date', now()::text
      ),
      updated_at = now()
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- ============================================================================
-- Phase 2B: Recompute member_count from firm_members
-- ============================================================================

UPDATE firm_agreements fa
SET member_count = sub.cnt
FROM (
  SELECT firm_id, COUNT(*)::int AS cnt
  FROM firm_members
  GROUP BY firm_id
) sub
WHERE fa.id = sub.firm_id AND fa.member_count != sub.cnt;

-- ============================================================================
-- Phase 3: Update sync_connection_request_firm to use canonical resolver
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_connection_request_firm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_firm_id UUID;
  v_firm_record RECORD;
  v_email_domain TEXT;
  v_normalized_company TEXT;
  v_generic_domains TEXT[] := ARRAY['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'mail.com', 'protonmail.com'];
  v_lead_email TEXT;
  v_lead_name TEXT;
  v_lead_company TEXT;
BEGIN
  -- If firm_id already explicitly set on this row, keep it
  IF NEW.firm_id IS NOT NULL THEN
    v_firm_id := NEW.firm_id;
  
  -- Case 1: Marketplace user — use canonical resolver
  ELSIF NEW.user_id IS NOT NULL THEN
    v_firm_id := resolve_user_firm_id(NEW.user_id);
    NEW.firm_id := v_firm_id;
  
  -- Case 2: Lead from inbound_leads
  ELSIF NEW.source_lead_id IS NOT NULL THEN
    SELECT firm_id, email, name, company_name INTO v_firm_id, v_lead_email, v_lead_name, v_lead_company
    FROM inbound_leads
    WHERE id = NEW.source_lead_id;
    
    NEW.firm_id := v_firm_id;
  
  -- Case 3: Manual lead with company/email
  ELSIF NEW.lead_company IS NOT NULL OR NEW.lead_email IS NOT NULL THEN
    v_lead_email := NEW.lead_email;
    v_lead_name := NEW.lead_name;
    v_lead_company := NEW.lead_company;
    
    IF NEW.lead_email IS NOT NULL THEN
      v_email_domain := extract_domain(NEW.lead_email);
    END IF;
    
    IF NEW.lead_company IS NOT NULL THEN
      v_normalized_company := normalize_company_name(NEW.lead_company);
    END IF;
    
    IF v_normalized_company IS NOT NULL OR (v_email_domain IS NOT NULL AND v_email_domain <> ALL(v_generic_domains)) THEN
      SELECT id INTO v_firm_id
      FROM firm_agreements
      WHERE 
        (normalized_company_name = v_normalized_company AND v_normalized_company IS NOT NULL)
        OR (email_domain = v_email_domain AND v_email_domain IS NOT NULL AND v_email_domain <> ALL(v_generic_domains))
      LIMIT 1;
      
      IF v_firm_id IS NULL THEN
        INSERT INTO firm_agreements (
          primary_company_name,
          normalized_company_name,
          email_domain,
          member_count,
          created_at,
          updated_at
        ) VALUES (
          COALESCE(NEW.lead_company, v_email_domain),
          COALESCE(v_normalized_company, v_email_domain),
          CASE WHEN v_email_domain <> ALL(v_generic_domains) THEN v_email_domain ELSE NULL END,
          0,
          NOW(),
          NOW()
        )
        RETURNING id INTO v_firm_id;
      END IF;
      
      NEW.firm_id := v_firm_id;
    END IF;
  END IF;
  
  -- If firm exists and this is a lead-based request, add to firm_members
  IF NEW.firm_id IS NOT NULL AND NEW.user_id IS NULL AND COALESCE(v_lead_email, NEW.lead_email) IS NOT NULL THEN
    v_lead_email := COALESCE(v_lead_email, NEW.lead_email);
    v_lead_name := COALESCE(v_lead_name, NEW.lead_name);
    v_lead_company := COALESCE(v_lead_company, NEW.lead_company);
    
    INSERT INTO firm_members (
      firm_id, member_type, lead_email, lead_name, lead_company,
      connection_request_id, inbound_lead_id, added_at
    ) VALUES (
      NEW.firm_id, 'lead', v_lead_email, v_lead_name, v_lead_company,
      NEW.id, NEW.source_lead_id, NOW()
    )
    ON CONFLICT (firm_id, lead_email) WHERE member_type = 'lead'
    DO UPDATE SET
      connection_request_id = COALESCE(EXCLUDED.connection_request_id, firm_members.connection_request_id),
      inbound_lead_id = COALESCE(EXCLUDED.inbound_lead_id, firm_members.inbound_lead_id),
      lead_name = COALESCE(EXCLUDED.lead_name, firm_members.lead_name),
      lead_company = COALESCE(EXCLUDED.lead_company, firm_members.lead_company),
      updated_at = NOW();
    
    UPDATE firm_agreements
    SET member_count = (SELECT COUNT(*) FROM firm_members WHERE firm_id = NEW.firm_id),
        updated_at = NOW()
    WHERE id = NEW.firm_id;
  END IF;
  
  -- Inherit agreement status
  IF NEW.firm_id IS NOT NULL THEN
    SELECT * INTO v_firm_record FROM firm_agreements WHERE id = NEW.firm_id;
    
    IF v_firm_record.fee_agreement_signed AND NOT COALESCE(NEW.lead_fee_agreement_signed, FALSE) THEN
      NEW.lead_fee_agreement_signed := TRUE;
      NEW.lead_fee_agreement_signed_at := v_firm_record.fee_agreement_signed_at;
    END IF;
    
    IF v_firm_record.nda_signed AND NOT COALESCE(NEW.lead_nda_signed, FALSE) THEN
      NEW.lead_nda_signed := TRUE;
      NEW.lead_nda_signed_at := v_firm_record.nda_signed_at;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- Phase 3B: Add validation trigger to prevent @ in email_domain
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_firm_email_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email_domain IS NOT NULL AND NEW.email_domain LIKE '%@%' THEN
    -- Auto-fix: extract domain part
    NEW.email_domain := split_part(NEW.email_domain, '@', 2);
    -- If result is generic, null it out
    IF NEW.email_domain = ANY(ARRAY['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'mail.com', 'protonmail.com']) THEN
      NEW.email_domain := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_firm_email_domain_trigger ON firm_agreements;
CREATE TRIGGER validate_firm_email_domain_trigger
  BEFORE INSERT OR UPDATE ON firm_agreements
  FOR EACH ROW
  EXECUTE FUNCTION validate_firm_email_domain();
