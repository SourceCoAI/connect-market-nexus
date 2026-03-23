-- Add ai_summary column to call_scores table for caching Gemini-generated summaries.
-- If call_scores table doesn't exist yet, create it first.

-- Create call_scores table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.call_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_activity_id uuid REFERENCES public.contact_activities(id) ON DELETE SET NULL,
  rep_name text NOT NULL,
  contact_name text,
  company_name text,
  call_date timestamptz,
  call_duration_seconds integer,
  recording_url text,
  disposition text,
  composite_score numeric(4,2),
  opener_tone numeric(4,2),
  call_structure numeric(4,2),
  discovery_quality numeric(4,2),
  objection_handling numeric(4,2),
  closing_next_step numeric(4,2),
  value_proposition numeric(4,2),
  ai_summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add ai_summary column if table exists but column doesn't
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'call_scores'
    AND column_name = 'ai_summary'
  ) THEN
    ALTER TABLE public.call_scores ADD COLUMN ai_summary text;
  END IF;
END $$;

-- RLS
ALTER TABLE public.call_scores ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read call_scores
CREATE POLICY IF NOT EXISTS "Authenticated users can view call_scores"
  ON public.call_scores FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role to update (for edge function caching)
CREATE POLICY IF NOT EXISTS "Service role can update call_scores"
  ON public.call_scores FOR UPDATE
  USING (true);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_call_scores_rep_name ON public.call_scores(rep_name);
CREATE INDEX IF NOT EXISTS idx_call_scores_call_date ON public.call_scores(call_date);
CREATE INDEX IF NOT EXISTS idx_call_scores_composite ON public.call_scores(composite_score DESC);
