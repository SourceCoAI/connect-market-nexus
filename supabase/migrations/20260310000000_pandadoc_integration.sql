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
-- DocuSeal columns are NOT dropped here — they remain for parallel deployment.
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
