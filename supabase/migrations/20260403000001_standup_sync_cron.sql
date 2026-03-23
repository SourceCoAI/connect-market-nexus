-- Migration: Cron job to poll Fireflies for <ds>-tagged standup meetings
--
-- Acts as a safety net for the process-standup-webhook function.
-- If the Fireflies webhook is misconfigured, delayed, or fails, this
-- cron job will catch any missed standup meetings within a 48-hour window.
--
-- =============================================================
-- PREREQUISITES:
-- =============================================================
-- 1. pg_cron and pg_net extensions must be enabled
-- 2. app.settings.supabase_url and app.settings.service_role_key
--    must be configured (see 20260203_enrichment_queue_cron.sql)
-- 3. FIREFLIES_API_KEY must be set in the edge function environment
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- =============================================================
-- FUNCTION: Trigger the sync-standup-meetings edge function
-- =============================================================

CREATE OR REPLACE FUNCTION trigger_standup_meeting_sync()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_request_id BIGINT;
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    v_result := jsonb_build_object(
      'success', false,
      'error', 'Supabase URL or service key not configured.',
      'timestamp', NOW()
    );

    INSERT INTO public.cron_job_logs (job_name, result, created_at)
    VALUES ('sync_standup_meetings', v_result, NOW());

    RETURN v_result;
  END IF;

  -- Call the sync-standup-meetings edge function
  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/sync-standup-meetings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('lookback_hours', 48)
  ) INTO v_request_id;

  v_result := jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'timestamp', NOW()
  );

  INSERT INTO public.cron_job_logs (job_name, result, created_at)
  VALUES ('sync_standup_meetings', v_result, NOW());

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION trigger_standup_meeting_sync() TO service_role;
COMMENT ON FUNCTION trigger_standup_meeting_sync IS 'Triggers the standup meeting sync edge function to catch any missed <ds>-tagged meetings from Fireflies';

-- =============================================================
-- SCHEDULE: Run at 12 PM ET and 5 PM ET daily
-- =============================================================
-- Two daily syncs aligned with the team's meeting schedule.
-- Times are in UTC: 16:00 = 12 PM EDT / 17:00 = 12 PM EST
--                   21:00 = 5 PM EDT  / 22:00 = 5 PM EST
-- We schedule both UTC offsets so it works year-round regardless
-- of daylight saving time.

SELECT cron.unschedule('sync-standup-meetings');

SELECT cron.schedule(
  'sync-standup-meetings',
  '0 16,17,21,22 * * *',
  $$SELECT trigger_standup_meeting_sync()$$
);
