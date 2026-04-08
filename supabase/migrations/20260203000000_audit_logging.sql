-- Migration: Add audit logging for sensitive operations
-- Tracks changes to scores, buyer data, and admin actions

-- =============================================================
-- CREATE AUDIT LOG TABLE
-- =============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who performed the action
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  is_admin BOOLEAN DEFAULT false,

  -- What was done
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'override', 'approve', 'pass', 'import', 'enrich'
  entity_type TEXT NOT NULL, -- 'listing', 'buyer', 'score', 'universe', 'profile'
  entity_id UUID,

  -- Change details
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],

  -- Context
  reason TEXT, -- For overrides, passes, etc.
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by entity
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- Index for querying by user
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);

-- Index for querying by action
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- Index for time-based queries
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- Composite index for admin dashboard queries
CREATE INDEX idx_audit_logs_admin_view ON public.audit_logs(created_at DESC, action, entity_type);

-- =============================================================
-- CREATE AUDIT LOG FUNCTION
-- =============================================================

CREATE OR REPLACE FUNCTION log_audit_event(
  p_user_id UUID,
  p_user_email TEXT,
  p_is_admin BOOLEAN,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit_id UUID;
  v_changed_fields TEXT[];
BEGIN
  -- Calculate changed fields if both old and new values provided
  IF p_old_values IS NOT NULL AND p_new_values IS NOT NULL THEN
    SELECT array_agg(key)
    INTO v_changed_fields
    FROM (
      SELECT key FROM jsonb_object_keys(p_new_values) AS key
      WHERE p_old_values->key IS DISTINCT FROM p_new_values->key
    ) changed;
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    user_email,
    is_admin,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    changed_fields,
    reason,
    request_id
  )
  VALUES (
    p_user_id,
    p_user_email,
    p_is_admin,
    p_action,
    p_entity_type,
    p_entity_id,
    p_old_values,
    p_new_values,
    v_changed_fields,
    p_reason,
    p_request_id
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

-- =============================================================
-- CREATE TRIGGERS FOR AUTOMATIC AUDIT LOGGING
-- =============================================================

-- Trigger function for score changes (especially overrides)
CREATE OR REPLACE FUNCTION audit_score_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Log score overrides specifically
  IF TG_OP = 'UPDATE' AND
     (OLD.human_override_score IS DISTINCT FROM NEW.human_override_score OR
      OLD.status IS DISTINCT FROM NEW.status) THEN

    PERFORM log_audit_event(
      auth.uid(),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true),
      CASE
        WHEN NEW.human_override_score IS NOT NULL AND OLD.human_override_score IS NULL THEN 'override'
        WHEN NEW.status = 'approved' THEN 'approve'
        WHEN NEW.status = 'passed' THEN 'pass'
        ELSE 'update'
      END,
      'score',
      NEW.id,
      jsonb_build_object(
        'composite_score', OLD.composite_score,
        'human_override_score', OLD.human_override_score,
        'status', OLD.status
      ),
      jsonb_build_object(
        'composite_score', NEW.composite_score,
        'human_override_score', NEW.human_override_score,
        'status', NEW.status
      ),
      NEW.pass_reason
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to remarketing_scores
DROP TRIGGER IF EXISTS audit_score_changes_trigger ON public.remarketing_scores;
CREATE TRIGGER audit_score_changes_trigger
  AFTER UPDATE ON public.remarketing_scores
  FOR EACH ROW
  EXECUTE FUNCTION audit_score_changes();

-- Trigger function for buyer data changes
CREATE OR REPLACE FUNCTION audit_buyer_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_sensitive_fields TEXT[] := ARRAY['thesis_summary', 'target_geographies', 'target_revenue_min', 'target_revenue_max', 'deal_breakers'];
  v_changed_sensitive BOOLEAN := false;
BEGIN
  -- Check if any sensitive fields changed
  IF TG_OP = 'UPDATE' THEN
    v_changed_sensitive := (
      OLD.thesis_summary IS DISTINCT FROM NEW.thesis_summary OR
      OLD.target_geographies IS DISTINCT FROM NEW.target_geographies OR
      OLD.target_revenue_min IS DISTINCT FROM NEW.target_revenue_min OR
      OLD.target_revenue_max IS DISTINCT FROM NEW.target_revenue_max OR
      OLD.deal_breakers IS DISTINCT FROM NEW.deal_breakers
    );
  END IF;

  -- Only log if sensitive fields changed or it's a create/delete
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' OR v_changed_sensitive THEN
    PERFORM log_audit_event(
      auth.uid(),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true),
      LOWER(TG_OP),
      'buyer',
      COALESCE(NEW.id, OLD.id),
      CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) END,
      CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) END,
      NULL
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to remarketing_buyers
DROP TRIGGER IF EXISTS audit_buyer_changes_trigger ON public.remarketing_buyers;
CREATE TRIGGER audit_buyer_changes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.remarketing_buyers
  FOR EACH ROW
  EXECUTE FUNCTION audit_buyer_changes();

-- =============================================================
-- CREATE AUDIT LOG VIEWS FOR ADMIN DASHBOARD
-- =============================================================

-- Recent activity view
CREATE OR REPLACE VIEW public.recent_audit_activity AS
SELECT
  al.id,
  al.action,
  al.entity_type,
  al.entity_id,
  al.user_email,
  al.is_admin,
  al.changed_fields,
  al.reason,
  al.created_at,
  CASE al.entity_type
    WHEN 'buyer' THEN (SELECT company_name FROM remarketing_buyers WHERE id = al.entity_id)
    WHEN 'listing' THEN (SELECT title FROM listings WHERE id = al.entity_id)
    WHEN 'score' THEN (
      SELECT b.company_name || ' → ' || l.title
      FROM remarketing_scores s
      JOIN remarketing_buyers b ON s.buyer_id = b.id
      JOIN listings l ON s.listing_id = l.id
      WHERE s.id = al.entity_id
    )
    ELSE NULL
  END AS entity_name
