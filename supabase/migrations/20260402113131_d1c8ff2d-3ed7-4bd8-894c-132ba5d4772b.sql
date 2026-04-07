-- Document request tracking table
CREATE TABLE public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES public.firm_agreements(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agreement_type text NOT NULL CHECK (agreement_type IN ('nda', 'fee_agreement')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'email_sent', 'signed', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  email_sent_at timestamptz,
  signed_at timestamptz,
  signed_toggled_by uuid REFERENCES auth.users(id),
  signed_toggled_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests
CREATE POLICY "Users can view own document requests" ON public.document_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own requests  
CREATE POLICY "Users can create own document requests" ON public.document_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins can view and update all
CREATE POLICY "Admins can manage all document requests" ON public.document_requests
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

-- Index for common queries
CREATE INDEX idx_document_requests_firm_id ON public.document_requests(firm_id);
CREATE INDEX idx_document_requests_status ON public.document_requests(status);
CREATE INDEX idx_document_requests_user_id ON public.document_requests(user_id);

-- Add request tracking to firm_agreements
ALTER TABLE public.firm_agreements 
  ADD COLUMN IF NOT EXISTS nda_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS nda_requested_by uuid,
  ADD COLUMN IF NOT EXISTS fee_agreement_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_agreement_requested_by uuid;