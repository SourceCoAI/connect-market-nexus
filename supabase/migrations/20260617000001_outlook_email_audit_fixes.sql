-- =============================================================================
-- Outlook Email Integration — Audit Fixes
-- Addresses critical issues found during comprehensive security audit.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. FIX: Tighten INSERT policy on email_messages
--    Users can only INSERT emails for contacts/deals they're assigned to.
--    (Service role used by sync engine bypasses RLS entirely.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert their own sent emails" ON public.email_messages;

CREATE POLICY "Users can insert emails for assigned contacts"
  ON public.email_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sourceco_user_id
    AND EXISTS (
      SELECT 1 FROM public.contact_assignments ca
      WHERE ca.sourceco_user_id = auth.uid()
        AND ca.is_active = true
        AND (
          ca.contact_id = email_messages.contact_id
          OR (email_messages.deal_id IS NOT NULL AND ca.deal_id = email_messages.deal_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. FIX: Add composite unique constraint for multi-contact email dedup
--    Prevents re-sync from creating duplicate records when one email
--    matches multiple contacts (microsoft_message_id gets _contactId suffix).
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS email_messages_microsoft_message_id_key;
ALTER TABLE public.email_messages DROP CONSTRAINT IF EXISTS email_messages_microsoft_message_id_key;

-- Replace single-column unique with composite unique on message+contact
CREATE UNIQUE INDEX idx_email_messages_dedup
  ON public.email_messages(microsoft_message_id, contact_id);

-- ---------------------------------------------------------------------------
-- 3. FIX: Add BCC field to email_messages (spec compliance)
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS bcc_addresses TEXT[] DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- 4. FIX: Add initial_sync_complete flag to email_connections
--    Prevents polling from running before initial 90-day sync finishes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS initial_sync_complete BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 5. FIX: Update user_has_email_access to support deal_id parameter
--    Allows send-email function to verify access via deal assignment too.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_email_access(
  _user_id UUID,
  _contact_id UUID,
  _deal_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Admins always have access
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_admin = true) THEN
    RETURN true;
  END IF;

  -- Check contact or deal assignment
  RETURN EXISTS (
    SELECT 1 FROM public.contact_assignments
    WHERE sourceco_user_id = _user_id
      AND is_active = true
      AND (
        contact_id = _contact_id
        OR (_deal_id IS NOT NULL AND deal_id = _deal_id)
      )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. FIX: Add webhook_events queue table for reliable webhook processing
--    Webhooks are recorded before returning 202, then processed async.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outlook_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id TEXT NOT NULL,
  resource TEXT,
  change_type TEXT,
  client_state TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT max_retries CHECK (retry_count <= 5)
);

CREATE INDEX idx_webhook_events_unprocessed
  ON public.outlook_webhook_events(received_at)
  WHERE processed_at IS NULL;

-- No RLS needed — only accessed by service role in edge functions
ALTER TABLE public.outlook_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages webhook events"
  ON public.outlook_webhook_events FOR ALL
  USING (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. FIX: Create scheduled jobs for background tasks
--    Requires pg_cron extension (enabled in Supabase dashboard).
-- ---------------------------------------------------------------------------
-- NOTE: These use pg_net to call edge functions. If pg_cron/pg_net are not
-- enabled, these will fail silently. Enable in Supabase Dashboard > Database > Extensions.

DO $$
BEGIN
  -- Only create cron jobs if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Poll for new emails every 5 minutes (fallback for webhooks)
    PERFORM cron.schedule(
      'outlook-sync-emails-poll',
      '*/5 * * * *',
      $$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/outlook-sync-emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$$
    );

    -- Renew webhook subscriptions every 12 hours
    PERFORM cron.schedule(
      'outlook-renew-webhooks',
      '0 */12 * * *',
      $$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/outlook-renew-webhooks',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$$
    );

    -- Refresh OAuth tokens every 30 minutes
    PERFORM cron.schedule(
      'outlook-token-refresh',
      '*/30 * * * *',
      $$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/outlook-token-refresh',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$$
    );

    -- Process unprocessed webhook events every minute
    PERFORM cron.schedule(
      'outlook-process-webhook-queue',
      '* * * * *',
      $$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/outlook-sync-emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{"processWebhookQueue": true}'::jsonb
      )$$
    );

  ELSE
    RAISE NOTICE 'pg_cron extension not enabled — scheduled jobs not created. Enable pg_cron in Supabase Dashboard.';
  END IF;
END $$;
