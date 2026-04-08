-- =============================================
-- Connection Messages — in-platform messaging
-- between admins and buyers on connection requests
-- =============================================

CREATE TABLE IF NOT EXISTS public.connection_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_request_id UUID NOT NULL REFERENCES public.connection_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('admin', 'buyer')),
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'message' CHECK (message_type IN ('message', 'decision', 'system')),
  is_read_by_buyer BOOLEAN NOT NULL DEFAULT false,
  is_read_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connection_messages_request
  ON public.connection_messages(connection_request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_connection_messages_unread_buyer
  ON public.connection_messages(connection_request_id)
  WHERE is_read_by_buyer = false AND sender_role = 'admin';

CREATE INDEX IF NOT EXISTS idx_connection_messages_unread_admin
  ON public.connection_messages(connection_request_id)
  WHERE is_read_by_admin = false AND sender_role = 'buyer';

-- RLS
ALTER TABLE public.connection_messages ENABLE ROW LEVEL SECURITY;

-- Admins can read and write all messages
DROP POLICY IF EXISTS "Admins can manage connection messages" ON public.connection_messages;
CREATE POLICY "Admins can manage connection messages"
  ON public.connection_messages FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Buyers can read messages on their own connection requests
DROP POLICY IF EXISTS "Buyers can read own request messages" ON public.connection_messages;
CREATE POLICY "Buyers can read own request messages"
  ON public.connection_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.connection_requests cr
      WHERE cr.id = connection_request_id AND cr.user_id = auth.uid()
    )
  );

-- Buyers can insert messages on their own connection requests
DROP POLICY IF EXISTS "Buyers can send messages on own requests" ON public.connection_messages;
CREATE POLICY "Buyers can send messages on own requests"
  ON public.connection_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = 'buyer'
    AND EXISTS (
      SELECT 1 FROM public.connection_requests cr
      WHERE cr.id = connection_request_id AND cr.user_id = auth.uid()
    )
  );

-- Buyers can update read status on their own messages
DROP POLICY IF EXISTS "Buyers can mark messages as read" ON public.connection_messages;
CREATE POLICY "Buyers can mark messages as read"
  ON public.connection_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.connection_requests cr
      WHERE cr.id = connection_request_id AND cr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.connection_requests cr
      WHERE cr.id = connection_request_id AND cr.user_id = auth.uid()
    )
  );

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.connection_messages;

-- Merged from: 20260222100000_data_integrity_fixes.sql
-- Data Integrity Fixes from Platform Audit
-- Addresses findings #2, #4, #8 from the data integrity audit
-- Safe migrations with pre-checks to avoid constraint violations

-- ============================================================================
-- FINDING #8: Expand normalize_domain() to catch more placeholder patterns
-- Currently only catches '<UNKNOWN>', but 'UNKNOWN', 'N/A', 'TBD', etc. slip through
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_domain(url text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN url IS NULL
      OR trim(url) = ''
      OR upper(trim(url)) IN ('<UNKNOWN>', 'UNKNOWN', 'N/A', 'TBD', 'PENDING', 'NONE', 'NULL')
    THEN NULL
    ELSE
      rtrim(
        split_part(
          split_part(
            regexp_replace(
              regexp_replace(
                lower(trim(url)),
                '^[a-z]+://', ''
              ),
              '^www\.', ''
            ),
            '/', 1
          ),
          ':', 1
        ),
        '.'
      )
  END
$$;

COMMENT ON FUNCTION normalize_domain IS
  'Normalizes URLs to comparable domain format. '
  'Returns NULL for: NULL input, empty string, or placeholder values '
  '(<UNKNOWN>, UNKNOWN, N/A, TBD, PENDING, NONE, NULL). '
  'Strips protocol, www, path, and port. Lowercases result. '
  'Used for domain-based deduplication via unique indexes.';

-- ============================================================================
-- FINDING #4: Enforce one-to-one enrichment job per listing
-- TypeScript types mark isOneToOne: true but no DB constraint enforces it.
-- Without this, duplicate enrichment jobs can queue for same listing,
-- causing duplicate API calls, resource waste, and race conditions.
-- ============================================================================

-- Step 1: Remove duplicate active jobs (keep the earliest queued one)
DELETE FROM enrichment_queue
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY listing_id
        ORDER BY queued_at ASC
      ) AS rnk
    FROM enrichment_queue
    WHERE status IN ('pending', 'processing')
  ) ranked
  WHERE rnk > 1
);

-- Step 2: Drop the old unconditional unique constraint if it exists.
-- The old constraint prevents re-queueing a listing after completion/failure.
ALTER TABLE enrichment_queue DROP CONSTRAINT IF EXISTS enrichment_queue_listing_unique;

-- Step 3: Create partial unique index on active jobs only
-- Completed/failed jobs don't occupy the slot, allowing re-queueing
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrichment_queue_single_active_job_per_listing
ON enrichment_queue (listing_id)
WHERE status IN ('pending', 'processing');

COMMENT ON INDEX idx_enrichment_queue_single_active_job_per_listing IS
  'Enforces single active enrichment job per listing. '
  'Only applies to pending/processing jobs; completed/failed jobs do not occupy slot.';

-- ============================================================================
-- FINDING #2: Add uniqueness constraint on remarketing_buyers.email_domain
-- company_website has per-universe unique index, but email_domain has nothing.
-- Multiple buyers can have identical email domains without detection.
-- ============================================================================

-- Step 1: Archive duplicate email_domain records (keep highest data_completeness)
WITH duplicates_to_archive AS (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(universe_id, '00000000-0000-0000-0000-000000000000'::uuid),
                     normalize_domain(email_domain)
        ORDER BY
          CASE data_completeness
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
          END ASC,
          created_at ASC
      ) AS rnk
    FROM remarketing_buyers
    WHERE archived = false
      AND email_domain IS NOT NULL
      AND email_domain != ''
      AND normalize_domain(email_domain) IS NOT NULL
  ) ranked
  WHERE rnk > 1
)
UPDATE remarketing_buyers
SET archived = true, updated_at = now()
WHERE id IN (SELECT id FROM duplicates_to_archive);

-- Step 2: Create per-universe unique index on normalized email_domain
CREATE UNIQUE INDEX IF NOT EXISTS idx_remarketing_buyers_unique_email_domain_per_universe
ON remarketing_buyers (
  COALESCE(universe_id, '00000000-0000-0000-0000-000000000000'::uuid),
  normalize_domain(email_domain)
)
WHERE archived = false
  AND email_domain IS NOT NULL
  AND email_domain != ''
  AND normalize_domain(email_domain) IS NOT NULL;

COMMENT ON INDEX idx_remarketing_buyers_unique_email_domain_per_universe IS
  'Enforces unique email domain per universe for non-archived buyers. '
  'Same domain allowed in different universes. Uses normalize_domain() for consistency.';
