-- Phase 9: Event-Driven Architecture
-- Expands global_activity_queue into a proper event bus with emit/claim/retry semantics.
-- All statements are idempotent (IF NOT EXISTS / CREATE OR REPLACE).

-- ============================================================================
-- Standard Event Types Reference
-- ============================================================================
--
-- deal.created              — A new deal was created
-- deal.stage_changed        — Deal moved to a different pipeline stage
-- deal.enrichment_completed — Deal enrichment finished (success or partial)
-- deal.assigned             — Deal assigned to an owner/team member
--
-- buyer.approved            — Buyer was approved for the platform
-- buyer.rejected            — Buyer was rejected
-- buyer.enrichment_completed — Buyer enrichment finished
--
-- connection.requested      — A buyer-deal connection was requested
-- connection.approved       — A connection was approved
-- connection.rejected       — A connection was rejected
--
-- agreement.nda_signed      — NDA agreement was signed
-- agreement.fee_signed      — Fee agreement was signed
-- agreement.status_changed  — Agreement status changed
--
-- document.uploaded         — A document was uploaded
-- document.downloaded       — A document was downloaded
-- document.viewed           — A document was viewed
--
-- notification.email_sent   — An email notification was dispatched
-- notification.in_app_sent  — An in-app notification was created
-- ============================================================================


-- ============================================================================
-- 1. Expand global_activity_queue for proper event system
-- ============================================================================

-- event_type: structured dotted event type (e.g. 'deal.created', 'buyer.approved')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'global_activity_queue'
      AND column_name = 'event_type'
  ) THEN
    ALTER TABLE public.global_activity_queue
      ADD COLUMN event_type text NOT NULL DEFAULT 'generic';
  END IF;
END $$;

-- entity_type: the domain object category this event relates to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'global_activity_queue'
      AND column_name = 'entity_type'
  ) THEN
    ALTER TABLE public.global_activity_queue
      ADD COLUMN entity_type text;
  END IF;
END $$;

-- entity_id: the primary key of the entity this event relates to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'global_activity_queue'
      AND column_name = 'entity_id'
  ) THEN
    ALTER TABLE public.global_activity_queue
      ADD COLUMN entity_id uuid;
  END IF;
END $$;

-- actor_id: the user who triggered this event
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'global_activity_queue'
      AND column_name = 'actor_id'
  ) THEN
    ALTER TABLE public.global_activity_queue
      ADD COLUMN actor_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- processed_at: NULL means unprocessed; set when a subscriber claims the event
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'global_activity_queue'
      AND column_name = 'processed_at'
  ) THEN
    ALTER TABLE public.global_activity_queue
      ADD COLUMN processed_at timestamptz;
  END IF;
END $$;

-- processor: identifier of the subscriber/function that processed this event
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'global_activity_queue'
      AND column_name = 'processor'
  ) THEN
    ALTER TABLE public.global_activity_queue
      ADD COLUMN processor text;
  END IF;
END $$;

-- error_message: if processing failed, the error description (for retry logic)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'global_activity_queue'
      AND column_name = 'error_message'
  ) THEN
    ALTER TABLE public.global_activity_queue
      ADD COLUMN error_message text;
  END IF;
END $$;


-- ============================================================================
-- 1b. Relax CHECK constraints for event bus usage
-- ============================================================================
-- The original operation_type CHECK only allowed 5 AI operation types.
-- Now that we use this table as a general event bus, operation_type needs
-- to accept event-style values like 'deal.created', 'buyer.approved', etc.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- Find and drop the CHECK constraint on operation_type
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
  WHERE con.conrelid = 'public.global_activity_queue'::regclass
    AND con.contype = 'c'
    AND att.attname = 'operation_type';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.global_activity_queue DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;


-- ============================================================================
-- 2. Indexes for efficient polling and lookups
-- ============================================================================

-- Subscribers poll by event_type for unprocessed events
CREATE INDEX IF NOT EXISTS idx_gaq_event_type_unprocessed
  ON public.global_activity_queue (event_type)
  WHERE processed_at IS NULL;

