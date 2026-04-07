-- ============================================================================
-- CTO AUDIT FIXES
--
-- This migration addresses multiple database issues identified during
-- the CTO audit. Changes include:
--   1. Missing B-tree indexes on remarketing_buyers
--   2. GIN indexes on JSONB columns in remarketing_buyers
--   3. CHECK constraints on score boundaries (remarketing_scores)
--   4. Revenue/EBITDA range validation constraints (remarketing_buyers)
--   5. Change CASCADE deletes to RESTRICT on remarketing_scores FKs
--   6. Extended audit log event types for data_room_audit_log
--   7. Improved partial index on data_room_access (unrevoked)
--   8. Partial index on data_room_access for expiration queries
-- ============================================================================


-- ─── 1. Missing B-tree indexes on remarketing_buyers ───

CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_email_domain
  ON public.remarketing_buyers(email_domain)
  WHERE email_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_company_website
  ON public.remarketing_buyers(company_website)
  WHERE company_website IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_revenue_range
  ON public.remarketing_buyers(target_revenue_min, target_revenue_max)
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_ebitda_range
  ON public.remarketing_buyers(target_ebitda_min, target_ebitda_max)
  WHERE archived = false;


-- ─── 2. GIN indexes on JSONB columns ───

CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_extraction_sources
  ON public.remarketing_buyers USING GIN(extraction_sources);

CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_recent_acquisitions
  ON public.remarketing_buyers USING GIN(recent_acquisitions);

CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_portfolio
  ON public.remarketing_buyers USING GIN(portfolio_companies);


-- ─── 3. CHECK constraints on score boundaries (remarketing_scores) ───
-- Postgres does not support IF NOT EXISTS for ADD CONSTRAINT, so we use
-- DO blocks with exception handling to make this migration idempotent.

DO $$ BEGIN
  ALTER TABLE public.remarketing_scores
    ADD CONSTRAINT chk_composite_score
    CHECK (composite_score >= 0 AND composite_score <= 100);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.remarketing_scores
    ADD CONSTRAINT chk_geography_score
    CHECK (geography_score IS NULL OR (geography_score >= 0 AND geography_score <= 100));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.remarketing_scores
    ADD CONSTRAINT chk_size_score
    CHECK (size_score IS NULL OR (size_score >= 0 AND size_score <= 100));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.remarketing_scores
    ADD CONSTRAINT chk_service_score
    CHECK (service_score IS NULL OR (service_score >= 0 AND service_score <= 100));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.remarketing_scores
    ADD CONSTRAINT chk_owner_goals_score
    CHECK (owner_goals_score IS NULL OR (owner_goals_score >= 0 AND owner_goals_score <= 100));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ─── 4. Revenue/EBITDA range validation (remarketing_buyers) ───

DO $$ BEGIN
  ALTER TABLE public.remarketing_buyers
    ADD CONSTRAINT chk_revenue_range
    CHECK (target_revenue_min IS NULL OR target_revenue_max IS NULL OR target_revenue_min <= target_revenue_max);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.remarketing_buyers
    ADD CONSTRAINT chk_ebitda_range
    CHECK (target_ebitda_min IS NULL OR target_ebitda_max IS NULL OR target_ebitda_min <= target_ebitda_max);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ─── 5. Change CASCADE deletes to RESTRICT on remarketing_scores FKs ───
-- Prevents accidental data loss when a listing or buyer is deleted.

ALTER TABLE public.remarketing_scores
  DROP CONSTRAINT IF EXISTS remarketing_scores_listing_id_fkey;

ALTER TABLE public.remarketing_scores
  ADD CONSTRAINT remarketing_scores_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE RESTRICT;

ALTER TABLE public.remarketing_scores
  DROP CONSTRAINT IF EXISTS remarketing_scores_buyer_id_fkey;

ALTER TABLE public.remarketing_scores
  ADD CONSTRAINT remarketing_scores_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES public.remarketing_buyers(id) ON DELETE RESTRICT;


-- ─── 6. Extend audit log event types ───
-- Drop the existing inline CHECK on data_room_audit_log.action and recreate
-- with additional remarketing / access lifecycle events.
-- The auto-generated constraint name for an inline CHECK is
-- data_room_audit_log_action_check.

ALTER TABLE public.data_room_audit_log
  DROP CONSTRAINT IF EXISTS data_room_audit_log_action_check;

