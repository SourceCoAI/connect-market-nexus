-- ═══════════════════════════════════════════════════════════════
-- Migration: add_listings_update_rls_policy
-- Date: 2026-03-18
-- Purpose: Adds a missing UPDATE RLS policy on the listings table.
--          Without this, any UPDATE (e.g. push_to_marketplace) is
--          silently blocked by RLS for all authenticated users,
--          even admins.
-- Tables affected: listings
-- ═══════════════════════════════════════════════════════════════

CREATE POLICY "Admins can update listings"
  ON public.listings
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
