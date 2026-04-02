
-- Add delivery tracking columns to document_requests
ALTER TABLE public.document_requests
  ADD COLUMN IF NOT EXISTS email_correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS email_provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS last_email_error TEXT;

-- Index for correlation lookups
CREATE INDEX IF NOT EXISTS idx_document_requests_correlation
  ON public.document_requests (email_correlation_id)
  WHERE email_correlation_id IS NOT NULL;
