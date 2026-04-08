-- Fix RLS policies for buyer_introductions table
-- Allow any authenticated user to INSERT (with their own user ID as created_by)
-- and UPDATE records they created, in addition to the existing admin-all policy.

-- Authenticated users can insert their own introductions
DROP POLICY IF EXISTS buyer_introductions_authenticated_insert ON buyer_introductions;
CREATE POLICY buyer_introductions_authenticated_insert ON buyer_introductions
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Authenticated users can update introductions they created
DROP POLICY IF EXISTS buyer_introductions_creator_update ON buyer_introductions;
CREATE POLICY buyer_introductions_creator_update ON buyer_introductions
  FOR UPDATE
  USING (auth.uid() = created_by);

-- Same for introduction_status_log: allow authenticated users to insert logs
DROP POLICY IF EXISTS introduction_status_log_authenticated_insert ON introduction_status_log;
CREATE POLICY introduction_status_log_authenticated_insert ON introduction_status_log
  FOR INSERT
  WITH CHECK (auth.uid() = changed_by);

-- Allow authenticated users to read status logs for introductions they created
DROP POLICY IF EXISTS introduction_status_log_creator_select ON introduction_status_log;
CREATE POLICY introduction_status_log_creator_select ON introduction_status_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM buyer_introductions bi
      WHERE bi.id = buyer_introduction_id
      AND bi.created_by = auth.uid()
    )
  );

-- Merged from: 20260506000000_rename_deals_to_deal_pipeline.sql
-- ============================================================================
-- MIGRATION: Rename deals → deal_pipeline
-- ============================================================================
-- The `deals` table is a CRM pipeline table tracking buyer journeys.
-- It is NOT the same as "deal rows inside listings". Renaming to
-- `deal_pipeline` eliminates this naming ambiguity.
--
-- This migration:
--   1. Renames the table
--   2. Recreates all functions whose body references `deals` by name
--   3. Drops and recreates triggers bound to `ON public.deals`
--   4. Updates RLS policies
--
-- Tables NOT renamed: deal_stages, deal_tasks, deal_activities,
--   deal_alerts, deal_comments, deal_documents — these are correct as-is.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: Rename the table
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.deals RENAME TO deal_pipeline;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: Drop triggers bound to the old table name
--         (They auto-transferred to deal_pipeline but we recreate them
--          with clean DDL for clarity)
-- ═══════════════════════════════════════════════════════════════════════════

-- Triggers ON deal_pipeline (formerly deals)
DROP TRIGGER IF EXISTS update_deal_stage_trigger ON public.deal_pipeline;
DROP TRIGGER IF EXISTS trg_deal_stage_timestamp ON public.deal_pipeline;
DROP TRIGGER IF EXISTS trigger_auto_assign_deal ON public.deal_pipeline;
DROP TRIGGER IF EXISTS trigger_notify_deal_reassignment ON public.deal_pipeline;
DROP TRIGGER IF EXISTS sync_followup_to_connection_requests ON public.deal_pipeline;
DROP TRIGGER IF EXISTS trg_deal_stage_change ON public.deal_pipeline;
DROP TRIGGER IF EXISTS audit_deals_trigger ON public.deal_pipeline;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3: Recreate RLS policy (table name in policy is cosmetic, but
--         re-creating for documentation clarity)
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can manage all deals" ON public.deal_pipeline;
CREATE POLICY "Admins can manage all deal_pipeline" ON public.deal_pipeline
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4: Recreate functions whose BODY references `deals` by name
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 4a. get_deals_with_buyer_profiles() ─────────────────────────────────
-- Latest source: 20260504000000_fix_deals_rpc_connection_request_filter.sql

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
  'Returns all active deal_pipeline rows with pre-joined listing, stage, admin, and buyer profile data. '
  'Eliminates the N+1 query pattern in the frontend use-deals hook.';


-- ─── 4b. get_deals_with_details() ───────────────────────────────────────
-- Latest source: 20260405000000_unify_task_system.sql

DROP FUNCTION IF EXISTS public.get_deals_with_details();

