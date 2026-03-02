-- Clay Enrichment Requests
-- Tracks outbound webhook requests to Clay and correlates async callbacks.
-- Used by clay-webhook-name-domain and clay-webhook-linkedin edge functions.

CREATE TABLE IF NOT EXISTS clay_enrichment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  request_type text NOT NULL CHECK (request_type IN ('name_domain', 'linkedin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),

  -- Original request data
  workspace_id uuid NOT NULL,
  first_name text,
  last_name text,
  domain text,
  linkedin_url text,
  company_name text,
  title text,

  -- Caller context
  source_function text NOT NULL,
  source_entity_id text,

  -- Result data (filled by inbound webhook)
  result_email text,
  result_data jsonb,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),

  -- Raw webhook payload for audit
  raw_callback_payload jsonb
);

CREATE INDEX idx_clay_requests_status ON clay_enrichment_requests(status) WHERE status = 'pending';
CREATE INDEX idx_clay_requests_workspace ON clay_enrichment_requests(workspace_id);

ALTER TABLE clay_enrichment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY clay_requests_select ON clay_enrichment_requests
  FOR SELECT USING (workspace_id = auth.uid());

CREATE POLICY clay_requests_service_all ON clay_enrichment_requests
  FOR ALL USING (true) WITH CHECK (true);
