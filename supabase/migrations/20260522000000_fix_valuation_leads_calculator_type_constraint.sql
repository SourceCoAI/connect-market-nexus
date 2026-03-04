-- ============================================================================
-- Fix calculator_type CHECK constraint to include all valid types
-- The edge function now routes mechanical/specialty as distinct types,
-- and the fallback path may insert 'unknown'. The prior constraint was
-- missing these values, causing inserts to fail silently.
-- Also drops the conflicting trg_valuation_leads_dedup trigger which
-- silently cancels inserts (returns NULL) — the edge function already
-- handles dedup via check-then-insert/update, and the safer
-- trg_prevent_valuation_lead_duplicates trigger marks dupes as excluded
-- instead of losing them.
-- ============================================================================

-- 1. Fix CHECK constraint: add mechanical, specialty, unknown
ALTER TABLE public.valuation_leads
  DROP CONSTRAINT IF EXISTS chk_calculator_type;

ALTER TABLE public.valuation_leads
  ADD CONSTRAINT chk_calculator_type
  CHECK (calculator_type IN (
    'general', 'auto_shop', 'hvac', 'collision', 'mechanical', 'specialty',
    'dental', 'plumbing', 'electrical', 'landscaping', 'pest_control', 'unknown'
  ));

-- 2. Drop the dangerous dedup trigger that silently eats inserts
-- The prevent_valuation_lead_duplicates trigger (marks dupes excluded) is the safe one.
-- The valuation_leads_dedup_check trigger (returns NULL, cancels insert) causes silent data loss.
DROP TRIGGER IF EXISTS trg_valuation_leads_dedup ON public.valuation_leads;
