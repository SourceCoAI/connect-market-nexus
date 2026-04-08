-- ============================================================================
-- CTO AUDIT PHASE 2 — Database hardening
--
-- This migration addresses remaining database items from the CTO audit:
--   1. RLS: Enforce access expiration on data_room_access (item 5.3)
--   2. FK: Change CASCADE to RESTRICT on data_room_access FKs (item 5.7)
--   3. Computed access status view (item 5.10)
--   4. RPC: get_deals_with_buyer_profiles for N+1 elimination (item 6.1)
-- ============================================================================


-- ─── 1. RLS: Enforce access expiration (item 5.3) ───
-- The existing policy allows buyers to see expired/revoked access rows.
-- Add expiration + revocation checks to the buyer-facing SELECT policy.

DROP POLICY IF EXISTS "Buyers can view own access" ON public.data_room_access;
CREATE POLICY "Buyers can view own access"
  ON public.data_room_access
  FOR SELECT TO authenticated
  USING (
    (
      marketplace_user_id = auth.uid()
      OR contact_id IN (
        SELECT c.id FROM public.contacts c WHERE c.profile_id = auth.uid()
      )
    )
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );


-- ─── 2. FK: CASCADE → RESTRICT on data_room_access (item 5.7) ───
-- Prevents accidental cascade deletion when a buyer or user is removed.
-- Admins must explicitly clean up access rows before deleting entities.

-- remarketing_buyer_id FK
ALTER TABLE public.data_room_access
  DROP CONSTRAINT IF EXISTS data_room_access_remarketing_buyer_id_fkey;

DO $$ BEGIN
  ALTER TABLE public.data_room_access
    ADD CONSTRAINT data_room_access_remarketing_buyer_id_fkey
    FOREIGN KEY (remarketing_buyer_id)
    REFERENCES public.remarketing_buyers(id)
    ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- marketplace_user_id FK
ALTER TABLE public.data_room_access
  DROP CONSTRAINT IF EXISTS data_room_access_marketplace_user_id_fkey;

DO $$ BEGIN
  ALTER TABLE public.data_room_access
    ADD CONSTRAINT data_room_access_marketplace_user_id_fkey
    FOREIGN KEY (marketplace_user_id)
    REFERENCES auth.users(id)
    ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ─── 3. Computed access status view (item 5.10) ───
-- Replaces ambiguous NULL semantics with an explicit access_status column.
-- State: active = (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()))
--        expired = (expires_at <= now() AND revoked_at IS NULL)
--        revoked = (revoked_at IS NOT NULL)

CREATE OR REPLACE VIEW public.data_room_access_status AS
SELECT
  *,
  CASE
    WHEN revoked_at IS NOT NULL THEN 'revoked'
    WHEN expires_at IS NOT NULL AND expires_at <= now() THEN 'expired'
    ELSE 'active'
  END AS access_status
FROM public.data_room_access;

COMMENT ON VIEW public.data_room_access_status IS
  'Convenience view over data_room_access with computed access_status column. '
  'Eliminates ambiguous NULL semantics: revoked_at IS NOT NULL → revoked, '
  'expires_at <= now() → expired, otherwise → active.';


-- ─── 4. RPC: get_deals_with_buyer_profiles (item 6.1 — N+1 elimination) ───
-- Replaces the 3-4 sequential query loops in use-deals.ts with a single
-- server-side join. Returns deals with their listings, stages, assigned admins,
-- connection request approval status, and buyer profiles.

