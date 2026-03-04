-- ============================================================================
-- SCHEDULE PE BACKFILL CRON JOB
--
-- Runs backfill-pe-platform-links daily at 3am UTC.
-- Uses pg_cron extension (available in Supabase).
-- The function is called via pg_net HTTP extension to invoke the edge function.
-- ============================================================================

-- Ensure pg_cron and pg_net are available
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the backfill edge function to run at 3am UTC daily
-- Uses net.http_post to call the Supabase edge function
SELECT cron.schedule(
  'backfill-pe-platform-links-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/backfill-pe-platform-links',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"batch_size": 100, "process_queue": true}'::jsonb
  );
  $$
);
