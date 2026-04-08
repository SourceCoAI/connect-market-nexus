-- Rate limit coordination table
-- Tracks per-provider rate limit state so edge functions can coordinate
CREATE TABLE IF NOT EXISTS enrichment_rate_limits (
  provider TEXT PRIMARY KEY,  -- 'anthropic', 'gemini', 'openai', 'firecrawl', 'apify'
  concurrent_requests INTEGER DEFAULT 0,
  backoff_until TIMESTAMPTZ DEFAULT NULL,
  last_429_at TIMESTAMPTZ DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial rows for each provider
INSERT INTO enrichment_rate_limits (provider) VALUES
  ('anthropic'),
  ('gemini'),
  ('openai'),
  ('firecrawl'),
  ('apify')
ON CONFLICT (provider) DO NOTHING;

-- Atomic increment for concurrent request tracking
CREATE OR REPLACE FUNCTION increment_provider_concurrent(p_provider TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO enrichment_rate_limits (provider, concurrent_requests, updated_at)
  VALUES (p_provider, 1, now())
  ON CONFLICT (provider) DO UPDATE
  SET concurrent_requests = enrichment_rate_limits.concurrent_requests + 1,
      updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- Atomic decrement for concurrent request tracking
CREATE OR REPLACE FUNCTION decrement_provider_concurrent(p_provider TEXT)
RETURNS void AS $$
BEGIN
  UPDATE enrichment_rate_limits
  SET concurrent_requests = GREATEST(0, concurrent_requests - 1),
      updated_at = now()
  WHERE provider = p_provider;
END;
$$ LANGUAGE plpgsql;

-- Auto-reset stale concurrent counts (if a function dies without decrementing)
-- Any concurrent_requests > 0 that haven't been updated in 5 minutes are stale
CREATE OR REPLACE FUNCTION reset_stale_concurrent_counts()
RETURNS void AS $$
BEGIN
  UPDATE enrichment_rate_limits
  SET concurrent_requests = 0, updated_at = now()
  WHERE concurrent_requests > 0
    AND updated_at < now() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Cost tracking table
CREATE TABLE IF NOT EXISTS enrichment_cost_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  estimated_cost_usd NUMERIC(10,6) DEFAULT 0,
  duration_ms INTEGER DEFAULT NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying cost by time period and provider
CREATE INDEX IF NOT EXISTS idx_cost_log_created_at ON enrichment_cost_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_log_provider ON enrichment_cost_log (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_log_function ON enrichment_cost_log (function_name, created_at DESC);

-- Enable RLS (service role bypasses, no user access needed)
ALTER TABLE enrichment_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichment_cost_log ENABLE ROW LEVEL SECURITY;

-- SECURITY: Only admins can read/write these tables via client.
-- Service role bypasses RLS automatically for edge functions.
CREATE POLICY "Admins manage rate limits" ON enrichment_rate_limits FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins manage cost log" ON enrichment_cost_log FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Merged from: 20260210000000_global_activity_queue.sql
-- Global Activity Queue: Unified AI operations manager
-- Coordinates concurrency across deal enrichment, buyer enrichment, guide generation, and scoring

CREATE TABLE public.global_activity_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL
    CHECK (operation_type IN (
      'deal_enrichment', 'buyer_enrichment', 'guide_generation',
      'buyer_scoring', 'criteria_extraction')),
  classification TEXT NOT NULL DEFAULT 'major'
    CHECK (classification IN ('major', 'minor')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  context_json JSONB DEFAULT '{}',
  error_log JSONB DEFAULT '[]',
  started_by UUID REFERENCES public.profiles(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  queued_at TIMESTAMPTZ DEFAULT now(),
  queue_position INTEGER,
  -- Description shown in UI (e.g. "Enriching 50 deals from Universe X")
  description TEXT
);

-- Fast lookup for active/queued operations
CREATE INDEX idx_gaq_status ON public.global_activity_queue(status);
CREATE INDEX idx_gaq_classification_status
  ON public.global_activity_queue(classification, status);
-- For history page ordering
CREATE INDEX idx_gaq_completed_at ON public.global_activity_queue(completed_at DESC)
  WHERE completed_at IS NOT NULL;
-- For queue ordering
CREATE INDEX idx_gaq_queued_at ON public.global_activity_queue(queued_at ASC)
  WHERE status = 'queued';

ALTER TABLE public.global_activity_queue ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (for status bar visibility)
CREATE POLICY "Authenticated users can view activity queue"
  ON public.global_activity_queue FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can insert/update/delete
CREATE POLICY "Admins can manage activity queue"
  ON public.global_activity_queue FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true));

-- Enable realtime for live status bar updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.global_activity_queue;

COMMENT ON TABLE public.global_activity_queue IS
  'Central orchestration table for all AI operations. Enforces one major operation at a time.';

-- Merged from: 20260210000000_referral_partner_tracker.sql
-- Referral Partner Tracker: complete schema migration
-- Ensures referral_partners base table exists, adds share credentials,
-- creates referral_submissions table, and enables RLS policies.

-- 1. Ensure referral_partners base table exists
CREATE TABLE IF NOT EXISTS public.referral_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  deal_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add sharing columns to referral_partners
ALTER TABLE public.referral_partners
  ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE public.referral_partners
  ADD COLUMN IF NOT EXISTS share_password_hash TEXT;
ALTER TABLE public.referral_partners
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

-- Index on share_token for fast public tracker lookups
CREATE INDEX IF NOT EXISTS idx_referral_partners_share_token
  ON public.referral_partners (share_token);

-- 3. Ensure listings FK to referral_partners exists
DO $$ BEGIN
  ALTER TABLE public.listings
    ADD COLUMN IF NOT EXISTS referral_partner_id UUID
    REFERENCES public.referral_partners(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_listings_referral_partner_id
  ON public.listings (referral_partner_id);

-- 4. Create referral_submissions table
CREATE TABLE IF NOT EXISTS public.referral_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_partner_id UUID NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  revenue NUMERIC,
  ebitda NUMERIC,
  location TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast partner lookups
CREATE INDEX IF NOT EXISTS idx_referral_submissions_partner
  ON public.referral_submissions (referral_partner_id);

-- Partial index for pending submissions queue
CREATE INDEX IF NOT EXISTS idx_referral_submissions_status
  ON public.referral_submissions (status) WHERE status = 'pending';

-- 5. Row Level Security
ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins manage referral partners"
    ON public.referral_partners FOR ALL
    USING (EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage referral submissions"
    ON public.referral_submissions FOR ALL
    USING (EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
