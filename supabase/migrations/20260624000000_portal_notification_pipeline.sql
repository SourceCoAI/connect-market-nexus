-- =============================================================================
-- Migration: Portal Notification Pipeline
-- Date: 2026-06-24
-- Description: Wires up the portal notification delivery pipeline.
--   1. Trigger queues notifications when admins send messages in deal chat
--   2. Cron jobs invoke portal-notification-processor (instant + digest modes)
--   3. Cron job invokes portal-auto-reminder daily
--
-- The actual email delivery is performed by the portal-notification-processor
-- edge function which is invoked by the scheduled cron jobs.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Trigger: queue notification when admin sends a message in deal chat
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.queue_portal_message_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deal_headline text;
  v_user record;
BEGIN
  IF NEW.sender_type != 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT (deal_snapshot->>'headline')::text INTO v_deal_headline
  FROM portal_deal_pushes
  WHERE id = NEW.push_id;

  FOR v_user IN
    SELECT id, email, name
    FROM portal_users
    WHERE portal_org_id = NEW.portal_org_id
      AND is_active = true
      AND email IS NOT NULL
  LOOP
    INSERT INTO portal_notifications (
      portal_user_id,
      portal_org_id,
      push_id,
      type,
      channel,
      subject,
      body,
      sent_at
    ) VALUES (
      v_user.id,
      NEW.portal_org_id,
      NEW.push_id,
      'message',
      'email',
      'New message about ' || COALESCE(v_deal_headline, 'a deal'),
      COALESCE(NEW.sender_name, 'Your advisor') || ' sent you a message: ' || LEFT(NEW.message, 200),
      NULL
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_portal_message_notification ON portal_deal_messages;
CREATE TRIGGER trg_queue_portal_message_notification
  AFTER INSERT ON portal_deal_messages
  FOR EACH ROW
  EXECUTE FUNCTION queue_portal_message_notification();

-- ----------------------------------------------------------------------------
-- 2. Cron jobs
-- ----------------------------------------------------------------------------
-- Note: pg_cron jobs are scheduled directly via SQL. The schedule and command
-- are recorded here so the migration is auditable, but pg_cron stores them in
-- cron.job. Re-running this migration will fail if the jobs already exist;
-- use cron.unschedule() to remove them first if needed.

DO $$
BEGIN
  -- Skip if cron extension not available (e.g. local dev)
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed, skipping cron schedule';
    RETURN;
  END IF;

  -- Remove existing jobs if present (idempotent)
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'portal-notification-processor-instant',
    'portal-notification-processor-daily-digest',
    'portal-notification-processor-weekly-digest',
    'portal-auto-reminder-daily'
  );

  -- Process instant notifications every minute
  PERFORM cron.schedule(
    'portal-notification-processor-instant',
    '* * * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/portal-notification-processor',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2MTcxMTMsImV4cCI6MjA2MjE5MzExM30.M653TuQcthJx8vZW4jPkUTdB67D_Dm48ItLcu_XBh2g"}'::jsonb,
      body := '{"mode": "instant"}'::jsonb
    );
    $cmd$
  );

  -- Daily digest at 9am UTC
  PERFORM cron.schedule(
    'portal-notification-processor-daily-digest',
    '0 9 * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/portal-notification-processor',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2MTcxMTMsImV4cCI6MjA2MjE5MzExM30.M653TuQcthJx8vZW4jPkUTdB67D_Dm48ItLcu_XBh2g"}'::jsonb,
      body := '{"mode": "daily_digest"}'::jsonb
    );
    $cmd$
  );

  -- Weekly digest Mondays at 9am UTC
  PERFORM cron.schedule(
    'portal-notification-processor-weekly-digest',
    '0 9 * * 1',
    $cmd$
    SELECT net.http_post(
      url := 'https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/portal-notification-processor',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2MTcxMTMsImV4cCI6MjA2MjE5MzExM30.M653TuQcthJx8vZW4jPkUTdB67D_Dm48ItLcu_XBh2g"}'::jsonb,
      body := '{"mode": "weekly_digest"}'::jsonb
    );
    $cmd$
  );

  -- Daily auto-reminder check at 9am UTC
  PERFORM cron.schedule(
    'portal-auto-reminder-daily',
    '0 9 * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/portal-auto-reminder',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2MTcxMTMsImV4cCI6MjA2MjE5MzExM30.M653TuQcthJx8vZW4jPkUTdB67D_Dm48ItLcu_XBh2g"}'::jsonb,
      body := '{"source": "cron"}'::jsonb
    );
    $cmd$
  );
END $$;
