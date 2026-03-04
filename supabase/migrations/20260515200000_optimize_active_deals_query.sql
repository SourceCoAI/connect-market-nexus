-- ============================================================================
-- OPTIMIZE ACTIVE DEALS QUERY
--
-- The Active Deals page query filters on:
--   remarketing_status = 'active' AND deleted_at IS NULL
--   AND (deal_source IN (...) OR (deal_source IN (...) AND pushed_to_all_deals = true))
-- Then orders by: manual_rank_override ASC NULLS LAST, deal_total_score DESC, created_at DESC
--
-- The existing partial index idx_listings_remarketing_active covers
-- (remarketing_status, is_internal_deal) WHERE deleted_at IS NULL AND remarketing_status = 'active'
-- but does not include deal_source or sort columns.
--
-- This migration adds a covering index that includes the sort columns,
-- allowing PostgreSQL to use an index-only scan for the sort+filter.
-- ============================================================================

-- Composite index for Active Deals query sort order
-- Includes deal_source for the OR filter and the three ORDER BY columns
CREATE INDEX IF NOT EXISTS idx_listings_active_deals_sort
  ON public.listings (manual_rank_override ASC NULLS LAST, deal_total_score DESC NULLS FIRST, created_at DESC)
  WHERE deleted_at IS NULL AND remarketing_status = 'active';