CREATE OR REPLACE FUNCTION public.get_deals_with_details()
RETURNS TABLE(
  deal_id UUID,
  deal_title TEXT,
  deal_description TEXT,
  deal_value NUMERIC,
  deal_priority TEXT,
  deal_probability INTEGER,
  deal_expected_close_date DATE,
  deal_source TEXT,
  deal_created_at TIMESTAMP WITH TIME ZONE,
  deal_updated_at TIMESTAMP WITH TIME ZONE,
  deal_stage_entered_at TIMESTAMP WITH TIME ZONE,
  stage_id UUID,
  stage_name TEXT,
  stage_color TEXT,
  stage_position INTEGER,
  listing_id UUID,
  listing_title TEXT,
  listing_revenue NUMERIC,
  listing_ebitda NUMERIC,
  listing_location TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_company TEXT,
  contact_phone TEXT,
  contact_role TEXT,
  buyer_contact_id UUID,
  buyer_contact_name TEXT,
  buyer_contact_email TEXT,
  seller_contact_id UUID,
  seller_contact_name TEXT,
  remarketing_buyer_id UUID,
  remarketing_buyer_company TEXT,
  nda_status TEXT,
  fee_agreement_status TEXT,
  followed_up BOOLEAN,
  followed_up_at TIMESTAMP WITH TIME ZONE,
  assigned_to UUID,
  assigned_admin_name TEXT,
  assigned_admin_email TEXT,
  total_tasks INTEGER,
  pending_tasks INTEGER,
  completed_tasks INTEGER,
  activity_count INTEGER
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id as deal_id,
    d.title as deal_title,
    d.description as deal_description,
    d.value as deal_value,
    d.priority as deal_priority,
    d.probability as deal_probability,
    d.expected_close_date as deal_expected_close_date,
    d.source as deal_source,
    d.created_at as deal_created_at,
    d.updated_at as deal_updated_at,
    d.stage_entered_at as deal_stage_entered_at,
    ds.id as stage_id,
    ds.name as stage_name,
    ds.color as stage_color,
    ds.position as stage_position,
    l.id as listing_id,
    l.title as listing_title,
    l.revenue as listing_revenue,
    l.ebitda as listing_ebitda,
    l.location as listing_location,
    d.contact_name,
    d.contact_email,
    d.contact_company,
    d.contact_phone,
    d.contact_role,
    d.buyer_contact_id,
    CASE WHEN bc.id IS NOT NULL
      THEN TRIM(bc.first_name || ' ' || bc.last_name)
      ELSE NULL
    END as buyer_contact_name,
    bc.email as buyer_contact_email,
    d.seller_contact_id,
    CASE WHEN sc.id IS NOT NULL
      THEN TRIM(sc.first_name || ' ' || sc.last_name)
      ELSE NULL
    END as seller_contact_name,
    d.remarketing_buyer_id,
    rb.company_name as remarketing_buyer_company,
    d.nda_status,
    d.fee_agreement_status,
    d.followed_up,
    d.followed_up_at,
    d.assigned_to,
    COALESCE(p.first_name || ' ' || p.last_name, p.email) as assigned_admin_name,
    p.email as assigned_admin_email,
    COALESCE(task_stats.total_tasks, 0) as total_tasks,
    COALESCE(task_stats.pending_tasks, 0) as pending_tasks,
    COALESCE(task_stats.completed_tasks, 0) as completed_tasks,
    COALESCE(activity_stats.activity_count, 0) as activity_count
  FROM public.deal_pipeline d
  LEFT JOIN public.deal_stages ds ON d.stage_id = ds.id
  LEFT JOIN public.listings l ON d.listing_id = l.id
  LEFT JOIN public.profiles p ON d.assigned_to = p.id
  LEFT JOIN public.contacts bc ON d.buyer_contact_id = bc.id
  LEFT JOIN public.contacts sc ON d.seller_contact_id = sc.id
  LEFT JOIN public.remarketing_buyers rb ON d.remarketing_buyer_id = rb.id
  LEFT JOIN (
    SELECT
      entity_id AS deal_id,
      COUNT(*)::integer as total_tasks,
      SUM(CASE WHEN status IN ('pending', 'pending_approval', 'in_progress', 'overdue') THEN 1 ELSE 0 END)::integer as pending_tasks,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::integer as completed_tasks
    FROM public.daily_standup_tasks
    WHERE entity_type = 'deal'
    GROUP BY entity_id
  ) task_stats ON d.id = task_stats.deal_id
  LEFT JOIN (
    SELECT
      deal_id,
      COUNT(*)::integer as activity_count
    FROM public.deal_activities
    GROUP BY deal_id
  ) activity_stats ON d.id = activity_stats.deal_id
  WHERE d.deleted_at IS NULL
  ORDER BY d.updated_at DESC;
$$;


-- ─── 4c. move_deal_stage_with_ownership() ───────────────────────────────
-- Latest source: 20260311100000_enforce_valid_website_for_active_deals.sql

CREATE OR REPLACE FUNCTION public.move_deal_stage_with_ownership(
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
    SELECT website INTO v_listing_website
    FROM listings
    WHERE id = v_deal_record.listing_id;

    IF NOT public.is_valid_company_website(v_listing_website) THEN
      RAISE EXCEPTION 'Cannot move deal to active stage: the company listing does not have a valid website/domain. Please add a real company website before moving this deal.';
    END IF;
  END IF;

  IF v_old_stage_name = 'New Inquiry' AND v_deal_record.assigned_to IS NULL THEN
    v_should_assign_owner := true;
  END IF;

  IF v_deal_record.assigned_to IS NOT NULL
     AND v_deal_record.assigned_to != p_current_admin_id THEN
    v_different_owner := true;
    v_previous_owner_id := v_deal_record.assigned_to;

    SELECT first_name || ' ' || last_name INTO v_previous_owner_name
    FROM profiles
    WHERE id = v_previous_owner_id;

    SELECT first_name || ' ' || last_name INTO v_current_admin_name
    FROM profiles
    WHERE id = p_current_admin_id;
  END IF;

  UPDATE deal_pipeline
  SET
    stage_id = p_new_stage_id,
    stage_entered_at = now(),
    updated_at = now(),
    assigned_to = CASE
      WHEN v_should_assign_owner THEN p_current_admin_id
      ELSE assigned_to
    END,
    owner_assigned_at = CASE
      WHEN v_should_assign_owner THEN now()
      ELSE owner_assigned_at
    END,
    owner_assigned_by = CASE
      WHEN v_should_assign_owner THEN p_current_admin_id
      ELSE owner_assigned_by
    END
  WHERE id = p_deal_id;

  INSERT INTO deal_activities (
    deal_id, admin_id, activity_type, title, description, metadata
  ) VALUES (
    p_deal_id,
    p_current_admin_id,
    'stage_change',
    'Stage Changed: ' || v_old_stage_name || ' → ' || v_new_stage_name,
    CASE
      WHEN v_should_assign_owner THEN
        'Deal moved to ' || v_new_stage_name || '. Owner auto-assigned.'
      WHEN v_different_owner THEN
        'Deal moved by ' || COALESCE(v_current_admin_name, 'admin') || ' (different from owner: ' || COALESCE(v_previous_owner_name, 'unknown') || ')'
      ELSE
        'Deal moved to ' || v_new_stage_name
    END,
    jsonb_build_object(
      'old_stage', v_old_stage_name,
      'new_stage', v_new_stage_name,
      'owner_assigned', v_should_assign_owner,
      'different_owner', v_different_owner,
      'previous_owner_id', v_previous_owner_id,
      'current_admin_id', p_current_admin_id
    )
  );

  IF v_different_owner THEN
    INSERT INTO admin_notifications (
      admin_id, deal_id, notification_type, title, message, action_url, metadata
    ) VALUES (
      v_previous_owner_id,
      p_deal_id,
      'deal_modified',
      'Your deal was modified',
      COALESCE(v_current_admin_name, 'Another admin') || ' moved your deal from "' || v_old_stage_name || '" to "' || v_new_stage_name || '"',
      '/admin/pipeline?deal=' || p_deal_id,
      jsonb_build_object(
        'modifying_admin_id', p_current_admin_id,
        'modifying_admin_name', v_current_admin_name,
        'old_stage', v_old_stage_name,
        'new_stage', v_new_stage_name
      )
    );
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'deal_id', p_deal_id,
    'old_stage_name', v_old_stage_name,
    'new_stage_name', v_new_stage_name,
    'owner_assigned', v_should_assign_owner,
    'different_owner_warning', v_different_owner,
    'previous_owner_id', v_previous_owner_id,
    'previous_owner_name', v_previous_owner_name,
    'assigned_to', CASE WHEN v_should_assign_owner THEN p_current_admin_id ELSE v_deal_record.assigned_to END
  );

  RETURN v_result;
END;
$$;


-- ─── 4d. get_buyer_deal_history() ───────────────────────────────────────
-- Latest source: 20260303100000_security_hardening_phase2.sql

DROP FUNCTION IF EXISTS public.get_buyer_deal_history(uuid);
CREATE OR REPLACE FUNCTION public.get_buyer_deal_history(p_buyer_id UUID)
RETURNS TABLE (
  deal_id UUID,
  deal_title TEXT,
  deal_category TEXT,
  has_teaser_access BOOLEAN,
  has_full_memo_access BOOLEAN,
  has_data_room_access BOOLEAN,
  memos_sent BIGINT,
  last_memo_sent_at TIMESTAMPTZ,
  pipeline_stage TEXT,
  pipeline_stage_id UUID
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
    COALESCE(
      (SELECT COUNT(*) FROM public.memo_distribution_log dl
       WHERE dl.deal_id = l.id AND dl.remarketing_buyer_id = p_buyer_id),
      0::bigint
    ) AS memos_sent,
    (SELECT MAX(dl.sent_at) FROM public.memo_distribution_log dl
     WHERE dl.deal_id = l.id AND dl.remarketing_buyer_id = p_buyer_id
    ) AS last_memo_sent_at,
    ds.name AS pipeline_stage,
    d.stage_id AS pipeline_stage_id
  FROM public.listings l
  LEFT JOIN public.data_room_access a
    ON a.deal_id = l.id AND a.remarketing_buyer_id = p_buyer_id
  LEFT JOIN public.deal_pipeline d
    ON d.listing_id = l.id AND d.remarketing_buyer_id = p_buyer_id
  LEFT JOIN public.deal_stages ds ON ds.id = d.stage_id
  WHERE a.id IS NOT NULL
     OR d.id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.memo_distribution_log dl
                WHERE dl.deal_id = l.id AND dl.remarketing_buyer_id = p_buyer_id)
  ORDER BY GREATEST(
    a.granted_at,
    d.created_at,
    (SELECT MAX(dl.sent_at) FROM public.memo_distribution_log dl
     WHERE dl.deal_id = l.id AND dl.remarketing_buyer_id = p_buyer_id)
  ) DESC NULLS LAST;
END;
$$;


-- ─── 4e. delete_listing_cascade() ──────────────────────────────────────
-- Latest source: 20260302000000_fix_delete_listing_cascade.sql

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

  DELETE FROM public.marketplace_approval_queue WHERE deal_id = p_listing_id;
  DELETE FROM public.deal_data_room_access WHERE deal_id = p_listing_id;
  DELETE FROM public.document_release_log WHERE deal_id = p_listing_id;
  DELETE FROM public.document_tracked_links WHERE deal_id = p_listing_id;
  DELETE FROM public.deal_documents WHERE deal_id = p_listing_id;
  DELETE FROM public.data_room_audit_log WHERE deal_id = p_listing_id;
  DELETE FROM public.data_room_access WHERE deal_id = p_listing_id;
  DELETE FROM public.data_room_documents WHERE deal_id = p_listing_id;
  DELETE FROM public.memo_distribution_log WHERE deal_id = p_listing_id;
  DELETE FROM public.lead_memo_versions WHERE memo_id IN (
    SELECT id FROM public.lead_memos WHERE deal_id = p_listing_id
  );
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
  DELETE FROM public.remarketing_scores WHERE listing_id = p_listing_id;
  DELETE FROM public.remarketing_scoring_queue WHERE listing_id = p_listing_id;
  DELETE FROM public.remarketing_universe_deals WHERE listing_id = p_listing_id;
  DELETE FROM public.saved_listings WHERE listing_id = p_listing_id;
  DELETE FROM public.similar_deal_alerts WHERE source_listing_id = p_listing_id;
  DELETE FROM public.score_snapshots WHERE listing_id = p_listing_id;
  UPDATE public.inbound_leads SET mapped_to_listing_id = NULL WHERE mapped_to_listing_id = p_listing_id;
  UPDATE public.valuation_leads SET pushed_listing_id = NULL WHERE pushed_listing_id = p_listing_id;
  DELETE FROM public.listings WHERE id = p_listing_id;
END;
$$;


-- ─── 4f. create_deal_from_connection_request() ──────────────────────────
-- Latest source: 20260306400000_update_deal_creation_triggers.sql

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
  SELECT id INTO default_stage_id
  FROM public.deal_stages
  WHERE is_default = TRUE
  ORDER BY position
  LIMIT 1;

  SELECT title INTO listing_title
  FROM public.listings
  WHERE id = NEW.listing_id;

  deal_title := COALESCE(NEW.lead_name, 'Unknown') || ' - ' || COALESCE(listing_title, 'Unknown Listing');

  IF NEW.user_id IS NOT NULL THEN
    SELECT c.id, c.remarketing_buyer_id
    INTO v_buyer_contact_id, v_remarketing_buyer_id
    FROM public.contacts c
    WHERE c.profile_id = NEW.user_id
      AND c.contact_type = 'buyer'
      AND c.archived = false
    LIMIT 1;
  END IF;

  IF NEW.listing_id IS NOT NULL THEN
    SELECT c.id INTO v_seller_contact_id
    FROM public.contacts c
    WHERE c.listing_id = NEW.listing_id
      AND c.contact_type = 'seller'
      AND c.is_primary_seller_contact = true
      AND c.archived = false
    LIMIT 1;
  END IF;

  INSERT INTO public.deal_pipeline (
    listing_id,
    stage_id,
    connection_request_id,
    title,
    description,
    source,
    contact_name,
    contact_email,
    contact_company,
    contact_phone,
    contact_role,
    buyer_contact_id,
    seller_contact_id,
    remarketing_buyer_id,
    metadata
  ) VALUES (
    NEW.listing_id,
    default_stage_id,
    NEW.id,
    deal_title,
    NEW.user_message,
    COALESCE(NEW.source, 'marketplace'),
    COALESCE(NEW.lead_name, (SELECT first_name || ' ' || last_name FROM public.profiles WHERE id = NEW.user_id)),
    COALESCE(NEW.lead_email, (SELECT email FROM public.profiles WHERE id = NEW.user_id)),
    NEW.lead_company,
    NEW.lead_phone,
    NEW.lead_role,
    v_buyer_contact_id,
    v_seller_contact_id,
    v_remarketing_buyer_id,
    jsonb_build_object(
      'auto_created', TRUE,
      'source_type', 'connection_request'
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 4g. create_deal_from_inbound_lead() ────────────────────────────────
-- Latest source: 20260306400000_update_deal_creation_triggers.sql

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
    SELECT id INTO default_stage_id
    FROM public.deal_stages
    WHERE is_default = TRUE
    ORDER BY position
    LIMIT 1;

    SELECT title INTO listing_title
    FROM public.listings
    WHERE id = NEW.mapped_to_listing_id;

    deal_title := COALESCE(NEW.name, 'Unknown') || ' - ' || COALESCE(listing_title, 'Unknown Listing');

    IF NEW.email IS NOT NULL THEN
      SELECT c.id, c.remarketing_buyer_id
      INTO v_buyer_contact_id, v_remarketing_buyer_id
      FROM public.contacts c
      WHERE lower(c.email) = lower(NEW.email)
        AND c.contact_type = 'buyer'
        AND c.archived = false
      LIMIT 1;
    END IF;

    IF NEW.mapped_to_listing_id IS NOT NULL THEN
      SELECT c.id INTO v_seller_contact_id
      FROM public.contacts c
      WHERE c.listing_id = NEW.mapped_to_listing_id
        AND c.contact_type = 'seller'
        AND c.is_primary_seller_contact = true
        AND c.archived = false
      LIMIT 1;
    END IF;

    INSERT INTO public.deal_pipeline (
      listing_id,
      stage_id,
      inbound_lead_id,
      title,
      description,
      source,
      contact_name,
      contact_email,
      contact_company,
      contact_phone,
      contact_role,
      buyer_contact_id,
      seller_contact_id,
      remarketing_buyer_id,
      metadata
    ) VALUES (
      NEW.mapped_to_listing_id,
      default_stage_id,
      NEW.id,
      deal_title,
      NEW.message,
      COALESCE(NEW.source, 'webflow'),
      NEW.name,
      NEW.email,
      NEW.company_name,
      NEW.phone_number,
      NEW.role,
      v_buyer_contact_id,
      v_seller_contact_id,
      v_remarketing_buyer_id,
      jsonb_build_object(
        'auto_created', TRUE,
        'source_type', 'inbound_lead'
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 4h. auto_create_deal_from_connection_request() ─────────────────────
-- Latest source: 20260303000000_drop_dead_objects_phase2.sql

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
  SELECT id INTO new_inquiry_stage_id
  FROM public.deal_stages
  WHERE name = 'New Inquiry'
  LIMIT 1;

  deal_source_value := CASE
    WHEN NEW.source IN ('website', 'marketplace', 'webflow', 'manual') THEN NEW.source
    ELSE 'marketplace'
  END;

  IF NEW.user_id IS NOT NULL THEN
    SELECT
      COALESCE(p.first_name || ' ' || p.last_name, p.email),
      p.email,
      p.company,
      p.phone_number,
      p.buyer_type,
      COALESCE(calculate_buyer_priority_score(p.buyer_type), 0)
    INTO
      contact_name_value,
      contact_email_value,
      contact_company_value,
      contact_phone_value,
      contact_role_value,
      buyer_priority_value
    FROM public.profiles p
    WHERE p.id = NEW.user_id;
  ELSE
    contact_name_value := NEW.lead_name;
    contact_email_value := NEW.lead_email;
    contact_company_value := NEW.lead_company;
    contact_phone_value := NEW.lead_phone;
    contact_role_value := NEW.lead_role;
    buyer_priority_value := COALESCE(NEW.buyer_priority_score, 0);
  END IF;

  INSERT INTO public.deal_pipeline (
    listing_id,
    stage_id,
    connection_request_id,
    value,
    probability,
    source,
    title,
    contact_name,
    contact_email,
    contact_company,
    contact_phone,
    contact_role,
    buyer_priority_score,
    nda_status,
    fee_agreement_status,
    created_at,
    stage_entered_at
  ) VALUES (
    NEW.listing_id,
    new_inquiry_stage_id,
    NEW.id,
    0,
    5,
    deal_source_value,
    COALESCE(
      contact_name_value || ' - ' || (SELECT title FROM public.listings WHERE id = NEW.listing_id),
      'New Deal'
    ),
    COALESCE(contact_name_value, 'Unknown Contact'),
    contact_email_value,
    contact_company_value,
    contact_phone_value,
    contact_role_value,
    buyer_priority_value,
    CASE
      WHEN NEW.lead_nda_signed THEN 'signed'
      WHEN NEW.lead_nda_email_sent THEN 'sent'
      ELSE 'not_sent'
    END,
    CASE
      WHEN NEW.lead_fee_agreement_signed THEN 'signed'
      WHEN NEW.lead_fee_agreement_email_sent THEN 'sent'
      ELSE 'not_sent'
    END,
    NEW.created_at,
    NEW.created_at
  );

  RETURN NEW;
END;
$function$;


-- ─── 4i. create_deal_on_request_approval() ──────────────────────────────
-- Latest source: 20260311100000_enforce_valid_website_for_active_deals.sql

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
    IF existing_deal_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    SELECT website INTO v_listing_website
    FROM public.listings
    WHERE id = NEW.listing_id;

    IF NOT public.is_valid_company_website(v_listing_website) THEN
      RETURN NEW;
    END IF;

    SELECT id INTO qualified_stage_id FROM public.deal_stages
      WHERE is_active = true AND name = 'Qualified'
      ORDER BY position
      LIMIT 1;

    IF qualified_stage_id IS NULL THEN
      SELECT id INTO qualified_stage_id FROM public.deal_stages WHERE is_active = true ORDER BY position LIMIT 1;
    END IF;

    SELECT COALESCE(NEW.lead_name, p.first_name || ' ' || p.last_name),
           COALESCE(NEW.lead_email, p.email),
           COALESCE(NEW.lead_company, p.company),
           COALESCE(NEW.lead_phone, p.phone_number),
           COALESCE(NEW.lead_role, p.job_title)
    INTO buyer_name, buyer_email, buyer_company, buyer_phone, buyer_role
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    IF COALESCE(NEW.lead_nda_signed, false) THEN
      nda_status := 'signed';
    ELSIF COALESCE(NEW.lead_nda_email_sent, false) THEN
      nda_status := 'sent';
    END IF;

    IF COALESCE(NEW.lead_fee_agreement_signed, false) THEN
      fee_status := 'signed';
    ELSIF COALESCE(NEW.lead_fee_agreement_email_sent, false) THEN
      fee_status := 'sent';
    END IF;

    src := COALESCE(NEW.source, 'marketplace');

    SELECT COALESCE(l.title, 'Unknown') INTO deal_title FROM public.listings l WHERE l.id = NEW.listing_id;

    INSERT INTO public.deal_pipeline (
      listing_id, stage_id, connection_request_id, value, probability, expected_close_date,
      assigned_to, stage_entered_at, source,
      contact_name, contact_email, contact_company, contact_phone, contact_role,
      nda_status, fee_agreement_status, title, description, priority
    )
    VALUES (
      NEW.listing_id, qualified_stage_id, NEW.id, 0, 50, NULL,
      NEW.approved_by, now(), src,
      buyer_name, buyer_email, buyer_company, buyer_phone, buyer_role,
      nda_status, fee_status,
      deal_title,
      COALESCE(NEW.user_message, 'Deal created from approved connection request'),
      'medium'
    )
    RETURNING id INTO new_deal_id;

    IF new_deal_id IS NOT NULL THEN
      INSERT INTO public.deal_activities (deal_id, admin_id, activity_type, title, description, metadata)
      VALUES (
        new_deal_id,
        NEW.approved_by,
        'note_added',
        'Created from connection request',
        COALESCE(NEW.user_message, 'Approved connection request and created deal'),
        jsonb_build_object('connection_request_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- ─── 4j. sync_followup_to_deals() ──────────────────────────────────────
-- Latest source: 20260116185345_9f55540f-...
-- (Trigger fires on connection_requests, updates deal_pipeline)

CREATE OR REPLACE FUNCTION public.sync_followup_to_deals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE deal_pipeline
  SET
    followed_up = NEW.followed_up,
    followed_up_at = NEW.followed_up_at,
    followed_up_by = NEW.followed_up_by,
    negative_followed_up = NEW.negative_followed_up,
    negative_followed_up_at = NEW.negative_followed_up_at,
    negative_followed_up_by = NEW.negative_followed_up_by
  WHERE connection_request_id = NEW.id;
  RETURN NEW;
END;
$$;


-- ─── 4k. cascade_soft_delete_listing() ──────────────────────────────────
-- Latest source: 20260304000000_soft_delete_cascade_trigger.sql

CREATE OR REPLACE FUNCTION public.cascade_soft_delete_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.remarketing_scores
      SET deleted_at = NEW.deleted_at
      WHERE listing_id = NEW.id AND deleted_at IS NULL;

    UPDATE public.remarketing_universe_deals
      SET deleted_at = NEW.deleted_at
      WHERE listing_id = NEW.id AND deleted_at IS NULL;

    UPDATE public.deal_pipeline
      SET deleted_at = NEW.deleted_at
      WHERE listing_id = NEW.id AND deleted_at IS NULL;

    UPDATE public.enrichment_queue
      SET deleted_at = NEW.deleted_at
      WHERE listing_id = NEW.id AND deleted_at IS NULL;
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE public.remarketing_scores
      SET deleted_at = NULL
      WHERE listing_id = NEW.id AND deleted_at = OLD.deleted_at;

    UPDATE public.remarketing_universe_deals
      SET deleted_at = NULL
      WHERE listing_id = NEW.id AND deleted_at = OLD.deleted_at;

    UPDATE public.deal_pipeline
      SET deleted_at = NULL
      WHERE listing_id = NEW.id AND deleted_at = OLD.deleted_at;

    UPDATE public.enrichment_queue
      SET deleted_at = NULL
      WHERE listing_id = NEW.id AND deleted_at = OLD.deleted_at;
  END IF;

  RETURN NEW;
END;
$$;


-- ─── 4l. handle_listing_status_change() ─────────────────────────────────
-- Latest source: 20260227000000_ai_task_system_v31_schema.sql

CREATE OR REPLACE FUNCTION public.handle_listing_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'sold' AND OLD.status != 'sold' THEN
    UPDATE public.daily_standup_tasks
    SET status = 'listing_closed',
        updated_at = now()
    WHERE entity_type = 'listing' AND entity_id = NEW.id
      AND status IN ('pending','pending_approval','in_progress','overdue');

    UPDATE public.daily_standup_tasks
    SET status = 'listing_closed',
        updated_at = now()
    WHERE entity_type = 'deal' AND entity_id IN (
      SELECT id FROM public.deal_pipeline WHERE listing_id = NEW.id
    )
    AND status IN ('pending','pending_approval','in_progress','overdue');
  END IF;

  IF NEW.status = 'inactive' AND OLD.status = 'active' THEN
    UPDATE public.daily_standup_tasks
    SET status = 'snoozed',
        snoozed_until = CURRENT_DATE + INTERVAL '30 days',
        updated_at = now()
    WHERE entity_type = 'listing' AND entity_id = NEW.id
      AND status IN ('pending','pending_approval','in_progress','overdue');
  END IF;

  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5: Recreate triggers on deal_pipeline
-- ═══════════════════════════════════════════════════════════════════════════

-- update_deal_stage_timestamp (BEFORE UPDATE)
CREATE TRIGGER trg_deal_stage_timestamp
  BEFORE UPDATE ON public.deal_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.update_deal_stage_timestamp();

-- auto_assign_deal (BEFORE INSERT)
CREATE TRIGGER trigger_auto_assign_deal
  BEFORE INSERT ON public.deal_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_deal_from_listing();

-- notify_deal_reassignment (AFTER UPDATE OF assigned_to)
CREATE TRIGGER trigger_notify_deal_reassignment
  AFTER UPDATE OF assigned_to ON public.deal_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_deal_reassignment();

-- sync_followup_to_connection_requests (AFTER UPDATE)
CREATE TRIGGER sync_followup_to_connection_requests
  AFTER UPDATE ON public.deal_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_followup_to_connection_requests();

-- trg_deal_stage_change (AFTER UPDATE OF stage_id)
CREATE TRIGGER trg_deal_stage_change
  AFTER UPDATE OF stage_id ON public.deal_pipeline
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION public.handle_deal_stage_change();

-- audit_deals_trigger (generic audit)
CREATE TRIGGER audit_deal_pipeline_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.deal_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.generic_audit_trigger();


COMMIT;
