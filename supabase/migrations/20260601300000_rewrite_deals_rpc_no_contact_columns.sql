-- ============================================================================
-- MIGRATION: Rewrite get_deals_with_buyer_profiles without contact columns
--
-- After dropping contact_name/email/company/phone/role from deal_pipeline,
-- the RPC sources buyer contact data from:
--   1. connection_requests.lead_* (for marketplace deals with anonymous leads)
--   2. profiles (for registered buyers via connection_requests.user_id)
--   3. contacts table (for manual deals via buyer_contact_id)
--
-- Also adds listing seller contact info as new output columns.
-- ============================================================================

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
  -- Seller contact info (from listings)
  listing_seller_contact_name text,
  listing_seller_contact_email text,
  listing_seller_contact_phone text,
  listing_seller_contact_title text,
  admin_id uuid,
  admin_first_name text,
  admin_last_name text,
  admin_email text,
  buyer_type text,
  buyer_website text,
  buyer_quality_score numeric,
  buyer_tier integer,
  -- Buyer contact info: COALESCE from connection_requests → contacts → profiles
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
    -- Seller contact from listings
    l.main_contact_name,
    l.main_contact_email,
    l.main_contact_phone,
    l.main_contact_title,
    ap.id,
    ap.first_name,
    ap.last_name,
    ap.email,
    bp.buyer_type,
    COALESCE(bp.website, bp.buyer_org_url),
    bp.buyer_quality_score,
    bp.buyer_tier,
    -- Buyer contact: prefer connection_request lead_*, fall back to contacts table
    COALESCE(
      cr.lead_name,
      NULLIF(TRIM(COALESCE(bc.first_name, '') || ' ' || COALESCE(bc.last_name, '')), ''),
      NULLIF(TRIM(COALESCE(bp.first_name, '') || ' ' || COALESCE(bp.last_name, '')), '')
    ),
    COALESCE(cr.lead_email, bc.email, bp.email),
    COALESCE(cr.lead_company, bc.company, bp.company),
    COALESCE(cr.lead_phone, bc.phone, bp.phone_number),
    COALESCE(cr.lead_role, bc.title),
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
  LEFT JOIN public.contacts bc ON bc.id = d.buyer_contact_id
  WHERE d.deleted_at IS NULL
    AND (
      d.connection_request_id IS NULL
      OR cr.id IS NOT NULL
    )
  ORDER BY d.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_deals_with_buyer_profiles() IS
  'Returns all active deals with pre-joined listing, stage, admin, buyer profile, '
  'and seller contact data. Contact info sourced from connection_requests/contacts/profiles '
  '(never from deal_pipeline directly — those columns are dropped).';


-- Also update get_deals_with_details to not reference contact columns
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
    -- contact_name: prefer connection_request lead, then contacts table, then profile
    COALESCE(
      NULLIF(cr.lead_name, ''),
      NULLIF(TRIM(COALESCE(bc.first_name, '') || ' ' || COALESCE(bc.last_name, '')), ''),
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      p.email,
      'Unknown Contact'
    ) as contact_name,
    COALESCE(cr.lead_email, bc.email, p.email) as contact_email,
    COALESCE(cr.lead_company, bc.company, p.company) as contact_company,
    COALESCE(cr.lead_phone, bc.phone, p.phone_number) as contact_phone,
    COALESCE(cr.lead_role, bc.title) as contact_role,
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
    COUNT(*) OVER (PARTITION BY COALESCE(l.internal_company_name, cr.lead_company, bc.company, p.company)) as company_deal_count,
    COUNT(*) OVER (PARTITION BY d.listing_id) as listing_deal_count,
    (
      SELECT COUNT(*)::bigint
      FROM connection_requests cr_count
      WHERE (cr_count.user_id = cr.user_id AND cr.user_id IS NOT NULL)
         OR (cr_count.lead_email = COALESCE(cr.lead_email, bc.email, p.email) AND cr_count.lead_email IS NOT NULL)
    ) as buyer_connection_count
  FROM deal_pipeline d
  LEFT JOIN deal_stages ds ON d.stage_id = ds.id
  LEFT JOIN listings l ON d.listing_id = l.id
  LEFT JOIN connection_requests cr ON d.connection_request_id = cr.id
  LEFT JOIN profiles p ON cr.user_id = p.id
  LEFT JOIN contacts bc ON d.buyer_contact_id = bc.id
  WHERE d.deleted_at IS NULL
  ORDER BY d.created_at DESC;
END;
$$;
