-- ============================================================================
-- MERGE DUPLICATE BUYERS
--
-- 3 active buyer pairs share the same website domain (found via v_duplicate_buyers):
--   allstartoday.com          → "Allstar Construction" (x2)
--   valorexteriorpartners.com → "Valor Exterior Partners" (x2)
--   windownation.com          → "Window Nation" (x2)
--
-- Strategy: keep the OLDEST record (lowest created_at = canonical), re-point all
-- FK references from the NEWER duplicate to the canonical, then archive the dupe.
--
-- After this migration the idx_buyers_unique_domain index (from 20260517100000)
-- will create cleanly with no conflicts.
-- ============================================================================

-- ── Step 1: Create helper procedure (top-level, not inside DO block) ─────────
-- Re-points one FK column; silently skips if the table doesn't exist.
CREATE OR REPLACE PROCEDURE _buyer_merge_safe_upd(
  tbl    text,
  col    text,
  new_id uuid,
  old_id uuid
)
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'UPDATE public.%I SET %I = $1 WHERE %I = $2',
    tbl, col, col
  ) USING new_id, old_id;
EXCEPTION WHEN undefined_table THEN
  NULL; -- table not present in this environment; skip silently
END;
$$;

-- ── Step 2: Merge loop ───────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN

  FOR r IN
    WITH dupes AS (
      SELECT
        extract_domain(company_website)             AS domain,
        array_agg(id ORDER BY created_at ASC)       AS ids
      FROM public.buyers
      WHERE archived = false
        AND company_website IS NOT NULL
        AND trim(company_website) != ''
      GROUP BY extract_domain(company_website)
      HAVING count(*) > 1
    )
    SELECT domain, ids[1] AS canonical_id, ids[2] AS duplicate_id FROM dupes
  LOOP

    RAISE NOTICE 'Merging domain=%: keeping %, archiving %',
      r.domain, r.canonical_id, r.duplicate_id;

    -- ── remarketing_scores (conflict-safe: skip rows already on canonical) ──
    BEGIN
      UPDATE public.remarketing_scores
        SET buyer_id = r.canonical_id
        WHERE buyer_id = r.duplicate_id
          AND NOT EXISTS (
            SELECT 1 FROM public.remarketing_scores s2
            WHERE s2.buyer_id = r.canonical_id
              AND s2.listing_id   = remarketing_scores.listing_id
              AND s2.universe_id IS NOT DISTINCT FROM remarketing_scores.universe_id
          );
      DELETE FROM public.remarketing_scores
        WHERE buyer_id = r.duplicate_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- ── buyer_enrichment_queue (at-most-one row per buyer) ───────────────────
    BEGIN
      UPDATE public.buyer_enrichment_queue
        SET buyer_id = r.canonical_id
        WHERE buyer_id = r.duplicate_id
          AND NOT EXISTS (
            SELECT 1 FROM public.buyer_enrichment_queue q2
            WHERE q2.buyer_id = r.canonical_id
          );
      DELETE FROM public.buyer_enrichment_queue
        WHERE buyer_id = r.duplicate_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- ── All other FK tables (simple re-point via helper) ─────────────────────
    CALL _buyer_merge_safe_upd('remarketing_buyer_contacts',      'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('buyer_transcripts',               'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('buyer_learning_history',          'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('buyer_seed_log',                  'remarketing_buyer_id',  r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('buyer_pass_decisions',            'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('buyer_approve_decisions',         'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('engagement_signals',              'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('call_transcripts',                'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('firm_members',                    'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('pe_firm_contacts',                'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('pe_firm_contacts',                'pe_firm_id',            r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('platform_contacts',               'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('platform_contacts',               'platform_id',           r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('contacts',                        'remarketing_buyer_id',  r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('profiles',                        'remarketing_buyer_id',  r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('data_room_access',                'remarketing_buyer_id',  r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('deals',                           'remarketing_buyer_id',  r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('document_distributions',          'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('document_openings',               'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('deal_data_room_access',           'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('document_distribution_tracking',  'matched_buyer_id',      r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('ai_buyer_signal_analysis',        'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('rm_buyer_deal_cadence',           'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('contact_intelligence',            'buyer_id',              r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('lead_memo_access',                'remarketing_buyer_id',  r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('memo_audit_logs',                 'remarketing_buyer_id',  r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('contact_activities',              'remarketing_buyer_id',  r.canonical_id, r.duplicate_id);
    CALL _buyer_merge_safe_upd('unified_contacts',                'remarketing_buyer_id',  r.canonical_id, r.duplicate_id);

    -- buyers.pe_firm_id (self-referential — PE firm child records pointing at a dupe PE firm)
    UPDATE public.buyers
      SET pe_firm_id = r.canonical_id
      WHERE pe_firm_id = r.duplicate_id;

    -- ── Archive the duplicate ─────────────────────────────────────────────
    UPDATE public.buyers
      SET archived   = true,
          updated_at = now(),
          notes      = COALESCE(notes || E'\n', '') ||
                       '[Archived by 20260517200000: merged into ' || r.canonical_id || ']'
      WHERE id = r.duplicate_id;

    RAISE NOTICE 'Done: archived %', r.duplicate_id;

  END LOOP;

END $$;

-- ── Step 3: Verify ───────────────────────────────────────────────────────────
DO $$
DECLARE
  remaining INTEGER;
BEGIN
  SELECT count(*) INTO remaining
  FROM (
    SELECT extract_domain(company_website)
    FROM public.buyers
    WHERE archived = false
      AND company_website IS NOT NULL
      AND trim(company_website) != ''
    GROUP BY extract_domain(company_website)
    HAVING count(*) > 1
  ) sub;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Merge incomplete: % domain(s) still have active duplicates', remaining;
  ELSE
    RAISE NOTICE 'Verified: no active domain duplicates remain. Safe to create unique index.';
  END IF;
END $$;

-- ── Step 4: Drop the temporary helper procedure ──────────────────────────────
DROP PROCEDURE IF EXISTS _buyer_merge_safe_upd(text, text, uuid, uuid);
