-- ============================================================================
-- ADD buyer_profile AND verification_status TO buyer_seed_log
--
-- The seed-buyers function logs buyer_profile (the Pass 1 AI-generated profile)
-- and verification_status (verified/unverified from Pass 2) but these columns
-- were missing from the original table definition, causing silent insert failures
-- and a broken audit trail.
-- ============================================================================

ALTER TABLE public.buyer_seed_log
  ADD COLUMN IF NOT EXISTS buyer_profile JSONB,
  ADD COLUMN IF NOT EXISTS verification_status TEXT;

COMMENT ON COLUMN public.buyer_seed_log.buyer_profile IS
  'Pass 1 AI-generated buyer profile used to find this buyer. Stored for audit/debugging.';

COMMENT ON COLUMN public.buyer_seed_log.verification_status IS
  'AI confidence level: verified (confident in PE backing + service match) or unverified.';
