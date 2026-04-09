-- ============================================================================
-- Portal access RPC — bypasses RLS for the initial portal access check.
--
-- The portal_organizations table has RLS policies that rely on is_admin()
-- and is_portal_member(). If those checks fail (sync issues, timing, etc.)
-- the frontend cannot even read the org row to determine access.
--
-- This SECURITY DEFINER function provides a reliable access check:
--   1. Resolves the org by slug
--   2. Checks if the caller is a portal member → returns their portal_users row
--   3. Checks if the caller is an admin → returns a synthetic result
--   4. Otherwise returns NULL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_portal_access(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_org_name text;
  v_org_slug text;
  v_welcome_message text;
  v_user_id uuid;
  v_portal_user jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Resolve org by slug (direct table access, no RLS)
  SELECT id, name, portal_slug, welcome_message
    INTO v_org_id, v_org_name, v_org_slug, v_welcome_message
    FROM portal_organizations
   WHERE portal_slug = p_slug
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Check if user is an actual portal member
  SELECT jsonb_build_object(
    'id', pu.id,
    'portal_org_id', pu.portal_org_id,
    'profile_id', pu.profile_id,
    'contact_id', pu.contact_id,
    'role', pu.role,
    'email', pu.email,
    'name', pu.name,
    'is_active', pu.is_active,
    'last_login_at', pu.last_login_at,
    'invite_sent_at', pu.invite_sent_at,
    'invite_accepted_at', pu.invite_accepted_at,
    'created_at', pu.created_at,
    'updated_at', pu.updated_at,
    'portal_org', jsonb_build_object(
      'id', v_org_id,
      'name', v_org_name,
      'portal_slug', v_org_slug,
      'welcome_message', v_welcome_message
    )
  )
  INTO v_portal_user
  FROM portal_users pu
  WHERE pu.portal_org_id = v_org_id
    AND pu.profile_id = v_user_id
    AND pu.is_active = true
  LIMIT 1;

  IF v_portal_user IS NOT NULL THEN
    RETURN v_portal_user;
  END IF;

  -- 3. Check if user is an admin (via user_roles OR profiles.is_admin)
  IF EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = v_user_id
      AND role IN ('admin', 'owner', 'moderator')
  ) OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_user_id
      AND is_admin = true
  ) THEN
    RETURN jsonb_build_object(
      'id', 'admin-preview-' || v_user_id::text,
      'portal_org_id', v_org_id,
      'profile_id', v_user_id,
      'contact_id', null,
      'role', 'admin',
      'email', '',
      'name', 'Admin Preview',
      'is_active', true,
      'last_login_at', null,
      'invite_sent_at', null,
      'invite_accepted_at', null,
      'created_at', now(),
      'updated_at', now(),
      'portal_org', jsonb_build_object(
        'id', v_org_id,
        'name', v_org_name,
        'portal_slug', v_org_slug,
        'welcome_message', v_welcome_message
      )
    );
  END IF;

  -- 4. No access
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.resolve_portal_access(text) IS
  'Resolves portal access for the current user. Returns portal_user data as JSONB if the user is a portal member or admin, NULL otherwise. SECURITY DEFINER to bypass RLS.';
