
-- Add recipient tracking columns to document_requests
ALTER TABLE public.document_requests 
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS requested_by_admin_id uuid REFERENCES auth.users(id);

-- Add index for faster pending request lookups
CREATE INDEX IF NOT EXISTS idx_document_requests_status ON public.document_requests (status, requested_at DESC);