ALTER TABLE public.data_room_audit_log
  ADD CONSTRAINT data_room_audit_log_action_check CHECK (action IN (
    -- Original events
    'view_document', 'download_document',
    'grant_teaser', 'grant_full_memo', 'grant_data_room',
    'revoke_teaser', 'revoke_full_memo', 'revoke_data_room',
    'upload_document', 'delete_document',
    'fee_agreement_override',
    'generate_memo', 'edit_memo', 'publish_memo',
    'send_memo_email', 'manual_log_send',
    'bulk_grant', 'bulk_revoke',
    'view_data_room',
    -- New events added by CTO audit
    'score_created', 'score_updated', 'score_deleted',
    'buyer_created', 'buyer_updated', 'buyer_archived',
    'access_expired', 'access_revoked_cascade',
    'bulk_clear_remarketing'
  ));


-- ─── 7. Improved partial index on data_room_access (unrevoked rows) ───
-- The existing idx_data_room_access_active requires both revoked_at IS NULL
-- AND expires_at IS NULL. This new index covers queries that only filter on
-- revoked_at IS NULL regardless of expiration status.

CREATE INDEX IF NOT EXISTS idx_data_room_access_unrevoked
  ON public.data_room_access(deal_id)
  WHERE revoked_at IS NULL;


-- ─── 8. Partial index for non-revoked access with expiration ───
-- Helps queries that check revoked_at IS NULL and need to evaluate expires_at
-- (e.g., "show me all active-or-future access rows"). Including expires_at in
-- the index allows index-only scans for expiration filtering without requiring
-- expires_at IS NULL.

CREATE INDEX IF NOT EXISTS idx_data_room_access_unrevoked_expires
  ON public.data_room_access(deal_id, expires_at)
  WHERE revoked_at IS NULL;

-- Merged from: 20260224000000_docuseal_integration.sql
-- ============================================================================
-- DocuSeal E-Signature Integration
--
-- Adds:
--   1. DocuSeal tracking columns on firm_agreements (additive only)
--   2. docuseal_webhook_log table for audit/legal compliance
--   3. Indexes for efficient lookups
--
-- IMPORTANT: Existing firm_agreements columns (nda_signed, fee_agreement_signed,
-- etc.) are preserved. The webhook handler sets BOTH the new DocuSeal fields
-- AND the existing booleans so all current queries keep working.
-- ============================================================================

-- ─── 1. Add DocuSeal columns to firm_agreements ───

ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS nda_docuseal_submission_id TEXT;
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS nda_docuseal_status TEXT DEFAULT 'not_sent';
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS nda_signed_document_url TEXT;
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS fee_docuseal_submission_id TEXT;
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS fee_docuseal_status TEXT DEFAULT 'not_sent';
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS fee_signed_document_url TEXT;

-- ─── 2. Create webhook audit log ───

CREATE TABLE IF NOT EXISTS public.docuseal_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  submitter_id TEXT,
  external_id TEXT,
  document_type TEXT,
  raw_payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docuseal_webhook_external_id
  ON public.docuseal_webhook_log(external_id);
CREATE INDEX IF NOT EXISTS idx_docuseal_webhook_submission_id
  ON public.docuseal_webhook_log(submission_id);
CREATE INDEX IF NOT EXISTS idx_docuseal_webhook_created_at
  ON public.docuseal_webhook_log(created_at DESC);

COMMENT ON TABLE public.docuseal_webhook_log IS
  'Immutable audit log for all DocuSeal webhook events. '
  'Every event (form.completed, form.viewed, form.started, form.declined) '
  'is logged here with the full raw payload for legal compliance.';

-- ─── 3. RLS ───

ALTER TABLE public.docuseal_webhook_log ENABLE ROW LEVEL SECURITY;

-- Admin read access
DROP POLICY IF EXISTS "Admins can view webhook logs" ON public.docuseal_webhook_log;
CREATE POLICY "Admins can view webhook logs"
  ON public.docuseal_webhook_log
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Service role insert (from edge functions)
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON public.docuseal_webhook_log;
CREATE POLICY "Service role can insert webhook logs"
  ON public.docuseal_webhook_log
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ─── 4. Grants ───

GRANT SELECT ON public.docuseal_webhook_log TO authenticated;
GRANT ALL ON public.docuseal_webhook_log TO service_role;

-- ============================================================================
-- Summary:
--   6 new columns on firm_agreements (all nullable/defaulted, fully additive)
--   1 new table: docuseal_webhook_log
--   RLS: Admin read, service_role insert
-- ============================================================================
