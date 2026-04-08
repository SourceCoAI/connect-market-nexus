-- ═══════════════════════════════════════════════════════════════
-- Migration: add_not_a_fit_to_listings
-- Date: 2026-03-06
-- Purpose: Adds not_a_fit boolean flag and not_a_fit_reason text column
--          to the listings table so deals can be flagged without deletion.
-- Tables affected: listings
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS not_a_fit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS not_a_fit_reason text;

-- Merged from: 20260306100000_add_phoneburner_transcript_support.sql
-- Add PhoneBurner transcript support to deal_transcripts
-- Allows PhoneBurner call transcripts to be stored alongside Fireflies transcripts

-- Add phoneburner-specific fields (if not already present)
ALTER TABLE deal_transcripts
  ADD COLUMN IF NOT EXISTS phoneburner_call_id TEXT,
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS contact_activity_id UUID;

-- Index for deduplication of PhoneBurner transcripts
CREATE INDEX IF NOT EXISTS idx_deal_transcripts_phoneburner_call_id
  ON deal_transcripts(phoneburner_call_id)
  WHERE phoneburner_call_id IS NOT NULL;

-- Index for querying by source
CREATE INDEX IF NOT EXISTS idx_deal_transcripts_source
  ON deal_transcripts(source);

-- Backfill: ensure all existing Fireflies transcripts have source = 'fireflies'
UPDATE deal_transcripts
SET source = 'fireflies'
WHERE source IS NULL
  AND fireflies_transcript_id IS NOT NULL;

-- Comment for clarity
COMMENT ON COLUMN deal_transcripts.phoneburner_call_id IS 'PhoneBurner call ID for deduplication';
COMMENT ON COLUMN deal_transcripts.recording_url IS 'URL to the call recording (PhoneBurner or other source)';
COMMENT ON COLUMN deal_transcripts.contact_activity_id IS 'Link to contact_activities row for PhoneBurner calls';
COMMENT ON COLUMN deal_transcripts.source IS 'Transcript source: fireflies, phoneburner, upload, link, manual';

-- Merged from: 20260306100000_docuseal_webhook_contact_fk.sql
-- ============================================================================
-- MIGRATION: Add contact_id to docuseal_webhook_log
-- ============================================================================
-- Part of the Data Relationship Audit — closes the missing FK between
-- DocuSeal signing events and the unified contacts table.
--
-- Currently, NDA/fee agreement signing events can only be matched to a person
-- via fragile email string comparison in raw_payload JSONB. This migration
-- adds a stored contact_id FK so that 'who signed the NDA?' is a single join.
--
-- Also adds a materialized signer_email column extracted from raw_payload
-- for efficient matching and future queries.
--
-- SAFETY:
--   - ADDITIVE ONLY: Two new nullable columns + index.
--   - NO DATA LOSS: Existing rows unchanged except for backfill.
--   - ZERO DOWNTIME: All statements are safe for live production.
-- ============================================================================


-- ─── STEP 1: Add signer_email materialized from raw_payload ─────────────────
-- DocuSeal payloads store submitter email in different locations depending
-- on the event format. Extract and store for reliable matching.

ALTER TABLE public.docuseal_webhook_log
  ADD COLUMN IF NOT EXISTS signer_email TEXT;

-- Backfill signer_email from raw_payload
-- DocuSeal payload structures:
--   { data: { submitters: [{ email: "..." }] } }
--   { data: { email: "..." } }
UPDATE public.docuseal_webhook_log
SET signer_email = COALESCE(
  -- Format 1: data.submitters[0].email
  raw_payload->'data'->'submitters'->0->>'email',
  -- Format 2: data.email
  raw_payload->'data'->>'email',
  -- Format 3: submitters[0].email (no data wrapper)
  raw_payload->'submitters'->0->>'email'
)
WHERE signer_email IS NULL;

CREATE INDEX IF NOT EXISTS idx_docuseal_webhook_signer_email
  ON public.docuseal_webhook_log(lower(signer_email))
  WHERE signer_email IS NOT NULL;


-- ─── STEP 2: Add contact_id FK ──────────────────────────────────────────────

ALTER TABLE public.docuseal_webhook_log
  ADD COLUMN IF NOT EXISTS contact_id
    UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_docuseal_webhook_contact
  ON public.docuseal_webhook_log(contact_id)
  WHERE contact_id IS NOT NULL;


-- ─── STEP 3: Backfill contact_id by email match ─────────────────────────────

UPDATE public.docuseal_webhook_log dw
SET contact_id = c.id
FROM public.contacts c
WHERE dw.contact_id IS NULL
  AND dw.signer_email IS NOT NULL
  AND lower(dw.signer_email) = lower(c.email)
  AND c.archived = false;


-- ============================================================================
-- Summary:
--   1 new column: signer_email (TEXT, extracted from raw_payload)
--   1 new column: contact_id (UUID FK → contacts)
--   2 indexes: signer_email for lookups, contact_id for joins
--   Backfill: email extracted from JSONB, then matched to contacts
-- ============================================================================
