-- =============================================================================
-- Fireflies Webhook Log + Retry
-- 1. Creates fireflies_webhook_log to track every incoming webhook
-- 2. Adds a pg_cron job to retry failed webhooks (max 3 attempts)
-- =============================================================================

-- 1. Webhook log table
CREATE TABLE IF NOT EXISTS public.fireflies_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id TEXT,
  event_type TEXT,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'success', 'failed')),
  attempt_count INT NOT NULL DEFAULT 1,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fireflies_webhook_log_status
  ON public.fireflies_webhook_log(status) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_fireflies_webhook_log_transcript
  ON public.fireflies_webhook_log(transcript_id);

ALTER TABLE public.fireflies_webhook_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_fireflies_webhook_log"
  ON public.fireflies_webhook_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('owner', 'admin', 'moderator')
    )
  );

CREATE POLICY "service_role_fireflies_webhook_log"
  ON public.fireflies_webhook_log FOR ALL
  USING (auth.role() = 'service_role');

-- 2. Retry function: re-invokes process-standup-webhook for failed entries
CREATE OR REPLACE FUNCTION retry_failed_fireflies_webhooks()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row RECORD;
  v_retried INT := 0;
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing app settings');
  END IF;

  FOR v_row IN
    SELECT id, transcript_id, payload, attempt_count
    FROM public.fireflies_webhook_log
    WHERE status = 'failed'
      AND attempt_count < 3
      AND created_at > NOW() - INTERVAL '48 hours'
    ORDER BY created_at ASC
    LIMIT 10
  LOOP
    -- Mark as processing and bump attempt count
    UPDATE public.fireflies_webhook_log
    SET status = 'processing', attempt_count = v_row.attempt_count + 1
    WHERE id = v_row.id;

    -- Re-invoke the webhook handler
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/process-standup-webhook',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_service_key,
        'Content-Type', 'application/json',
        'X-Retry-Webhook-Log-Id', v_row.id::text
      ),
      body := COALESCE(v_row.payload, jsonb_build_object('transcript_id', v_row.transcript_id))
    );

    v_retried := v_retried + 1;
  END LOOP;

  INSERT INTO public.cron_job_logs (job_name, result, created_at)
  VALUES ('retry_failed_fireflies_webhooks',
    jsonb_build_object('success', true, 'retried', v_retried, 'timestamp', NOW()),
    NOW());

  RETURN jsonb_build_object('success', true, 'retried', v_retried);
END;
$$;

GRANT EXECUTE ON FUNCTION retry_failed_fireflies_webhooks() TO service_role;

-- 3. Schedule retry every 15 minutes
SELECT cron.schedule(
  'retry-failed-fireflies-webhooks',
  '*/15 * * * *',
  $$SELECT retry_failed_fireflies_webhooks()$$
);
