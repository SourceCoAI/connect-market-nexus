
CREATE TABLE IF NOT EXISTS public.clay_enrichment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  request_type text NOT NULL CHECK (request_type IN ('name_domain', 'linkedin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  workspace_id uuid NOT NULL,
  first_name text,
  last_name text,
  domain text,
  linkedin_url text,
  company_name text,
  title text,
  source_function text NOT NULL,
  source_entity_id text,
  result_email text,
  result_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  raw_callback_payload jsonb
);

CREATE INDEX idx_clay_requests_status ON public.clay_enrichment_requests(status) WHERE status = 'pending';
CREATE INDEX idx_clay_requests_workspace ON public.clay_enrichment_requests(workspace_id);

ALTER TABLE public.clay_enrichment_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view their own workspace's requests
CREATE POLICY "clay_requests_select_own"
  ON public.clay_enrichment_requests
  FOR SELECT
  TO authenticated
  USING (workspace_id = auth.uid());

-- Only service role (edge functions) can insert/update/delete — no extra policy needed, service role bypasses RLS
