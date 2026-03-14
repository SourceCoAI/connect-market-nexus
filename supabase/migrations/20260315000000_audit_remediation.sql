-- ═══════════════════════════════════════════════════════════════
-- Migration: audit_remediation
-- Date: 2026-03-15
-- Purpose: Fixes multiple database issues identified during audit.
--          All statements are idempotent (safe to run multiple times).
-- ═══════════════════════════════════════════════════════════════


-- ─── H1: Missing Indexes ─────────────────────────────────────────────────────
-- NOTE: Cannot use CONCURRENTLY inside a transaction block, so we use
-- regular CREATE INDEX IF NOT EXISTS instead.

CREATE INDEX IF NOT EXISTS idx_buyer_introductions_buyer_id
  ON public.buyer_introductions(buyer_id);

CREATE INDEX IF NOT EXISTS idx_deal_pipeline_deleted_at
  ON public.deal_pipeline(deleted_at);


-- ─── M1: Fix enriched_contacts RLS policies ─────────────────────────────────
-- The original policies (enriched_contacts_service_insert and
-- enriched_contacts_service_update) use WITH CHECK (true) / USING (true)
-- without a TO clause, allowing ANY role to insert/update.
-- Fix: restrict to service_role only.

DROP POLICY IF EXISTS enriched_contacts_service_insert ON public.enriched_contacts;
DROP POLICY IF EXISTS enriched_contacts_service_update ON public.enriched_contacts;

CREATE POLICY enriched_contacts_service_insert ON public.enriched_contacts
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY enriched_contacts_service_update ON public.enriched_contacts
  FOR UPDATE TO service_role
  USING (true);


-- ─── C6: Fix buyer_type_confidence column type mismatch ─────────────────────
-- Standardize from REAL to INTEGER if the column currently has the wrong type.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'buyers'
      AND column_name = 'buyer_type_confidence'
      AND data_type = 'real'
  ) THEN
    ALTER TABLE public.buyers
      ALTER COLUMN buyer_type_confidence TYPE INTEGER
      USING buyer_type_confidence::INTEGER;
  END IF;
END $$;


-- ─── H11: Fix ALTER TABLE on VIEW ───────────────────────────────────────────
-- is_publicly_traded belongs on the real table (buyers), not the view
-- (remarketing_buyers). ADD COLUMN IF NOT EXISTS is idempotent.

ALTER TABLE IF EXISTS public.buyers
  ADD COLUMN IF NOT EXISTS is_publicly_traded BOOLEAN DEFAULT false;


-- ─── C5: Non-idempotent table creation (global_activity_queue) ──────────────
-- Two migration files (20260210_global_activity_queue.sql and
-- 20260210215937_ade4993c-5b7f-4b07-a2d9-8bb3c833b699.sql) both CREATE TABLE
-- public.global_activity_queue without IF NOT EXISTS. This will fail if both
-- run. The real fix is migration squashing; adding IF NOT EXISTS retroactively
-- does not help because the migrations have already been applied. Noted here
-- for tracking purposes.
-- NO-OP: This issue should be resolved via migration squashing.


-- ─── M3: Unique constraints for webhook idempotency ─────────────────────────
-- Prevent duplicate webhook event processing. Note: the actual column names
-- are smartlead_campaign_id / heyreach_campaign_id (not campaign_id).

CREATE UNIQUE INDEX IF NOT EXISTS idx_smartlead_webhook_events_dedup
  ON public.smartlead_webhook_events(event_type, smartlead_campaign_id, lead_email)
  WHERE smartlead_campaign_id IS NOT NULL AND lead_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_heyreach_webhook_events_dedup
  ON public.heyreach_webhook_events(event_type, heyreach_campaign_id, lead_email)
  WHERE heyreach_campaign_id IS NOT NULL AND lead_email IS NOT NULL;


-- ─── H8: Add pg_cron jobs for missing queue processors ──────────────────────
-- Idempotent: unschedule first (ignoring errors if not yet scheduled),
-- then schedule.

DO $$ BEGIN
  PERFORM cron.unschedule('process-buyer-enrichment-queue');
EXCEPTION WHEN others THEN
  -- Job did not exist yet; safe to ignore
  NULL;
END $$;

SELECT cron.schedule(
  'process-buyer-enrichment-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-buyer-enrichment-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

DO $$ BEGIN
  PERFORM cron.unschedule('process-scoring-queue');
EXCEPTION WHEN others THEN
  -- Job did not exist yet; safe to ignore
  NULL;
END $$;

SELECT cron.schedule(
  'process-scoring-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-scoring-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
