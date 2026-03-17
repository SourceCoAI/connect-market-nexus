-- Call Quality Scores
-- Stores per-call quality scoring results from the 16-category M&A cold call scoring prompt.
-- Linked to contact_activities (the call) and optionally deal_transcripts.

CREATE TABLE IF NOT EXISTS call_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  contact_activity_id UUID REFERENCES contact_activities(id) ON DELETE CASCADE,
  deal_transcript_id UUID REFERENCES deal_transcripts(id) ON DELETE SET NULL,
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,

  -- Rep info (denormalized for fast aggregation)
  rep_name TEXT,
  rep_email TEXT,

  -- Category 1: Call Classification
  call_classification TEXT CHECK (call_classification IN ('Voicemail drop', 'Gatekeeper', 'Connection')),

  -- Category 2: Opener Quality (1-10)
  opener_quality_rating SMALLINT CHECK (opener_quality_rating BETWEEN 1 AND 10),
  opener_quality_justification TEXT,

  -- Category 3: Discovery Quality (1-10)
  discovery_quality_rating SMALLINT CHECK (discovery_quality_rating BETWEEN 1 AND 10),
  discovery_quality_justification TEXT,
  owner_context_surfaced TEXT,

  -- Category 4: Interest Level (1-10, scores the OWNER)
  interest_level_rating SMALLINT CHECK (interest_level_rating BETWEEN 1 AND 10),
  interest_level_justification TEXT,
  interest_type TEXT CHECK (interest_type IN ('explicit', 'implicit')),

  -- Category 5: Objection Log
  objection_log TEXT,

  -- Category 6: Objection Handling Effectiveness (1-10)
  objection_handling_rating SMALLINT CHECK (objection_handling_rating BETWEEN 1 AND 10),
  objection_handling_justification TEXT,

  -- Category 7: Objection Resolution Rate (0-100%)
  objection_resolution_rate SMALLINT CHECK (objection_resolution_rate BETWEEN 0 AND 100),

  -- Category 8: Talk-to-Listen Ratio (1-10)
  talk_listen_ratio_rating SMALLINT CHECK (talk_listen_ratio_rating BETWEEN 1 AND 10),
  talk_listen_ratio_justification TEXT,
  estimated_rep_talk_pct SMALLINT CHECK (estimated_rep_talk_pct BETWEEN 0 AND 100),

  -- Category 9: Closing / Next Step Execution (1-10)
  closing_rating SMALLINT CHECK (closing_rating BETWEEN 1 AND 10),
  closing_justification TEXT,
  next_step_agreed TEXT,

  -- Category 10: Decision Maker Confirmation (1-10)
  decision_maker_rating SMALLINT CHECK (decision_maker_rating BETWEEN 1 AND 10),
  decision_maker_justification TEXT,

  -- Category 11: Script Adherence (1-10)
  script_adherence_rating SMALLINT CHECK (script_adherence_rating BETWEEN 1 AND 10),
  script_adherence_justification TEXT,
  stages_completed TEXT[], -- e.g. {'Permission','Purpose','Discovery','Value','Close'}

  -- Category 12: Value Proposition Clarity (1-10)
  value_proposition_rating SMALLINT CHECK (value_proposition_rating BETWEEN 1 AND 10),
  value_proposition_justification TEXT,

  -- Category 13: Rapport and Tone (1-10)
  rapport_rating SMALLINT CHECK (rapport_rating BETWEEN 1 AND 10),
  rapport_justification TEXT,

  -- Category 14: Not-Interested Follow-Up Depth
  not_interested_follow_up TEXT,

  -- Category 15: Call Summary (CRM-ready)
  call_summary TEXT,

  -- Category 16: Top Coaching Point
  top_coaching_point TEXT,

  -- Computed overall quality (average of scored dimensions for Connection calls)
  overall_quality NUMERIC(3,1),

  -- Metadata
  scoring_model TEXT DEFAULT 'gemini-2.5-flash',
  scoring_prompt_version TEXT DEFAULT 'v1',
  call_duration_seconds INTEGER,
  scored_at TIMESTAMPTZ DEFAULT now(),
  scoring_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cqs_contact_activity ON call_quality_scores(contact_activity_id);
