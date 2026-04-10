-- ============================================================================
-- PIPELINE CRM COMPLETENESS: Fill every data-model gap surfaced by the
-- 25-scenario SourceCo employee walkthrough.
-- ============================================================================
-- This migration adds fields, stages, and infrastructure to make the deal
-- pipeline a genuine end-to-end CRM for M&A deal tracking, from first
-- contact through LOI, closing, and commission payout.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LOI TRACKING — beyond the boolean
-- ═══════════════════════════════════════════════════════════════════════════
-- under_loi was a boolean. M&A advisors need to track the LOI lifecycle:
-- when it was submitted, what the offer was, when exclusivity expires, etc.

ALTER TABLE public.deal_pipeline
  ADD COLUMN IF NOT EXISTS loi_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loi_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loi_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS loi_value NUMERIC,
  ADD COLUMN IF NOT EXISTS loi_terms_summary TEXT,
  ADD COLUMN IF NOT EXISTS loi_counterparty TEXT;

COMMENT ON COLUMN public.deal_pipeline.loi_submitted_at IS 'When the LOI was submitted by the buyer';
COMMENT ON COLUMN public.deal_pipeline.loi_signed_at IS 'When both parties executed the LOI';
COMMENT ON COLUMN public.deal_pipeline.loi_expiry_date IS 'When the LOI exclusivity period expires';
COMMENT ON COLUMN public.deal_pipeline.loi_value IS 'Proposed purchase price in the LOI';
COMMENT ON COLUMN public.deal_pipeline.loi_counterparty IS 'Who submitted the LOI (buyer firm name)';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. RESTORE "Under Contract" STAGE
-- ═══════════════════════════════════════════════════════════════════════════
-- Deleted in 20251003105446. The closing process between LOI-signed and
-- Closed Won needs its own stage for task automation and reporting.

INSERT INTO public.deal_stages (name, description, position, color, is_active, is_default, stage_type, default_probability)
SELECT 'Under Contract', 'Purchase agreement signed, heading to close', 7, '#22c55e', true, false, 'active', 90
WHERE NOT EXISTS (SELECT 1 FROM public.deal_stages WHERE name = 'Under Contract' AND is_active = true);

-- Bump Closed Won and Closed Lost positions to make room
UPDATE public.deal_stages SET position = 8 WHERE name = 'Closed Won' AND is_active = true AND position < 8;
UPDATE public.deal_stages SET position = 9 WHERE name = 'Closed Lost' AND is_active = true AND position < 9;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. COMMISSION & FEE TRACKING
-- ═══════════════════════════════════════════════════════════════════════════
-- M&A advisors need to track fee earned per closed deal.

ALTER TABLE public.deal_pipeline
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS fee_earned NUMERIC,
  ADD COLUMN IF NOT EXISTS fee_paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.deal_pipeline.commission_rate IS 'Advisory fee rate as a percentage (e.g. 5.00 = 5%)';
COMMENT ON COLUMN public.deal_pipeline.fee_earned IS 'Actual fee earned on close (dollar amount)';
COMMENT ON COLUMN public.deal_pipeline.fee_paid_at IS 'When the advisory fee was paid out';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. DEAL FIELD EDITABILITY — expose priority + close date for inline editing
-- ═══════════════════════════════════════════════════════════════════════════
-- The `value` and `probability` columns already exist but were only settable
-- at creation time (via CreateDealModal). No migration needed — just the
-- frontend needs to expose them. This section adds indexes for the
-- new filterable/sortable fields.

CREATE INDEX IF NOT EXISTS idx_deal_pipeline_loi_expiry ON public.deal_pipeline(loi_expiry_date) WHERE loi_expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deal_pipeline_fee_earned ON public.deal_pipeline(fee_earned) WHERE fee_earned IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. WIRE TASK TEMPLATE FOR "Under Contract" STAGE
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.task_templates (name, description, category, stage_trigger, tasks)
SELECT
  'Closing Checklist',
  'Standard tasks when deal enters Under Contract stage',
  'deal_process',
  'Under Contract',
  '[
    {"title": "Confirm purchase agreement is fully executed", "task_type": "due_diligence", "priority": "high", "due_offset_days": 1},
    {"title": "Coordinate escrow / wire instructions", "task_type": "send_materials", "priority": "high", "due_offset_days": 3},
    {"title": "Verify all DD conditions are satisfied", "task_type": "due_diligence", "priority": "high", "due_offset_days": 5},
    {"title": "Schedule closing call with both parties", "task_type": "schedule_call", "priority": "high", "due_offset_days": 5},
    {"title": "Prepare closing documents package", "task_type": "send_materials", "priority": "medium", "due_offset_days": 7},
    {"title": "Confirm commission invoice and payment terms", "task_type": "other", "priority": "medium", "due_offset_days": 10}
  ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.task_templates WHERE name = 'Closing Checklist');


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. AUTO-SET under_loi WHEN DEAL ENTERS LOI SUBMITTED STAGE
-- ═══════════════════════════════════════════════════════════════════════════
-- Extend the existing sync_deal_flags_from_stage trigger to also set
-- under_loi = true when the deal enters "LOI Submitted"

CREATE OR REPLACE FUNCTION public.sync_deal_flags_from_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_stage_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT name INTO new_stage_name FROM public.deal_stages WHERE id = NEW.stage_id;
  IF new_stage_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- NDA synchronization
  IF new_stage_name ILIKE '%NDA Signed%' AND NEW.nda_status IS DISTINCT FROM 'signed' THEN
    NEW.nda_status := 'signed';
  ELSIF new_stage_name ILIKE '%NDA Sent%' AND NEW.nda_status IN ('not_sent', NULL) THEN
    NEW.nda_status := 'sent';
  END IF;

  -- Fee agreement synchronization
  IF new_stage_name ILIKE '%Fee Agreement Signed%'
     AND NEW.fee_agreement_status IS DISTINCT FROM 'signed' THEN
    NEW.fee_agreement_status := 'signed';
  ELSIF new_stage_name ILIKE '%Fee Agreement Sent%'
        AND NEW.fee_agreement_status IN ('not_sent', NULL) THEN
    NEW.fee_agreement_status := 'sent';
  END IF;

  -- LOI synchronization
  IF new_stage_name ILIKE '%LOI Submitted%' THEN
    NEW.under_loi := true;
    IF NEW.loi_submitted_at IS NULL THEN
      NEW.loi_submitted_at := now();
    END IF;
  END IF;

  -- Under Contract synchronization
  IF new_stage_name ILIKE '%Under Contract%' THEN
    NEW.under_loi := true;
    IF NEW.loi_signed_at IS NULL THEN
      NEW.loi_signed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
