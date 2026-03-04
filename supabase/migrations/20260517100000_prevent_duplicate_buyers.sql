-- ============================================================================
-- PREVENT DUPLICATE BUYERS — Database-Level Guardrails
--
-- Strategy: website domain is the canonical unique identifier for buyers.
-- Buyers without a website are not permitted (enforced at application layer;
-- the unique domain index enforces it at the DB layer for rows that do have one).
--
-- This migration:
--   1. Adds a partial unique index on extract_domain(company_website)
--      so the DB itself rejects duplicate domains
--   2. Creates a monitoring view to detect any existing domain duplicates
--
-- SAFETY: The index is partial (WHERE archived = false AND company_website IS NOT NULL),
-- so it won't conflict with archived records or legacy rows with no website.
-- The index will FAIL if two active buyers already share the same domain.
-- Run the Section 1 query first to identify and resolve any such pairs.
-- ============================================================================


-- ============================================================================
-- SECTION 1: Find existing domain duplicates (informational — no data changes)
-- ============================================================================
-- Run this manually before deploying to identify conflicts:
--
--   SELECT extract_domain(company_website) AS domain,
--          count(*) AS cnt,
--          array_agg(id ORDER BY created_at) AS ids,
--          array_agg(company_name ORDER BY created_at) AS names
--   FROM public.buyers
--   WHERE archived = false
--     AND company_website IS NOT NULL
--     AND trim(company_website) != ''
--   GROUP BY extract_domain(company_website)
--   HAVING count(*) > 1
--   ORDER BY cnt DESC;
--
-- For each duplicate set: archive the newer copies and update FK references
-- (remarketing_scores, buyer_introductions, etc.) to point to the oldest record.
-- ============================================================================


-- ============================================================================
-- SECTION 2: Unique index on website domain (the canonical dedup key)
-- ============================================================================
-- Prevents two active buyers from sharing the same root domain.
-- NULL websites are excluded — the application layer blocks no-website inserts.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_buyers_unique_domain
  ON public.buyers (extract_domain(company_website))
  WHERE archived = false
    AND company_website IS NOT NULL
    AND trim(company_website) != '';

COMMENT ON INDEX public.idx_buyers_unique_domain IS
  'Website domain is the canonical unique identifier for buyers. '
  'Prevents two active buyers from sharing the same root domain. '
  'Uses the existing extract_domain() helper to normalize URLs. '
  'Added 2026-05-17. Application layer also rejects buyers with no website.';


-- ============================================================================
-- SECTION 3: Domain duplicate monitoring view
-- ============================================================================

CREATE OR REPLACE VIEW public.v_duplicate_buyers AS
SELECT
  extract_domain(b.company_website) AS domain,
  count(*)                           AS duplicate_count,
  array_agg(b.id          ORDER BY b.created_at) AS buyer_ids,
  array_agg(b.company_name ORDER BY b.created_at) AS company_names,
  array_agg(b.company_website ORDER BY b.created_at) AS websites,
  array_agg(b.created_at  ORDER BY b.created_at) AS created_ats,
  min(b.created_at)                  AS first_created_at
FROM public.buyers b
WHERE b.archived = false
  AND b.company_website IS NOT NULL
  AND trim(b.company_website) != ''
GROUP BY extract_domain(b.company_website)
HAVING count(*) > 1
ORDER BY duplicate_count DESC, first_created_at;

COMMENT ON VIEW public.v_duplicate_buyers IS
  'Shows active buyers sharing the same website domain. '
  'Should always be empty once the idx_buyers_unique_domain index is in place. '
  'Query periodically to detect regressions from direct DB writes or triggers.';
