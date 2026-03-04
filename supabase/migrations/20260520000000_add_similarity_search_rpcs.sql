-- ============================================================================
-- ADD SIMILARITY SEARCH RPCs
--
-- Used by:
--   - backfill-pe-platform-links (search_pe_firms_by_similarity)
--   - handle-buyer-approval (search_buyers_by_similarity)
-- ============================================================================

-- RPC: search PE firms by name similarity (for backfill pipeline)
CREATE OR REPLACE FUNCTION search_pe_firms_by_similarity(
  search_name TEXT,
  min_similarity FLOAT DEFAULT 0.40
)
RETURNS TABLE (
  id UUID,
  company_name TEXT,
  score FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    b.id,
    b.company_name,
    similarity(LOWER(b.company_name), LOWER(search_name))::FLOAT AS score
  FROM public.buyers b
  WHERE b.buyer_type = 'private_equity'
    AND b.archived = false
    AND similarity(LOWER(b.company_name), LOWER(search_name)) > min_similarity
  ORDER BY score DESC
  LIMIT 3;
$$;

-- RPC: search all buyers by name similarity (for marketplace merge)
CREATE OR REPLACE FUNCTION search_buyers_by_similarity(
  search_name TEXT,
  min_similarity FLOAT DEFAULT 0.70
)
RETURNS TABLE (
  id UUID,
  company_name TEXT,
  score FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    b.id,
    b.company_name,
    similarity(LOWER(b.company_name), LOWER(search_name))::FLOAT AS score
  FROM public.buyers b
  WHERE b.archived = false
    AND similarity(LOWER(b.company_name), LOWER(search_name)) > min_similarity
  ORDER BY score DESC
  LIMIT 5;
$$;