CREATE INDEX IF NOT EXISTS idx_cqs_listing ON call_quality_scores(listing_id);
CREATE INDEX IF NOT EXISTS idx_cqs_rep_name ON call_quality_scores(rep_name);
CREATE INDEX IF NOT EXISTS idx_cqs_classification ON call_quality_scores(call_classification);
CREATE INDEX IF NOT EXISTS idx_cqs_scored_at ON call_quality_scores(scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_cqs_overall ON call_quality_scores(overall_quality DESC) WHERE overall_quality IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_call_quality_scores_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_quality_scores_updated_at
  BEFORE UPDATE ON call_quality_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_call_quality_scores_timestamp();

-- RLS
ALTER TABLE call_quality_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to call quality scores"
  ON call_quality_scores FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin'
           OR auth.users.raw_user_meta_data->>'role' = 'super_admin')
    )
  );

CREATE POLICY "Service role full access to call quality scores"
  ON call_quality_scores FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Aggregation RPC: Get average scores with optional filters
CREATE OR REPLACE FUNCTION get_call_score_averages(
  p_rep_name TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  total_scored BIGINT,
  total_connections BIGINT,
  avg_overall_quality NUMERIC,
  avg_opener NUMERIC,
  avg_discovery NUMERIC,
  avg_interest_level NUMERIC,
  avg_objection_handling NUMERIC,
  avg_talk_listen NUMERIC,
  avg_closing NUMERIC,
  avg_decision_maker NUMERIC,
  avg_script_adherence NUMERIC,
  avg_value_proposition NUMERIC,
  avg_rapport NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_scored,
    COUNT(*) FILTER (WHERE cqs.call_classification = 'Connection')::BIGINT AS total_connections,
    ROUND(AVG(cqs.overall_quality), 1) AS avg_overall_quality,
    ROUND(AVG(cqs.opener_quality_rating)::NUMERIC, 1) AS avg_opener,
    ROUND(AVG(cqs.discovery_quality_rating)::NUMERIC, 1) AS avg_discovery,
    ROUND(AVG(cqs.interest_level_rating)::NUMERIC, 1) AS avg_interest_level,
    ROUND(AVG(cqs.objection_handling_rating)::NUMERIC, 1) AS avg_objection_handling,
    ROUND(AVG(cqs.talk_listen_ratio_rating)::NUMERIC, 1) AS avg_talk_listen,
    ROUND(AVG(cqs.closing_rating)::NUMERIC, 1) AS avg_closing,
    ROUND(AVG(cqs.decision_maker_rating)::NUMERIC, 1) AS avg_decision_maker,
    ROUND(AVG(cqs.script_adherence_rating)::NUMERIC, 1) AS avg_script_adherence,
    ROUND(AVG(cqs.value_proposition_rating)::NUMERIC, 1) AS avg_value_proposition,
    ROUND(AVG(cqs.rapport_rating)::NUMERIC, 1) AS avg_rapport
  FROM call_quality_scores cqs
  WHERE cqs.call_classification = 'Connection'
    AND (p_rep_name IS NULL OR cqs.rep_name = p_rep_name)
    AND (p_date_from IS NULL OR cqs.scored_at >= p_date_from)
    AND (p_date_to IS NULL OR cqs.scored_at <= p_date_to);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rep performance RPC
CREATE OR REPLACE FUNCTION get_rep_call_performance(
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  rep_name TEXT,
  total_calls BIGINT,
  avg_overall_quality NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cqs.rep_name,
    COUNT(*)::BIGINT AS total_calls,
    ROUND(AVG(cqs.overall_quality), 1) AS avg_overall_quality
  FROM call_quality_scores cqs
  WHERE cqs.call_classification = 'Connection'
    AND cqs.rep_name IS NOT NULL
    AND (p_date_from IS NULL OR cqs.scored_at >= p_date_from)
    AND (p_date_to IS NULL OR cqs.scored_at <= p_date_to)
  GROUP BY cqs.rep_name
  ORDER BY avg_overall_quality DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE call_quality_scores IS 'Per-call quality scoring results from the 16-category M&A cold call scoring prompt. Linked to contact_activities.';
