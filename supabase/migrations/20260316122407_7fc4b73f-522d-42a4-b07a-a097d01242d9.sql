
-- ============================================================
-- Fix: Firm Association Data Integrity & Resolver Rewrite
-- ============================================================
-- Problem: resolve_user_firm_id() uses connection_requests.firm_id as Priority 1,
-- but sync_connection_request_firm trigger SETS firm_id via this resolver = circular.
-- One bad assignment propagated to 44+ users on the teltonika.lt firm.
-- ============================================================

-- ── 1. Rewrite resolve_user_firm_id() ────────────────────────
-- New logic: NEVER reads connection_requests. Uses firm_members + profile matching.
CREATE OR REPLACE FUNCTION public.resolve_user_firm_id(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_firm_id uuid;
  v_email_domain text;
  v_normalized_company text;
  v_generic_domains text[] := ARRAY[
    'gmail.com','googlemail.com','yahoo.com','hotmail.com','outlook.com',
    'icloud.com','me.com','mac.com','aol.com','live.com','msn.com',
    'mail.com','zoho.com','yandex.com','gmx.com','gmx.net',
    'protonmail.com','proton.me','pm.me','fastmail.com','tutanota.com',
    'hey.com','comcast.net','att.net','sbcglobal.net','verizon.net',
    'cox.net','bellsouth.net','rocketmail.com','ymail.com',
    'yahoo.com.au','hotmail.se','inbox.com'
  ];
BEGIN
  -- Get user's email domain and normalized company
  SELECT
    split_part(email, '@', 2),
    normalize_company_name(COALESCE(company, ''))
  INTO v_email_domain, v_normalized_company
  FROM profiles
  WHERE id = p_user_id;

  -- Priority 1: firm_members entry where firm's email_domain matches user's email domain
  -- (skip for generic/free email domains)
  IF v_email_domain IS NOT NULL AND v_email_domain <> ALL(v_generic_domains) THEN
    SELECT fm.firm_id INTO v_firm_id
    FROM firm_members fm
    JOIN firm_agreements fa ON fa.id = fm.firm_id
    WHERE fm.user_id = p_user_id
      AND fa.email_domain = v_email_domain
    ORDER BY fm.added_at DESC
    LIMIT 1;

    IF v_firm_id IS NOT NULL THEN
      RETURN v_firm_id;
    END IF;

    -- Also check if any firm matches the domain even without firm_members
    SELECT fa.id INTO v_firm_id
    FROM firm_agreements fa
    WHERE fa.email_domain = v_email_domain
    LIMIT 1;

    IF v_firm_id IS NOT NULL THEN
      RETURN v_firm_id;
    END IF;
  END IF;

  -- Priority 2: firm_members entry where firm's normalized name matches user's company
  IF v_normalized_company IS NOT NULL AND v_normalized_company != '' THEN
    SELECT fm.firm_id INTO v_firm_id
    FROM firm_members fm
    JOIN firm_agreements fa ON fa.id = fm.firm_id
    WHERE fm.user_id = p_user_id
      AND fa.normalized_company_name = v_normalized_company
    ORDER BY fm.added_at DESC
    LIMIT 1;

    IF v_firm_id IS NOT NULL THEN
      RETURN v_firm_id;
    END IF;
  END IF;

  -- Priority 3: Most recent firm_members entry (fallback)
  SELECT firm_id INTO v_firm_id
  FROM firm_members
  WHERE user_id = p_user_id
  ORDER BY added_at DESC
  LIMIT 1;

  RETURN v_firm_id;
END;
$$;

-- ── 2. Data cleanup: move mismatched members to correct firms ──

-- Create a temporary function for the cleanup
CREATE OR REPLACE FUNCTION public._cleanup_mismatched_firm_members()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_correct_firm_id uuid;
  v_email_domain text;
  v_normalized_company text;
  v_generic_domains text[] := ARRAY[
    'gmail.com','googlemail.com','yahoo.com','hotmail.com','outlook.com',
    'icloud.com','me.com','mac.com','aol.com','live.com','msn.com',
    'mail.com','zoho.com','yandex.com','gmx.com','gmx.net',
    'protonmail.com','proton.me','pm.me','fastmail.com','tutanota.com',
    'hey.com','comcast.net','att.net','sbcglobal.net','verizon.net',
    'cox.net','bellsouth.net','rocketmail.com','ymail.com',
    'yahoo.com.au','hotmail.se','inbox.com'
  ];
  v_old_firm_id uuid;
BEGIN
  -- Process each mismatched member on the teltonika.lt firm
  FOR rec IN
    SELECT fm.id as member_id, fm.firm_id, fm.user_id,
           p.email, p.company, p.first_name, p.last_name
    FROM firm_members fm
    JOIN profiles p ON p.id = fm.user_id
    JOIN firm_agreements fa ON fa.id = fm.firm_id
    WHERE fa.email_domain = 'teltonika.lt'
      AND fm.user_id IS NOT NULL
      AND split_part(p.email, '@', 2) != 'teltonika.lt'
  LOOP
    v_old_firm_id := rec.firm_id;
    v_email_domain := split_part(rec.email, '@', 2);
    v_normalized_company := normalize_company_name(COALESCE(rec.company, ''));
    v_correct_firm_id := NULL;

    -- Try to find correct firm by email domain (non-generic)
    IF v_email_domain IS NOT NULL AND v_email_domain <> ALL(v_generic_domains) THEN
      SELECT id INTO v_correct_firm_id
      FROM firm_agreements
      WHERE email_domain = v_email_domain
        AND id != v_old_firm_id
      LIMIT 1;
    END IF;

    -- Try by normalized company name
    IF v_correct_firm_id IS NULL AND v_normalized_company IS NOT NULL AND v_normalized_company != '' THEN
      SELECT id INTO v_correct_firm_id
      FROM firm_agreements
      WHERE normalized_company_name = v_normalized_company
        AND id != v_old_firm_id
      LIMIT 1;
    END IF;

    -- Create new firm if none found
    IF v_correct_firm_id IS NULL THEN
      INSERT INTO firm_agreements (
        primary_company_name,
        normalized_company_name,
        email_domain,
        nda_signed, fee_agreement_signed,
        member_count,
        created_at, updated_at
      ) VALUES (
        COALESCE(rec.company, v_email_domain, 'Unknown'),
        COALESCE(v_normalized_company, v_email_domain, 'unknown'),
        CASE WHEN v_email_domain <> ALL(v_generic_domains) THEN v_email_domain ELSE NULL END,
        false, false,
        0,
        now(), now()
      )
      RETURNING id INTO v_correct_firm_id;
    END IF;

    -- Move the member: delete old, insert new (to handle unique constraints)
    DELETE FROM firm_members WHERE id = rec.member_id;

    INSERT INTO firm_members (firm_id, user_id, member_type, added_at)
    VALUES (v_correct_firm_id, rec.user_id, 'marketplace_user', now())
    ON CONFLICT (firm_id, user_id) WHERE user_id IS NOT NULL
    DO NOTHING;

    -- Update all connection_requests for this user to the correct firm
    UPDATE connection_requests
    SET firm_id = v_correct_firm_id
    WHERE user_id = rec.user_id
      AND firm_id = v_old_firm_id;

    -- Log to audit
    INSERT INTO agreement_audit_log (
      firm_id, agreement_type, old_status, new_status,
      changed_by_name, notes, created_at
    ) VALUES (
      v_old_firm_id, 'nda', NULL, 'member_reassigned',
      'system_migration',
      format('Moved user %s (%s, %s) from firm %s to %s — data integrity fix',
        rec.user_id, rec.email, rec.company, v_old_firm_id, v_correct_firm_id),
      now()
    );
  END LOOP;

  -- Update member counts for all affected firms
  UPDATE firm_agreements fa
  SET member_count = (SELECT count(*) FROM firm_members WHERE firm_id = fa.id),
      updated_at = now()
  WHERE id IN (
    SELECT DISTINCT firm_id FROM firm_members
    UNION
    SELECT 'fc768c08-be17-493e-b37f-4640c78cfafe'::uuid -- teltonika
  );
END;
$$;

-- Execute the cleanup
SELECT _cleanup_mismatched_firm_members();

-- Drop the temp function
DROP FUNCTION public._cleanup_mismatched_firm_members();

-- ── 3. Update sync_connection_request_firm trigger ──────────
-- The trigger already calls resolve_user_firm_id() for marketplace users,
-- which is now fixed. No trigger body change needed since it delegates
-- to the resolver. But we need to ensure the resolver is called fresh
-- (not cached from old connection_requests).
-- The trigger function is already correct — it calls resolve_user_firm_id(NEW.user_id)
-- when user_id IS NOT NULL and firm_id IS NULL, which is the right behavior.

COMMENT ON FUNCTION public.resolve_user_firm_id IS
  'Deterministic firm resolver. Priority: 1) email domain match, 2) company name match, 3) most recent membership. Never reads connection_requests to avoid circular dependency with sync_connection_request_firm trigger.';
