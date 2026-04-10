-- ============================================================================
-- MIGRATION: Revoke direct INSERT/UPDATE on contacts
-- ============================================================================
-- Part of the contact consolidation strategy (phase 2 — final lockdown).
--
-- All write call sites in src/ and supabase/functions/ have been migrated
-- to call the contacts_upsert() SECURITY DEFINER RPC. The RPC runs as the
-- function owner and is not affected by the revoke. Direct writes are now
-- blocked for:
--
--   * authenticated role (all logged-in users)
--   * anon role (should never have had writes, but revoking for safety)
--
-- service_role retains full access because:
--   1. Test cleanup (schemaTests.ts) uses .from('contacts').delete()
--   2. Emergency admin operations may need bypass
--   3. The migration backfill scripts run as service_role
--
-- DELETE is NOT revoked — test cleanup and GDPR erasure need it. The
-- contacts_upsert() RPC handles soft-deletes; hard deletes are reserved
-- for test cleanup and admin data-ops.
--
-- SELECT is NOT revoked — read access stays open for all authenticated
-- users (subject to existing RLS policies).
--
-- Bypass: service_role, or a new SECURITY DEFINER function with explicit
-- elevated privileges.
-- ============================================================================


-- Revoke INSERT and UPDATE on contacts from the authenticated role.
-- The contacts_upsert() RPC is SECURITY DEFINER so it is not affected.
REVOKE INSERT, UPDATE ON public.contacts FROM authenticated;
REVOKE INSERT, UPDATE ON public.contacts FROM anon;

COMMENT ON TABLE public.contacts IS
  'Canonical unified contact store. Direct INSERT/UPDATE revoked for '
  'authenticated and anon roles as of 20260625. All writes must go through '
  'the contacts_upsert() RPC (SECURITY DEFINER). service_role retains '
  'full access for test cleanup and emergency admin operations. '
  'See docs/CONTACT_SYSTEM.md for the write path documentation.';
