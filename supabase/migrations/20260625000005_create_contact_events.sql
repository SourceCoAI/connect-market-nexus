-- ============================================================================
-- MIGRATION: Create contact_events history log and backfill from
-- enriched_contacts
-- ============================================================================
-- Part of the contact consolidation strategy (phase 4a — additive only).
--
-- Today enriched_contacts is a parallel store: every Clay/Prospeo/Blitz/
-- Serper webhook writes a row there AND a row into contacts, with no link
-- between them. This migration adds the canonical history destination:
--
--   public.contact_events — append-only log of every enrichment attempt
--                           and every mutation to a contacts row.
--
-- After this migration the structural pieces are in place. Phase 4b (the
-- behavioral cutover — rewriting the enrichment edge functions to target
-- contact_events and drop enriched_contacts) is a separate change that
-- needs a dual-write observation window and is not in scope here.
-- ============================================================================


-- ─── 1. Create contact_events ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which contact this event belongs to. NULL allowed only during backfill
  -- for enriched_contacts rows that never resolved to a canonical contact.
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,

  -- Event classification
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'enrichment',     -- third-party provider returned data
      'create',         -- canonical contacts row was created
      'update',         -- canonical contacts row was updated
      'merge',          -- two contacts rows were merged
      'unmerge',        -- a previous merge was reverted
      'soft_delete',    -- row was soft-deleted
      'restore',        -- soft-delete was reverted
      'verify_email',   -- deliverability check succeeded
      'bounce'          -- deliverability check failed
    )),

  -- Provenance
  provider TEXT,        -- 'clay_linkedin', 'prospeo', 'blitz', 'serper', 'manual', etc.
  confidence TEXT CHECK (confidence IN ('verified', 'likely', 'guessed', 'unverified')),
  source_query TEXT,    -- free-form — what was searched (for enrichment)

  -- Payload
  old_values JSONB,     -- snapshot of contacts row before this event
  new_values JSONB,     -- snapshot of contacts row after this event
  changed_fields TEXT[],

  -- Actor
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Request context (optional)
  request_id TEXT,
  ip_address INET,
  user_agent TEXT
);


-- ─── 2. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contact_events_contact_id
  ON public.contact_events(contact_id, performed_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_events_type_time
  ON public.contact_events(event_type, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_events_provider
  ON public.contact_events(provider, performed_at DESC)
  WHERE provider IS NOT NULL;

-- Cache-hit lookup: "when was the last enrichment for this contact?"
CREATE INDEX IF NOT EXISTS idx_contact_events_enrichment_cache
  ON public.contact_events(contact_id, performed_at DESC)
  WHERE event_type = 'enrichment';


-- ─── 3. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.contact_events ENABLE ROW LEVEL SECURITY;

-- Admins can read all events
DROP POLICY IF EXISTS "contact_events_admin_read" ON public.contact_events;
CREATE POLICY "contact_events_admin_read" ON public.contact_events
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Only service role writes (all writes flow through contacts_upsert RPC
-- which runs as SECURITY DEFINER).
DROP POLICY IF EXISTS "contact_events_service_write" ON public.contact_events;
CREATE POLICY "contact_events_service_write" ON public.contact_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─── 4. Backfill from enriched_contacts ────────────────────────────────────
-- Each historical enriched_contacts row becomes one contact_events row with
-- event_type = 'enrichment'. We attempt to link to a canonical contacts row
-- via email match first, then linkedin_url match. Rows that don't resolve
-- are kept with contact_id = NULL so the history survives even for contacts
-- that never made it into the canonical table.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'enriched_contacts') THEN

    INSERT INTO public.contact_events (
      contact_id,
      event_type,
      provider,
      confidence,
      source_query,
      new_values,
      performed_by,
      performed_at
    )
    SELECT
      -- Prefer email match, fall back to linkedin_url, else NULL
      COALESCE(
        (SELECT c.id FROM public.contacts c
          WHERE c.email IS NOT NULL
            AND lower(c.email) = lower(ec.email)
            AND c.deleted_at IS NULL
          LIMIT 1),
        (SELECT c.id FROM public.contacts c
          WHERE c.linkedin_url IS NOT NULL
            AND c.linkedin_url <> ''
            AND lower(c.linkedin_url) = lower(ec.linkedin_url)
            AND c.deleted_at IS NULL
          LIMIT 1)
      ),
      'enrichment',
      ec.source,
      ec.confidence,
      ec.search_query,
      jsonb_build_object(
        'full_name',    ec.full_name,
        'first_name',   ec.first_name,
        'last_name',    ec.last_name,
        'title',        ec.title,
        'email',        ec.email,
        'phone',        ec.phone,
        'linkedin_url', ec.linkedin_url,
        'company_name', ec.company_name
      ),
      ec.workspace_id,
      ec.enriched_at;

  END IF;
END $$;


-- ─── 5. Documentation ──────────────────────────────────────────────────────

COMMENT ON TABLE public.contact_events IS
  'Append-only history log for the contacts table. One row per enrichment '
  'attempt, mutation, merge, soft-delete, or verification event. Replaces '
  'the parallel enriched_contacts store as the canonical enrichment cache — '
  'use the newest enrichment event per contact to determine cache freshness. '
  'Written exclusively by contacts_upsert() and contacts_merge() RPCs.';