FROM public.audit_logs al
ORDER BY al.created_at DESC
LIMIT 100;

-- Score override history view
CREATE OR REPLACE VIEW public.score_override_history AS
SELECT
  al.id,
  al.entity_id AS score_id,
  al.user_email AS overridden_by,
  (al.old_values->>'composite_score')::NUMERIC AS original_score,
  (al.new_values->>'human_override_score')::NUMERIC AS override_score,
  al.old_values->>'status' AS old_status,
  al.new_values->>'status' AS new_status,
  al.reason,
  al.created_at,
  b.company_name AS buyer_name,
  l.title AS deal_name
FROM public.audit_logs al
LEFT JOIN public.remarketing_scores s ON al.entity_id = s.id
LEFT JOIN public.remarketing_buyers b ON s.buyer_id = b.id
LEFT JOIN public.listings l ON s.listing_id = l.id
WHERE al.entity_type = 'score'
  AND al.action IN ('override', 'approve', 'pass')
ORDER BY al.created_at DESC;

-- =============================================================
-- RLS POLICIES FOR AUDIT LOGS
-- =============================================================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "audit_logs_admin_select" ON public.audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Only the system can insert audit logs (via security definer functions)
CREATE POLICY "audit_logs_system_insert" ON public.audit_logs
  FOR INSERT
  WITH CHECK (false); -- Inserts happen via SECURITY DEFINER functions

-- =============================================================
-- GRANT PERMISSIONS
-- =============================================================

GRANT SELECT ON public.recent_audit_activity TO authenticated;
GRANT SELECT ON public.score_override_history TO authenticated;
GRANT EXECUTE ON FUNCTION log_audit_event TO authenticated;

COMMENT ON TABLE public.audit_logs IS 'Audit trail for sensitive operations - score overrides, buyer edits, etc.';
COMMENT ON VIEW public.recent_audit_activity IS 'Recent audit events for admin dashboard';
COMMENT ON VIEW public.score_override_history IS 'History of score overrides with buyer/deal context';

-- Merged from: 20260203000000_auto_enrich_trigger.sql
-- Migration: Auto-enrich deals on insert and track refresh cycle
-- Deals auto-enrich when added, refresh every 3 months

-- =============================================================
-- ADD ENRICHMENT TRACKING COLUMNS (if not exist)
-- =============================================================

-- enriched_at already exists, add enrichment schedule tracking
ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS enrichment_scheduled_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS enrichment_refresh_due_at TIMESTAMPTZ DEFAULT NULL;

-- =============================================================
-- CREATE FUNCTION TO CHECK IF ENRICHMENT IS DUE
-- =============================================================

CREATE OR REPLACE FUNCTION is_enrichment_due(listing_row public.listings)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- Never enriched - needs enrichment
  IF listing_row.enriched_at IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Check if 3 months (90 days) have passed since last enrichment
  IF listing_row.enriched_at < NOW() - INTERVAL '90 days' THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- =============================================================
-- CREATE FUNCTION TO QUEUE ENRICHMENT
-- =============================================================

CREATE OR REPLACE FUNCTION queue_listing_enrichment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only queue if has a website URL and not already scheduled
  IF (NEW.website IS NOT NULL OR NEW.internal_deal_memo_link IS NOT NULL)
     AND NEW.enrichment_scheduled_at IS NULL
     AND (NEW.enriched_at IS NULL OR NEW.enriched_at < NOW() - INTERVAL '90 days') THEN

    -- Mark as scheduled for enrichment
    NEW.enrichment_scheduled_at := NOW();
    NEW.enrichment_refresh_due_at := NOW() + INTERVAL '90 days';

    -- Insert into enrichment queue table
    INSERT INTO public.enrichment_queue (listing_id, queued_at, status)
    VALUES (NEW.id, NOW(), 'pending')
    ON CONFLICT (listing_id) DO UPDATE SET
      queued_at = NOW(),
      status = 'pending',
      attempts = 0;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================
-- CREATE ENRICHMENT QUEUE TABLE
-- =============================================================

CREATE TABLE IF NOT EXISTS public.enrichment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT enrichment_queue_listing_unique UNIQUE (listing_id)
);

CREATE INDEX idx_enrichment_queue_status ON public.enrichment_queue(status, queued_at);
CREATE INDEX idx_enrichment_queue_listing ON public.enrichment_queue(listing_id);

-- =============================================================
-- CREATE TRIGGER FOR NEW LISTINGS
-- =============================================================

DROP TRIGGER IF EXISTS auto_enrich_new_listing ON public.listings;
CREATE TRIGGER auto_enrich_new_listing
  BEFORE INSERT ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION queue_listing_enrichment();

-- Also trigger on update when website is added
DROP TRIGGER IF EXISTS auto_enrich_updated_listing ON public.listings;
CREATE TRIGGER auto_enrich_updated_listing
  BEFORE UPDATE OF website, internal_deal_memo_link ON public.listings
  FOR EACH ROW
  WHEN (OLD.website IS DISTINCT FROM NEW.website OR OLD.internal_deal_memo_link IS DISTINCT FROM NEW.internal_deal_memo_link)
  EXECUTE FUNCTION queue_listing_enrichment();

-- =============================================================
-- CREATE VIEW FOR STALE LISTINGS (need refresh)
-- =============================================================

CREATE OR REPLACE VIEW public.listings_needing_enrichment AS
SELECT
  l.id,
  l.title,
  l.internal_company_name,
  l.website,
  l.enriched_at,
  l.enrichment_refresh_due_at,
  CASE
    WHEN l.enriched_at IS NULL THEN 'never_enriched'
    WHEN l.enriched_at < NOW() - INTERVAL '90 days' THEN 'stale'
    ELSE 'current'
  END AS enrichment_status,
  eq.status AS queue_status,
  eq.attempts AS queue_attempts,
  eq.last_error
