-- ============================================================================
-- Buyer Classification Audit & Fix RPCs
-- Provides admin tools to detect and correct classification violations
-- ============================================================================

-- 1. Audit function: returns a comprehensive JSON report
CREATE OR REPLACE FUNCTION audit_buyer_classifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_violations jsonb;
  v_summary jsonb;
  v_sample jsonb;
BEGIN
  -- ---- VIOLATION CHECKS ----

  -- V1: Platform Company Rule — pe_firm_name set but not corporate
  WITH v1 AS (
    SELECT id, company_name, buyer_type, pe_firm_name, is_pe_backed,
           buyer_type_source, company_website
    FROM buyers
    WHERE archived = false
      AND pe_firm_name IS NOT NULL AND pe_firm_name != ''
      AND buyer_type IS DISTINCT FROM 'corporate'
      AND LOWER(TRIM(pe_firm_name)) != LOWER(TRIM(company_name))
  )
  SELECT jsonb_build_object(
    'code', 'V1',
    'name', 'Platform Company Rule violation',
    'description', 'pe_firm_name set but buyer_type is not corporate',
    'severity', 'critical',
    'count', (SELECT count(*) FROM v1),
    'buyers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'company_name', company_name, 'buyer_type', buyer_type,
      'pe_firm_name', pe_firm_name, 'is_pe_backed', is_pe_backed,
      'buyer_type_source', buyer_type_source, 'company_website', company_website
    )) FROM v1), '[]'::jsonb)
  ) INTO v_violations;

  -- V2: PE firm self-backed
  WITH v2 AS (
    SELECT id, company_name, buyer_type, is_pe_backed, buyer_type_source
    FROM buyers
    WHERE archived = false
      AND buyer_type = 'private_equity'
      AND is_pe_backed = true
  )
  SELECT v_violations || jsonb_build_object(
    'V2', jsonb_build_object(
      'code', 'V2',
      'name', 'PE firm marked as PE-backed',
      'description', 'buyer_type=private_equity but is_pe_backed=true (PE firms ARE PE, not PE-backed)',
      'severity', 'high',
      'count', (SELECT count(*) FROM v2),
      'buyers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'company_name', company_name, 'buyer_type_source', buyer_type_source
      )) FROM v2), '[]'::jsonb)
    )
  ) INTO v_violations;

  -- Restructure V1 into keyed format
  v_violations := jsonb_build_object('V1', v_violations) || (v_violations - 'code' - 'name' - 'description' - 'severity' - 'count' - 'buyers');

  -- V3: Orphan is_pe_backed — marked PE-backed but no PE parent
  WITH v3 AS (
    SELECT id, company_name, buyer_type, is_pe_backed, buyer_type_source
    FROM buyers
    WHERE archived = false
      AND is_pe_backed = true
      AND (pe_firm_name IS NULL OR pe_firm_name = '')
      AND parent_pe_firm_id IS NULL
  )
  SELECT v_violations || jsonb_build_object(
    'V3', jsonb_build_object(
      'code', 'V3',
      'name', 'Orphan PE-backed flag',
      'description', 'is_pe_backed=true but no pe_firm_name or parent_pe_firm_id',
      'severity', 'medium',
      'count', (SELECT count(*) FROM v3),
      'buyers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'company_name', company_name, 'buyer_type', buyer_type,
        'buyer_type_source', buyer_type_source
      )) FROM v3), '[]'::jsonb)
    )
  ) INTO v_violations;

  -- V4: Orphan parent_pe_firm_id — points to non-existent buyer
  WITH v4 AS (
    SELECT b.id, b.company_name, b.parent_pe_firm_id, b.parent_pe_firm_name
    FROM buyers b
    LEFT JOIN buyers p ON b.parent_pe_firm_id = p.id
    WHERE b.archived = false
      AND b.parent_pe_firm_id IS NOT NULL
      AND p.id IS NULL
  )
  SELECT v_violations || jsonb_build_object(
    'V4', jsonb_build_object(
      'code', 'V4',
      'name', 'Orphan parent PE firm reference',
      'description', 'parent_pe_firm_id points to non-existent buyer',
      'severity', 'medium',
      'count', (SELECT count(*) FROM v4),
      'buyers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'company_name', company_name, 'parent_pe_firm_id', parent_pe_firm_id,
        'parent_pe_firm_name', parent_pe_firm_name
      )) FROM v4), '[]'::jsonb)
    )
  ) INTO v_violations;

  -- V5: NULL buyer_type with data (should be classified)
  WITH v5 AS (
    SELECT id, company_name, company_website, pe_firm_name, is_pe_backed
    FROM buyers
    WHERE archived = false
      AND buyer_type IS NULL
      AND (company_website IS NOT NULL OR thesis_summary IS NOT NULL)
  )
  SELECT v_violations || jsonb_build_object(
    'V5', jsonb_build_object(
      'code', 'V5',
      'name', 'Unclassified buyer with data',
      'description', 'buyer_type is NULL but buyer has website or thesis data',
      'severity', 'low',
      'count', (SELECT count(*) FROM v5),
      'buyers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'company_name', company_name, 'company_website', company_website,
        'pe_firm_name', pe_firm_name, 'is_pe_backed', is_pe_backed
      )) FROM v5), '[]'::jsonb)
    )
  ) INTO v_violations;

  -- V6: Unresolved review queue
  SELECT v_violations || jsonb_build_object(
    'V6', jsonb_build_object(
      'code', 'V6',
      'name', 'Needs classification review',
      'description', 'buyer_type_needs_review is true',
      'severity', 'info',
      'count', (SELECT count(*) FROM buyers WHERE archived = false AND buyer_type_needs_review = true),
      'buyers', '[]'::jsonb
    )
  ) INTO v_violations;

  -- V7: Missing source — has buyer_type but no source tracking
  WITH v7 AS (
    SELECT id, company_name, buyer_type
    FROM buyers
    WHERE archived = false
      AND buyer_type IS NOT NULL
      AND buyer_type_source IS NULL
    LIMIT 50
  )
  SELECT v_violations || jsonb_build_object(
    'V7', jsonb_build_object(
      'code', 'V7',
      'name', 'Missing buyer_type_source',
      'description', 'buyer_type is set but buyer_type_source is NULL',
      'severity', 'low',
      'count', (SELECT count(*) FROM buyers WHERE archived = false AND buyer_type IS NOT NULL AND buyer_type_source IS NULL),
      'buyers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'company_name', company_name, 'buyer_type', buyer_type
      )) FROM v7), '[]'::jsonb)
    )
  ) INTO v_violations;

  -- V8: Non-corporate buyer with is_pe_backed=true
  WITH v8 AS (
    SELECT id, company_name, buyer_type, is_pe_backed, pe_firm_name, buyer_type_source
    FROM buyers
    WHERE archived = false
      AND buyer_type != 'corporate'
      AND is_pe_backed = true
  )
  SELECT v_violations || jsonb_build_object(
    'V8', jsonb_build_object(
      'code', 'V8',
      'name', 'Non-corporate buyer marked PE-backed',
      'description', 'is_pe_backed=true on non-corporate buyer type',
      'severity', 'high',
      'count', (SELECT count(*) FROM v8),
      'buyers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'company_name', company_name, 'buyer_type', buyer_type,
        'pe_firm_name', pe_firm_name, 'buyer_type_source', buyer_type_source
      )) FROM v8), '[]'::jsonb)
    )
  ) INTO v_violations;

  -- V9: Inconsistent PE fields — parent_pe_firm_id set but no pe_firm_name
  WITH v9 AS (
    SELECT id, company_name, parent_pe_firm_id, parent_pe_firm_name, pe_firm_name
    FROM buyers
    WHERE archived = false
      AND parent_pe_firm_id IS NOT NULL
      AND (pe_firm_name IS NULL OR pe_firm_name = '')
  )
  SELECT v_violations || jsonb_build_object(
    'V9', jsonb_build_object(
      'code', 'V9',
      'name', 'Inconsistent PE fields',
      'description', 'parent_pe_firm_id is set but pe_firm_name is empty',
      'severity', 'medium',
      'count', (SELECT count(*) FROM v9),
      'buyers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'company_name', company_name, 'parent_pe_firm_id', parent_pe_firm_id,
        'parent_pe_firm_name', parent_pe_firm_name, 'pe_firm_name', pe_firm_name
      )) FROM v9), '[]'::jsonb)
    )
  ) INTO v_violations;

  -- ---- SUMMARY STATS ----
  SELECT jsonb_build_object(
    'total_buyers', (SELECT count(*) FROM buyers),
    'total_active', (SELECT count(*) FROM buyers WHERE archived = false),
    'total_archived', (SELECT count(*) FROM buyers WHERE archived = true),
    'by_buyer_type', COALESCE((
      SELECT jsonb_object_agg(COALESCE(buyer_type, '_null'), cnt)
      FROM (SELECT buyer_type, count(*) AS cnt FROM buyers WHERE archived = false GROUP BY buyer_type) t
    ), '{}'::jsonb),
    'by_buyer_type_source', COALESCE((
      SELECT jsonb_object_agg(COALESCE(buyer_type_source, '_null'), cnt)
      FROM (SELECT buyer_type_source, count(*) AS cnt FROM buyers WHERE archived = false GROUP BY buyer_type_source) t
    ), '{}'::jsonb),
    'pe_backed_by_type', COALESCE((
      SELECT jsonb_object_agg(COALESCE(buyer_type, '_null'), cnt)
      FROM (SELECT buyer_type, count(*) AS cnt FROM buyers WHERE archived = false AND is_pe_backed = true GROUP BY buyer_type) t
    ), '{}'::jsonb)
  ) INTO v_summary;

  -- ---- 50-BUYER RANDOM SAMPLE ----
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', b.id,
      'company_name', b.company_name,
      'buyer_type', b.buyer_type,
      'is_pe_backed', b.is_pe_backed,
      'pe_firm_name', b.pe_firm_name,
      'parent_pe_firm_id', b.parent_pe_firm_id,
      'parent_pe_firm_name', b.parent_pe_firm_name,
      'buyer_type_source', b.buyer_type_source,
      'buyer_type_confidence', b.buyer_type_confidence,
      'company_website', b.company_website,
      'industry_vertical', b.industry_vertical,
      'classification_notes', (
        CASE
          WHEN b.pe_firm_name IS NOT NULL AND b.pe_firm_name != '' AND b.buyer_type IS DISTINCT FROM 'corporate'
               AND LOWER(TRIM(b.pe_firm_name)) != LOWER(TRIM(b.company_name))
            THEN 'VIOLATION V1: pe_firm_name set but buyer_type != corporate'
          WHEN b.buyer_type = 'private_equity' AND b.is_pe_backed = true
            THEN 'VIOLATION V2: PE firm marked as PE-backed'
          WHEN b.is_pe_backed = true AND (b.pe_firm_name IS NULL OR b.pe_firm_name = '') AND b.parent_pe_firm_id IS NULL
            THEN 'VIOLATION V3: PE-backed but no PE parent'
          WHEN b.buyer_type != 'corporate' AND b.is_pe_backed = true
            THEN 'VIOLATION V8: Non-corporate marked PE-backed'
          WHEN b.buyer_type IS NULL AND (b.company_website IS NOT NULL OR b.thesis_summary IS NOT NULL)
            THEN 'NOTE V5: Unclassified buyer with data'
          WHEN b.buyer_type IS NOT NULL AND b.buyer_type_source IS NULL
            THEN 'NOTE V7: Missing buyer_type_source'
          ELSE 'OK'
        END
      )
    ) AS row_data
    FROM buyers b
    WHERE b.archived = false
    ORDER BY random()
    LIMIT 50
  ) t INTO v_sample;

  -- ---- BUILD FINAL RESULT ----
  v_result := jsonb_build_object(
    'audit_timestamp', now(),
    'violations', v_violations,
    'summary', v_summary,
    'random_sample', v_sample
  );

  RETURN v_result;
