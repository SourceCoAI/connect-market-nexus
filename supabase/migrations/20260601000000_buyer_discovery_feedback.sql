-- Buyer Discovery Feedback Loop
--
-- Stores accept/reject decisions from the deal team on buyer recommendations.
-- Feedback operates at the NICHE level — rejecting a buyer on a fleet repair deal
-- informs all future fleet repair searches, not just that one deal.
--
-- This is the foundation for making every deal smarter than the last.

-- ── Feedback table ──
CREATE TABLE IF NOT EXISTS buyer_discovery_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What deal triggered this feedback
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,

  -- Which buyer was accepted/rejected
  buyer_id UUID REFERENCES buyers(id) ON DELETE SET NULL,
  buyer_name TEXT NOT NULL,
  pe_firm_name TEXT,

  -- The action taken
  action TEXT NOT NULL CHECK (action IN ('accepted', 'rejected')),

  -- Optional reason for rejection (free text or structured)
  reason TEXT,
  reason_category TEXT CHECK (reason_category IS NULL OR reason_category IN (
    'wrong_industry',
    'not_pe_backed',
    'pe_firm_not_platform',
    'too_small',
    'too_large',
    'wrong_geography',
    'no_longer_active',
    'already_contacted',
    'not_a_fit_other'
  )),

  -- Niche category derived from the deal — this is what links feedback
  -- across deals in the same vertical
  niche_category TEXT NOT NULL,

  -- Additional context
  deal_industry TEXT,
  deal_categories TEXT[],
  buyer_type TEXT,
  buyer_source TEXT, -- 'ai_seeded', 'marketplace', 'scored'
  composite_score INTEGER,
  service_score INTEGER,

  -- Who gave the feedback
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate feedback for same buyer+deal combination
  UNIQUE (listing_id, buyer_id, action)
);

-- ── Indexes for fast lookup ──
-- Primary query: find feedback for a niche category to calibrate future searches
CREATE INDEX idx_bdf_niche_category ON buyer_discovery_feedback(niche_category);
CREATE INDEX idx_bdf_listing_id ON buyer_discovery_feedback(listing_id);
CREATE INDEX idx_bdf_buyer_id ON buyer_discovery_feedback(buyer_id);
CREATE INDEX idx_bdf_action ON buyer_discovery_feedback(action);

-- ── RLS policies ──
ALTER TABLE buyer_discovery_feedback ENABLE ROW LEVEL SECURITY;

-- Admins can read and write feedback
CREATE POLICY "Admins can manage buyer discovery feedback"
  ON buyer_discovery_feedback
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Service role has full access (for edge functions)
CREATE POLICY "Service role full access to buyer discovery feedback"
  ON buyer_discovery_feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Add buyer_profile column to buyer_seed_log for debugging ──
-- Stores the Pass 1 buyer profile so we can inspect what criteria were used
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buyer_seed_log' AND column_name = 'buyer_profile'
  ) THEN
    ALTER TABLE buyer_seed_log ADD COLUMN buyer_profile JSONB;
  END IF;
END $$;

-- ── Add verification_status column to buyer_seed_log ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buyer_seed_log' AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE buyer_seed_log ADD COLUMN verification_status TEXT DEFAULT 'unverified';
  END IF;
END $$;

-- ── Invalidate old seed caches so new two-pass results are used ──
-- The v2 prompt produces fundamentally different (better) results,
-- so old cached results should be regenerated.
UPDATE buyer_seed_cache
SET expires_at = now() - interval '1 second'
WHERE cache_key LIKE 'seed:%';
