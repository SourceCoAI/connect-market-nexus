-- ============================================================================
-- FIX HARDCODED SERVICE KEYS IN CRON JOBS
--
-- Replaces all cron jobs that had hardcoded JWT keys with versions that use
-- current_setting('app.settings.service_role_key') and
-- current_setting('app.settings.supabase_url') instead.
--
-- This makes the cron jobs portable across environments and avoids leaking
-- secrets into migration files.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Unschedule all existing cron jobs that have hardcoded keys
-- ---------------------------------------------------------------------------

-- Use a DO block so we can handle cases where a job may not exist
DO $$
BEGIN
  PERFORM cron.unschedule('sync-missing-profiles-hourly');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sync-missing-profiles-hourly not found, skipping';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('process-enrichment-queue');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'process-enrichment-queue not found, skipping';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('process-ma-guide-queue');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'process-ma-guide-queue not found, skipping';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('send-onboarding-day2');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'send-onboarding-day2 not found, skipping';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('send-onboarding-day7');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'send-onboarding-day7 not found, skipping';
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('send-first-request-followup');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'send-first-request-followup not found, skipping';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Re-create each cron job using current_setting() for keys and URL
-- ---------------------------------------------------------------------------

-- sync-missing-profiles-hourly — runs every hour at :00
SELECT cron.schedule(
  'sync-missing-profiles-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-missing-profiles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"source": "hourly-cron"}'::jsonb
  ) AS request_id;
  $$
);

-- process-enrichment-queue — runs every 2 minutes
SELECT cron.schedule(
  'process-enrichment-queue',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-enrichment-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'apikey', current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('time', now()::text)
  ) AS request_id;
  $$
);

-- process-ma-guide-queue — runs every minute
SELECT cron.schedule(
  'process-ma-guide-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-ma-guide-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', current_setting('app.settings.service_role_key')
    ),
    body := concat('{"triggered_at": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- send-onboarding-day2 — runs daily at 9am UTC
SELECT cron.schedule(
  'send-onboarding-day2',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-onboarding-day2',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'apikey', current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- send-onboarding-day7 — runs daily at 9am UTC
SELECT cron.schedule(
  'send-onboarding-day7',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-onboarding-day7',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'apikey', current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- send-first-request-followup — runs every hour at :00
SELECT cron.schedule(
  'send-first-request-followup',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-first-request-followup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'apikey', current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
