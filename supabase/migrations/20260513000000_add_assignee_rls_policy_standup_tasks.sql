-- ============================================================
-- Add RLS policy for task assignees on daily_standup_tasks
--
-- Previously only admin/owner/moderator roles could read tasks.
-- Non-admin users assigned tasks could not see them at all,
-- causing the "My Tasks" view to be blank for regular users.
-- ============================================================

-- Allow users to SELECT tasks assigned to them
CREATE POLICY "assignees_read_own_tasks"
  ON daily_standup_tasks FOR SELECT
  USING (assignee_id = auth.uid());

-- Allow users to UPDATE tasks assigned to them (e.g. mark complete)
CREATE POLICY "assignees_update_own_tasks"
  ON daily_standup_tasks FOR UPDATE
  USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());

-- Allow users to SELECT meetings linked to their tasks
-- (needed for the source_meeting join in task queries)
CREATE POLICY "authenticated_read_standup_meetings"
  ON standup_meetings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Merged from: 20260513000000_add_needs_buyer_search.sql
-- ============================================================================
-- MIGRATION: Add "needs buyer search" flag to listings
-- ============================================================================
-- Mirrors the existing needs_owner_contact pattern.
-- When flagged, the deal row turns blue in the Active Deals table
-- to indicate the team needs to find a buyer for this deal.
-- ============================================================================

-- 1. Add columns to listings
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS needs_buyer_search boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_buyer_search_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_buyer_search_by uuid REFERENCES auth.users(id);

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
    COALESCE(l.needs_buyer_search, false),
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

-- Merged from: 20260513000000_move_buyer_scoring_to_remarketing.sql
-- ============================================================================
-- MOVE BUYER SCORING FIELDS TO REMARKETING_BUYERS
--
-- buyer_quality_score, buyer_tier, admin_tier_override, admin_override_note
-- currently live on profiles (the person/auth table). They belong on
-- remarketing_buyers (the company/buyer table) since they describe the
-- organization's quality, not the individual person.
--
-- Phase 1: Add columns to remarketing_buyers
-- Phase 2: Backfill from profiles (via remarketing_buyer_id FK)
-- Phase 3: Create a view for backwards-compatible reads
--
-- SAFETY: Additive only. No columns are dropped from profiles.
-- ============================================================================


-- ============================================================================
-- PHASE 1: ADD SCORING COLUMNS TO REMARKETING_BUYERS
-- ============================================================================

ALTER TABLE public.remarketing_buyers
  ADD COLUMN IF NOT EXISTS buyer_quality_score NUMERIC,
  ADD COLUMN IF NOT EXISTS buyer_quality_score_last_calculated TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_tier INTEGER
    CHECK (buyer_tier BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS admin_tier_override INTEGER
    CHECK (admin_tier_override BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS admin_override_note TEXT,
  ADD COLUMN IF NOT EXISTS platform_signal_detected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS platform_signal_source TEXT;

-- Index for tier-based queries (marketplace gating, pipeline sorting)
CREATE INDEX IF NOT EXISTS idx_buyers_tier
  ON public.remarketing_buyers(buyer_tier)
  WHERE buyer_tier IS NOT NULL AND archived = false;

-- Index for quality score sorting
CREATE INDEX IF NOT EXISTS idx_buyers_quality_score
  ON public.remarketing_buyers(buyer_quality_score DESC NULLS LAST)
  WHERE archived = false;


-- ============================================================================
-- PHASE 2: BACKFILL FROM PROFILES
-- ============================================================================
-- Copy scoring data from profiles → remarketing_buyers where linked.
-- Only fills NULL values on remarketing_buyers (don't overwrite existing data).

UPDATE public.remarketing_buyers rb
SET
  buyer_quality_score = COALESCE(rb.buyer_quality_score, p.buyer_quality_score),
  buyer_quality_score_last_calculated = COALESCE(
    rb.buyer_quality_score_last_calculated,
    p.buyer_quality_score_last_calculated::timestamptz
  ),
  buyer_tier = COALESCE(rb.buyer_tier, p.buyer_tier),
  admin_tier_override = COALESCE(rb.admin_tier_override, p.admin_tier_override),
  admin_override_note = COALESCE(rb.admin_override_note, p.admin_override_note),
  platform_signal_detected = COALESCE(rb.platform_signal_detected, p.platform_signal_detected, false),
  platform_signal_source = COALESCE(rb.platform_signal_source, p.platform_signal_source)
FROM public.profiles p
WHERE p.remarketing_buyer_id = rb.id
  AND p.deleted_at IS NULL
  AND (
    p.buyer_quality_score IS NOT NULL
    OR p.buyer_tier IS NOT NULL
    OR p.admin_tier_override IS NOT NULL
  );


-- ============================================================================
-- PHASE 3: UPDATE QUALITY SCORE FUNCTION TO WRITE TO REMARKETING_BUYERS
-- ============================================================================
-- The calculate-buyer-quality-score edge function currently writes to profiles.
-- We add a trigger that mirrors score writes from profiles → remarketing_buyers
-- so both stay in sync during the transition period.

CREATE OR REPLACE FUNCTION public.sync_buyer_score_to_remarketing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When buyer scoring fields change on profiles, sync to remarketing_buyers
  IF NEW.remarketing_buyer_id IS NOT NULL AND (
    NEW.buyer_quality_score IS DISTINCT FROM OLD.buyer_quality_score OR
    NEW.buyer_tier IS DISTINCT FROM OLD.buyer_tier OR
    NEW.admin_tier_override IS DISTINCT FROM OLD.admin_tier_override OR
    NEW.admin_override_note IS DISTINCT FROM OLD.admin_override_note OR
    NEW.platform_signal_detected IS DISTINCT FROM OLD.platform_signal_detected
  ) THEN
    UPDATE public.remarketing_buyers
    SET
      buyer_quality_score = NEW.buyer_quality_score,
      buyer_quality_score_last_calculated = NEW.buyer_quality_score_last_calculated::timestamptz,
      buyer_tier = NEW.buyer_tier,
      admin_tier_override = NEW.admin_tier_override,
      admin_override_note = NEW.admin_override_note,
      platform_signal_detected = COALESCE(NEW.platform_signal_detected, false),
      platform_signal_source = NEW.platform_signal_source,
      updated_at = now()
    WHERE id = NEW.remarketing_buyer_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_buyer_score ON public.profiles;
CREATE TRIGGER trg_sync_buyer_score
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_buyer_score_to_remarketing();


-- ============================================================================
-- Summary:
--   Phase 1: 7 new columns + 2 indexes on remarketing_buyers
--   Phase 2: Backfilled from profiles via remarketing_buyer_id
--   Phase 3: Sync trigger keeps both tables in sync during transition
-- ============================================================================