FROM public.listings l
LEFT JOIN public.enrichment_queue eq ON l.id = eq.listing_id
WHERE l.deleted_at IS NULL
  AND l.status = 'active'
  AND (l.website IS NOT NULL OR l.internal_deal_memo_link IS NOT NULL)
  AND (l.enriched_at IS NULL OR l.enriched_at < NOW() - INTERVAL '90 days');

-- =============================================================
-- FUNCTION TO PROCESS ENRICHMENT QUEUE
-- =============================================================

CREATE OR REPLACE FUNCTION process_enrichment_queue_batch(batch_size INTEGER DEFAULT 5)
RETURNS TABLE (
  processed INTEGER,
  succeeded INTEGER,
  failed INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_succeeded INTEGER := 0;
  v_failed INTEGER := 0;
  v_queue_item RECORD;
BEGIN
  -- Get pending items (oldest first, max 3 attempts)
  FOR v_queue_item IN
    SELECT eq.*, l.website, l.internal_deal_memo_link
    FROM public.enrichment_queue eq
    JOIN public.listings l ON eq.listing_id = l.id
    WHERE eq.status = 'pending' AND eq.attempts < 3
    ORDER BY eq.queued_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Mark as processing
    UPDATE public.enrichment_queue
    SET status = 'processing', started_at = NOW(), attempts = attempts + 1
    WHERE id = v_queue_item.id;

    v_processed := v_processed + 1;

    -- Note: Actual enrichment is handled by edge function called via cron
    -- This just marks items for processing

  END LOOP;

  RETURN QUERY SELECT v_processed, v_succeeded, v_failed;
END;
$$;

-- =============================================================
-- GRANT PERMISSIONS
-- =============================================================

GRANT SELECT ON public.listings_needing_enrichment TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.enrichment_queue TO authenticated;
GRANT EXECUTE ON FUNCTION is_enrichment_due TO authenticated;
GRANT EXECUTE ON FUNCTION process_enrichment_queue_batch TO authenticated;

COMMENT ON TABLE public.enrichment_queue IS 'Queue of listings pending enrichment';
COMMENT ON VIEW public.listings_needing_enrichment IS 'Listings that need initial or refresh enrichment';
COMMENT ON COLUMN public.listings.enrichment_refresh_due_at IS 'When this listing should be re-enriched (90 days after last enrichment)';

-- Merged from: 20260203000000_call_transcripts.sql
-- Call Transcripts Intelligence
-- Stores and processes call transcripts (highest priority data source: 100)
-- Extracts deal/buyer insights using 8-prompt architecture from Whispers

CREATE TABLE IF NOT EXISTS call_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES remarketing_buyers(id) ON DELETE CASCADE,
  transcript_text TEXT NOT NULL,
  call_date TIMESTAMPTZ NOT NULL,
  call_duration_minutes INTEGER,
  participants TEXT[],
  call_type TEXT CHECK (call_type IN (
    'seller_call',
    'buyer_call',
    'seller_buyer_intro',
    'management_presentation',
    'q_and_a',
    'site_visit_debrief',
    'other'
  )),
  extracted_insights JSONB,
  key_quotes TEXT[],
  ceo_detected BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN (
    'pending',
    'processing',
    'completed',
    'failed'
  )),
  processing_error TEXT,
  file_url TEXT,
  file_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_call_transcripts_listing ON call_transcripts(listing_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_buyer ON call_transcripts(buyer_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_date ON call_transcripts(call_date DESC);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_status ON call_transcripts(processing_status);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_ceo ON call_transcripts(ceo_detected) WHERE ceo_detected = true;

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_call_transcript_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_transcripts_updated_at
  BEFORE UPDATE ON call_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION update_call_transcript_timestamp();

-- Add comment explaining the table
COMMENT ON TABLE call_transcripts IS 'Stores call transcripts and extracted insights. Transcripts are highest priority data source (100) and can overwrite all other sources.';
COMMENT ON COLUMN call_transcripts.extracted_insights IS 'JSONB containing extracted insights from 8-prompt architecture: financials, services, geography, owner_goals, buyer_criteria, deal_structure, etc.';
COMMENT ON COLUMN call_transcripts.key_quotes IS 'Array of verbatim quotes from transcript that provide context for extracted data';
COMMENT ON COLUMN call_transcripts.ceo_detected IS 'True if CEO/owner was detected in transcript - triggers engagement signal (+40 points)';

-- RLS Policies
ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admin full access to call transcripts"
  ON call_transcripts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin'
           OR auth.users.raw_user_meta_data->>'role' = 'super_admin')
    )
  );

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access to call transcripts"
  ON call_transcripts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Merged from: 20260203000000_cron_materialized_views.sql
-- Migration: Set up cron job for materialized view refresh
-- Uses pg_cron extension (available in Supabase)

-- =============================================================
-- ENABLE PG_CRON EXTENSION
-- =============================================================

-- Note: pg_cron may need to be enabled via Supabase dashboard
-- Extensions > pg_cron > Enable
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres (required for cron jobs)
GRANT USAGE ON SCHEMA cron TO postgres;

-- =============================================================
-- CREATE REFRESH FUNCTION WITH ERROR HANDLING
-- =============================================================

CREATE OR REPLACE FUNCTION refresh_materialized_views_safe()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_result JSONB;
  v_errors TEXT[] := '{}';
