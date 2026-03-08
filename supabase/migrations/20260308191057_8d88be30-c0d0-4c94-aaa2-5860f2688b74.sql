
-- Table to track AI buyer search (seed-buyers) jobs for progress tracking & enrichment queue
CREATE TABLE public.buyer_search_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'searching', 'scoring', 'completed', 'failed')),
  progress_pct smallint NOT NULL DEFAULT 0,
  progress_message text,
  buyers_found integer DEFAULT 0,
  buyers_inserted integer DEFAULT 0,
  buyers_updated integer DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for dashboard queries
CREATE INDEX idx_buyer_search_jobs_listing ON public.buyer_search_jobs(listing_id);
CREATE INDEX idx_buyer_search_jobs_status ON public.buyer_search_jobs(status);
CREATE INDEX idx_buyer_search_jobs_created ON public.buyer_search_jobs(created_at DESC);

-- RLS
ALTER TABLE public.buyer_search_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view buyer search jobs"
  ON public.buyer_search_jobs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert buyer search jobs"
  ON public.buyer_search_jobs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update buyer search jobs"
  ON public.buyer_search_jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Service role needs full access for edge functions
CREATE POLICY "Service role full access on buyer_search_jobs"
  ON public.buyer_search_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
