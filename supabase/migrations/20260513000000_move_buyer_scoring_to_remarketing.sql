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