BEGIN
  v_start_time := NOW();

  -- Refresh each view with error handling
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_deal_pipeline_summary;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'mv_deal_pipeline_summary: ' || SQLERRM);
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_score_tier_distribution;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'mv_score_tier_distribution: ' || SQLERRM);
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_buyer_activity_summary;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'mv_buyer_activity_summary: ' || SQLERRM);
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_universe_performance;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'mv_universe_performance: ' || SQLERRM);
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_geography_distribution;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'mv_geography_distribution: ' || SQLERRM);
  END;

  v_end_time := NOW();

  -- Build result
  v_result := jsonb_build_object(
    'success', array_length(v_errors, 1) IS NULL OR array_length(v_errors, 1) = 0,
    'started_at', v_start_time,
    'completed_at', v_end_time,
    'duration_ms', EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time)),
    'errors', v_errors
  );

  -- Log the refresh
  INSERT INTO public.cron_job_logs (job_name, result, created_at)
  VALUES ('refresh_materialized_views', v_result, NOW());

  RETURN v_result;
END;
$$;

-- =============================================================
-- CREATE CRON JOB LOG TABLE
-- =============================================================

CREATE TABLE IF NOT EXISTS public.cron_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying recent logs
CREATE INDEX idx_cron_job_logs_created ON public.cron_job_logs(created_at DESC);
CREATE INDEX idx_cron_job_logs_job ON public.cron_job_logs(job_name, created_at DESC);

-- Keep only last 7 days of logs (auto-cleanup)
CREATE OR REPLACE FUNCTION cleanup_old_cron_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.cron_job_logs
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;

-- =============================================================
-- SCHEDULE CRON JOBS
-- =============================================================

-- Refresh materialized views every 15 minutes
SELECT cron.schedule(
  'refresh-materialized-views',
  '*/15 * * * *', -- Every 15 minutes
  $$SELECT refresh_materialized_views_safe()$$
);

-- Cleanup old cron logs daily at 3 AM
SELECT cron.schedule(
  'cleanup-cron-logs',
  '0 3 * * *', -- Daily at 3 AM
  $$SELECT cleanup_old_cron_logs()$$
);

-- =============================================================
-- VIEW FOR MONITORING CRON JOBS
-- =============================================================

CREATE OR REPLACE VIEW public.cron_job_status AS
SELECT
  job_name,
  result->>'success' AS success,
  (result->>'duration_ms')::NUMERIC AS duration_ms,
  result->>'errors' AS errors,
  created_at
FROM public.cron_job_logs
ORDER BY created_at DESC
LIMIT 50;

-- Grant access to admins
GRANT SELECT ON public.cron_job_logs TO authenticated;
GRANT SELECT ON public.cron_job_status TO authenticated;

COMMENT ON TABLE public.cron_job_logs IS 'Log of scheduled job executions';
COMMENT ON FUNCTION refresh_materialized_views_safe() IS 'Refreshes all dashboard materialized views with error handling';

-- Merged from: 20260203000000_engagement_signals.sql
-- Engagement Signal Tracking
-- Tracks buyer interaction signals that boost match priority
-- Used to elevate engaged buyers (site visits, financial requests, NDA, etc.)

CREATE TABLE IF NOT EXISTS engagement_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES remarketing_buyers(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'site_visit',
    'financial_request',
    'ceo_involvement',
    'nda_signed',
    'ioi_submitted',
    'loi_submitted',
    'call_scheduled',
    'management_presentation',
    'data_room_access',
    'email_engagement'
  )),
  signal_value INTEGER NOT NULL DEFAULT 0,
  signal_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL CHECK (source IN (
    'manual',
    'email_tracking',
    'crm_integration',
    'system_detected'
  )),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(listing_id, buyer_id, signal_type, signal_date)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_engagement_signals_listing ON engagement_signals(listing_id);
CREATE INDEX IF NOT EXISTS idx_engagement_signals_buyer ON engagement_signals(buyer_id);
CREATE INDEX IF NOT EXISTS idx_engagement_signals_pair ON engagement_signals(listing_id, buyer_id);
CREATE INDEX IF NOT EXISTS idx_engagement_signals_date ON engagement_signals(signal_date DESC);

-- Calculate total engagement score for a listing-buyer pair
CREATE OR REPLACE FUNCTION calculate_engagement_score(
  p_listing_id UUID,
  p_buyer_id UUID
) RETURNS INTEGER AS $$
DECLARE
  total_score INTEGER := 0;
BEGIN
  SELECT COALESCE(SUM(signal_value), 0)
  INTO total_score
  FROM engagement_signals
  WHERE listing_id = p_listing_id
    AND buyer_id = p_buyer_id;

  -- Cap at 100 points per spec
  RETURN LEAST(total_score, 100);
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining the table
COMMENT ON TABLE engagement_signals IS 'Tracks buyer engagement signals (site visits, NDAs, IOIs, LOIs) to prioritize active buyers in scoring. Signals add 0-100 bonus points to match scores.';
COMMENT ON COLUMN engagement_signals.signal_value IS 'Point value for this signal type. Typical values: site_visit=20, financial_request=30, nda_signed=25, ceo_involvement=40, ioi_submitted=60, loi_submitted=100';
COMMENT ON COLUMN engagement_signals.source IS 'How this signal was captured: manual (admin entry), email_tracking (automated), crm_integration (from CRM), system_detected (auto-detected from logs)';

-- RLS Policies
ALTER TABLE engagement_signals ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admin full access to engagement signals"
  ON engagement_signals FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin'
           OR auth.users.raw_user_meta_data->>'role' = 'super_admin')
    )
  );

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access"
  ON engagement_signals FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Merged from: 20260203000000_enrichment_queue_cron.sql
-- Migration: Set up cron job for processing enrichment queue
-- Uses pg_cron + pg_net to call edge function
--
-- =============================================================
-- SETUP INSTRUCTIONS (REQUIRED):
-- =============================================================
-- After running this migration, configure the database settings:
--
-- Option 1: Via Supabase Dashboard > SQL Editor
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR-PROJECT.supabase.co';
--   ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR-SERVICE-ROLE-KEY';
--
-- Option 2: Via Supabase Dashboard > Database Settings > Vault
--   Add secrets: supabase_url and service_role_key
--
-- Then verify settings work:
--   SELECT trigger_enrichment_queue_processor();
--
-- =============================================================
-- ENABLE PG_NET EXTENSION (for HTTP calls from Postgres)
-- =============================================================

