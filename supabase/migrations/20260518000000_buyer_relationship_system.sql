-- ============================================================================
-- BUYER RELATIONSHIP SYSTEM
--
-- Part A: PE Firm ↔ Platform Company parent-child model
-- Part B: Marketplace signup integration columns
-- Part C: Automated PE backfill pipeline tables
--
-- New columns on buyers (formerly remarketing_buyers):
--   parent_pe_firm_id, parent_pe_firm_name, is_marketplace_member,
--   marketplace_joined_at, backfill_status
--
-- New tables:
--   pe_backfill_review_queue, pe_backfill_log, pe_link_queue
--
-- New triggers:
--   auto-populate parent_pe_firm_name, cascade name changes,
--   enqueue pe_link on pe_firm_name change
--
-- NOTE: The table was renamed from remarketing_buyers → buyers in migration
-- 20260514000000. A backward-compatible VIEW named remarketing_buyers exists
-- but DDL (ALTER TABLE, CREATE INDEX, CREATE TRIGGER) must target the real
-- table: public.buyers.
-- ============================================================================

-- Enable pg_trgm for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- PHASE 1: ADD COLUMNS TO buyers
-- ============================================================================

-- parent_pe_firm_id: self-referencing FK for parent PE firm relationship
-- (pe_firm_id already exists from prior migration; parent_pe_firm_id is the
--  canonical name per spec. We add it alongside pe_firm_id for clarity.)
ALTER TABLE public.buyers
  ADD COLUMN IF NOT EXISTS parent_pe_firm_id UUID REFERENCES public.buyers(id)
    ON DELETE SET NULL;

-- Denormalized parent PE firm name for display
ALTER TABLE public.buyers
  ADD COLUMN IF NOT EXISTS parent_pe_firm_name TEXT;

-- Marketplace integration columns
ALTER TABLE public.buyers
  ADD COLUMN IF NOT EXISTS is_marketplace_member BOOLEAN DEFAULT false;

ALTER TABLE public.buyers
  ADD COLUMN IF NOT EXISTS marketplace_joined_at TIMESTAMPTZ;

-- Backfill pipeline status tracking
ALTER TABLE public.buyers
  ADD COLUMN IF NOT EXISTS backfill_status TEXT
    CHECK (backfill_status IN ('done', 'flagged', 'unresolvable', 'retry'));

-- Index for parent lookups
CREATE INDEX IF NOT EXISTS idx_buyers_parent_pe_firm_id
  ON public.buyers(parent_pe_firm_id)
  WHERE parent_pe_firm_id IS NOT NULL;

-- Index for marketplace member queries
CREATE INDEX IF NOT EXISTS idx_buyers_marketplace_member
  ON public.buyers(is_marketplace_member)
  WHERE is_marketplace_member = true;

-- Index for backfill candidate queries
CREATE INDEX IF NOT EXISTS idx_buyers_backfill_candidates
  ON public.buyers(buyer_type, backfill_status)
  WHERE buyer_type = 'corporate'
    AND backfill_status IS NULL;


