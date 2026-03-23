-- ============================================================================
-- MIGRATION: Add "under LOI" flag to deal_pipeline
-- ============================================================================
-- Allows admins to mark a deal as "Under LOI" (Letter of Intent).
-- When flagged, the deal card turns purple in the pipeline views.
-- Follows the same pattern as the existing meeting_scheduled flag.
-- ============================================================================

-- 1. Add column to deal_pipeline
ALTER TABLE public.deal_pipeline
  ADD COLUMN IF NOT EXISTS under_loi boolean DEFAULT false;

-- 2. Update the RPC to include the new field
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
  listing_needs_buyer_search boolean,
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
  meeting_scheduled boolean,
  under_loi boolean
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
    COALESCE(l.needs_buyer_search, false),
    ap.id,
    ap.first_name,
    ap.last_name,
    ap.email,
    bp.buyer_type,
    COALESCE(bp.website, bp.buyer_org_url),
    bp.buyer_quality_score,
    bp.buyer_tier,
    COALESCE(cr.lead_name, CONCAT(bc.first_name, ' ', bc.last_name)),
    COALESCE(cr.lead_email, bc.email),
    cr.lead_company,
    COALESCE(cr.lead_phone, bc.phone),
    cr.lead_role,
    COALESCE(bp.first_name, bc.first_name),
    COALESCE(bp.last_name, bc.last_name),
    COALESCE(bp.email, bc.email),
    bp.company,
    COALESCE(bp.phone_number, bc.phone),
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
    COALESCE(d.meeting_scheduled, false),
    COALESCE(d.under_loi, false)
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
  'Returns all active deal_pipeline rows with pre-joined listing, stage, admin, and buyer profile data. '
  'Eliminates the N+1 query pattern in the frontend use-deals hook.';
