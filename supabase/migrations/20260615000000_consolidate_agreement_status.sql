-- ============================================================================
-- Consolidate agreement status: add firm_id to get_my_agreement_status()
-- so buyer-facing code has a single source of truth for all agreement data.
-- Also adds server-side gating to enhanced_merge_or_create_connection_request.
-- ============================================================================

-- 1. Extend get_my_agreement_status to return firm_id
DROP FUNCTION IF EXISTS public.get_my_agreement_status();

CREATE OR REPLACE FUNCTION public.get_my_agreement_status()
RETURNS TABLE (
  nda_covered BOOLEAN,
  nda_status TEXT,
  nda_coverage_source TEXT,
  nda_firm_name TEXT,
  nda_parent_firm_name TEXT,
  fee_covered BOOLEAN,
  fee_status TEXT,
  fee_coverage_source TEXT,
  fee_firm_name TEXT,
  fee_parent_firm_name TEXT,
  firm_id UUID
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_nda RECORD;
  v_fee RECORD;
BEGIN
  -- Get the caller's email
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  IF v_user_email IS NULL THEN
    RETURN QUERY SELECT
      false, 'not_started'::TEXT, 'not_covered'::TEXT, NULL::TEXT, NULL::TEXT,
      false, 'not_started'::TEXT, 'not_covered'::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::UUID;
    RETURN;
  END IF;

  -- Check NDA coverage
  SELECT * INTO v_nda FROM public.check_agreement_coverage(v_user_email, 'nda');

  -- Check fee agreement coverage
  SELECT * INTO v_fee FROM public.check_agreement_coverage(v_user_email, 'fee_agreement');

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
    COALESCE(v_nda.firm_id, v_fee.firm_id);
  RETURN;
END;
$$;

-- 2. Add server-side gating to connection request RPC
-- Block business owners and enforce NDA coverage at the database level.
CREATE OR REPLACE FUNCTION public.enhanced_merge_or_create_connection_request(
  p_listing_id UUID,
  p_user_message TEXT,
  p_lead_name TEXT DEFAULT NULL,
  p_lead_email TEXT DEFAULT NULL,
  p_lead_company TEXT DEFAULT NULL,
  p_lead_role TEXT DEFAULT NULL,
  p_lead_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_user_profile record;
  v_existing_request record;
  v_existing_lead_request record;
  v_new_request_id uuid;
  v_result jsonb;
  v_nda_coverage record;
  v_user_email text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get user profile
  SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- SERVER-SIDE GATE: Block business owners
  IF v_user_profile.buyer_type IN ('businessOwner', 'business_owner') THEN
    RAISE EXCEPTION 'Business owner accounts cannot request deal connections';
  END IF;

  -- SERVER-SIDE GATE: Enforce NDA coverage
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF v_user_email IS NOT NULL THEN
    SELECT * INTO v_nda_coverage FROM public.check_agreement_coverage(v_user_email, 'nda');
    IF v_nda_coverage IS NOT NULL AND NOT COALESCE(v_nda_coverage.is_covered, false) THEN
      RAISE EXCEPTION 'NDA must be signed before requesting deal access';
    END IF;
  END IF;

  -- Check for existing marketplace request from this user for this listing
  SELECT * INTO v_existing_request
  FROM public.connection_requests
  WHERE user_id = v_user_id
    AND listing_id = p_listing_id
    AND status != 'rejected'
  ORDER BY created_at DESC
  LIMIT 1;

  -- If user already has a request for this listing, update with new message and conflict info
  IF v_existing_request.id IS NOT NULL THEN
    -- Update the existing request with the new message and mark as duplicate submission
    UPDATE public.connection_requests
    SET
      user_message = p_user_message,
      source_metadata = COALESCE(source_metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'has_duplicate_submission', true,
          'duplicate_submission_count', COALESCE((source_metadata->'duplicate_submission_count')::int, 0) + 1,
          'previous_message', v_existing_request.user_message,
          'latest_message_at', NOW(),
          'needs_admin_review', true,
          'duplicate_reason', 'same_user_same_listing'
        ),
      updated_at = NOW()
    WHERE id = v_existing_request.id;

    -- Return existing request info with conflict details
    RETURN jsonb_build_object(
      'request_id', v_existing_request.id,
      'is_duplicate', true,
      'duplicate_type', 'same_user_same_listing',
      'action_taken', 'updated_existing_request',
      'previous_message', v_existing_request.user_message,
      'new_message', p_user_message
    );
  END IF;

  -- Check for existing lead request with same email for this listing
  SELECT * INTO v_existing_lead_request
  FROM public.connection_requests
  WHERE user_id IS NULL
    AND lead_email = v_user_profile.email
    AND listing_id = p_listing_id
    AND status != 'rejected'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_lead_request.id IS NOT NULL THEN
    -- Convert lead request to user request
    UPDATE public.connection_requests
    SET
      user_id = v_user_id,
      user_message = COALESCE(p_user_message, v_existing_lead_request.user_message),
      source_metadata = COALESCE(source_metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'lead_converted', true,
          'lead_name', v_existing_lead_request.lead_name,
          'lead_email', v_existing_lead_request.lead_email,
          'converted_at', NOW()
        ),
      updated_at = NOW()
    WHERE id = v_existing_lead_request.id;

    RETURN jsonb_build_object(
      'request_id', v_existing_lead_request.id,
      'is_duplicate', true,
      'duplicate_type', 'lead_to_user_conversion',
      'action_taken', 'converted_lead_request',
      'lead_name', v_existing_lead_request.lead_name,
      'new_message', p_user_message
    );
  END IF;

  -- Create new connection request
  INSERT INTO public.connection_requests (
    user_id,
    listing_id,
    user_message,
    status,
    lead_name,
    lead_email,
    lead_company,
    lead_role,
    lead_phone,
    source
  ) VALUES (
    v_user_id,
    p_listing_id,
    p_user_message,
    'pending',
    p_lead_name,
    p_lead_email,
    p_lead_company,
    p_lead_role,
    p_lead_phone,
    'marketplace'
  )
  RETURNING id INTO v_new_request_id;

  RETURN jsonb_build_object(
    'request_id', v_new_request_id,
    'is_duplicate', false,
    'duplicate_type', null,
    'action_taken', 'created_new_request'
  );
END;
$$;
