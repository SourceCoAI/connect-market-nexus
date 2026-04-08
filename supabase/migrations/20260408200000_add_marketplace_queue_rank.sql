-- ============================================================================
-- Migration: Add marketplace_queue_rank to listings
-- Date: 2026-04-08
-- Purpose: Allow drag-to-reorder ranking of deals in the Marketplace Queue,
--          separate from the Active Deals manual_rank_override.
-- ============================================================================

ALTER TABLE listings ADD COLUMN IF NOT EXISTS marketplace_queue_rank integer;

-- Index for fast ordering
CREATE INDEX IF NOT EXISTS idx_listings_marketplace_queue_rank
  ON listings (marketplace_queue_rank)
  WHERE pushed_to_marketplace = true AND marketplace_queue_rank IS NOT NULL;
