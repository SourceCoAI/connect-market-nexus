-- Contact Discovery Log
-- Tracks every buyer approval → contact search orchestration so outcomes
-- are visible in the admin UI regardless of success or failure.

CREATE TABLE IF NOT EXISTS contact_discovery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_source text NOT NULL DEFAULT 'approval'
    CHECK (trigger_source IN ('approval', 'bulk_approval', 'manual', 'retry')),
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed', 'partial', 'failed', 'skipped')),

  -- Search targets
  pe_firm_name text,
  company_name text NOT NULL,
  pe_domain text,
  company_domain text,

  -- Results
  pe_contacts_found integer NOT NULL DEFAULT 0,
  company_contacts_found integer NOT NULL DEFAULT 0,
  total_saved integer NOT NULL DEFAULT 0,
  skipped_duplicates integer NOT NULL DEFAULT 0,
  existing_contacts_count integer NOT NULL DEFAULT 0,

  -- Error tracking
  error_message text,
  pe_search_error text,
  company_search_error text,

  -- Timing
  duration_ms integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_contact_discovery_log_buyer ON contact_discovery_log(buyer_id);
CREATE INDEX idx_contact_discovery_log_status ON contact_discovery_log(status);
CREATE INDEX idx_contact_discovery_log_created ON contact_discovery_log(created_at DESC);
CREATE INDEX idx_contact_discovery_log_trigger ON contact_discovery_log(triggered_by);

-- RLS
ALTER TABLE contact_discovery_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all logs
CREATE POLICY contact_discovery_log_admin_select ON contact_discovery_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Service role can insert/update (edge functions use service key)
CREATE POLICY contact_discovery_log_service_insert ON contact_discovery_log
  FOR INSERT WITH CHECK (true);

CREATE POLICY contact_discovery_log_service_update ON contact_discovery_log
  FOR UPDATE USING (true);