-- Entity history lookups (e.g. "show me all events for deal X")
CREATE INDEX IF NOT EXISTS idx_gaq_entity_type_entity_id
  ON public.global_activity_queue (entity_type, entity_id);

-- Ordering unprocessed events by creation time (FIFO processing)
CREATE INDEX IF NOT EXISTS idx_gaq_created_at_unprocessed
  ON public.global_activity_queue (created_at)
  WHERE processed_at IS NULL;


-- ============================================================================
-- 3. emit_event() — publish an event to the queue
-- ============================================================================

CREATE OR REPLACE FUNCTION public.emit_event(
  p_event_type text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO public.global_activity_queue (
    event_type,
    entity_type,
    entity_id,
    actor_id,
    context_json,
    operation_type,
    status,
    classification
  ) VALUES (
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_actor_id,
    p_metadata,
    -- Map to existing required columns for backward compatibility
    COALESCE(p_event_type, 'generic'),
    'queued',
    'minor'
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.emit_event IS
  'Publishes an event to the global_activity_queue. Returns the new event UUID. '
  'Events are created with processed_at = NULL so subscribers can claim them.';


-- ============================================================================
-- 4. claim_events() — atomically claim unprocessed events for a subscriber
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_events(
  p_event_type text,
  p_processor text,
  p_batch_size integer DEFAULT 10
)
RETURNS SETOF public.global_activity_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT id
    FROM public.global_activity_queue
    WHERE event_type = p_event_type
      AND processed_at IS NULL
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.global_activity_queue AS q
  SET
    processed_at = now(),
    processor    = p_processor
  FROM claimable
  WHERE q.id = claimable.id
  RETURNING q.*;
END;
$$;

COMMENT ON FUNCTION public.claim_events IS
  'Atomically claims up to p_batch_size unprocessed events of a given type. '
  'Uses FOR UPDATE SKIP LOCKED for safe concurrent access by multiple subscribers. '
  'Returns the full rows of the claimed events.';


-- ============================================================================
-- 5. mark_event_failed() — reset an event for retry and record the error
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_event_failed(
  p_event_id uuid,
  p_error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.global_activity_queue
  SET
    processed_at  = NULL,
    processor     = NULL,
    error_message = p_error_message
  WHERE id = p_event_id;
END;
$$;

COMMENT ON FUNCTION public.mark_event_failed IS
  'Marks a previously claimed event as failed by clearing processed_at (so it '
  'becomes eligible for retry) and recording the error_message for diagnostics.';


-- ============================================================================
-- 7. RLS: service_role full access, admin read access
-- ============================================================================

-- Drop existing policies that may conflict, then recreate.
-- We use DO blocks so drops are safe if policies don't exist.

DO $$
BEGIN
  -- Remove broad authenticated-user policies that are too permissive for an event bus
  DROP POLICY IF EXISTS "Authenticated users can view activity queue"
    ON public.global_activity_queue;
  DROP POLICY IF EXISTS "Authenticated users can view global activity queue"
    ON public.global_activity_queue;
  DROP POLICY IF EXISTS "Authenticated users can insert into global activity queue"
    ON public.global_activity_queue;
  DROP POLICY IF EXISTS "Authenticated users can update global activity queue"
    ON public.global_activity_queue;
  DROP POLICY IF EXISTS "Admins can manage activity queue"
    ON public.global_activity_queue;

  -- Drop event-bus policies if re-running this migration
  DROP POLICY IF EXISTS "service_role has full access to activity queue"
    ON public.global_activity_queue;
  DROP POLICY IF EXISTS "Admins can read activity queue"
    ON public.global_activity_queue;
END $$;

-- RLS is already enabled on global_activity_queue; ensure it stays on
ALTER TABLE public.global_activity_queue ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS by default in Supabase, but an explicit policy
-- makes intent clear and covers edge cases.
CREATE POLICY "service_role has full access to activity queue"
  ON public.global_activity_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins can read events for monitoring / debugging
CREATE POLICY "Admins can read activity queue"
  ON public.global_activity_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND is_admin = true
    )
  );
