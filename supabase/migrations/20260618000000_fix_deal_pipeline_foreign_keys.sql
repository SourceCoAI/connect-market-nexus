-- ============================================================================
-- MIGRATION: Fix foreign keys still referencing old "deals" table
-- ============================================================================
-- The deals table was renamed to deal_pipeline in migration
-- 20260506000000_rename_deals_to_deal_pipeline.sql, but the FK constraints
-- created in 20260222300000_database_hardening.sql still reference
-- public.deals(id), causing error 42P01 when inserting into child tables
-- (e.g. adding notes/comments to a deal).
-- ============================================================================

BEGIN;

-- deal_activities.deal_id → deal_pipeline
ALTER TABLE public.deal_activities
  DROP CONSTRAINT IF EXISTS deal_activities_deal_id_fkey,
  ADD CONSTRAINT deal_activities_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal_pipeline(id) ON DELETE CASCADE;

-- deal_comments.deal_id → deal_pipeline
ALTER TABLE public.deal_comments
  DROP CONSTRAINT IF EXISTS deal_comments_deal_id_fkey,
  ADD CONSTRAINT deal_comments_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal_pipeline(id) ON DELETE CASCADE;

-- deal_contacts.deal_id → deal_pipeline
ALTER TABLE public.deal_contacts
  DROP CONSTRAINT IF EXISTS deal_contacts_deal_id_fkey,
  ADD CONSTRAINT deal_contacts_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal_pipeline(id) ON DELETE CASCADE;

-- deal_notes.deal_id → deal_pipeline
ALTER TABLE public.deal_notes
  DROP CONSTRAINT IF EXISTS deal_notes_deal_id_fkey,
  ADD CONSTRAINT deal_notes_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal_pipeline(id) ON DELETE CASCADE;

-- deal_tasks.deal_id → deal_pipeline
ALTER TABLE public.deal_tasks
  DROP CONSTRAINT IF EXISTS deal_tasks_deal_id_fkey,
  ADD CONSTRAINT deal_tasks_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal_pipeline(id) ON DELETE CASCADE;

-- deal_documents.deal_id → deal_pipeline
ALTER TABLE public.deal_documents
  DROP CONSTRAINT IF EXISTS deal_documents_deal_id_fkey,
  ADD CONSTRAINT deal_documents_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal_pipeline(id) ON DELETE CASCADE;

-- deal_transcripts.deal_id → deal_pipeline
ALTER TABLE public.deal_transcripts
  DROP CONSTRAINT IF EXISTS deal_transcripts_deal_id_fkey,
  ADD CONSTRAINT deal_transcripts_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal_pipeline(id) ON DELETE CASCADE;

-- deal_referrals.deal_id → deal_pipeline
ALTER TABLE public.deal_referrals
  DROP CONSTRAINT IF EXISTS deal_referrals_deal_id_fkey,
  ADD CONSTRAINT deal_referrals_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal_pipeline(id) ON DELETE CASCADE;

-- deal_scoring_adjustments.deal_id → deal_pipeline
ALTER TABLE public.deal_scoring_adjustments
  DROP CONSTRAINT IF EXISTS deal_scoring_adjustments_deal_id_fkey,
  ADD CONSTRAINT deal_scoring_adjustments_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal_pipeline(id) ON DELETE CASCADE;

-- deal_alerts.deal_id → deal_pipeline
ALTER TABLE public.deal_alerts
  DROP CONSTRAINT IF EXISTS deal_alerts_deal_id_fkey,
  ADD CONSTRAINT deal_alerts_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES public.deal_pipeline(id) ON DELETE CASCADE;

COMMIT;
