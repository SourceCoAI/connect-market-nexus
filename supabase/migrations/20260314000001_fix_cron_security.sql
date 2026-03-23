-- Fix: Remove hardcoded service_role JWT from cron jobs.
-- Replace with runtime references to GUC variables set in the Supabase project config.

-- Drop existing cron jobs that contain hardcoded JWTs
SELECT cron.unschedule('send-onboarding-day2');
SELECT cron.unschedule('send-onboarding-day7');
SELECT cron.unschedule('send-first-request-followup');

-- Recreate using current_setting() to read from app.settings GUC variables
-- (These must be configured in the Supabase dashboard under Database Settings > Custom Postgres Config)

-- Onboarding Day 2 email — runs daily at 9am UTC
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

-- Onboarding Day 7 re-engagement — runs daily at 9am UTC
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

-- First request follow-up — runs every hour (checks 20-28hr window)
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
