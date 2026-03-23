-- Medium Severity Fixes Migration
-- Addresses audit gaps M-2, M-5, M-6, M-8, M-9

-- ============================================================
-- M-2 FIX: Add tags/labels system for buyers.
-- Simple JSONB array for flexible tagging without a join table.
-- ============================================================
ALTER TABLE public.buyers
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_buyers_tags ON public.buyers USING GIN (tags);

-- ============================================================
-- M-5 FIX: Add fee/commission tracking fields to referral_partners.
-- ============================================================
ALTER TABLE public.referral_partners
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 2) DEFAULT NULL;

ALTER TABLE public.referral_partners
ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT NULL;

ALTER TABLE public.referral_partners
DROP CONSTRAINT IF EXISTS chk_referral_commission_type;
ALTER TABLE public.referral_partners
ADD CONSTRAINT chk_referral_commission_type CHECK (commission_type IN ('percentage', 'flat_fee', 'tiered'));

ALTER TABLE public.referral_partners
ADD COLUMN IF NOT EXISTS commission_notes TEXT DEFAULT NULL;

-- ============================================================
-- M-6 FIX: Add missing columns to referral_partners that were
-- captured in UI but silently discarded on insert.
-- ============================================================
ALTER TABLE public.referral_partners
ADD COLUMN IF NOT EXISTS partner_type TEXT DEFAULT NULL;

ALTER TABLE public.referral_partners
DROP CONSTRAINT IF EXISTS chk_referral_partner_type;
ALTER TABLE public.referral_partners
ADD CONSTRAINT chk_referral_partner_type CHECK (partner_type IN ('person', 'business'));

ALTER TABLE public.referral_partners
ADD COLUMN IF NOT EXISTS linkedin TEXT DEFAULT NULL;

ALTER TABLE public.referral_partners
ADD COLUMN IF NOT EXISTS website TEXT DEFAULT NULL;

ALTER TABLE public.referral_partners
ADD COLUMN IF NOT EXISTS contact_name TEXT DEFAULT NULL;

-- ============================================================
-- M-8 FIX: Add is_admin flag to page_views so admin traffic
-- can be excluded from analytics.
-- ============================================================
ALTER TABLE public.page_views
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- M-9 FIX: Add SLA tracking fields to deal_pipeline for
-- monitoring review response times.
-- ============================================================
ALTER TABLE public.deal_pipeline
ADD COLUMN IF NOT EXISTS first_reviewed_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.deal_pipeline
ADD COLUMN IF NOT EXISTS review_sla_hours INTEGER DEFAULT 48;

-- Create a view for deals exceeding SLA
CREATE OR REPLACE VIEW public.v_deals_exceeding_sla AS
SELECT
  dp.id,
  dp.title,
  dp.created_at,
  dp.first_reviewed_at,
  dp.review_sla_hours,
  EXTRACT(EPOCH FROM (COALESCE(dp.first_reviewed_at, NOW()) - dp.created_at)) / 3600 AS hours_since_creation,
  CASE
    WHEN dp.first_reviewed_at IS NULL
      AND EXTRACT(EPOCH FROM (NOW() - dp.created_at)) / 3600 > dp.review_sla_hours
    THEN true
    ELSE false
  END AS sla_breached
FROM public.deal_pipeline dp
WHERE dp.deleted_at IS NULL;
