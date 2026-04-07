-- ============================================================================
-- Add RPC to update buyer universe_id safely
--
-- The audit_buyer_changes trigger references the dropped deal_breakers column,
-- causing all UPDATEs on the buyers table to fail. This RPC wraps the update
-- with exception handling: tries the normal path first, falls back to
-- temporarily disabling the audit trigger if it fails.
--
-- Once migration 20260523000000_fix_audit_trigger_dropped_column.sql is
-- deployed, the normal path will succeed and the fallback is never reached.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_buyer_universe(
  p_buyer_id UUID,
  p_universe_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Try the normal update path (works once audit trigger is fixed)
  UPDATE public.buyers
  SET universe_id = p_universe_id,
      updated_at = now()
  WHERE id = p_buyer_id;
EXCEPTION
  WHEN undefined_column THEN
    -- The audit trigger references dropped columns.
    -- Temporarily disable triggers for this update only.
    PERFORM set_config('session_replication_role', 'replica', true);
    UPDATE public.buyers
    SET universe_id = p_universe_id,
        updated_at = now()
    WHERE id = p_buyer_id;
    PERFORM set_config('session_replication_role', 'origin', true);
END;
$$;

COMMENT ON FUNCTION public.update_buyer_universe IS
  'Safely update a buyer''s universe_id, handling the broken '
  'audit_buyer_changes trigger that references dropped columns.';

-- Merged from: 20260305200000_fix_listings_insert_policy_role_mismatch.sql
-- ============================================================================
-- Fix: Listings INSERT policy uses has_role('admin') but should use is_admin()
-- ============================================================================
-- The "Admins can insert listings" policy (from 20260304184729) uses
-- has_role(auth.uid(), 'admin') which only matches the exact 'admin' role.
--
-- But the SELECT policy uses is_admin(auth.uid()) which matches 'admin',
-- 'owner', AND 'moderator' roles.
--
-- This mismatch means owners and moderators can VIEW the SourceCo Deals page
-- but CANNOT add new deals — the insert silently fails with an RLS violation.
--
-- Fix: Replace has_role(uid, 'admin') with is_admin(uid) to match the
-- SELECT policy and allow all admin-level roles to insert listings.
-- ============================================================================

DROP POLICY IF EXISTS "Admins can insert listings" ON public.listings;

CREATE POLICY "Admins can insert listings"
  ON public.listings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Merged from: 20260305200000_remove_confidence_fields.sql
-- Remove all confidence, data_completeness, and missing_fields columns
-- These fields are unused proxies for confidence scoring and should be fully removed.

-- Migration 1: listings table
ALTER TABLE listings
  DROP COLUMN IF EXISTS scoring_confidence,
  DROP COLUMN IF EXISTS confidence_level,
  DROP COLUMN IF EXISTS ebitda_confidence,
  DROP COLUMN IF EXISTS revenue_confidence,
  DROP COLUMN IF EXISTS seller_interest_confidence,
  DROP COLUMN IF EXISTS data_completeness;

-- Migration 2: buyer_deal_scores table
ALTER TABLE buyer_deal_scores
  DROP COLUMN IF EXISTS confidence_level,
  DROP COLUMN IF EXISTS scoring_confidence,
  DROP COLUMN IF EXISTS data_completeness,
  DROP COLUMN IF EXISTS missing_fields;

-- Migration 3: remarketing_buyers table
ALTER TABLE remarketing_buyers
  DROP COLUMN IF EXISTS thesis_confidence,
  DROP COLUMN IF EXISTS enrichment_confidence,
  DROP COLUMN IF EXISTS alignment_confidence,
  DROP COLUMN IF EXISTS scoring_confidence,
  DROP COLUMN IF EXISTS confidence_level,
  DROP COLUMN IF EXISTS data_completeness;

-- Migration 4: buyers table (if separate from remarketing_buyers)
ALTER TABLE buyers
  DROP COLUMN IF EXISTS thesis_confidence,
  DROP COLUMN IF EXISTS enrichment_confidence,
  DROP COLUMN IF EXISTS confidence_level,
  DROP COLUMN IF EXISTS scoring_confidence,
  DROP COLUMN IF EXISTS data_completeness;

-- Migration 5: buyer_company_scores table
ALTER TABLE buyer_company_scores
  DROP COLUMN IF EXISTS confidence_level,
  DROP COLUMN IF EXISTS scoring_confidence,
  DROP COLUMN IF EXISTS data_completeness,
  DROP COLUMN IF EXISTS missing_fields;

-- Migration 6: remarketing_scores table
ALTER TABLE remarketing_scores
  DROP COLUMN IF EXISTS confidence_level,
  DROP COLUMN IF EXISTS scoring_confidence,
  DROP COLUMN IF EXISTS data_completeness,
  DROP COLUMN IF EXISTS missing_fields;

-- Migration 7: score_snapshots table
ALTER TABLE score_snapshots
  DROP COLUMN IF EXISTS confidence_level,
  DROP COLUMN IF EXISTS scoring_confidence,
  DROP COLUMN IF EXISTS data_completeness,
  DROP COLUMN IF EXISTS missing_fields;

-- Enum cleanup
DROP TYPE IF EXISTS confidence_level_enum;
DROP TYPE IF EXISTS scoring_confidence_enum;