CREATE OR REPLACE FUNCTION public.get_deals_with_buyer_profiles()
RETURNS TABLE (
  deal_id UUID,
  deal_title TEXT,
  deal_description TEXT,
  deal_value NUMERIC,
  deal_priority TEXT,
  deal_probability NUMERIC,
  deal_expected_close_date DATE,
  deal_source TEXT,
  deal_created_at TIMESTAMPTZ,
  deal_updated_at TIMESTAMPTZ,
  deal_stage_entered_at TIMESTAMPTZ,
  deal_deleted_at TIMESTAMPTZ,
  connection_request_id UUID,
  -- Stage
  stage_id UUID,
  stage_name TEXT,
  stage_color TEXT,
  stage_position INT,
  stage_is_active BOOLEAN,
  stage_is_default BOOLEAN,
  stage_is_system_stage BOOLEAN,
  stage_default_probability NUMERIC,
  stage_type TEXT,
  -- Listing
  listing_id UUID,
  listing_title TEXT,
  listing_revenue NUMERIC,
  listing_ebitda NUMERIC,
  listing_location TEXT,
  listing_category TEXT,
  listing_internal_company_name TEXT,
  listing_image_url TEXT,
  listing_deal_total_score NUMERIC,
  listing_is_priority_target BOOLEAN,
  listing_needs_owner_contact BOOLEAN,
  -- Assigned admin
  admin_id UUID,
  admin_first_name TEXT,
  admin_last_name TEXT,
  admin_email TEXT,
  -- Buyer profile (from connection_request → profile)
  buyer_type TEXT,
  buyer_website TEXT,
  buyer_quality_score NUMERIC,
  buyer_tier INT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    d.id AS deal_id,
    d.title AS deal_title,
    d.description AS deal_description,
    d.value AS deal_value,
    d.priority AS deal_priority,
    d.probability AS deal_probability,
    d.expected_close_date AS deal_expected_close_date,
    d.source AS deal_source,
    d.created_at AS deal_created_at,
    d.updated_at AS deal_updated_at,
    COALESCE(d.stage_entered_at, d.created_at) AS deal_stage_entered_at,
    d.deleted_at AS deal_deleted_at,
    d.connection_request_id,
    -- Stage
    ds.id AS stage_id,
    ds.name AS stage_name,
    ds.color AS stage_color,
    ds.position AS stage_position,
    ds.is_active AS stage_is_active,
    ds.is_default AS stage_is_default,
    ds.is_system_stage AS stage_is_system_stage,
    ds.default_probability AS stage_default_probability,
    ds.stage_type AS stage_type,
    -- Listing
    l.id AS listing_id,
    l.title AS listing_title,
    l.revenue AS listing_revenue,
    l.ebitda AS listing_ebitda,
    l.location AS listing_location,
    l.category AS listing_category,
    l.internal_company_name AS listing_internal_company_name,
    l.image_url AS listing_image_url,
    l.deal_total_score AS listing_deal_total_score,
    l.is_priority_target AS listing_is_priority_target,
    l.needs_owner_contact AS listing_needs_owner_contact,
    -- Assigned admin
    ap.id AS admin_id,
    ap.first_name AS admin_first_name,
    ap.last_name AS admin_last_name,
    ap.email AS admin_email,
    -- Buyer profile (joined through connection_request)
    bp.buyer_type AS buyer_type,
    COALESCE(bp.website, bp.buyer_org_url) AS buyer_website,
    bp.buyer_quality_score AS buyer_quality_score,
    bp.buyer_tier AS buyer_tier
  FROM public.deals d
  LEFT JOIN public.listings l ON l.id = d.listing_id
  LEFT JOIN public.deal_stages ds ON ds.id = d.stage_id
  LEFT JOIN public.profiles ap ON ap.id = d.assigned_to
  LEFT JOIN public.connection_requests cr ON cr.id = d.connection_request_id
  LEFT JOIN public.profiles bp ON bp.id = cr.user_id
  WHERE d.deleted_at IS NULL
    -- Only include deals that are from remarketing/manual (no CR) or have approved CRs
    AND (
      d.connection_request_id IS NULL
      OR cr.status = 'approved'
    )
  ORDER BY d.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_deals_with_buyer_profiles() IS
  'Returns all active deals with pre-joined listing, stage, admin, and buyer profile data. '
  'Eliminates the N+1 query pattern in the frontend use-deals hook.';

-- Merged from: 20260224100000_internal_team_role_updates.sql
-- ============================================================================
-- Internal Team Page - Role System Updates
--
-- Updates:
--   1. get_all_user_roles() - Allow admin access (not just owner)
--   2. change_user_role() - Sync is_admin=true for moderator role too
--      (moderator = Team Member, needs admin panel access)
--   3. Allow admins to assign 'moderator' role (not just owner)
-- ============================================================================

-- ─── 0. Drop functions first (return type changed, CREATE OR REPLACE won't work) ───
DROP FUNCTION IF EXISTS public.get_all_user_roles();
DROP FUNCTION IF EXISTS public.change_user_role(uuid, app_role, text);

-- ─── 1. Update get_all_user_roles to allow admin access ───
-- Previously: only owner could call this
-- Now: admin and owner can see all roles (needed for Internal Team page)

CREATE OR REPLACE FUNCTION public.get_all_user_roles()
RETURNS TABLE(
  user_id uuid,
  role app_role,
  granted_at timestamp with time zone,
  granted_by uuid,
  user_email text,
  user_first_name text,
  user_last_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owner or admin can view all roles
  IF NOT (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'admin')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ur.user_id,
    ur.role,
    ur.granted_at,
    ur.granted_by,
    au.email as user_email,
    p.first_name as user_first_name,
    p.last_name as user_last_name
  FROM public.user_roles ur
  LEFT JOIN auth.users au ON ur.user_id = au.id
  LEFT JOIN public.profiles p ON ur.user_id = p.id
  ORDER BY
    CASE ur.role
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'moderator' THEN 3
      ELSE 4
    END,
    ur.granted_at DESC;
END;
$$;

-- ─── 2. Update change_user_role to handle moderator correctly ───
-- Key changes:
--   a) Admin can assign 'moderator' role (not just owner)
--   b) is_admin synced for moderator too (they need admin panel access)
--   c) Owner-only operations remain owner-only (assigning admin/owner roles)

