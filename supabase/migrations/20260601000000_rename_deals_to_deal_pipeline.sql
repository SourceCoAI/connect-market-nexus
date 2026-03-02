-- ============================================================================
-- MIGRATION: Rename deals → deal_pipeline
--
-- Eliminates naming ambiguity: "deals" was confused with deal rows inside
-- the listings table.  deal_pipeline is the CRM pipeline tracking table.
--
-- Steps:
--   1. Rename the table
--   2. Rename indexes
--   3. Rename FK constraints on child tables
--   4. Drop & recreate RLS policies
--   5. Recreate all functions that hardcode the old table name
--   6. Recreate triggers bound to the renamed table
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: Rename the table
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.deals RENAME TO deal_pipeline;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: Rename indexes
-- ═══════════════════════════════════════════════════════════════════════════
ALTER INDEX IF EXISTS idx_deals_contact_company    RENAME TO idx_deal_pipeline_contact_company;
ALTER INDEX IF EXISTS idx_deals_assigned_to        RENAME TO idx_deal_pipeline_assigned_to;
ALTER INDEX IF EXISTS idx_deals_created_at         RENAME TO idx_deal_pipeline_created_at;
ALTER INDEX IF EXISTS idx_deals_stage_entered_at   RENAME TO idx_deal_pipeline_stage_entered_at;
ALTER INDEX IF EXISTS idx_deals_updated_at         RENAME TO idx_deal_pipeline_updated_at;
ALTER INDEX IF EXISTS idx_deals_deal_score         RENAME TO idx_deal_pipeline_deal_score;
ALTER INDEX IF EXISTS idx_deals_priority_rank      RENAME TO idx_deal_pipeline_priority_rank;
ALTER INDEX IF EXISTS idx_deals_stage_id           RENAME TO idx_deal_pipeline_stage_id;
ALTER INDEX IF EXISTS idx_deals_listing_id         RENAME TO idx_deal_pipeline_listing_id;
ALTER INDEX IF EXISTS idx_deals_connection_request_id RENAME TO idx_deal_pipeline_connection_request_id;
ALTER INDEX IF EXISTS idx_deals_inbound_lead_id    RENAME TO idx_deal_pipeline_inbound_lead_id;
ALTER INDEX IF EXISTS idx_deals_priority           RENAME TO idx_deal_pipeline_priority;
ALTER INDEX IF EXISTS idx_deals_source             RENAME TO idx_deal_pipeline_source;
ALTER INDEX IF EXISTS idx_deals_nda_status         RENAME TO idx_deal_pipeline_nda_status;
ALTER INDEX IF EXISTS idx_deals_fee_agreement_status RENAME TO idx_deal_pipeline_fee_agreement_status;
ALTER INDEX IF EXISTS idx_deals_buyer_contact      RENAME TO idx_deal_pipeline_buyer_contact;
ALTER INDEX IF EXISTS idx_deals_seller_contact     RENAME TO idx_deal_pipeline_seller_contact;
ALTER INDEX IF EXISTS idx_deals_priority_score     RENAME TO idx_deal_pipeline_priority_score;
ALTER INDEX IF EXISTS idx_deals_stage_created      RENAME TO idx_deal_pipeline_stage_created;
ALTER INDEX IF EXISTS idx_deals_connection_request RENAME TO idx_deal_pipeline_connection_request;
ALTER INDEX IF EXISTS idx_deals_listing            RENAME TO idx_deal_pipeline_listing;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3: Drop & recreate RLS policy
-- ═══════════════════════════════════════════════════════════════════════════
-- RLS is already enabled (follows the table). Just rename the policy.
DROP POLICY IF EXISTS "Admins can manage all deals" ON public.deal_pipeline;
CREATE POLICY "Admins can manage all deal_pipeline"
  ON public.deal_pipeline
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4: Recreate functions that hardcode FROM/INSERT INTO/UPDATE deals
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 4a. get_deals_with_buyer_profiles ─────────────────────────────────────
-- Just update FROM clause for now; full rewrite comes in Phase 2.
DROP FUNCTION IF EXISTS public.get_deals_with_buyer_profiles();

