-- Add 'sourceco' deal source to dashboard stats function
-- Mirrors the same treatment as gp_partners: hidden from active when unpushed,
-- uses push date for "new in period", and has dedicated card metrics.

CREATE OR REPLACE FUNCTION public.get_remarketing_dashboard_stats(p_from_date timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH base AS (
    SELECT
      id, title, internal_company_name, deal_source, pushed_to_all_deals,
      pushed_to_all_deals_at, deal_total_score, deal_owner_id,
      enrichment_status, enriched_at, created_at, revenue, ebitda,
      category, address_state, status, remarketing_status
    FROM listings
    WHERE remarketing_status = 'active'
  ),
  visible AS (
    SELECT * FROM base
    WHERE status NOT IN ('archived', 'inactive')
      AND NOT (
        deal_source IN ('captarget', 'gp_partners', 'sourceco', 'valuation_calculator')
        AND (pushed_to_all_deals IS NULL OR pushed_to_all_deals = false)
      )
  ),
  -- Header card counts
  cards AS (
    SELECT
      (SELECT count(*) FROM visible) AS all_visible,
      (SELECT count(*) FROM visible WHERE
        CASE
          WHEN p_from_date IS NULL THEN true
          WHEN deal_source IN ('captarget', 'gp_partners', 'sourceco') THEN pushed_to_all_deals_at IS NOT NULL AND pushed_to_all_deals_at >= p_from_date
          ELSE created_at >= p_from_date
        END
      ) AS all_new_in_period,
      (SELECT count(*) FROM base WHERE deal_source = 'captarget') AS ct_total,
      (SELECT count(*) FROM base WHERE deal_source = 'captarget' AND (p_from_date IS NULL OR created_at >= p_from_date)) AS ct_new,
      (SELECT count(*) FROM base WHERE deal_source = 'captarget' AND pushed_to_all_deals = true) AS ct_pushed,
      (SELECT coalesce(round(avg(deal_total_score)), 0) FROM base WHERE deal_source = 'captarget' AND deal_total_score IS NOT NULL) AS ct_avg,
      (SELECT count(*) FROM base WHERE deal_source = 'captarget' AND pushed_to_all_deals = true
        AND (p_from_date IS NULL OR (pushed_to_all_deals_at IS NOT NULL AND pushed_to_all_deals_at >= p_from_date))) AS ct_approved_in_period,
      (SELECT count(*) FROM base WHERE deal_source = 'gp_partners') AS gp_total,
      (SELECT count(*) FROM base WHERE deal_source = 'gp_partners' AND (p_from_date IS NULL OR created_at >= p_from_date)) AS gp_new,
      (SELECT count(*) FROM base WHERE deal_source = 'gp_partners' AND pushed_to_all_deals = true) AS gp_pushed,
      (SELECT coalesce(round(avg(deal_total_score)), 0) FROM base WHERE deal_source = 'gp_partners' AND deal_total_score IS NOT NULL) AS gp_avg,
      (SELECT count(*) FROM base WHERE deal_source = 'gp_partners' AND pushed_to_all_deals = true
        AND (p_from_date IS NULL OR (pushed_to_all_deals_at IS NOT NULL AND pushed_to_all_deals_at >= p_from_date))) AS gp_approved_in_period,
      (SELECT count(*) FROM base WHERE deal_source = 'sourceco') AS sc_total,
      (SELECT count(*) FROM base WHERE deal_source = 'sourceco' AND (p_from_date IS NULL OR created_at >= p_from_date)) AS sc_new,
      (SELECT count(*) FROM base WHERE deal_source = 'sourceco' AND pushed_to_all_deals = true) AS sc_pushed,
      (SELECT coalesce(round(avg(deal_total_score)), 0) FROM base WHERE deal_source = 'sourceco' AND deal_total_score IS NOT NULL) AS sc_avg,
      (SELECT count(*) FROM base WHERE deal_source = 'sourceco' AND pushed_to_all_deals = true
        AND (p_from_date IS NULL OR (pushed_to_all_deals_at IS NOT NULL AND pushed_to_all_deals_at >= p_from_date))) AS sc_approved_in_period,
      (SELECT count(*) FROM base WHERE deal_source NOT IN ('captarget', 'gp_partners', 'sourceco') OR deal_source IS NULL) AS other_total,
      (SELECT count(*) FROM base WHERE deal_source = 'marketplace') AS marketplace_total,
      (SELECT count(*) FROM base WHERE deal_source IS NULL OR deal_source = 'manual') AS manual_total,
      (SELECT count(*) FROM base WHERE enrichment_status = 'enriched' OR (enriched_at IS NOT NULL AND enrichment_status IS NULL)) AS enriched,
      (SELECT count(*) FROM base WHERE enrichment_status = 'pending') AS pending_enrichment,
      (SELECT count(*) FROM base WHERE enrichment_status = 'failed') AS failed_enrichment,
      (SELECT count(*) FROM base WHERE deal_total_score IS NOT NULL) AS total_scored
  ),
  -- Source counts for "new in period"
  new_by_source AS (
    SELECT coalesce(deal_source, 'manual') AS src, count(*) AS cnt
    FROM base
    WHERE p_from_date IS NULL OR created_at >= p_from_date
    GROUP BY coalesce(deal_source, 'manual')
  ),
  -- All source counts (visible)
  all_by_source AS (
    SELECT coalesce(deal_source, 'manual') AS src, count(*) AS cnt
    FROM visible
    GROUP BY coalesce(deal_source, 'manual')
  ),
  -- Team assignments
  team AS (
    SELECT coalesce(deal_owner_id::text, '__unassigned') AS owner_id,
      count(*) AS total,
      count(*) FILTER (WHERE enrichment_status = 'enriched' OR enriched_at IS NOT NULL) AS enriched,
      count(*) FILTER (WHERE deal_total_score IS NOT NULL) AS scored
    FROM visible
    GROUP BY coalesce(deal_owner_id::text, '__unassigned')
  ),
  -- Score distribution
  score_dist AS (
    SELECT
      count(*) FILTER (WHERE deal_total_score >= 80) AS tier_80_100,
      count(*) FILTER (WHERE deal_total_score >= 60 AND deal_total_score < 80) AS tier_60_79,
      count(*) FILTER (WHERE deal_total_score >= 40 AND deal_total_score < 60) AS tier_40_59,
      count(*) FILTER (WHERE deal_total_score >= 20 AND deal_total_score < 40) AS tier_20_39,
      count(*) FILTER (WHERE deal_total_score < 20 OR deal_total_score IS NULL) AS tier_0_19
    FROM base
  ),
  -- Top deals (top 8 scored in period)
  top AS (
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY deal_total_score DESC NULLS LAST) AS deals
    FROM (
      SELECT id, title, internal_company_name, deal_source, deal_total_score,
             category, revenue, ebitda, address_state, created_at
      FROM base
      WHERE deal_total_score IS NOT NULL
        AND (p_from_date IS NULL OR created_at >= p_from_date)
      ORDER BY deal_total_score DESC
      LIMIT 8
    ) t
  ),
  -- Weekly chart (last 8 weeks)
  weekly AS (
    SELECT
      date_trunc('week', added_date)::date AS week_start,
      count(*) AS cnt
    FROM (
      SELECT
        CASE
          WHEN deal_source IN ('captarget', 'gp_partners', 'sourceco') AND pushed_to_all_deals = true AND pushed_to_all_deals_at IS NOT NULL
            THEN pushed_to_all_deals_at
          ELSE created_at
        END AS added_date
      FROM base
    ) sub
    WHERE added_date >= (now() - interval '56 days')
    GROUP BY date_trunc('week', added_date)::date
  ),
  -- Recent activity (5 most recent events)
  recent AS (
    SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY date DESC) AS events
    FROM (
      SELECT created_at AS date, 'created' AS type, coalesce(internal_company_name, title, 'Unknown') AS name, deal_source AS source
      FROM base
      UNION ALL
      SELECT pushed_to_all_deals_at AS date, 'pushed' AS type, coalesce(internal_company_name, title, 'Unknown') AS name, deal_source AS source
      FROM base WHERE pushed_to_all_deals = true AND pushed_to_all_deals_at IS NOT NULL
      ORDER BY date DESC
      LIMIT 5
    ) r
  )
  SELECT jsonb_build_object(
    'cards', (SELECT row_to_json(cards)::jsonb FROM cards),
    'new_by_source', (SELECT coalesce(jsonb_object_agg(src, cnt), '{}'::jsonb) FROM new_by_source),
    'all_by_source', (SELECT coalesce(jsonb_object_agg(src, cnt), '{}'::jsonb) FROM all_by_source),
    'team', (SELECT coalesce(jsonb_agg(row_to_json(team)::jsonb), '[]'::jsonb) FROM team),
    'score_dist', (SELECT row_to_json(score_dist)::jsonb FROM score_dist),
    'top_deals', (SELECT coalesce(deals, '[]'::jsonb) FROM top),
    'weekly', (SELECT coalesce(jsonb_object_agg(week_start::text, cnt), '{}'::jsonb) FROM weekly),
    'recent_activity', (SELECT coalesce(events, '[]'::jsonb) FROM recent)
  ) INTO result;

  RETURN result;
END;
$$;
