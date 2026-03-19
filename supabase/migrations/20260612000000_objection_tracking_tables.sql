-- Objection Tracking: categories, instances, and playbook tables
-- Part of the Training Center > Objection Tracker feature

-- ── objection_categories ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS objection_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  ai_suggested boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE objection_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read objection categories"
  ON objection_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage objection categories"
  ON objection_categories FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

-- Seed the 10 default categories
INSERT INTO objection_categories (name, description, icon) VALUES
  ('Timing', 'Prospect says they are not looking right now or asks to call back later', 'clock'),
  ('Not Interested', 'Prospect says they are happy with current advisors or not interested', 'x-circle'),
  ('Price / Fee Concern', 'Prospect raises questions or concerns about fees and pricing', 'dollar-sign'),
  ('Already In a Process', 'Prospect is already in M&A discussions or has an advisor', 'git-branch'),
  ('Gatekeeper Block', 'Prospect or gatekeeper blocks access to the decision-maker', 'shield'),
  ('No Deals Available', 'Prospect says they have nothing to sell or no deals available', 'package'),
  ('Size Mismatch', 'Prospect says the firm is too small or too big for their needs', 'minimize'),
  ('Send Info', 'Prospect asks the caller to send an email or information instead', 'mail'),
  ('Too Busy', 'Prospect says now is not a good time or they are too busy', 'alert-circle'),
  ('Other / Uncategorised', 'Objections that do not fit any existing category', 'help-circle');

-- ── objection_instances ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS objection_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid,
  caller_id uuid REFERENCES profiles(id),
  extracted_at timestamptz NOT NULL DEFAULT now(),
  objection_text text NOT NULL,
  category_id uuid NOT NULL REFERENCES objection_categories(id),
  caller_response_text text,
  overcame boolean NOT NULL DEFAULT false,
  call_outcome text CHECK (call_outcome IN ('continued', 'ended', 'meeting_booked', 'callback_scheduled')),
  handling_score integer CHECK (handling_score BETWEEN 1 AND 10),
  confidence_score decimal,
  recording_url text,
  recording_timestamp_seconds integer,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('auto_accepted', 'pending_review', 'rejected')),
  manually_tagged boolean NOT NULL DEFAULT false,
  manager_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE objection_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read objection instances"
  ON objection_instances FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage objection instances"
  ON objection_instances FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Service role can insert objection instances"
  ON objection_instances FOR INSERT TO service_role
  WITH CHECK (true);

-- Index for common queries
CREATE INDEX idx_objection_instances_category ON objection_instances(category_id);
CREATE INDEX idx_objection_instances_status ON objection_instances(status);
CREATE INDEX idx_objection_instances_caller ON objection_instances(caller_id);
CREATE INDEX idx_objection_instances_overcame ON objection_instances(overcame);

-- ── objection_playbook ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS objection_playbook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES objection_categories(id),
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
  frameworks jsonb DEFAULT '[]'::jsonb,
  mistakes_to_avoid jsonb DEFAULT '[]'::jsonb,
  data_basis_count integer NOT NULL DEFAULT 0,
  ai_confidence decimal,
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  rejection_reason text
);

ALTER TABLE objection_playbook ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read playbook entries"
  ON objection_playbook FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage playbook entries"
  ON objection_playbook FOR ALL TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Service role can manage playbook entries"
  ON objection_playbook FOR ALL TO service_role
  USING (true);

CREATE INDEX idx_objection_playbook_category ON objection_playbook(category_id);
CREATE INDEX idx_objection_playbook_status ON objection_playbook(status);
