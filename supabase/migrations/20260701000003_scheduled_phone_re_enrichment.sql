-- ============================================================================
-- MIGRATION: Scheduled phone re-enrichment via pg_cron
-- ============================================================================
-- Creates a stored procedure that re-queues contacts missing mobile_phone_1
-- for phone enrichment. Enrichment providers add data over time, so contacts
-- that had no phone last month may have one now.
--
-- The procedure inserts Clay enrichment requests for contacts that:
--   1. Have a linkedin_url (required for Clay phone lookup)
--   2. Are missing mobile_phone_1
--   3. Haven't been enriched in the last 30 days
--   4. Are not deleted or merged
--
-- Intended to be called by pg_cron daily or weekly.
-- If pg_cron is not available, this can be called manually or via an
-- admin endpoint.
-- ============================================================================

-- 1. Create the re-enrichment procedure
CREATE OR REPLACE FUNCTION public.queue_phone_re_enrichment(
  p_batch_size INT DEFAULT 50,
  p_min_days_since_enrichment INT DEFAULT 30
)
RETURNS TABLE(contacts_queued INT, contacts_skipped INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_queued INT := 0;
  v_skipped INT := 0;
  v_contact RECORD;
BEGIN
  FOR v_contact IN
    SELECT c.id, c.first_name, c.last_name, c.linkedin_url, c.title
    FROM public.contacts c
    WHERE c.mobile_phone_1 IS NULL
      AND c.linkedin_url IS NOT NULL
      AND c.linkedin_url <> ''
      AND c.deleted_at IS NULL
      AND c.merged_into_id IS NULL
      AND c.archived = false
      AND (
        c.last_enriched_at IS NULL
        OR c.last_enriched_at < now() - (p_min_days_since_enrichment || ' days')::INTERVAL
      )
    ORDER BY c.created_at DESC
    LIMIT p_batch_size
  LOOP
    -- Check if there's already a pending Clay request for this contact
    IF EXISTS (
      SELECT 1 FROM public.clay_enrichment_requests
      WHERE linkedin_url = v_contact.linkedin_url
        AND status = 'pending'
        AND created_at > now() - INTERVAL '7 days'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Insert a Clay enrichment request for phone lookup
    INSERT INTO public.clay_enrichment_requests (
      request_id,
      linkedin_url,
      first_name,
      last_name,
      title,
      status,
      source_function,
      source_entity_id,
      created_at
    ) VALUES (
      gen_random_uuid()::TEXT,
      v_contact.linkedin_url,
      v_contact.first_name,
      v_contact.last_name,
      v_contact.title,
      'pending',
      'scheduled_re_enrichment',
      v_contact.id::TEXT,
      now()
    );

    v_queued := v_queued + 1;
  END LOOP;

  RETURN QUERY SELECT v_queued, v_skipped;
END;
$$;

COMMENT ON FUNCTION public.queue_phone_re_enrichment(INT, INT) IS
  'Queues contacts missing mobile_phone_1 for Clay phone re-enrichment. '
  'Skips recently-enriched contacts and those with pending requests. '
  'Call via pg_cron or manually for batch phone recovery.';

-- Grant to service_role for cron/admin execution
GRANT EXECUTE ON FUNCTION public.queue_phone_re_enrichment(INT, INT)
  TO service_role;

-- 2. Schedule with pg_cron if available (runs daily at 3 AM UTC)
-- NOTE: pg_cron must be enabled on the Supabase project. If not available,
-- this SELECT will fail silently and the function can be called manually.
DO $$
BEGIN
  -- Only attempt to schedule if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'phone-re-enrichment-daily',
      '0 3 * * *',  -- daily at 3:00 AM UTC
      $$SELECT * FROM public.queue_phone_re_enrichment(50, 30)$$
    );
    RAISE NOTICE 'pg_cron job scheduled: phone-re-enrichment-daily';
  ELSE
    RAISE NOTICE 'pg_cron not available — queue_phone_re_enrichment must be called manually';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule pg_cron job: %. The function is still available for manual use.', SQLERRM;
END;
$$;
