
-- Update enhanced_merge_or_create_connection_request to require Fee Agreement specifically.
-- NDA alone is no longer sufficient. Fee Agreement alone is fine.

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
  v_fee_coverage record;
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

  -- SERVER-SIDE GATE: Fee Agreement is required (NDA alone is not sufficient)
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF v_user_email IS NOT NULL THEN
    SELECT * INTO v_fee_coverage FROM public.check_agreement_coverage(v_user_email, 'fee_agreement');
    
    IF NOT COALESCE(v_fee_coverage.is_covered, false) THEN
      RAISE EXCEPTION 'A Fee Agreement must be signed before requesting deal access';
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

  IF v_existing_request.id IS NOT NULL THEN
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

    RETURN jsonb_build_object(
      'request_id', v_existing_request.id,
      'is_duplicate', true,
      'duplicate_type', 'same_user_same_listing',
      'action_taken', 'updated_existing_request',
      'previous_message', v_existing_request.user_message,
      'previous_status', v_existing_request.status,
      'created_at', v_existing_request.created_at
    );
  END IF;

  IF p_lead_email IS NOT NULL THEN
    SELECT * INTO v_existing_lead_request
    FROM public.connection_requests
    WHERE listing_id = p_listing_id
      AND lead_email = p_lead_email
      AND status != 'rejected'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_lead_request.id IS NOT NULL THEN
      UPDATE public.connection_requests
      SET
        user_id = v_user_id,
        user_message = COALESCE(p_user_message, v_existing_lead_request.user_message),
        source_metadata = COALESCE(v_existing_lead_request.source_metadata, '{}'::jsonb) ||
          jsonb_build_object(
            'merged_from_lead', true,
            'original_lead_email', p_lead_email,
            'merged_at', NOW()
          ),
        updated_at = NOW()
      WHERE id = v_existing_lead_request.id;

      RETURN jsonb_build_object(
        'request_id', v_existing_lead_request.id,
        'is_duplicate', true,
        'duplicate_type', 'lead_to_user_merge',
        'action_taken', 'merged_lead_request',
        'previous_status', v_existing_lead_request.status
      );
    END IF;
  END IF;

  v_new_request_id := gen_random_uuid();

  INSERT INTO public.connection_requests (
    id, listing_id, user_id, user_message, status,
    lead_name, lead_email, lead_company, lead_role, lead_phone,
    source_metadata, created_at, updated_at
  ) VALUES (
    v_new_request_id, p_listing_id, v_user_id, p_user_message, 'pending',
    p_lead_name, p_lead_email, p_lead_company, p_lead_role, p_lead_phone,
    jsonb_build_object('source', 'marketplace', 'created_via', 'enhanced_rpc'),
    NOW(), NOW()
  );

  RETURN jsonb_build_object(
    'request_id', v_new_request_id,
    'is_duplicate', false,
    'action_taken', 'created_new_request',
    'status', 'pending'
  );
END;
$$;