-- Note: pg_net may need to be enabled via Supabase dashboard
-- Extensions > pg_net > Enable
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =============================================================
-- CREATE CRON JOB LOGS TABLE
-- =============================================================

CREATE TABLE IF NOT EXISTS public.cron_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_job_logs_job_name ON public.cron_job_logs(job_name, created_at DESC);

-- =============================================================
-- ATOMIC CLAIM FUNCTION (Prevents Race Conditions)
-- =============================================================

-- This function atomically claims queue items for processing.
-- It updates the status to 'processing' and returns the claimed items.
-- Uses FOR UPDATE SKIP LOCKED to prevent multiple workers from claiming the same items.
CREATE OR REPLACE FUNCTION claim_enrichment_queue_items(
  batch_size INTEGER DEFAULT 5,
  max_attempts INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  listing_id UUID,
  status TEXT,
  attempts INTEGER,
  queued_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT eq.id
    FROM public.enrichment_queue eq
    WHERE eq.status = 'pending'
      AND eq.attempts < max_attempts
    ORDER BY eq.queued_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.enrichment_queue eq
  SET
    status = 'processing',
    attempts = eq.attempts + 1,
    started_at = NOW(),
    updated_at = NOW()
  FROM claimed
  WHERE eq.id = claimed.id
  RETURNING eq.id, eq.listing_id, eq.status, eq.attempts, eq.queued_at;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_enrichment_queue_items(INTEGER, INTEGER) TO service_role;
COMMENT ON FUNCTION claim_enrichment_queue_items IS 'Atomically claims enrichment queue items for processing (prevents race conditions)';

-- =============================================================
-- CREATE FUNCTION TO CALL ENRICHMENT QUEUE PROCESSOR
-- =============================================================

CREATE OR REPLACE FUNCTION trigger_enrichment_queue_processor()
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
  -- Get Supabase config from environment (set via Vault secrets or ALTER DATABASE)
  -- Run: ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR-PROJECT.supabase.co';
  -- Run: ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR-SERVICE-ROLE-KEY';
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- If not configured via settings, we can't make the call
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    v_result := jsonb_build_object(
      'success', false,
      'error', 'Supabase URL or service key not configured. Run: ALTER DATABASE postgres SET app.settings.supabase_url = ''https://YOUR-PROJECT.supabase.co''; ALTER DATABASE postgres SET app.settings.service_role_key = ''YOUR-KEY'';',
      'timestamp', NOW()
    );

    INSERT INTO public.cron_job_logs (job_name, result, created_at)
    VALUES ('process_enrichment_queue', v_result, NOW());

    RETURN v_result;
  END IF;

  -- Make async HTTP POST to edge function
  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/process-enrichment-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('batchSize', 5)
  ) INTO v_request_id;

  v_result := jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'timestamp', NOW()
  );

  -- Log the trigger
  INSERT INTO public.cron_job_logs (job_name, result, created_at)
  VALUES ('process_enrichment_queue', v_result, NOW());

  RETURN v_result;
END;
$$;

-- =============================================================
-- SCHEDULE CRON JOB FOR ENRICHMENT QUEUE
-- =============================================================

-- Process enrichment queue every 5 minutes
-- This ensures new deals get enriched quickly
SELECT cron.schedule(
  'process-enrichment-queue',
  '*/5 * * * *', -- Every 5 minutes
  $$SELECT trigger_enrichment_queue_processor()$$
);

-- =============================================================
-- ALTERNATIVE: Direct queue processing in SQL (no edge function needed)
-- This is a simpler approach that processes queue directly in Postgres
-- =============================================================

CREATE OR REPLACE FUNCTION process_enrichment_queue_direct(batch_size INTEGER DEFAULT 5)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_processed INTEGER := 0;
  v_result JSONB;
BEGIN
  -- Get pending items and mark them as processing
  -- This just marks them - actual enrichment still needs edge function
  FOR v_item IN
    UPDATE public.enrichment_queue
    SET
      status = 'processing',
      started_at = NOW(),
      attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM public.enrichment_queue
      WHERE status = 'pending' AND attempts < 3
      ORDER BY queued_at ASC
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  LOOP
    v_processed := v_processed + 1;

    -- Note: The actual enrichment is handled by the edge function
    -- This just prepares items for processing
    RAISE NOTICE 'Marked listing % for enrichment (attempt %)', v_item.listing_id, v_item.attempts;
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'items_marked', v_processed,
    'timestamp', NOW()
  );

  RETURN v_result;
END;
$$;

-- =============================================================
-- CREATE VIEW FOR MONITORING ENRICHMENT QUEUE
-- =============================================================

CREATE OR REPLACE VIEW public.enrichment_queue_status AS
SELECT
  eq.id,
  eq.listing_id,
  l.title AS listing_title,
  l.internal_company_name,
  l.website,
  eq.status,
  eq.attempts,
  eq.queued_at,
  eq.started_at,
  eq.completed_at,
  eq.last_error,
  CASE
    WHEN eq.status = 'pending' THEN 'Waiting'
    WHEN eq.status = 'processing' THEN 'In Progress'
    WHEN eq.status = 'completed' THEN 'Done'
    WHEN eq.status = 'failed' THEN 'Failed (max retries)'
    ELSE eq.status
  END AS status_display
FROM public.enrichment_queue eq
JOIN public.listings l ON eq.listing_id = l.id
ORDER BY eq.queued_at DESC;

