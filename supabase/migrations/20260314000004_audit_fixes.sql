-- Audit fixes migration
-- Addresses findings 4, 12, 15, and 34 from the audit report.

--------------------------------------------------------------------------------
-- Finding 4: Add unique constraint to prevent duplicate email sends
-- The race condition in SELECT->SEND->INSERT can cause duplicates
--------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_delivery_logs_dedup
  ON public.email_delivery_logs(email, email_type)
  WHERE status = 'sent';

--------------------------------------------------------------------------------
-- Finding 12: Recalculate denormalized columns when messages are deleted
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_conversation_on_message_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_msg RECORD;
BEGIN
  -- Find the most recent remaining message for this thread
  SELECT body, created_at, sender_role
  INTO last_msg
  FROM public.connection_messages
  WHERE connection_request_id = OLD.connection_request_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF last_msg IS NOT NULL THEN
    UPDATE connection_requests
    SET
      last_message_at = last_msg.created_at,
      last_message_preview = LEFT(last_msg.body, 100),
      last_message_sender_role = last_msg.sender_role,
      updated_at = now()
    WHERE id = OLD.connection_request_id;
  ELSE
    UPDATE connection_requests
    SET
      last_message_at = NULL,
      last_message_preview = NULL,
      last_message_sender_role = NULL,
      updated_at = now()
    WHERE id = OLD.connection_request_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_recalculate_conversation_on_message_delete ON public.connection_messages;
CREATE TRIGGER trigger_recalculate_conversation_on_message_delete
  AFTER DELETE ON public.connection_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_conversation_on_message_delete();

--------------------------------------------------------------------------------
-- Finding 15: Add buyer_type and is_pe_backed to cache invalidation trigger
-- The existing trigger misses these fields that affect scoring priority
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invalidate_buyer_recommendation_cache()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'DELETE') THEN
    -- New or removed buyers always affect scoring results
    UPDATE buyer_recommendation_cache SET expires_at = NOW();
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Only invalidate when scoring-relevant fields actually changed
    IF (
      OLD.target_services    IS DISTINCT FROM NEW.target_services OR
      OLD.target_industries  IS DISTINCT FROM NEW.target_industries OR
      OLD.industry_vertical  IS DISTINCT FROM NEW.industry_vertical OR
      OLD.target_geographies IS DISTINCT FROM NEW.target_geographies OR
      OLD.geographic_footprint IS DISTINCT FROM NEW.geographic_footprint OR
      OLD.target_ebitda_min  IS DISTINCT FROM NEW.target_ebitda_min OR
      OLD.target_ebitda_max  IS DISTINCT FROM NEW.target_ebitda_max OR
      OLD.has_fee_agreement  IS DISTINCT FROM NEW.has_fee_agreement OR
      OLD.acquisition_appetite IS DISTINCT FROM NEW.acquisition_appetite OR
      OLD.total_acquisitions IS DISTINCT FROM NEW.total_acquisitions OR
      OLD.thesis_summary     IS DISTINCT FROM NEW.thesis_summary OR
      OLD.hq_state           IS DISTINCT FROM NEW.hq_state OR
      OLD.archived           IS DISTINCT FROM NEW.archived OR
      OLD.buyer_type         IS DISTINCT FROM NEW.buyer_type OR
      OLD.is_pe_backed       IS DISTINCT FROM NEW.is_pe_backed
    ) THEN
      UPDATE buyer_recommendation_cache SET expires_at = NOW();
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- Finding 34: Drop dead tables
--------------------------------------------------------------------------------
DROP TABLE IF EXISTS public.collection_items CASCADE;
DROP TABLE IF EXISTS public.collections CASCADE;
