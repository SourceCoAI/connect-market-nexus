-- ============================================================================
-- MERGE DUPLICATE BUYERS
--
-- 3 active buyer pairs share the same website domain (found via v_duplicate_buyers):
--   allstartoday.com        → "Allstar Construction" (x2)
--   valorexteriorpartners.com → "Valor Exterior Partners" (x2)
--   windownation.com        → "Window Nation" (x2)
--
-- Strategy: keep the OLDEST record (lowest created_at = canonical), re-point all
-- FK references from the NEWER duplicate to the canonical, then archive the dupe.
--
-- After this migration the idx_buyers_unique_domain index (from 20260517100000)
-- will create cleanly with no conflicts.
-- ============================================================================

DO $$
DECLARE
  -- Each pair: canonical_id (oldest), duplicate_id (newest)
  r RECORD;
BEGIN

  FOR r IN
    WITH dupes AS (
      SELECT
        extract_domain(company_website)                          AS domain,
        min(id) FILTER (WHERE created_at = min_created)         AS canonical_id,
        max(id) FILTER (WHERE created_at > min_created)         AS duplicate_id
      FROM (
        SELECT id, company_website, created_at,
               min(created_at) OVER (PARTITION BY extract_domain(company_website)) AS min_created
        FROM public.buyers
        WHERE archived = false
          AND company_website IS NOT NULL
          AND trim(company_website) != ''
      ) sub
      GROUP BY extract_domain(company_website)
      HAVING count(*) > 1
    )
    SELECT canonical_id, duplicate_id, domain FROM dupes
    WHERE canonical_id IS NOT NULL AND duplicate_id IS NOT NULL
  LOOP

    RAISE NOTICE 'Merging domain=%: keeping %, archiving %',
      r.domain, r.canonical_id, r.duplicate_id;

    -- ── Re-point every FK reference ──────────────────────────────────────

    -- remarketing_scores
    UPDATE public.remarketing_scores
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id
        AND NOT EXISTS (
          SELECT 1 FROM public.remarketing_scores s2
          WHERE s2.buyer_id = r.canonical_id
            AND s2.listing_id = remarketing_scores.listing_id
            AND s2.universe_id IS NOT DISTINCT FROM remarketing_scores.universe_id
        );
    -- Delete scores that would conflict with the canonical (same listing+universe already exists)
    DELETE FROM public.remarketing_scores
      WHERE buyer_id = r.duplicate_id;

    -- remarketing_buyer_contacts
    UPDATE public.remarketing_buyer_contacts
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- buyer_transcripts
    UPDATE public.buyer_transcripts
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- buyer_learning_history
    UPDATE public.buyer_learning_history
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- buyer_seed_log
    UPDATE public.buyer_seed_log
      SET remarketing_buyer_id = r.canonical_id
      WHERE remarketing_buyer_id = r.duplicate_id;

    -- buyer_enrichment_queue
    UPDATE public.buyer_enrichment_queue
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id
        AND NOT EXISTS (
          SELECT 1 FROM public.buyer_enrichment_queue q2
          WHERE q2.buyer_id = r.canonical_id
        );
    DELETE FROM public.buyer_enrichment_queue
      WHERE buyer_id = r.duplicate_id;

    -- buyer_pass_decisions
    UPDATE public.buyer_pass_decisions
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- buyer_approve_decisions
    UPDATE public.buyer_approve_decisions
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- engagement_signals
    UPDATE public.engagement_signals
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- call_transcripts
    UPDATE public.call_transcripts
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- firm_members
    UPDATE public.firm_members
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- pe_firm_contacts (buyer_id column)
    UPDATE public.pe_firm_contacts
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- pe_firm_contacts (pe_firm_id column — self-ref to a PE firm buyer)
    UPDATE public.pe_firm_contacts
      SET pe_firm_id = r.canonical_id
      WHERE pe_firm_id = r.duplicate_id;

    -- platform_contacts (buyer_id column)
    UPDATE public.platform_contacts
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- platform_contacts (platform_id column)
    UPDATE public.platform_contacts
      SET platform_id = r.canonical_id
      WHERE platform_id = r.duplicate_id;

    -- contacts
    UPDATE public.contacts
      SET remarketing_buyer_id = r.canonical_id
      WHERE remarketing_buyer_id = r.duplicate_id;

    -- profiles
    UPDATE public.profiles
      SET remarketing_buyer_id = r.canonical_id
      WHERE remarketing_buyer_id = r.duplicate_id;

    -- data_room_access
    UPDATE public.data_room_access
      SET remarketing_buyer_id = r.canonical_id
      WHERE remarketing_buyer_id = r.duplicate_id;

    -- deals
    UPDATE public.deals
      SET remarketing_buyer_id = r.canonical_id
      WHERE remarketing_buyer_id = r.duplicate_id;

    -- document_distributions
    UPDATE public.document_distributions
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- document_openings
    UPDATE public.document_openings
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- deal_data_room_access
    UPDATE public.deal_data_room_access
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- document_distribution_tracking
    UPDATE public.document_distribution_tracking
      SET matched_buyer_id = r.canonical_id
      WHERE matched_buyer_id = r.duplicate_id;

    -- ai_buyer_signal_analysis
    UPDATE public.ai_buyer_signal_analysis
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- rm_buyer_deal_cadence
    UPDATE public.rm_buyer_deal_cadence
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- contact_intelligence
    UPDATE public.contact_intelligence
      SET buyer_id = r.canonical_id
      WHERE buyer_id = r.duplicate_id;

    -- lead_memo_access
    UPDATE public.lead_memo_access
      SET remarketing_buyer_id = r.canonical_id
      WHERE remarketing_buyer_id = r.duplicate_id;

    -- memo_audit_logs
    UPDATE public.memo_audit_logs
      SET remarketing_buyer_id = r.canonical_id
      WHERE remarketing_buyer_id = r.duplicate_id;

    -- contact_activities
    UPDATE public.contact_activities
      SET remarketing_buyer_id = r.canonical_id
      WHERE remarketing_buyer_id = r.duplicate_id;

    -- unified_contacts
    UPDATE public.unified_contacts
      SET remarketing_buyer_id = r.canonical_id
      WHERE remarketing_buyer_id = r.duplicate_id;

    -- buyers.pe_firm_id (self-referential — PE firm child records pointing at a dupe PE firm)
    UPDATE public.buyers
      SET pe_firm_id = r.canonical_id
      WHERE pe_firm_id = r.duplicate_id;

    -- ── Archive the duplicate ─────────────────────────────────────────────
    UPDATE public.buyers
      SET archived = true,
          updated_at = now(),
          notes = COALESCE(notes || E'\n', '') ||
                  '[Archived by 20260517200000: merged into ' || r.canonical_id || ']'
      WHERE id = r.duplicate_id;

    RAISE NOTICE 'Done: archived %', r.duplicate_id;

  END LOOP;

END $$;

-- ── Verify: should return 0 rows ────────────────────────────────────────────
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