CREATE FUNCTION public.get_deals_with_buyer_profiles()
RETURNS TABLE (
  deal_id uuid,
  deal_title text,
  deal_description text,
  deal_value numeric,
  deal_priority text,
  deal_probability numeric,
  deal_expected_close_date date,
  deal_source text,
  deal_created_at timestamptz,
  deal_updated_at timestamptz,
  deal_stage_entered_at timestamptz,
  deal_deleted_at timestamptz,
  connection_request_id uuid,
  stage_id uuid,
  stage_name text,
  stage_color text,
  stage_position integer,
  stage_is_active boolean,
  stage_is_default boolean,
  stage_is_system_stage boolean,
  stage_default_probability numeric,
  stage_type text,
  listing_id uuid,
  listing_title text,
  listing_revenue numeric,
  listing_ebitda numeric,
  listing_location text,
  listing_category text,
  listing_internal_company_name text,
  listing_image_url text,
  listing_deal_total_score numeric,
  listing_is_priority_target boolean,
  listing_needs_owner_contact boolean,
  admin_id uuid,
  admin_first_name text,
  admin_last_name text,
  admin_email text,
  buyer_type text,
  buyer_website text,
  buyer_quality_score numeric,
  buyer_tier integer,
  contact_name text,
  contact_email text,
  contact_company text,
  contact_phone text,
  contact_role text,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  buyer_company text,
  buyer_phone text,
  nda_status text,
  fee_agreement_status text,
  followed_up boolean,
  followed_up_at timestamptz,
  negative_followed_up boolean,
  negative_followed_up_at timestamptz,
  meeting_scheduled boolean
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    d.id,
    d.title,
    d.description,
    d.value,
    d.priority,
    d.probability,
    d.expected_close_date,
    d.source,
    d.created_at,
    d.updated_at,
    COALESCE(d.stage_entered_at, d.created_at),
    d.deleted_at,
    d.connection_request_id,
    ds.id,
    ds.name,
    ds.color,
    ds.position,
    ds.is_active,
    ds.is_default,
    ds.is_system_stage,
    ds.default_probability,
    ds.stage_type,
    l.id,
    l.title,
    l.revenue,
    l.ebitda,
    l.location,
    l.category,
    l.internal_company_name,
    l.image_url,
    l.deal_total_score,
    l.is_priority_target,
    l.needs_owner_contact,
    ap.id,
    ap.first_name,
    ap.last_name,
    ap.email,
    bp.buyer_type,
    COALESCE(bp.website, bp.buyer_org_url),
    bp.buyer_quality_score,
    bp.buyer_tier,
    cr.lead_name,
    cr.lead_email,
    cr.lead_company,
    cr.lead_phone,
    cr.lead_role,
    bp.first_name,
    bp.last_name,
    bp.email,
    bp.company,
    bp.phone_number,
    CASE
      WHEN cr.lead_nda_signed THEN 'signed'
      WHEN cr.lead_nda_email_sent THEN 'sent'
      ELSE 'not_sent'
    END,
    CASE
      WHEN cr.lead_fee_agreement_signed THEN 'signed'
      WHEN cr.lead_fee_agreement_email_sent THEN 'sent'
      ELSE 'not_sent'
    END,
    COALESCE(cr.followed_up, false),
    cr.followed_up_at,
    COALESCE(cr.negative_followed_up, false),
    cr.negative_followed_up_at,
    COALESCE(d.meeting_scheduled, false)
  FROM public.deal_pipeline d
  LEFT JOIN public.listings l ON l.id = d.listing_id
  LEFT JOIN public.deal_stages ds ON ds.id = d.stage_id
  LEFT JOIN public.profiles ap ON ap.id = d.assigned_to
  LEFT JOIN public.connection_requests cr ON cr.id = d.connection_request_id
  LEFT JOIN public.profiles bp ON bp.id = cr.user_id
  WHERE d.deleted_at IS NULL
    AND (
      d.connection_request_id IS NULL
      OR cr.id IS NOT NULL
    )
  ORDER BY d.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_deals_with_buyer_profiles() IS
  'Returns all active deals with pre-joined listing, stage, admin, and buyer profile data. '
  'Reads from deal_pipeline table (renamed from deals).';


-- ── 4b. get_deals_with_details ────────────────────────────────────────────
-- Latest version from 20260303100000_security_hardening_phase2
DROP FUNCTION IF EXISTS public.get_deals_with_details();

CREATE OR REPLACE FUNCTION public.get_deals_with_details()
RETURNS TABLE (
  deal_id uuid,
  deal_title text,
  deal_description text,
  deal_value numeric,
  deal_probability integer,
  deal_expected_close_date date,
  deal_created_at timestamp with time zone,
  deal_updated_at timestamp with time zone,
  deal_stage_entered_at timestamp with time zone,
  deal_followed_up boolean,
  deal_followed_up_at timestamp with time zone,
  deal_followed_up_by uuid,
  deal_negative_followed_up boolean,
  deal_negative_followed_up_at timestamp with time zone,
  deal_negative_followed_up_by uuid,
  deal_buyer_priority_score integer,
  deal_priority text,
  deal_source text,
  stage_id uuid,
  stage_name text,
  stage_color text,
  stage_position integer,
  listing_id uuid,
  listing_title text,
  listing_category text,
  listing_real_company_name text,
  listing_revenue numeric,
  listing_ebitda numeric,
  listing_location text,
  connection_request_id uuid,
  buyer_id uuid,
  buyer_name text,
  buyer_email text,
  buyer_company text,
  buyer_phone text,
  buyer_type text,
  assigned_to uuid,
  contact_name text,
  contact_email text,
  contact_company text,
  contact_phone text,
  contact_role text,
  nda_status text,
  fee_agreement_status text,
  last_contact_at timestamp with time zone,
  total_activities integer,
  pending_tasks integer,
  total_tasks integer,
  completed_tasks integer,
  last_activity_at timestamp with time zone,
  company_deal_count bigint,
  listing_deal_count bigint,
  buyer_connection_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    d.id as deal_id,
    d.title as deal_title,
    d.description as deal_description,
    d.value as deal_value,
    d.probability as deal_probability,
    d.expected_close_date as deal_expected_close_date,
    d.created_at as deal_created_at,
    d.updated_at as deal_updated_at,
    d.stage_entered_at as deal_stage_entered_at,
    d.followed_up as deal_followed_up,
    d.followed_up_at as deal_followed_up_at,
    d.followed_up_by as deal_followed_up_by,
    d.negative_followed_up as deal_negative_followed_up,
    d.negative_followed_up_at as deal_negative_followed_up_at,
    d.negative_followed_up_by as deal_negative_followed_up_by,
    d.buyer_priority_score as deal_buyer_priority_score,
    d.priority as deal_priority,
    d.source as deal_source,
    ds.id as stage_id,
    ds.name as stage_name,
    ds.color as stage_color,
    ds.position as stage_position,
    d.listing_id,
    l.title as listing_title,
    l.category as listing_category,
    l.internal_company_name as listing_real_company_name,
    l.revenue as listing_revenue,
    l.ebitda as listing_ebitda,
    l.location as listing_location,
    d.connection_request_id,
    p.id as buyer_id,
    COALESCE(p.first_name || ' ' || p.last_name, p.email) as buyer_name,
    p.email as buyer_email,
    p.company as buyer_company,
    p.phone_number as buyer_phone,
    p.buyer_type,
    d.assigned_to,
    CASE
      WHEN d.contact_name IS NOT NULL AND d.contact_name != '' AND d.contact_name != 'Unknown' AND d.contact_name != 'Unknown Contact'
        THEN d.contact_name
      WHEN p.first_name IS NOT NULL OR p.last_name IS NOT NULL
        THEN COALESCE(p.first_name || ' ' || p.last_name, p.email)
      WHEN cr.lead_name IS NOT NULL AND cr.lead_name != ''
        THEN cr.lead_name
      ELSE 'Unknown Contact'
    END as contact_name,
    COALESCE(NULLIF(d.contact_email, ''), p.email, cr.lead_email) as contact_email,
    COALESCE(NULLIF(d.contact_company, ''), p.company, cr.lead_company) as contact_company,
    COALESCE(NULLIF(d.contact_phone, ''), p.phone_number, cr.lead_phone) as contact_phone,
    d.contact_role,
    d.nda_status,
    d.fee_agreement_status,
    (
      SELECT MAX(dc.created_at)
      FROM deal_contacts dc
      WHERE dc.deal_id = d.id
    ) as last_contact_at,
    (
      SELECT COUNT(*)::integer
      FROM deal_activities da
      WHERE da.deal_id = d.id
    ) as total_activities,
    (
      SELECT COUNT(*)::integer
      FROM deal_tasks dt
      WHERE dt.deal_id = d.id AND dt.status = 'pending'
    ) as pending_tasks,
    (
      SELECT COUNT(*)::integer
      FROM deal_tasks dt
      WHERE dt.deal_id = d.id
    ) as total_tasks,
    (
      SELECT COUNT(*)::integer
      FROM deal_tasks dt
      WHERE dt.deal_id = d.id AND dt.status = 'completed'
    ) as completed_tasks,
    GREATEST(
      d.updated_at,
      (SELECT MAX(da.created_at) FROM deal_activities da WHERE da.deal_id = d.id),
      (SELECT MAX(dt.updated_at) FROM deal_tasks dt WHERE dt.deal_id = d.id)
    ) as last_activity_at,
    COUNT(*) OVER (PARTITION BY COALESCE(l.internal_company_name, d.contact_company, p.company)) as company_deal_count,
    COUNT(*) OVER (PARTITION BY d.listing_id) as listing_deal_count,
    (
      SELECT COUNT(*)::bigint
      FROM connection_requests cr_count
      WHERE (cr_count.user_id = cr.user_id AND cr.user_id IS NOT NULL)
         OR (cr_count.lead_email = COALESCE(NULLIF(d.contact_email, ''), p.email, cr.lead_email) AND cr_count.lead_email IS NOT NULL)
    ) as buyer_connection_count
  FROM deal_pipeline d
  LEFT JOIN deal_stages ds ON d.stage_id = ds.id
  LEFT JOIN listings l ON d.listing_id = l.id
  LEFT JOIN connection_requests cr ON d.connection_request_id = cr.id
  LEFT JOIN profiles p ON cr.user_id = p.id
  WHERE d.deleted_at IS NULL
  ORDER BY d.created_at DESC;
END;
$$;


-- ── 4c. move_deal_stage_with_ownership ────────────────────────────────────
DROP FUNCTION IF EXISTS public.move_deal_stage_with_ownership(uuid, uuid, uuid);

CREATE FUNCTION public.move_deal_stage_with_ownership(
  p_deal_id uuid,
  p_new_stage_id uuid,
  p_current_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deal_record RECORD;
  v_new_stage_record RECORD;
  v_old_stage_name text;
  v_new_stage_name text;
  v_should_assign_owner boolean := false;
  v_different_owner boolean := false;
  v_previous_owner_id uuid;
  v_previous_owner_name text;
  v_current_admin_name text;
  v_listing_website text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_deal_record FROM deal_pipeline WHERE id = p_deal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found: %', p_deal_id;
  END IF;

  SELECT name INTO v_old_stage_name FROM deal_stages WHERE id = v_deal_record.stage_id;
  SELECT * INTO v_new_stage_record FROM deal_stages WHERE id = p_new_stage_id;
  v_new_stage_name := v_new_stage_record.name;

  IF v_new_stage_record.stage_type = 'active' THEN
    SELECT website INTO v_listing_website FROM listings WHERE id = v_deal_record.listing_id;
    IF NOT public.is_valid_company_website(v_listing_website) THEN
      RAISE EXCEPTION 'Cannot move deal to active stage: the company listing does not have a valid website/domain. Please add a real company website before moving this deal.';
    END IF;
  END IF;

  IF v_old_stage_name = 'New Inquiry' AND v_deal_record.assigned_to IS NULL THEN
    v_should_assign_owner := true;
  END IF;

  IF v_deal_record.assigned_to IS NOT NULL AND v_deal_record.assigned_to != p_current_admin_id THEN
    v_different_owner := true;
    v_previous_owner_id := v_deal_record.assigned_to;
    SELECT first_name || ' ' || last_name INTO v_previous_owner_name FROM profiles WHERE id = v_previous_owner_id;
    SELECT first_name || ' ' || last_name INTO v_current_admin_name FROM profiles WHERE id = p_current_admin_id;
  END IF;

  UPDATE deal_pipeline
  SET
    stage_id = p_new_stage_id,
    stage_entered_at = now(),
    updated_at = now(),
    assigned_to = CASE WHEN v_should_assign_owner THEN p_current_admin_id ELSE assigned_to END,
    owner_assigned_at = CASE WHEN v_should_assign_owner THEN now() ELSE owner_assigned_at END,
    owner_assigned_by = CASE WHEN v_should_assign_owner THEN p_current_admin_id ELSE owner_assigned_by END
  WHERE id = p_deal_id;

  INSERT INTO deal_activities (deal_id, admin_id, activity_type, title, description, metadata)
  VALUES (
    p_deal_id, p_current_admin_id, 'stage_change',
    'Stage Changed: ' || v_old_stage_name || ' → ' || v_new_stage_name,
    CASE
      WHEN v_should_assign_owner THEN 'Deal moved to ' || v_new_stage_name || '. Owner auto-assigned.'
      WHEN v_different_owner THEN 'Deal moved by ' || COALESCE(v_current_admin_name, 'admin') || ' (different from owner: ' || COALESCE(v_previous_owner_name, 'unknown') || ')'
      ELSE 'Deal moved to ' || v_new_stage_name
    END,
    jsonb_build_object(
      'old_stage', v_old_stage_name, 'new_stage', v_new_stage_name,
      'owner_assigned', v_should_assign_owner, 'different_owner', v_different_owner,
      'previous_owner_id', v_previous_owner_id, 'current_admin_id', p_current_admin_id
    )
  );

  IF v_different_owner THEN
    INSERT INTO admin_notifications (admin_id, deal_id, notification_type, title, message, action_url, metadata)
    VALUES (
      v_previous_owner_id, p_deal_id, 'deal_modified', 'Your deal was modified',
      COALESCE(v_current_admin_name, 'Another admin') || ' moved your deal from "' || v_old_stage_name || '" to "' || v_new_stage_name || '"',
      '/admin/pipeline?deal=' || p_deal_id,
      jsonb_build_object('modifying_admin_id', p_current_admin_id, 'modifying_admin_name', v_current_admin_name, 'old_stage', v_old_stage_name, 'new_stage', v_new_stage_name)
    );
  END IF;

  v_result := jsonb_build_object(
    'success', true, 'deal_id', p_deal_id,
    'old_stage_name', v_old_stage_name, 'new_stage_name', v_new_stage_name,
    'owner_assigned', v_should_assign_owner, 'different_owner_warning', v_different_owner,
    'previous_owner_id', v_previous_owner_id, 'previous_owner_name', v_previous_owner_name,
    'assigned_to', CASE WHEN v_should_assign_owner THEN p_current_admin_id ELSE v_deal_record.assigned_to END
  );
  RETURN v_result;
END;
$$;


-- ── 4d. create_deal_on_request_approval ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_deal_on_request_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_deal_id uuid;
  qualified_stage_id uuid;
  buyer_name text;
  buyer_email text;
  buyer_company text;
  buyer_phone text;
  buyer_role text;
  nda_status text := 'not_sent';
  fee_status text := 'not_sent';
  src text;
  deal_title text;
  new_deal_id uuid;
  v_listing_website text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND COALESCE(OLD.status,'') <> 'approved' THEN
    SELECT id INTO existing_deal_id FROM public.deal_pipeline WHERE connection_request_id = NEW.id LIMIT 1;
    IF existing_deal_id IS NOT NULL THEN RETURN NEW; END IF;

    SELECT website INTO v_listing_website FROM public.listings WHERE id = NEW.listing_id;
    IF NOT public.is_valid_company_website(v_listing_website) THEN RETURN NEW; END IF;

    SELECT id INTO qualified_stage_id FROM public.deal_stages WHERE is_active = true AND name = 'Qualified' ORDER BY position LIMIT 1;
    IF qualified_stage_id IS NULL THEN
      SELECT id INTO qualified_stage_id FROM public.deal_stages WHERE is_active = true ORDER BY position LIMIT 1;
    END IF;

    SELECT COALESCE(NEW.lead_name, p.first_name || ' ' || p.last_name),
           COALESCE(NEW.lead_email, p.email),
           COALESCE(NEW.lead_company, p.company),
           COALESCE(NEW.lead_phone, p.phone_number),
           COALESCE(NEW.lead_role, p.job_title)
    INTO buyer_name, buyer_email, buyer_company, buyer_phone, buyer_role
    FROM public.profiles p WHERE p.id = NEW.user_id;

    IF COALESCE(NEW.lead_nda_signed, false) THEN nda_status := 'signed';
    ELSIF COALESCE(NEW.lead_nda_email_sent, false) THEN nda_status := 'sent'; END IF;
    IF COALESCE(NEW.lead_fee_agreement_signed, false) THEN fee_status := 'signed';
    ELSIF COALESCE(NEW.lead_fee_agreement_email_sent, false) THEN fee_status := 'sent'; END IF;

    src := COALESCE(NEW.source, 'marketplace');
    SELECT COALESCE(l.title, 'Unknown') INTO deal_title FROM public.listings l WHERE l.id = NEW.listing_id;

    INSERT INTO public.deal_pipeline (
      listing_id, stage_id, connection_request_id, value, probability, expected_close_date,
      assigned_to, stage_entered_at, source,
      contact_name, contact_email, contact_company, contact_phone, contact_role,
      nda_status, fee_agreement_status, title, description, priority
    ) VALUES (
      NEW.listing_id, qualified_stage_id, NEW.id, 0, 50, NULL,
      NEW.approved_by, now(), src,
      buyer_name, buyer_email, buyer_company, buyer_phone, buyer_role,
      nda_status, fee_status, deal_title,
      COALESCE(NEW.user_message, 'Deal created from approved connection request'), 'medium'
    ) RETURNING id INTO new_deal_id;

    IF new_deal_id IS NOT NULL THEN
      INSERT INTO public.deal_activities (deal_id, admin_id, activity_type, title, description, metadata)
      VALUES (new_deal_id, NEW.approved_by, 'note_added', 'Created from connection request',
              COALESCE(NEW.user_message, 'Approved connection request and created deal'),
              jsonb_build_object('connection_request_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


-- ── 4e. create_deal_from_connection_request ───────────────────────────────
CREATE OR REPLACE FUNCTION public.create_deal_from_connection_request()
RETURNS TRIGGER AS $$
DECLARE
  default_stage_id UUID;
  deal_title TEXT;
  listing_title TEXT;
  v_buyer_contact_id UUID;
  v_seller_contact_id UUID;
  v_remarketing_buyer_id UUID;
BEGIN
  SELECT id INTO default_stage_id FROM public.deal_stages WHERE is_default = TRUE ORDER BY position LIMIT 1;
  SELECT title INTO listing_title FROM public.listings WHERE id = NEW.listing_id;
  deal_title := COALESCE(NEW.lead_name, 'Unknown') || ' - ' || COALESCE(listing_title, 'Unknown Listing');

  IF NEW.user_id IS NOT NULL THEN
    SELECT c.id, c.remarketing_buyer_id INTO v_buyer_contact_id, v_remarketing_buyer_id
    FROM public.contacts c WHERE c.profile_id = NEW.user_id AND c.contact_type = 'buyer' AND c.archived = false LIMIT 1;
  END IF;
  IF NEW.listing_id IS NOT NULL THEN
    SELECT c.id INTO v_seller_contact_id FROM public.contacts c
    WHERE c.listing_id = NEW.listing_id AND c.contact_type = 'seller' AND c.is_primary_seller_contact = true AND c.archived = false LIMIT 1;
  END IF;

  INSERT INTO public.deal_pipeline (
    listing_id, stage_id, connection_request_id, title, description, source,
    contact_name, contact_email, contact_company, contact_phone, contact_role,
    buyer_contact_id, seller_contact_id, remarketing_buyer_id, metadata
  ) VALUES (
    NEW.listing_id, default_stage_id, NEW.id, deal_title, NEW.user_message, COALESCE(NEW.source, 'marketplace'),
    COALESCE(NEW.lead_name, (SELECT first_name || ' ' || last_name FROM public.profiles WHERE id = NEW.user_id)),
    COALESCE(NEW.lead_email, (SELECT email FROM public.profiles WHERE id = NEW.user_id)),
    NEW.lead_company, NEW.lead_phone, NEW.lead_role,
    v_buyer_contact_id, v_seller_contact_id, v_remarketing_buyer_id,
    jsonb_build_object('auto_created', TRUE, 'source_type', 'connection_request')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 4f. create_deal_from_inbound_lead ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_deal_from_inbound_lead()
RETURNS TRIGGER AS $$
DECLARE
  default_stage_id UUID;
  deal_title TEXT;
  listing_title TEXT;
  v_buyer_contact_id UUID;
  v_seller_contact_id UUID;
  v_remarketing_buyer_id UUID;
BEGIN
  IF OLD.status != 'converted' AND NEW.status = 'converted' THEN
    SELECT id INTO default_stage_id FROM public.deal_stages WHERE is_default = TRUE ORDER BY position LIMIT 1;
    SELECT title INTO listing_title FROM public.listings WHERE id = NEW.mapped_to_listing_id;
    deal_title := COALESCE(NEW.name, 'Unknown') || ' - ' || COALESCE(listing_title, 'Unknown Listing');

    IF NEW.email IS NOT NULL THEN
      SELECT c.id, c.remarketing_buyer_id INTO v_buyer_contact_id, v_remarketing_buyer_id
      FROM public.contacts c WHERE lower(c.email) = lower(NEW.email) AND c.contact_type = 'buyer' AND c.archived = false LIMIT 1;
    END IF;
    IF NEW.mapped_to_listing_id IS NOT NULL THEN
      SELECT c.id INTO v_seller_contact_id FROM public.contacts c
      WHERE c.listing_id = NEW.mapped_to_listing_id AND c.contact_type = 'seller' AND c.is_primary_seller_contact = true AND c.archived = false LIMIT 1;
    END IF;

    INSERT INTO public.deal_pipeline (
      listing_id, stage_id, inbound_lead_id, title, description, source,
      contact_name, contact_email, contact_company, contact_phone, contact_role,
      buyer_contact_id, seller_contact_id, remarketing_buyer_id, metadata
    ) VALUES (
      NEW.mapped_to_listing_id, default_stage_id, NEW.id, deal_title, NEW.message, COALESCE(NEW.source, 'webflow'),
      NEW.name, NEW.email, NEW.company_name, NEW.phone_number, NEW.role,
      v_buyer_contact_id, v_seller_contact_id, v_remarketing_buyer_id,
      jsonb_build_object('auto_created', TRUE, 'source_type', 'inbound_lead')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 4g. update_deal_owner ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_deal_owner(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.update_deal_owner(
  p_deal_id uuid,
  p_assigned_to uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid;
  v_result jsonb;
  v_old_owner uuid;
  v_listing_id uuid;
  v_primary_owner uuid;
  v_previous_owner_name text;
  v_stage_name text;
BEGIN
  v_actor_id := COALESCE(p_actor_id, auth.uid());
  SELECT assigned_to, listing_id INTO v_old_owner, v_listing_id FROM public.deal_pipeline WHERE id = p_deal_id;
  SELECT primary_owner_id INTO v_primary_owner FROM public.listings WHERE id = v_listing_id;

  IF NOT (public.is_admin(v_actor_id) OR v_actor_id = v_old_owner OR v_actor_id = v_primary_owner) THEN
    RAISE EXCEPTION 'Only admins, current owners, or listing primary owners can update deal ownership';
  END IF;

  IF v_old_owner IS NOT NULL THEN
    SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_previous_owner_name FROM public.profiles WHERE id = v_old_owner;
  END IF;

  UPDATE public.deal_pipeline SET assigned_to = p_assigned_to, owner_assigned_by = v_actor_id, owner_assigned_at = NOW(), updated_at = NOW() WHERE id = p_deal_id;

  SELECT s.name INTO v_stage_name FROM public.deal_pipeline d LEFT JOIN public.deal_stages s ON s.id = d.stage_id WHERE d.id = p_deal_id;

  SELECT jsonb_build_object(
    'id', d.id, 'assigned_to', d.assigned_to, 'updated_at', d.updated_at,
    'stage_id', d.stage_id, 'nda_status', d.nda_status, 'fee_agreement_status', d.fee_agreement_status,
    'followed_up', d.followed_up, 'negative_followed_up', d.negative_followed_up,
    'previous_owner_id', v_old_owner, 'previous_owner_name', v_previous_owner_name,
    'owner_changed', (v_old_owner IS DISTINCT FROM p_assigned_to), 'stage_name', v_stage_name
  ) INTO v_result FROM public.deal_pipeline d WHERE d.id = p_deal_id;

  IF v_old_owner IS DISTINCT FROM p_assigned_to THEN
    INSERT INTO public.deal_activities (deal_id, admin_id, activity_type, title, description, metadata)
    VALUES (p_deal_id, v_actor_id, 'assignment_changed', 'Deal Owner Changed',
      CASE WHEN v_old_owner IS NULL AND p_assigned_to IS NOT NULL THEN 'Deal assigned'
           WHEN v_old_owner IS NOT NULL AND p_assigned_to IS NULL THEN 'Deal unassigned'
           ELSE 'Deal reassigned' END,
      jsonb_build_object('old_owner', v_old_owner, 'new_owner', p_assigned_to, 'changed_by', v_actor_id));
  END IF;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_deal_owner(uuid, uuid, uuid) TO authenticated;


-- ── 4h. auto_create_deal_from_connection_request ──────────────────────────
CREATE OR REPLACE FUNCTION public.auto_create_deal_from_connection_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_inquiry_stage_id uuid;
  deal_source_value text;
  contact_name_value text;
  contact_email_value text;
  contact_company_value text;
  contact_phone_value text;
  contact_role_value text;
  buyer_priority_value integer;
BEGIN
  SELECT id INTO new_inquiry_stage_id FROM public.deal_stages WHERE name = 'New Inquiry' LIMIT 1;

  deal_source_value := CASE
    WHEN NEW.source IN ('website', 'marketplace', 'webflow', 'manual') THEN NEW.source
    ELSE 'marketplace'
  END;

  IF NEW.user_id IS NOT NULL THEN
    SELECT COALESCE(p.first_name || ' ' || p.last_name, p.email), p.email, p.company, p.phone_number, p.buyer_type, COALESCE(calculate_buyer_priority_score(p.buyer_type), 0)
    INTO contact_name_value, contact_email_value, contact_company_value, contact_phone_value, contact_role_value, buyer_priority_value
    FROM public.profiles p WHERE p.id = NEW.user_id;
  ELSE
    contact_name_value := NEW.lead_name;
    contact_email_value := NEW.lead_email;
    contact_company_value := NEW.lead_company;
    contact_phone_value := NEW.lead_phone;
    contact_role_value := NEW.lead_role;
    buyer_priority_value := COALESCE(NEW.buyer_priority_score, 0);
  END IF;

  INSERT INTO public.deal_pipeline (
    listing_id, stage_id, connection_request_id, value, probability, source, title,
    contact_name, contact_email, contact_company, contact_phone, contact_role,
    buyer_priority_score, nda_status, fee_agreement_status, created_at, stage_entered_at
  ) VALUES (
    NEW.listing_id, new_inquiry_stage_id, NEW.id, 0, 5, deal_source_value,
    COALESCE(contact_name_value || ' - ' || (SELECT title FROM public.listings WHERE id = NEW.listing_id), 'New Deal'),
    COALESCE(contact_name_value, 'Unknown Contact'), contact_email_value, contact_company_value, contact_phone_value, contact_role_value,
    buyer_priority_value,
    CASE WHEN NEW.lead_nda_signed THEN 'signed' WHEN NEW.lead_nda_email_sent THEN 'sent' ELSE 'not_sent' END,
    CASE WHEN NEW.lead_fee_agreement_signed THEN 'signed' WHEN NEW.lead_fee_agreement_email_sent THEN 'sent' ELSE 'not_sent' END,
    NEW.created_at, NEW.created_at
  );
  RETURN NEW;
END;
$function$;


-- ── 4i. soft_delete_deal ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.soft_delete_deal(deal_id uuid, deletion_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete deals';
  END IF;
  UPDATE public.deal_pipeline SET deleted_at = NOW(), updated_at = NOW() WHERE id = deal_id AND deleted_at IS NULL;
  IF FOUND THEN
    INSERT INTO public.deal_activities (deal_id, admin_id, activity_type, title, description, metadata)
    VALUES (deal_id, auth.uid(), 'deal_deleted', 'Deal Deleted',
            COALESCE('Reason: ' || deletion_reason, 'Deal was deleted'),
            jsonb_build_object('deletion_reason', deletion_reason));
  END IF;
  RETURN FOUND;
END;
$$;


-- ── 4j. restore_deal ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_deal(deal_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can restore deals';
  END IF;
  UPDATE public.deal_pipeline SET deleted_at = NULL, updated_at = NOW() WHERE id = deal_id AND deleted_at IS NOT NULL;
  IF FOUND THEN
    INSERT INTO public.deal_activities (deal_id, admin_id, activity_type, title, description)
    VALUES (deal_id, auth.uid(), 'deal_restored', 'Deal Restored', 'Deal was restored from deleted status');
  END IF;
  RETURN FOUND;
END;
$$;


-- ── 4k. sync_followup_to_deals ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_followup_to_deals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE deal_pipeline
  SET followed_up = NEW.followed_up, followed_up_at = NEW.followed_up_at, followed_up_by = NEW.followed_up_by,
      negative_followed_up = NEW.negative_followed_up, negative_followed_up_at = NEW.negative_followed_up_at, negative_followed_up_by = NEW.negative_followed_up_by
  WHERE connection_request_id = NEW.id;
  RETURN NEW;
END;
$$;


-- ── 4l. auto_assign_deal_from_listing ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_assign_deal_from_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.listing_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    SELECT primary_owner_id INTO NEW.assigned_to FROM listings WHERE id = NEW.listing_id AND primary_owner_id IS NOT NULL;
    IF NEW.assigned_to IS NOT NULL THEN
      NEW.owner_assigned_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


-- ── 4m. get_buyer_deal_history ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_buyer_deal_history(uuid);

CREATE OR REPLACE FUNCTION public.get_buyer_deal_history(p_buyer_id UUID)
RETURNS TABLE (
  deal_id UUID, deal_title TEXT, deal_category TEXT,
  has_teaser_access BOOLEAN, has_full_memo_access BOOLEAN, has_data_room_access BOOLEAN,
  memos_sent BIGINT, last_memo_sent_at TIMESTAMPTZ,
  pipeline_stage TEXT, pipeline_stage_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;
  RETURN QUERY
  SELECT
    l.id AS deal_id,
    COALESCE(l.internal_company_name, l.title) AS deal_title,
    l.category AS deal_category,
    COALESCE(a.can_view_teaser, false) AS has_teaser_access,
    COALESCE(a.can_view_full_memo, false) AS has_full_memo_access,
    COALESCE(a.can_view_data_room, false) AS has_data_room_access,
    COALESCE((SELECT COUNT(*) FROM public.memo_distribution_log dl WHERE dl.deal_id = l.id AND dl.remarketing_buyer_id = p_buyer_id), 0::bigint) AS memos_sent,
    (SELECT MAX(dl.sent_at) FROM public.memo_distribution_log dl WHERE dl.deal_id = l.id AND dl.remarketing_buyer_id = p_buyer_id) AS last_memo_sent_at,
    ds.name AS pipeline_stage,
    d.stage_id AS pipeline_stage_id
  FROM public.listings l
  LEFT JOIN public.data_room_access a ON a.deal_id = l.id AND a.remarketing_buyer_id = p_buyer_id
  LEFT JOIN public.deal_pipeline d ON d.listing_id = l.id AND d.remarketing_buyer_id = p_buyer_id
  LEFT JOIN public.deal_stages ds ON ds.id = d.stage_id
  WHERE a.id IS NOT NULL OR d.id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.memo_distribution_log dl WHERE dl.deal_id = l.id AND dl.remarketing_buyer_id = p_buyer_id)
  ORDER BY GREATEST(a.granted_at, d.created_at,
    (SELECT MAX(dl.sent_at) FROM public.memo_distribution_log dl WHERE dl.deal_id = l.id AND dl.remarketing_buyer_id = p_buyer_id)
  ) DESC NULLS LAST;
END;
$$;


-- ── 4n. handle_listing_status_change (references deals for task closure) ──
CREATE OR REPLACE FUNCTION public.handle_listing_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status IN ('archived', 'sold', 'withdrawn') AND OLD.status = 'active' THEN
    UPDATE public.daily_standup_tasks SET status = 'listing_closed', updated_at = now()
    WHERE entity_type = 'listing' AND entity_id = NEW.id AND status IN ('pending','pending_approval','in_progress','overdue');
    UPDATE public.daily_standup_tasks SET status = 'listing_closed', updated_at = now()
    WHERE entity_type = 'deal' AND entity_id IN (SELECT id FROM public.deal_pipeline WHERE listing_id = NEW.id)
    AND status IN ('pending','pending_approval','in_progress','overdue');
  END IF;
  IF NEW.status = 'inactive' AND OLD.status = 'active' THEN
    UPDATE public.daily_standup_tasks SET status = 'snoozed', snoozed_until = CURRENT_DATE + INTERVAL '30 days', updated_at = now()
    WHERE entity_type = 'listing' AND entity_id = NEW.id AND status IN ('pending','pending_approval','in_progress','overdue');
  END IF;
  IF NEW.status = 'active' AND OLD.status = 'inactive' THEN
    UPDATE public.daily_standup_tasks SET status = 'pending', snoozed_until = NULL, updated_at = now()
    WHERE entity_type = 'listing' AND entity_id = NEW.id AND status = 'snoozed';
  END IF;
  RETURN NEW;
END;
$$;


-- ── 4o. delete_listing_cascade ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_listing_cascade(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete listings';
  END IF;

  -- Child tables with deal_id FK (via listing_id on deal_pipeline)
  DELETE FROM public.data_room_access WHERE deal_id = p_listing_id;
  DELETE FROM public.data_room_audit_log WHERE deal_id = p_listing_id;
  DELETE FROM public.memo_distribution_log WHERE deal_id = p_listing_id;
  DELETE FROM public.lead_memo_versions WHERE memo_id IN (SELECT id FROM public.lead_memos WHERE deal_id = p_listing_id);
  DELETE FROM public.lead_memos WHERE deal_id = p_listing_id;

  DELETE FROM public.alert_delivery_logs WHERE listing_id = p_listing_id;
  DELETE FROM public.buyer_approve_decisions WHERE listing_id = p_listing_id;
  DELETE FROM public.buyer_learning_history WHERE listing_id = p_listing_id;
  DELETE FROM public.buyer_pass_decisions WHERE listing_id = p_listing_id;
  DELETE FROM public.buyer_deal_scores WHERE deal_id = p_listing_id::text;
  DELETE FROM public.call_transcripts WHERE listing_id = p_listing_id;
  DELETE FROM public.chat_conversations WHERE listing_id = p_listing_id;
  DELETE FROM public.collection_items WHERE listing_id = p_listing_id;
  DELETE FROM public.connection_requests WHERE listing_id = p_listing_id;
  DELETE FROM public.deal_ranking_history WHERE listing_id = p_listing_id;
  DELETE FROM public.deal_referrals WHERE listing_id = p_listing_id;
  DELETE FROM public.deal_pipeline WHERE listing_id = p_listing_id;
  DELETE FROM public.deal_scoring_adjustments WHERE listing_id = p_listing_id;
  DELETE FROM public.deal_transcripts WHERE listing_id = p_listing_id;
  DELETE FROM public.engagement_signals WHERE listing_id = p_listing_id;
  DELETE FROM public.enrichment_queue WHERE listing_id = p_listing_id;
  DELETE FROM public.listing_analytics WHERE listing_id = p_listing_id;
  DELETE FROM public.listing_conversations WHERE listing_id = p_listing_id;
  DELETE FROM public.outreach_records WHERE listing_id = p_listing_id;
  DELETE FROM public.owner_intro_notifications WHERE listing_id = p_listing_id;
  DELETE FROM public.remarketing_outreach WHERE listing_id = p_listing_id;

  DELETE FROM public.listings WHERE id = p_listing_id;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5: Recreate triggers that were bound ON public.deals
-- (Triggers follow the table rename automatically, but we recreate them
--  for clarity in case the binding is stale.)
-- ═══════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_deal_stage_change ON public.deal_pipeline;
CREATE TRIGGER trg_deal_stage_change
  AFTER UPDATE OF stage_id ON public.deal_pipeline
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION public.handle_deal_stage_change();

DROP TRIGGER IF EXISTS sync_followup_trigger ON public.deal_pipeline;
CREATE TRIGGER sync_followup_trigger
  AFTER UPDATE OF followed_up, negative_followed_up ON public.deal_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_followup_to_connection_requests();

DROP TRIGGER IF EXISTS trg_auto_assign_deal_owner ON public.deal_pipeline;
CREATE TRIGGER trg_auto_assign_deal_owner
  BEFORE INSERT ON public.deal_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_deal_from_listing();

COMMIT;
