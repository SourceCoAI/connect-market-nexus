-- ============================================================================
-- MIGRATION: Extend contacts schema for unified canonical store
-- ============================================================================
-- Part of the contact consolidation strategy. Adds the fields that today
-- force enrichment/role/priority data to live in parallel tables
-- (enriched_contacts, and the already-dropped pe_firm_contacts and
-- platform_contacts). Purely additive — no data movement, no drops.
--
-- Decisions locked in for this migration (defaults from the strategy plan,
-- can be revised before any of this reaches code that reads the columns):
--
--   1. contact_firm_history join table: DEFERRED. Single firm_id stays
--      for now. When multi-firm history is needed, add the join table
--      as a separate migration — no schema change required here.
--   2. portal_user contact_type: ADDED. Extends the CHECK constraint.
--   3. Identity merges (merged_into_id) column: ADDED now, merge RPC
--      deferred to a later migration.
-- ============================================================================


-- ─── 1. New columns ────────────────────────────────────────────────────────

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS confidence TEXT
    CHECK (confidence IN ('verified', 'likely', 'guessed', 'unverified'))
    DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_enrichment_source TEXT,
  ADD COLUMN IF NOT EXISTS merged_into_id UUID
    REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS role_category TEXT,
  ADD COLUMN IF NOT EXISTS priority_level SMALLINT
    CHECK (priority_level IS NULL OR priority_level BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;


-- ─── 2. Extend contact_type CHECK to include portal_user ───────────────────
-- Existing CHECK: buyer/seller/advisor/internal. Adding portal_user for
-- the client portal tables introduced in 20260617000000.

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_contact_type_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_contact_type_check
  CHECK (contact_type IN ('buyer', 'seller', 'advisor', 'internal', 'portal_user'));


-- ─── 3. LinkedIn URL deduplication ─────────────────────────────────────────
-- Today contacts dedupes only by lower(email). A person with two emails
-- survives as two rows. Add a unique partial index on lower(linkedin_url)
-- so the identity resolver has a second fallback key.
--
-- WHERE clauses keep the index small and permit NULL / empty values to
-- coexist while still enforcing uniqueness for the real values.

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_linkedin_url_unique
  ON public.contacts(lower(linkedin_url))
  WHERE linkedin_url IS NOT NULL
    AND linkedin_url <> ''
    AND deleted_at IS NULL
    AND merged_into_id IS NULL;


-- ─── 4. Indexes for the new columns ────────────────────────────────────────

-- Identity resolution uses last_enriched_at to decide cache-hit freshness
CREATE INDEX IF NOT EXISTS idx_contacts_last_enriched_at
  ON public.contacts(last_enriched_at DESC)
  WHERE last_enriched_at IS NOT NULL;

-- Soft-delete / merge tombstone filter
CREATE INDEX IF NOT EXISTS idx_contacts_live
  ON public.contacts(contact_type)
  WHERE deleted_at IS NULL AND merged_into_id IS NULL;

-- Merge tombstone lookup (for historical FK resolution)
CREATE INDEX IF NOT EXISTS idx_contacts_merged_into_id
  ON public.contacts(merged_into_id)
  WHERE merged_into_id IS NOT NULL;

-- Role + priority for outreach queries (absorbs dropped pe_firm_contacts
-- and platform_contacts indexes)
CREATE INDEX IF NOT EXISTS idx_contacts_role_priority
  ON public.contacts(contact_type, role_category, priority_level DESC)
  WHERE deleted_at IS NULL AND merged_into_id IS NULL;


-- ─── 5. Documentation ──────────────────────────────────────────────────────

COMMENT ON COLUMN public.contacts.confidence IS
  'Enrichment confidence level for email/phone/linkedin accuracy. '
  'verified = explicit user confirmation or provider "high" confidence; '
  'likely = pattern match with 2+ corroborating sources; '
  'guessed = single-source pattern match; '
  'unverified = no enrichment attempt yet.';

COMMENT ON COLUMN public.contacts.last_enriched_at IS
  'Timestamp of the most recent enrichment provider hit against this row. '
  'Used by the enrichment cache layer (see find-contacts edge function) '
  'to decide whether to re-query third-party providers. 7-day default TTL.';

COMMENT ON COLUMN public.contacts.last_enrichment_source IS
  'Provider identifier for the most recent enrichment (e.g., "clay_linkedin", '
  '"prospeo", "blitz", "serper", "manual").';

COMMENT ON COLUMN public.contacts.merged_into_id IS
  'Tombstone pointer for duplicate contacts that were merged into a canonical '
  'row. When a user runs the merge RPC, the loser row keeps its id so existing '
  'foreign keys (deal_contacts, buyer_introductions, etc.) continue to resolve '
  'via a JOIN on merged_into_id.';

COMMENT ON COLUMN public.contacts.deleted_at IS
  'Soft-delete marker. Replaces the archived column semantically — a row with '
  'deleted_at IS NOT NULL is invisible to all read paths but retained for '
  '30 days so GDPR erasure can be reversed during a dispute window.';

COMMENT ON COLUMN public.contacts.role_category IS
  'Free-form role bucket. For PE firm contacts: partner/principal/director/vp/'
  'associate/analyst/operating_partner/other. For strategic buyers: ceo/cfo/'
  'coo/president/vp/director/manager/corp_dev/business_dev/other. Absorbs the '
  'dropped pe_firm_contacts.role_category and platform_contacts.role_category.';

COMMENT ON COLUMN public.contacts.priority_level IS
  'Outreach priority 1 (highest) through 5 (lowest). Absorbs the dropped '
  'pe_firm_contacts.priority_level and platform_contacts.priority_level.';

COMMENT ON COLUMN public.contacts.email_verified_at IS
  'Timestamp of the most recent successful deliverability check against this '
  'email address. Used by the outbound email pipeline to suppress sending to '
  'stale / bounced addresses.';