END;
$$;

-- 2. Auto-fix function: corrects known violations (respects admin_manual)
CREATE OR REPLACE FUNCTION fix_buyer_classification_violations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fixed_v1 int := 0;
  v_fixed_v2 int := 0;
  v_fixed_v3 int := 0;
  v_fixed_v8 int := 0;
  v_fixed_v9 int := 0;
BEGIN
  -- Fix V1: Platform Company Rule — pe_firm_name set (differs from company_name) → corporate + is_pe_backed
  WITH updated AS (
    UPDATE buyers
    SET buyer_type = 'corporate', is_pe_backed = true, updated_at = now()
    WHERE archived = false
      AND pe_firm_name IS NOT NULL AND pe_firm_name != ''
      AND buyer_type IS DISTINCT FROM 'corporate'
      AND LOWER(TRIM(pe_firm_name)) != LOWER(TRIM(company_name))
      AND (buyer_type_source IS NULL OR buyer_type_source != 'admin_manual')
    RETURNING 1
  )
  SELECT count(*) INTO v_fixed_v1 FROM updated;

  -- Fix V2: PE firm self-backed → clear is_pe_backed
  WITH updated AS (
    UPDATE buyers
    SET is_pe_backed = false, updated_at = now()
    WHERE archived = false
      AND buyer_type = 'private_equity'
      AND is_pe_backed = true
      AND (buyer_type_source IS NULL OR buyer_type_source != 'admin_manual')
    RETURNING 1
  )
  SELECT count(*) INTO v_fixed_v2 FROM updated;

  -- Fix V3: Orphan is_pe_backed → clear flag
  WITH updated AS (
    UPDATE buyers
    SET is_pe_backed = false, updated_at = now()
    WHERE archived = false
      AND is_pe_backed = true
      AND (pe_firm_name IS NULL OR pe_firm_name = '')
      AND parent_pe_firm_id IS NULL
      AND (buyer_type_source IS NULL OR buyer_type_source != 'admin_manual')
    RETURNING 1
  )
  SELECT count(*) INTO v_fixed_v3 FROM updated;

  -- Fix V8: Non-corporate with is_pe_backed → clear flag
  WITH updated AS (
    UPDATE buyers
    SET is_pe_backed = false, updated_at = now()
    WHERE archived = false
      AND buyer_type != 'corporate'
      AND is_pe_backed = true
      AND (buyer_type_source IS NULL OR buyer_type_source != 'admin_manual')
    RETURNING 1
  )
  SELECT count(*) INTO v_fixed_v8 FROM updated;

  -- Fix V9: parent_pe_firm_id set but pe_firm_name empty — backfill from parent
  WITH updated AS (
    UPDATE buyers b
    SET pe_firm_name = p.company_name, updated_at = now()
    FROM buyers p
    WHERE b.parent_pe_firm_id = p.id
      AND b.archived = false
      AND (b.pe_firm_name IS NULL OR b.pe_firm_name = '')
      AND b.parent_pe_firm_id IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_fixed_v9 FROM updated;

  RETURN jsonb_build_object(
    'fixed_at', now(),
    'fixes_applied', jsonb_build_object(
      'V1_platform_company_rule', v_fixed_v1,
      'V2_pe_firm_self_backed', v_fixed_v2,
      'V3_orphan_pe_backed', v_fixed_v3,
      'V8_non_corporate_pe_backed', v_fixed_v8,
      'V9_pe_firm_name_backfill', v_fixed_v9
    ),
    'total_fixed', v_fixed_v1 + v_fixed_v2 + v_fixed_v3 + v_fixed_v8 + v_fixed_v9
  );
END;
$$;

-- Grant execute to authenticated users (admin check done at app level)
GRANT EXECUTE ON FUNCTION audit_buyer_classifications() TO authenticated;
GRANT EXECUTE ON FUNCTION fix_buyer_classification_violations() TO authenticated;
