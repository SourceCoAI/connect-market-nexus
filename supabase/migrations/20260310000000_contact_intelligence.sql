-- Contact Intelligence: enriched_contacts, contact_search_cache, contact_search_log
-- Supports the find-contacts and discover-companies edge functions

-- 1. Enriched contacts table (stores Prospeo + Apify results)
CREATE TABLE IF NOT EXISTS enriched_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  full_name text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  email text,
  phone text,
  linkedin_url text NOT NULL DEFAULT '',
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('high', 'medium', 'low')),
  source text NOT NULL DEFAULT 'unknown',
  enriched_at timestamptz NOT NULL DEFAULT now(),
  search_query text,
  buyer_id uuid REFERENCES remarketing_buyers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Unique constraint for dedup
  UNIQUE(workspace_id, linkedin_url)
);

-- 2. Search cache (avoid re-scraping within 7 days)
CREATE TABLE IF NOT EXISTS contact_search_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL,
  company_name text NOT NULL,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Search log (audit trail)
CREATE TABLE IF NOT EXISTS contact_search_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  title_filter text[] DEFAULT '{}',
  results_count integer NOT NULL DEFAULT 0,
  from_cache boolean NOT NULL DEFAULT false,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_enriched_contacts_workspace ON enriched_contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_enriched_contacts_company ON enriched_contacts(company_name);
CREATE INDEX IF NOT EXISTS idx_enriched_contacts_email ON enriched_contacts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enriched_contacts_buyer ON enriched_contacts(buyer_id) WHERE buyer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_search_cache_key ON contact_search_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_contact_search_cache_created ON contact_search_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_contact_search_log_user ON contact_search_log(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_search_log_created ON contact_search_log(created_at);

-- RLS policies
ALTER TABLE enriched_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_search_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_search_log ENABLE ROW LEVEL SECURITY;

-- Enriched contacts: users can read their own
CREATE POLICY enriched_contacts_select ON enriched_contacts
  FOR SELECT USING (workspace_id = auth.uid());

-- Enriched contacts: service role can insert/update
CREATE POLICY enriched_contacts_service_insert ON enriched_contacts
  FOR INSERT WITH CHECK (true);

CREATE POLICY enriched_contacts_service_update ON enriched_contacts
  FOR UPDATE USING (true);

-- Cache: service role access
CREATE POLICY contact_search_cache_all ON contact_search_cache
  FOR ALL USING (true);

-- Log: users can read their own
CREATE POLICY contact_search_log_select ON contact_search_log
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY contact_search_log_service_insert ON contact_search_log
  FOR INSERT WITH CHECK (true);

-- Updated_at trigger for enriched_contacts
CREATE OR REPLACE FUNCTION update_enriched_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enriched_contacts_updated_at
  BEFORE UPDATE ON enriched_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_enriched_contacts_updated_at();

-- Merged from: 20260310000000_pandadoc_integration.sql
-- ============================================================================
-- PandaDoc E-Signature Integration
--
-- Adds:
--   1. PandaDoc tracking columns on firm_agreements (additive only)
--   2. pandadoc_webhook_log table for audit/legal compliance
--   3. Indexes for efficient lookups
--
-- IMPORTANT: Existing firm_agreements columns (nda_signed, fee_agreement_signed,
-- etc.) are preserved. The webhook handler sets BOTH the new PandaDoc fields
-- AND the existing booleans so all current queries keep working.
--
-- Legacy columns are NOT dropped here — they remain for parallel deployment.
-- A separate migration will drop them after PandaDoc is fully live.
-- ============================================================================

-- ─── 1. Add PandaDoc columns to firm_agreements ───

ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS nda_pandadoc_document_id TEXT;
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS nda_pandadoc_status TEXT DEFAULT 'not_sent';
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS nda_pandadoc_signed_url TEXT;
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS fee_pandadoc_document_id TEXT;
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS fee_pandadoc_status TEXT DEFAULT 'not_sent';
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS fee_pandadoc_signed_url TEXT;

-- ─── 2. Create webhook audit log ───

CREATE TABLE IF NOT EXISTS public.pandadoc_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  document_id TEXT NOT NULL,
  recipient_id TEXT,
  external_id TEXT,
  document_type TEXT,
  raw_payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  signer_email TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pandadoc_webhook_document_id
  ON public.pandadoc_webhook_log(document_id);
CREATE INDEX IF NOT EXISTS idx_pandadoc_webhook_external_id
  ON public.pandadoc_webhook_log(external_id);
CREATE INDEX IF NOT EXISTS idx_pandadoc_webhook_created_at
  ON public.pandadoc_webhook_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pandadoc_webhook_signer_email
  ON public.pandadoc_webhook_log(lower(signer_email))
  WHERE signer_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pandadoc_webhook_contact
  ON public.pandadoc_webhook_log(contact_id)
  WHERE contact_id IS NOT NULL;

COMMENT ON TABLE public.pandadoc_webhook_log IS
  'Immutable audit log for all PandaDoc webhook events. '
  'Every event (document.completed, document.viewed, document.declined) '
  'is logged here with the full raw payload for legal compliance.';

-- ─── 3. RLS ───

ALTER TABLE public.pandadoc_webhook_log ENABLE ROW LEVEL SECURITY;

-- Admin read access
DROP POLICY IF EXISTS "Admins can view pandadoc webhook logs" ON public.pandadoc_webhook_log;
CREATE POLICY "Admins can view pandadoc webhook logs"
  ON public.pandadoc_webhook_log
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Service role insert (from edge functions)
DROP POLICY IF EXISTS "Service role can insert pandadoc webhook logs" ON public.pandadoc_webhook_log;
CREATE POLICY "Service role can insert pandadoc webhook logs"
  ON public.pandadoc_webhook_log
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ─── 4. Grants ───

GRANT SELECT ON public.pandadoc_webhook_log TO authenticated;
GRANT ALL ON public.pandadoc_webhook_log TO service_role;

-- ─── 5. Unique constraint for idempotency ───

CREATE UNIQUE INDEX IF NOT EXISTS idx_pandadoc_webhook_idempotent
  ON public.pandadoc_webhook_log(document_id, event_type);

-- ============================================================================
-- Summary:
--   6 new columns on firm_agreements (all nullable/defaulted, fully additive)
--   1 new table: pandadoc_webhook_log
--   RLS: Admin read, service_role insert
--   Unique index on (document_id, event_type) for idempotency
-- ============================================================================