-- Grant access
GRANT SELECT ON public.enrichment_queue_status TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_enrichment_queue_processor() TO authenticated;
GRANT EXECUTE ON FUNCTION process_enrichment_queue_direct(INTEGER) TO authenticated;

COMMENT ON FUNCTION trigger_enrichment_queue_processor() IS 'Triggers the enrichment queue processor edge function via HTTP';
COMMENT ON FUNCTION process_enrichment_queue_direct(INTEGER) IS 'Marks pending enrichment items for processing';
COMMENT ON VIEW public.enrichment_queue_status IS 'View for monitoring enrichment queue status';

-- Merged from: 20260203000000_geographic_adjacency.sql
-- Geographic Adjacency Intelligence
-- Maps state-to-state proximity for ~100-mile distance calculations
-- Used in buyer-deal geography scoring to give bonuses for adjacent states

CREATE TABLE IF NOT EXISTS geographic_adjacency (
  state_code TEXT PRIMARY KEY,
  adjacent_states TEXT[] NOT NULL,
  region TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for fast adjacency lookups
CREATE INDEX IF NOT EXISTS idx_geographic_adjacency_region ON geographic_adjacency(region);

-- Seed US state adjacency data (50 states + DC)
INSERT INTO geographic_adjacency (state_code, adjacent_states, region) VALUES
  -- Northeast
  ('ME', ARRAY['NH'], 'Northeast'),
  ('NH', ARRAY['ME', 'VT', 'MA'], 'Northeast'),
  ('VT', ARRAY['NH', 'MA', 'NY'], 'Northeast'),
  ('MA', ARRAY['NH', 'VT', 'NY', 'CT', 'RI'], 'Northeast'),
  ('RI', ARRAY['MA', 'CT'], 'Northeast'),
  ('CT', ARRAY['MA', 'RI', 'NY'], 'Northeast'),
  ('NY', ARRAY['VT', 'MA', 'CT', 'NJ', 'PA'], 'Northeast'),
  ('NJ', ARRAY['NY', 'PA', 'DE'], 'Northeast'),
  ('PA', ARRAY['NY', 'NJ', 'DE', 'MD', 'WV', 'OH'], 'Northeast'),
  ('DE', ARRAY['NJ', 'PA', 'MD'], 'Northeast'),
  ('MD', ARRAY['PA', 'DE', 'WV', 'VA'], 'Northeast'),
  ('DC', ARRAY['MD', 'VA'], 'Northeast'),

  -- Southeast
  ('VA', ARRAY['MD', 'DC', 'WV', 'KY', 'TN', 'NC'], 'Southeast'),
  ('WV', ARRAY['PA', 'MD', 'VA', 'KY', 'OH'], 'Southeast'),
  ('KY', ARRAY['WV', 'VA', 'TN', 'MO', 'IL', 'IN', 'OH'], 'Southeast'),
  ('NC', ARRAY['VA', 'TN', 'GA', 'SC'], 'Southeast'),
  ('SC', ARRAY['NC', 'GA'], 'Southeast'),
  ('GA', ARRAY['NC', 'SC', 'FL', 'AL', 'TN'], 'Southeast'),
  ('FL', ARRAY['GA', 'AL'], 'Southeast'),
  ('AL', ARRAY['FL', 'GA', 'TN', 'MS'], 'Southeast'),
  ('MS', ARRAY['AL', 'TN', 'AR', 'LA'], 'Southeast'),
  ('LA', ARRAY['MS', 'AR', 'TX'], 'Southeast'),
  ('TN', ARRAY['KY', 'VA', 'NC', 'GA', 'AL', 'MS', 'AR', 'MO'], 'Southeast'),
  ('AR', ARRAY['TN', 'MS', 'LA', 'TX', 'OK', 'MO'], 'Southeast'),

  -- Midwest
  ('OH', ARRAY['PA', 'WV', 'KY', 'IN', 'MI'], 'Midwest'),
  ('IN', ARRAY['OH', 'KY', 'IL', 'MI'], 'Midwest'),
  ('IL', ARRAY['IN', 'KY', 'MO', 'IA', 'WI'], 'Midwest'),
  ('MI', ARRAY['OH', 'IN', 'WI'], 'Midwest'),
  ('WI', ARRAY['MI', 'IL', 'IA', 'MN'], 'Midwest'),
  ('MN', ARRAY['WI', 'IA', 'SD', 'ND'], 'Midwest'),
  ('IA', ARRAY['IL', 'WI', 'MN', 'SD', 'NE', 'MO'], 'Midwest'),
  ('MO', ARRAY['IA', 'IL', 'KY', 'TN', 'AR', 'OK', 'KS', 'NE'], 'Midwest'),
  ('ND', ARRAY['MN', 'SD', 'MT'], 'Midwest'),
  ('SD', ARRAY['ND', 'MN', 'IA', 'NE', 'WY', 'MT'], 'Midwest'),
  ('NE', ARRAY['SD', 'IA', 'MO', 'KS', 'CO', 'WY'], 'Midwest'),
  ('KS', ARRAY['NE', 'MO', 'OK', 'CO'], 'Midwest'),

  -- Southwest
  ('OK', ARRAY['KS', 'MO', 'AR', 'TX', 'NM', 'CO'], 'Southwest'),
  ('TX', ARRAY['OK', 'AR', 'LA', 'NM'], 'Southwest'),
  ('NM', ARRAY['TX', 'OK', 'CO', 'AZ'], 'Southwest'),
  ('AZ', ARRAY['NM', 'UT', 'NV', 'CA'], 'Southwest'),

  -- West
  ('CO', ARRAY['NE', 'KS', 'OK', 'NM', 'UT', 'WY'], 'West'),
  ('WY', ARRAY['SD', 'NE', 'CO', 'UT', 'ID', 'MT'], 'West'),
  ('MT', ARRAY['ND', 'SD', 'WY', 'ID'], 'West'),
  ('ID', ARRAY['MT', 'WY', 'UT', 'NV', 'OR', 'WA'], 'West'),
  ('UT', ARRAY['ID', 'WY', 'CO', 'NM', 'AZ', 'NV'], 'West'),
  ('NV', ARRAY['ID', 'UT', 'AZ', 'CA', 'OR'], 'West'),

  -- Pacific
  ('WA', ARRAY['ID', 'OR'], 'Pacific'),
  ('OR', ARRAY['WA', 'ID', 'NV', 'CA'], 'Pacific'),
  ('CA', ARRAY['OR', 'NV', 'AZ'], 'Pacific'),
  ('AK', ARRAY[]::TEXT[], 'Pacific'),
  ('HI', ARRAY[]::TEXT[], 'Pacific')
ON CONFLICT (state_code) DO NOTHING;

-- Add comment explaining the table
COMMENT ON TABLE geographic_adjacency IS 'Maps US state adjacency for proximity-based geography scoring. Adjacent states are ~100 miles apart.';
COMMENT ON COLUMN geographic_adjacency.adjacent_states IS 'Array of 2-letter state codes that share a border with this state';
COMMENT ON COLUMN geographic_adjacency.region IS 'US region: Northeast, Southeast, Midwest, Southwest, West, Pacific';

-- Merged from: 20260203000000_google_review_columns.sql
-- Add Google review/rating columns and LinkedIn URL to listings table
-- Used by apify-google-reviews and apify-linkedin-scrape edge functions

-- =============================================================
-- GOOGLE REVIEW COLUMNS
-- =============================================================

ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS google_review_count INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS google_rating DECIMAL(2,1) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS google_maps_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS google_place_id TEXT DEFAULT NULL;

-- Add index for filtering by review count (used in consumer business scoring)
CREATE INDEX IF NOT EXISTS idx_listings_google_review_count
ON public.listings(google_review_count)
WHERE google_review_count IS NOT NULL;

-- Comment the columns for documentation
COMMENT ON COLUMN public.listings.google_review_count IS 'Number of Google reviews, scraped via Apify';
COMMENT ON COLUMN public.listings.google_rating IS 'Google rating (1.0-5.0), scraped via Apify';
COMMENT ON COLUMN public.listings.google_maps_url IS 'Direct URL to Google Maps listing';
COMMENT ON COLUMN public.listings.google_place_id IS 'Google Place ID for API lookups';

-- =============================================================
-- LINKEDIN URL COLUMN
-- =============================================================

ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS linkedin_url TEXT DEFAULT NULL;

-- Add index for finding listings with LinkedIn URLs
CREATE INDEX IF NOT EXISTS idx_listings_linkedin_url
ON public.listings(linkedin_url)
WHERE linkedin_url IS NOT NULL;

COMMENT ON COLUMN public.listings.linkedin_url IS 'LinkedIn company page URL, extracted from website or manually entered';

-- Merged from: 20260203000000_performance_indexes.sql
-- Migration: Add performance indexes for frequently queried columns
-- These indexes significantly improve query performance on large datasets

-- =============================================================
-- LISTINGS TABLE INDEXES
-- =============================================================

-- Index for filtering by status (most common filter)
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings(status);

-- Index for geographic state searches (used in matching and filtering)
CREATE INDEX IF NOT EXISTS idx_listings_geographic_states ON public.listings USING GIN(geographic_states);

-- Index for date-based queries (recent deals, date filters)
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON public.listings(created_at DESC);

-- Index for enrichment status checks
CREATE INDEX IF NOT EXISTS idx_listings_enriched_at ON public.listings(enriched_at) WHERE enriched_at IS NOT NULL;

-- Composite index for common admin queries (status + created_at)
CREATE INDEX IF NOT EXISTS idx_listings_status_created ON public.listings(status, created_at DESC);

-- Index for revenue/EBITDA range queries
CREATE INDEX IF NOT EXISTS idx_listings_revenue ON public.listings(revenue) WHERE revenue IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_ebitda ON public.listings(ebitda) WHERE ebitda IS NOT NULL;

-- =============================================================
-- REMARKETING_SCORES TABLE INDEXES
-- =============================================================

-- Index for composite score (most common sort/filter)
CREATE INDEX IF NOT EXISTS idx_remarketing_scores_composite ON public.remarketing_scores(composite_score DESC);

-- Index for tier-based filtering
CREATE INDEX IF NOT EXISTS idx_remarketing_scores_tier ON public.remarketing_scores(
  CASE
    WHEN composite_score >= 80 THEN 'A'
    WHEN composite_score >= 60 THEN 'B'
    WHEN composite_score >= 40 THEN 'C'
    ELSE 'D'
  END
);

-- Index for status filtering (approved, passed, pending)
CREATE INDEX IF NOT EXISTS idx_remarketing_scores_status ON public.remarketing_scores(status);

-- Composite index for buyer-listing lookups
CREATE INDEX IF NOT EXISTS idx_remarketing_scores_buyer_listing ON public.remarketing_scores(buyer_id, listing_id);

-- Index for universe-based filtering
CREATE INDEX IF NOT EXISTS idx_remarketing_scores_universe ON public.remarketing_scores(universe_id) WHERE universe_id IS NOT NULL;

-- =============================================================
-- REMARKETING_BUYERS TABLE INDEXES
-- =============================================================

-- Index for data completeness filtering
CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_completeness ON public.remarketing_buyers(data_completeness);

-- Index for archived status (most queries filter this)
CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_archived ON public.remarketing_buyers(archived);

-- Index for geographic footprint searches
CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_footprint ON public.remarketing_buyers USING GIN(geographic_footprint);

-- Index for target geographies
CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_target_geo ON public.remarketing_buyers USING GIN(target_geographies);

-- Index for buyer type filtering
CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_type ON public.remarketing_buyers(buyer_type);

-- Composite for common queries (not archived + completeness)
CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_active ON public.remarketing_buyers(archived, data_completeness)
  WHERE archived = false;

-- =============================================================
-- REMARKETING_BUYER_UNIVERSES TABLE INDEXES
-- =============================================================

-- Index for archived filter
CREATE INDEX IF NOT EXISTS idx_remarketing_universes_archived ON public.remarketing_buyer_universes(archived);

-- Index for name searches
CREATE INDEX IF NOT EXISTS idx_remarketing_universes_name ON public.remarketing_buyer_universes(name);

-- =============================================================
-- PROFILES TABLE INDEXES
-- =============================================================

-- Index for admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;

-- Index for approval status
CREATE INDEX IF NOT EXISTS idx_profiles_approval ON public.profiles(approval_status);

-- Index for buyer type filtering
CREATE INDEX IF NOT EXISTS idx_profiles_buyer_type ON public.profiles(buyer_type);

-- =============================================================
-- ANALYZE TABLES TO UPDATE STATISTICS
-- =============================================================

ANALYZE public.listings;
ANALYZE public.remarketing_scores;
ANALYZE public.remarketing_buyers;
ANALYZE public.remarketing_buyer_universes;
ANALYZE public.profiles;

COMMENT ON INDEX idx_listings_geographic_states IS 'GIN index for fast geographic_states array searches';
COMMENT ON INDEX idx_remarketing_scores_composite IS 'Index for sorting by composite score (most common operation)';
COMMENT ON INDEX idx_remarketing_buyers_footprint IS 'GIN index for geographic_footprint array searches';

-- Merged from: 20260203000000_remove_deal_motivation_score.sql
-- Migration: Remove deal_motivation_score column
-- This field is redundant since we use seller_interest_score from transcript analysis

-- Drop the deal_motivation_score column from listings table
ALTER TABLE public.listings
DROP COLUMN IF EXISTS deal_motivation_score;

-- Add comment explaining seller interest scoring
COMMENT ON COLUMN public.listings.seller_interest_score IS 'AI-analyzed seller motivation score (0-100) from notes/transcripts via analyze-seller-interest function';

-- Merged from: 20260203000000_soft_deletes_consistency.sql
-- Migration: Implement consistent soft deletes across all tables
-- Adds deleted_at column and ensures RLS policies respect soft deletes

-- =============================================================
-- ADD SOFT DELETE COLUMNS WHERE MISSING
-- =============================================================

-- Listings table
ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Remarketing scores table
ALTER TABLE public.remarketing_scores
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Remarketing buyer contacts table
ALTER TABLE public.remarketing_buyer_contacts
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Connection requests table
ALTER TABLE public.connection_requests
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- =============================================================
-- CREATE SOFT DELETE HELPER FUNCTIONS
-- =============================================================

-- Generic soft delete function
CREATE OR REPLACE FUNCTION soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Instead of deleting, set deleted_at timestamp
  NEW.deleted_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to restore soft-deleted records
CREATE OR REPLACE FUNCTION restore_soft_deleted(
  p_table_name TEXT,
  p_record_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I SET deleted_at = NULL WHERE id = $1',
    p_table_name
  ) USING p_record_id;

  RETURN FOUND;
END;
$$;

-- =============================================================
-- CREATE VIEWS THAT EXCLUDE SOFT-DELETED RECORDS
-- =============================================================

-- Active listings view (excludes soft-deleted)
CREATE OR REPLACE VIEW public.active_listings AS
SELECT * FROM public.listings
WHERE deleted_at IS NULL;

-- Active buyers view (excludes archived and soft-deleted)
CREATE OR REPLACE VIEW public.active_buyers AS
SELECT * FROM public.remarketing_buyers
WHERE archived = false
  AND (deleted_at IS NULL OR deleted_at IS NULL);

-- Active scores view
CREATE OR REPLACE VIEW public.active_scores AS
SELECT * FROM public.remarketing_scores
WHERE deleted_at IS NULL;

-- Active universes view
CREATE OR REPLACE VIEW public.active_universes AS
SELECT * FROM public.remarketing_buyer_universes
WHERE archived = false;

-- =============================================================
-- UPDATE RLS POLICIES TO RESPECT SOFT DELETES
-- =============================================================

-- Drop and recreate listings select policy
DROP POLICY IF EXISTS "listings_select_policy" ON public.listings;
CREATE POLICY "listings_select_policy" ON public.listings
  FOR SELECT
  USING (deleted_at IS NULL OR auth.jwt() ->> 'is_admin' = 'true');

-- Drop and recreate scores select policy
DROP POLICY IF EXISTS "scores_select_policy" ON public.remarketing_scores;
CREATE POLICY "scores_select_policy" ON public.remarketing_scores
  FOR SELECT
  USING (deleted_at IS NULL OR auth.jwt() ->> 'is_admin' = 'true');

-- =============================================================
-- CREATE INDEXES FOR SOFT DELETE QUERIES
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_listings_deleted ON public.listings(deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_remarketing_scores_deleted ON public.remarketing_scores(deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_remarketing_buyers_deleted ON public.remarketing_buyers(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- =============================================================
-- GRANT ACCESS TO VIEWS
-- =============================================================

GRANT SELECT ON public.active_listings TO authenticated;
GRANT SELECT ON public.active_buyers TO authenticated;
GRANT SELECT ON public.active_scores TO authenticated;
GRANT SELECT ON public.active_universes TO authenticated;

COMMENT ON VIEW public.active_listings IS 'Listings view excluding soft-deleted records';
COMMENT ON VIEW public.active_buyers IS 'Buyers view excluding archived and soft-deleted records';
COMMENT ON COLUMN public.listings.deleted_at IS 'Soft delete timestamp - NULL means active';