-- ============================================================================
-- PHASE 2: DEPTH CONSTRAINT — no chains deeper than 1 level
-- A parent_pe_firm_id may NOT point to a record that itself has a parent_pe_firm_id.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_parent_pe_firm_depth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_pe_firm_id IS NOT NULL THEN
    -- The referenced parent must not itself have a parent
    IF EXISTS (
      SELECT 1 FROM public.buyers
      WHERE id = NEW.parent_pe_firm_id
        AND parent_pe_firm_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Parent PE firm cannot itself have a parent (max depth = 1)';
    END IF;

    -- Also prevent a PE firm from being set as a child if it has children
    IF EXISTS (
      SELECT 1 FROM public.buyers
      WHERE parent_pe_firm_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'This record has portfolio companies and cannot be made a child of another PE firm';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_parent_pe_firm_depth ON public.buyers;
CREATE TRIGGER trg_check_parent_pe_firm_depth
  BEFORE INSERT OR UPDATE OF parent_pe_firm_id
  ON public.buyers
  FOR EACH ROW
  EXECUTE FUNCTION check_parent_pe_firm_depth();


-- ============================================================================
-- PHASE 3: BACKFILL parent_pe_firm_id FROM existing pe_firm_id
-- (pe_firm_id was added in prior migration; copy to parent_pe_firm_id)
-- ============================================================================

UPDATE public.buyers
SET parent_pe_firm_id = pe_firm_id
WHERE pe_firm_id IS NOT NULL
  AND parent_pe_firm_id IS NULL;


-- ============================================================================
-- PHASE 4: TRIGGERS
-- ============================================================================

-- Trigger 1: Auto-populate parent_pe_firm_name and is_pe_backed when parent_pe_firm_id is set
CREATE OR REPLACE FUNCTION auto_set_parent_pe_firm_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_pe_firm_id IS NOT NULL
     AND (OLD.parent_pe_firm_id IS DISTINCT FROM NEW.parent_pe_firm_id) THEN
    -- Set parent_pe_firm_name from the parent record
    SELECT company_name INTO NEW.parent_pe_firm_name
    FROM public.buyers
    WHERE id = NEW.parent_pe_firm_id;

    -- Ensure is_pe_backed is true
    NEW.is_pe_backed := true;
  ELSIF NEW.parent_pe_firm_id IS NULL
        AND OLD.parent_pe_firm_id IS NOT NULL THEN
    -- Clearing the parent link
    NEW.parent_pe_firm_name := NULL;
    NEW.is_pe_backed := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_set_parent_pe_firm_fields ON public.buyers;
CREATE TRIGGER trg_auto_set_parent_pe_firm_fields
  BEFORE INSERT OR UPDATE OF parent_pe_firm_id
  ON public.buyers
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_parent_pe_firm_fields();


-- Trigger 2: Cascade-update parent_pe_firm_name when PE firm's company_name changes
CREATE OR REPLACE FUNCTION cascade_pe_firm_name_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_name IS DISTINCT FROM OLD.company_name
     AND NEW.buyer_type = 'private_equity' THEN
    UPDATE public.buyers
    SET parent_pe_firm_name = NEW.company_name
    WHERE parent_pe_firm_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_pe_firm_name_change ON public.buyers;
CREATE TRIGGER trg_cascade_pe_firm_name_change
  AFTER UPDATE OF company_name
  ON public.buyers
  FOR EACH ROW
  EXECUTE FUNCTION cascade_pe_firm_name_change();


-- Trigger 3: Enqueue for PE firm linking when pe_firm_name changes on a corporate buyer
CREATE OR REPLACE FUNCTION trigger_pe_link_on_enrich()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.buyer_type = 'corporate'
     AND NEW.pe_firm_name IS NOT NULL
     AND NEW.parent_pe_firm_id IS NULL
     AND (OLD.pe_firm_name IS DISTINCT FROM NEW.pe_firm_name) THEN
    INSERT INTO public.pe_link_queue (buyer_id, pe_firm_name_raw, queued_at)
    VALUES (NEW.id, NEW.pe_firm_name, now())
    ON CONFLICT (buyer_id) DO UPDATE SET
      pe_firm_name_raw = EXCLUDED.pe_firm_name_raw,
      queued_at = now(),
      status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PHASE 5: CREATE NEW TABLES
-- ============================================================================

-- PE Backfill Review Queue: holds items needing human review
CREATE TABLE IF NOT EXISTS public.pe_backfill_review_queue (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_buyer_id    UUID NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
  platform_name        TEXT NOT NULL,
  pe_firm_name_raw     TEXT NOT NULL,
  pe_firm_name_cleaned TEXT NOT NULL,
  candidate_matches    JSONB,
  ai_reasoning         TEXT,
  confidence_score     INTEGER,
  status               TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')),
  resolved_by          UUID REFERENCES public.profiles(id),
  resolved_at          TIMESTAMPTZ,
  chosen_pe_firm_id    UUID REFERENCES public.buyers(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pe_review_queue_status
  ON public.pe_backfill_review_queue(status)
  WHERE status = 'pending';

-- PE Backfill Log: audit trail for every backfill decision
CREATE TABLE IF NOT EXISTS public.pe_backfill_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               UUID,
  platform_buyer_id    UUID,
  platform_name        TEXT,
  pe_firm_name_raw     TEXT,
  pe_firm_name_cleaned TEXT,
  method_used          TEXT,
  confidence_score     INTEGER,
  matched_pe_firm_id   UUID,
  matched_pe_firm_name TEXT,
  outcome              TEXT,
  reasoning            TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pe_backfill_log_run
  ON public.pe_backfill_log(run_id);

-- PE Link Queue: real-time trigger queue for incoming enrichments
CREATE TABLE IF NOT EXISTS public.pe_link_queue (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id             UUID NOT NULL UNIQUE REFERENCES public.buyers(id) ON DELETE CASCADE,
  pe_firm_name_raw     TEXT,
  queued_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  status               TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_pe_link_queue_pending
  ON public.pe_link_queue(status)
  WHERE status = 'pending';

-- Now create the trigger on buyers for pe_link_queue
-- (table must exist before trigger is created)
DROP TRIGGER IF EXISTS trg_pe_link_on_enrich ON public.buyers;
CREATE TRIGGER trg_pe_link_on_enrich
  AFTER INSERT OR UPDATE OF pe_firm_name
  ON public.buyers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_pe_link_on_enrich();


-- ============================================================================
-- PHASE 6: BACKFILL parent_pe_firm_name for existing linked records
-- ============================================================================

UPDATE public.buyers child
SET parent_pe_firm_name = parent.company_name
FROM public.buyers parent
WHERE child.parent_pe_firm_id = parent.id
  AND child.parent_pe_firm_name IS NULL;


-- ============================================================================
-- PHASE 7: RLS POLICIES FOR NEW TABLES
-- ============================================================================

ALTER TABLE public.pe_backfill_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pe_backfill_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pe_link_queue ENABLE ROW LEVEL SECURITY;

-- Service role has full access (edge functions use service role)
CREATE POLICY "Service role full access on pe_backfill_review_queue"
  ON public.pe_backfill_review_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on pe_backfill_log"
  ON public.pe_backfill_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on pe_link_queue"
  ON public.pe_link_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);
