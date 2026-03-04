-- =============================================================================
-- Migration: Global API Rate Limiter (Semaphore)
-- Part of: Data Architecture Audit Phase 5
--
-- Provides coordinated rate limiting across all enrichment queues
-- to prevent thundering herd problems on external APIs.
-- =============================================================================

-- 1. Rate limits configuration per provider
CREATE TABLE IF NOT EXISTS api_rate_limits (
  provider text PRIMARY KEY,
  max_concurrent integer NOT NULL DEFAULT 3,
  max_per_minute integer,
  max_per_hour integer,
  daily_cost_limit_usd numeric(10,2),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default limits
INSERT INTO api_rate_limits (provider, max_concurrent, max_per_minute, daily_cost_limit_usd) VALUES
  ('gemini',        5,  30, 50.00),
  ('claude_haiku',  5,  30, 25.00),
  ('claude_sonnet', 3,  10, 100.00),
  ('firecrawl',     3,  15, 30.00),
  ('apify',         2,  10, 20.00),
  ('prospeo',       3,  20, 15.00),
  ('serper',        5,  30, 10.00)
ON CONFLICT (provider) DO NOTHING;

-- 2. Active slot tracking (semaphore)
CREATE TABLE IF NOT EXISTS api_semaphore (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL REFERENCES api_rate_limits(provider),
  slot_holder text NOT NULL,        -- edge function name
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,  -- auto-release after timeout
  released_at timestamptz,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_api_semaphore_active
  ON api_semaphore (provider)
  WHERE released_at IS NULL AND expires_at > now();

CREATE INDEX IF NOT EXISTS idx_api_semaphore_cleanup
  ON api_semaphore (expires_at)
  WHERE released_at IS NULL;

-- 3. Acquire a slot (returns slot ID or NULL if at capacity)
CREATE OR REPLACE FUNCTION acquire_api_slot(
  p_provider text,
  p_caller text,
  p_timeout_seconds integer DEFAULT 300
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_max integer;
  v_active integer;
  v_slot_id uuid;
BEGIN
  -- Auto-expire stale slots
  UPDATE api_semaphore
  SET released_at = now()
  WHERE expires_at < now() AND released_at IS NULL;

  -- Get configured limit
  SELECT max_concurrent INTO v_max
  FROM api_rate_limits
  WHERE provider = p_provider;

  IF NOT FOUND THEN
    v_max := 3;  -- safe default
  END IF;

  -- Count active slots
  SELECT count(*) INTO v_active
  FROM api_semaphore
  WHERE provider = p_provider
    AND released_at IS NULL
    AND expires_at > now();

  -- Reject if at capacity
  IF v_active >= v_max THEN
    RETURN NULL;
  END IF;

  -- Acquire slot
  INSERT INTO api_semaphore (provider, slot_holder, expires_at)
  VALUES (p_provider, p_caller, now() + make_interval(secs => p_timeout_seconds))
  RETURNING id INTO v_slot_id;

  RETURN v_slot_id;
END;
$$;

-- 4. Release a slot
CREATE OR REPLACE FUNCTION release_api_slot(p_slot_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE api_semaphore
  SET released_at = now()
  WHERE id = p_slot_id AND released_at IS NULL;
END;
$$;

-- 5. Check current utilization (for monitoring dashboards)
CREATE OR REPLACE FUNCTION get_api_utilization()
RETURNS TABLE (
  provider text,
  max_concurrent integer,
  active_slots bigint,
  utilization_pct numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    rl.provider,
    rl.max_concurrent,
    count(s.id) AS active_slots,
    ROUND(count(s.id)::numeric / NULLIF(rl.max_concurrent, 0) * 100, 1) AS utilization_pct
  FROM api_rate_limits rl
  LEFT JOIN api_semaphore s
    ON s.provider = rl.provider
    AND s.released_at IS NULL
    AND s.expires_at > now()
  GROUP BY rl.provider, rl.max_concurrent
  ORDER BY utilization_pct DESC NULLS LAST;
$$;

-- 6. RLS — service role only (edge functions use service role)
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_semaphore ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_rate_limits"
  ON api_rate_limits FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "service_role_semaphore"
  ON api_semaphore FOR ALL
  TO service_role
  USING (true);

-- Admin read access for monitoring
CREATE POLICY "admin_read_rate_limits"
  ON api_rate_limits FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admin_read_semaphore"
  ON api_semaphore FOR SELECT
  USING (public.is_admin(auth.uid()));

-- 7. Daily cost aggregation view
CREATE OR REPLACE VIEW api_daily_costs AS
SELECT
  provider,
  date_trunc('day', acquired_at) AS day,
  count(*) AS total_calls,
  count(*) FILTER (WHERE released_at IS NOT NULL) AS completed_calls,
  count(*) FILTER (WHERE released_at IS NULL AND expires_at < now()) AS timed_out_calls
FROM api_semaphore
GROUP BY provider, date_trunc('day', acquired_at)
ORDER BY day DESC, provider;
