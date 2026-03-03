-- Migration: 20260507000000_add_score_snapshot_to_buyer_introductions.sql
-- Persist scoring data on buyer introduction records so cards always display
-- fit reason, fit signals, tier, composite score, and source even when the
-- live scoring cache is unavailable.

ALTER TABLE buyer_introductions
  ADD COLUMN IF NOT EXISTS score_snapshot jsonb;

COMMENT ON COLUMN buyer_introductions.score_snapshot IS
  'BuyerScore snapshot captured at acceptance time. Keys: composite_score, service_score, geography_score, size_score, bonus_score, fit_signals, fit_reason, tier, source, buyer_type, hq_city, hq_state, has_fee_agreement, pe_firm_name, pe_firm_id, acquisition_appetite.';