CREATE OR REPLACE FUNCTION public.change_user_role(
  target_user_id uuid,
  new_role app_role,
  change_reason text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  caller_id UUID;
  caller_role public.app_role;
  old_role public.app_role;
  target_email TEXT;
BEGIN
  caller_id := auth.uid();
  caller_role := public.get_user_role(caller_id);

  -- Admin can assign moderator role; owner can assign any role
  IF caller_role = 'admin' THEN
    -- Admins can only assign 'moderator' or 'user' roles
    IF new_role NOT IN ('moderator', 'user') THEN
      RAISE EXCEPTION 'Admins can only assign Team Member or User roles';
    END IF;
  ELSIF NOT public.is_owner(caller_id) THEN
    RAISE EXCEPTION 'Only owners and admins can change user roles';
  END IF;

  -- Prevent owner from demoting themselves
  IF caller_id = target_user_id AND new_role != 'owner' THEN
    RAISE EXCEPTION 'Owners cannot demote themselves';
  END IF;

  -- Get target user email
  SELECT email INTO target_email FROM auth.users WHERE id = target_user_id;

  -- Prevent changing the primary owner
  IF target_email = 'ahaile14@gmail.com' AND new_role != 'owner' THEN
    RAISE EXCEPTION 'Cannot change the owner role of the primary owner';
  END IF;

  -- Prevent creating multiple owners
  IF new_role = 'owner' AND target_email != 'ahaile14@gmail.com' THEN
    RAISE EXCEPTION 'Only ahaile14@gmail.com can have the owner role';
  END IF;

  -- Get old role
  old_role := public.get_user_role(target_user_id);

  -- Delete existing roles for this user
  DELETE FROM public.user_roles WHERE user_id = target_user_id;

  -- Insert new role
  INSERT INTO public.user_roles (user_id, role, granted_by, reason)
  VALUES (target_user_id, new_role, caller_id, change_reason);

  -- Log the change
  INSERT INTO public.permission_audit_log (
    target_user_id, changed_by, old_role, new_role, reason
  ) VALUES (
    target_user_id, caller_id, old_role, new_role, change_reason
  );

  -- Sync with profiles.is_admin for backward compatibility
  -- moderator (Team Member) ALSO gets is_admin=true so they can enter admin panel
  UPDATE public.profiles
  SET
    is_admin = (new_role IN ('owner', 'admin', 'moderator')),
    updated_at = NOW()
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$function$;

-- ─── 3. Update RLS on user_roles to allow admin read access ───

DROP POLICY IF EXISTS "Owner can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owner and admin can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owner can manage roles" ON public.user_roles;

CREATE POLICY "Owner and admin can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.is_owner(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR user_id = auth.uid()
);

CREATE POLICY "Owner can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_owner(auth.uid()))
WITH CHECK (public.is_owner(auth.uid()));

-- ============================================================================
-- Summary:
--   get_all_user_roles() now accessible by admin (not just owner)
--   change_user_role() now allows admin to assign 'moderator' role
--   change_user_role() now syncs is_admin=true for moderator role
--   RLS updated: admin can read user_roles table
-- ============================================================================
