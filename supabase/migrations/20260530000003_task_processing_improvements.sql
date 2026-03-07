-- =============================================================================
-- Task Processing Improvements
-- 1. task_processing_metrics: tracks per-meeting extraction stats
-- 2. Dead-letter enhancement: permanent failure tracking on webhook log
-- 3. Delayed processing support for partial transcripts
-- 4. Rate limiting tracking table
-- =============================================================================

-- 1. Task Processing Metrics table
CREATE TABLE IF NOT EXISTS public.task_processing_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES standup_meetings(id) ON DELETE CASCADE,
  webhook_log_id UUID REFERENCES fireflies_webhook_log(id) ON DELETE SET NULL,
  correlation_id TEXT NOT NULL,
  fireflies_transcript_id TEXT,
  tasks_extracted INT NOT NULL DEFAULT 0,
  tasks_deduplicated INT NOT NULL DEFAULT 0,
  tasks_unassigned INT NOT NULL DEFAULT 0,
  tasks_needing_review INT NOT NULL DEFAULT 0,
  contacts_matched INT NOT NULL DEFAULT 0,
  low_confidence_count INT NOT NULL DEFAULT 0,
  processing_duration_ms INT,
  extraction_mode TEXT CHECK (extraction_mode IN ('ai', 'fireflies-native', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_processing_metrics_meeting
  ON public.task_processing_metrics(meeting_id);
CREATE INDEX IF NOT EXISTS idx_task_processing_metrics_correlation
  ON public.task_processing_metrics(correlation_id);
CREATE INDEX IF NOT EXISTS idx_task_processing_metrics_created
  ON public.task_processing_metrics(created_at);

ALTER TABLE public.task_processing_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_task_processing_metrics"
  ON public.task_processing_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('owner', 'admin', 'moderator')
    )
  );

CREATE POLICY "service_role_task_processing_metrics"
  ON public.task_processing_metrics FOR ALL
  USING (auth.role() = 'service_role');

-- 2. Dead-letter enhancement: add columns to webhook log for permanent failure tracking
ALTER TABLE public.fireflies_webhook_log
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

-- Mark webhooks as dead-lettered when they exceed max retries
CREATE OR REPLACE FUNCTION mark_dead_letter_webhooks()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE public.fireflies_webhook_log
  SET status = 'dead_letter',
      dead_lettered_at = NOW()
  WHERE status = 'failed'
    AND attempt_count >= 3
    AND dead_lettered_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Update status check to include dead_letter
ALTER TABLE public.fireflies_webhook_log
  DROP CONSTRAINT IF EXISTS fireflies_webhook_log_status_check;
ALTER TABLE public.fireflies_webhook_log
  ADD CONSTRAINT fireflies_webhook_log_status_check
  CHECK (status IN ('received', 'processing', 'success', 'failed', 'dead_letter', 'delayed'));

-- 3. Delayed processing support
ALTER TABLE public.fireflies_webhook_log
  ADD COLUMN IF NOT EXISTS process_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delay_reason TEXT;

-- Update retry function to also process delayed webhooks
CREATE OR REPLACE FUNCTION retry_failed_fireflies_webhooks()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row RECORD;
  v_retried INT := 0;
  v_delayed INT := 0;
  v_dead_lettered INT := 0;
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing app settings');
  END IF;

  -- Mark permanent failures as dead-lettered
  SELECT mark_dead_letter_webhooks() INTO v_dead_lettered;

  -- Retry failed webhooks (under max attempts)
  FOR v_row IN
    SELECT id, transcript_id, payload, attempt_count, correlation_id
    FROM public.fireflies_webhook_log
    WHERE status = 'failed'
      AND attempt_count < 3
      AND created_at > NOW() - INTERVAL '48 hours'
    ORDER BY created_at ASC
    LIMIT 10
  LOOP
    UPDATE public.fireflies_webhook_log
    SET status = 'processing', attempt_count = v_row.attempt_count + 1
    WHERE id = v_row.id;

    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/process-standup-webhook',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_service_key,
        'Content-Type', 'application/json',
        'X-Retry-Webhook-Log-Id', v_row.id::text,
        'X-Correlation-Id', COALESCE(v_row.correlation_id, v_row.id::text)
      ),
      body := COALESCE(v_row.payload, jsonb_build_object('transcript_id', v_row.transcript_id))
    );

    v_retried := v_retried + 1;
  END LOOP;

  -- Process delayed webhooks whose time has come
  FOR v_row IN
    SELECT id, transcript_id, payload, correlation_id
    FROM public.fireflies_webhook_log
    WHERE status = 'delayed'
      AND process_after IS NOT NULL
      AND process_after <= NOW()
    ORDER BY process_after ASC
    LIMIT 10
  LOOP
    UPDATE public.fireflies_webhook_log
    SET status = 'processing'
    WHERE id = v_row.id;

    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/process-standup-webhook',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_service_key,
        'Content-Type', 'application/json',
        'X-Retry-Webhook-Log-Id', v_row.id::text,
        'X-Correlation-Id', COALESCE(v_row.correlation_id, v_row.id::text)
      ),
      body := COALESCE(v_row.payload, jsonb_build_object('transcript_id', v_row.transcript_id))
    );

    v_delayed := v_delayed + 1;
  END LOOP;

  INSERT INTO public.cron_job_logs (job_name, result, created_at)
  VALUES ('retry_failed_fireflies_webhooks',
    jsonb_build_object(
      'success', true,
      'retried', v_retried,
      'delayed_processed', v_delayed,
      'dead_lettered', v_dead_lettered,
      'timestamp', NOW()
    ),
    NOW());

  RETURN jsonb_build_object(
    'success', true,
    'retried', v_retried,
    'delayed_processed', v_delayed,
    'dead_lettered', v_dead_lettered
  );
END;
$$;

GRANT EXECUTE ON FUNCTION mark_dead_letter_webhooks() TO service_role;

-- 4. Rate limiting: track webhook requests per IP/transcript
CREATE TABLE IF NOT EXISTS public.webhook_rate_limit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ip TEXT NOT NULL,
  transcript_id TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_rate_limit_source_time
  ON public.webhook_rate_limit(source_ip, requested_at);

ALTER TABLE public.webhook_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_webhook_rate_limit"
  ON public.webhook_rate_limit FOR ALL
  USING (auth.role() = 'service_role');

-- Cleanup old rate limit entries (keep 24h)
CREATE OR REPLACE FUNCTION cleanup_webhook_rate_limit()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected INT;
BEGIN
  DELETE FROM public.webhook_rate_limit
  WHERE requested_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Schedule cleanup hourly
SELECT cron.schedule(
  'cleanup-webhook-rate-limit',
  '0 * * * *',
  $$SELECT cleanup_webhook_rate_limit()$$
);
