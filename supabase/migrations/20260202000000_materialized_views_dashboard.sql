-- Migration: Create materialized views for dashboard metrics
-- This improves dashboard performance by pre-computing expensive aggregations

-- 1. Deal Pipeline Summary Metrics
-- Provides quick access to deal counts and values by status/tier
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_deal_pipeline_summary AS
SELECT
  COUNT(*) FILTER (WHERE status = 'active') AS active_deals,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_deals,
  COUNT(*) FILTER (WHERE status = 'closed') AS closed_deals,
  COUNT(*) AS total_deals,
  COALESCE(SUM(revenue) FILTER (WHERE status = 'active'), 0) AS active_revenue_total,
  COALESCE(SUM(ebitda) FILTER (WHERE status = 'active'), 0) AS active_ebitda_total,
  COALESCE(AVG(revenue) FILTER (WHERE status = 'active'), 0) AS avg_deal_revenue,
  COALESCE(AVG(ebitda) FILTER (WHERE status = 'active'), 0) AS avg_deal_ebitda,
  COUNT(*) FILTER (WHERE enriched_at IS NOT NULL) AS enriched_deals,
  COUNT(*) FILTER (WHERE created_at > CURRENT_DATE - INTERVAL '7 days') AS deals_added_7d,
  COUNT(*) FILTER (WHERE created_at > CURRENT_DATE - INTERVAL '30 days') AS deals_added_30d,
  NOW() AS refreshed_at
FROM public.listings;

-- Index for the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS mv_deal_pipeline_summary_idx ON mv_deal_pipeline_summary (refreshed_at);

-- 2. Score Distribution by Tier
-- Pre-computes tier counts for fast dashboard rendering
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_score_tier_distribution AS
SELECT
  CASE
    WHEN composite_score >= 80 THEN 'A'
    WHEN composite_score >= 60 THEN 'B'
    WHEN composite_score >= 40 THEN 'C'
    ELSE 'D'
  END AS tier,
  COUNT(*) AS count,
  AVG(composite_score) AS avg_score,
  status,
  NOW() AS refreshed_at
FROM public.remarketing_scores
GROUP BY tier, status;

CREATE INDEX IF NOT EXISTS mv_score_tier_distribution_tier_idx ON mv_score_tier_distribution (tier);

-- 3. Buyer Activity Summary
-- Aggregates buyer engagement metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_buyer_activity_summary AS
SELECT
  b.id AS buyer_id,
  b.company_name,
  b.buyer_type,
  b.data_completeness,
  COUNT(DISTINCT s.listing_id) AS total_matches,
  COUNT(*) FILTER (WHERE s.status = 'approved') AS approved_count,
  COUNT(*) FILTER (WHERE s.status = 'passed') AS passed_count,
  COUNT(*) FILTER (WHERE s.status = 'pending') AS pending_count,
  COALESCE(AVG(s.composite_score), 0) AS avg_match_score,
  MAX(s.created_at) AS last_match_date,
  NOW() AS refreshed_at
FROM public.remarketing_buyers b
LEFT JOIN public.remarketing_scores s ON b.id = s.buyer_id
WHERE b.archived = false
GROUP BY b.id, b.company_name, b.buyer_type, b.data_completeness;

CREATE INDEX IF NOT EXISTS mv_buyer_activity_buyer_id_idx ON mv_buyer_activity_summary (buyer_id);
CREATE INDEX IF NOT EXISTS mv_buyer_activity_avg_score_idx ON mv_buyer_activity_summary (avg_match_score DESC);

-- 4. Universe Performance Metrics
-- Tracks tracker/universe performance over time
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_universe_performance AS
SELECT
  u.id AS universe_id,
  u.name AS universe_name,
  COUNT(DISTINCT s.buyer_id) AS active_buyers,
  COUNT(DISTINCT s.listing_id) AS deals_scored,
  COUNT(*) AS total_scores,
  COUNT(*) FILTER (WHERE s.status = 'approved') AS approvals,
  COUNT(*) FILTER (WHERE s.status = 'passed') AS passes,
  COALESCE(AVG(s.composite_score), 0) AS avg_score,
  COUNT(*) FILTER (WHERE s.composite_score >= 80) AS tier_a_matches,
  COUNT(*) FILTER (WHERE s.composite_score >= 60 AND s.composite_score < 80) AS tier_b_matches,
  NOW() AS refreshed_at
FROM public.remarketing_buyer_universes u
LEFT JOIN public.remarketing_scores s ON u.id = s.universe_id
WHERE u.archived = false
GROUP BY u.id, u.name;

CREATE INDEX IF NOT EXISTS mv_universe_performance_id_idx ON mv_universe_performance (universe_id);

-- 5. Geography Distribution
-- Pre-computes deal distribution by state
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_geography_distribution AS
SELECT
  state,
  COUNT(*) AS deal_count,
  SUM(revenue) AS total_revenue,
  AVG(revenue) AS avg_revenue,
  NOW() AS refreshed_at
FROM (
  SELECT UNNEST(geographic_states) AS state, revenue
  FROM public.listings
  WHERE status = 'active' AND geographic_states IS NOT NULL
) geo
GROUP BY state
ORDER BY deal_count DESC;

CREATE INDEX IF NOT EXISTS mv_geography_distribution_state_idx ON mv_geography_distribution (state);

-- Create a function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_dashboard_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_deal_pipeline_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_score_tier_distribution;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_buyer_activity_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_universe_performance;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_geography_distribution;
END;
$$;

-- Grant access to authenticated users for reading views
GRANT SELECT ON mv_deal_pipeline_summary TO authenticated;
GRANT SELECT ON mv_score_tier_distribution TO authenticated;
GRANT SELECT ON mv_buyer_activity_summary TO authenticated;
GRANT SELECT ON mv_universe_performance TO authenticated;
GRANT SELECT ON mv_geography_distribution TO authenticated;

-- Allow admins to refresh the views
GRANT EXECUTE ON FUNCTION refresh_dashboard_materialized_views() TO authenticated;

-- Add a comment explaining refresh strategy
COMMENT ON FUNCTION refresh_dashboard_materialized_views() IS
'Refreshes all dashboard materialized views. Should be called periodically (e.g., every 15 minutes) via cron or on-demand after bulk operations.';
