-- Platform Audit Remediation Migration
-- Addresses findings from the March 2026 full system audit
-- Priority: P1-P3 database-level fixes

-- ============================================================================
-- P3: Add stage timestamps to deal_pipeline for timeline reporting
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deal_pipeline' AND column_name = 'interested_at') THEN
    ALTER TABLE deal_pipeline ADD COLUMN interested_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deal_pipeline' AND column_name = 'nda_at') THEN
    ALTER TABLE deal_pipeline ADD COLUMN nda_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deal_pipeline' AND column_name = 'cim_at') THEN
    ALTER TABLE deal_pipeline ADD COLUMN cim_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deal_pipeline' AND column_name = 'ioi_at') THEN
    ALTER TABLE deal_pipeline ADD COLUMN ioi_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deal_pipeline' AND column_name = 'loi_at') THEN
    ALTER TABLE deal_pipeline ADD COLUMN loi_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deal_pipeline' AND column_name = 'closed_at') THEN
    ALTER TABLE deal_pipeline ADD COLUMN closed_at timestamptz;
  END IF;
END $$;

-- ============================================================================
-- P3: Add low-confidence classification review queue
-- Buyers with classification_confidence < 0.7 are flagged for review
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buyers' AND column_name = 'buyer_type_confidence') THEN
    ALTER TABLE buyers ADD COLUMN buyer_type_confidence real;
  END IF;
END $$;

-- Create a view for the low-confidence review queue
CREATE OR REPLACE VIEW buyer_classification_review_queue AS
SELECT
  b.id,
  b.company_name,
  b.buyer_type,
  b.buyer_type_ai_recommendation,
  b.buyer_type_confidence,
  b.buyer_type_reasoning,
  b.buyer_type_classified_at,
  b.buyer_type_source,
  b.buyer_type_needs_review,
  b.company_website,
  b.created_at
FROM buyers b
WHERE b.archived = false
  AND (
    b.buyer_type_needs_review = true
    OR b.buyer_type_confidence < 70
    OR b.buyer_type IS NULL
    OR b.buyer_type = ''
  )
ORDER BY
  CASE WHEN b.buyer_type IS NULL OR b.buyer_type = '' THEN 0 ELSE 1 END,
  COALESCE(b.buyer_type_confidence, 0) ASC,
  b.created_at DESC;

-- ============================================================================
-- P2: Add unique constraint for connection request deduplication
-- Prevents duplicate connection requests from same email for same listing
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_connection_requests_email_listing_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_connection_requests_email_listing_unique
    ON connection_requests (listing_id, lead_email)
    WHERE lead_email IS NOT NULL AND lead_email != '';
  END IF;
END $$;

-- ============================================================================
-- P3: Add enrichment_history table for rollback capability
-- Every enrichment overwrite stores previous + new value for audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS enrichment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('buyer', 'listing', 'contact', 'firm')),
  field_name text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  provider text NOT NULL,
  enrichment_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by target
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_enrichment_history_target'
  ) THEN
    CREATE INDEX idx_enrichment_history_target ON enrichment_history (target_id, target_type, field_name);
  END IF;
END $$;

-- ============================================================================
-- P3: Slug collision handling function for marketplace listings
-- Generates unique slugs with collision retry
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_unique_listing_slug(
  p_title text,
  p_listing_id uuid DEFAULT NULL
) RETURNS text AS $$
DECLARE
  v_base_slug text;
  v_slug text;
  v_suffix int := 0;
BEGIN
  -- Generate base slug from title
  v_base_slug := lower(regexp_replace(
    regexp_replace(p_title, '[^a-zA-Z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
  ));
  v_base_slug := trim(both '-' from v_base_slug);

  -- Truncate to reasonable length
  IF length(v_base_slug) > 60 THEN
    v_base_slug := left(v_base_slug, 60);
    v_base_slug := trim(both '-' from v_base_slug);
  END IF;

  -- Fallback for empty slugs
  IF v_base_slug = '' OR v_base_slug IS NULL THEN
    v_base_slug := 'listing';
  END IF;

  v_slug := v_base_slug;

  -- Check for collisions and append suffix if needed
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM listings
      WHERE slug = v_slug
        AND (p_listing_id IS NULL OR id != p_listing_id)
    ) THEN
      RETURN v_slug;
    END IF;
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- P2: Status transition enforcement for connection requests
-- Ensures proper ordering: pending → notified → reviewed → (converted|rejected)
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_connection_request_status_transition()
RETURNS trigger AS $$
DECLARE
  valid_transitions jsonb := '{
    "pending": ["notified", "reviewed", "rejected"],
    "notified": ["reviewed", "converted", "rejected"],
    "reviewed": ["converted", "rejected"],
    "converted": [],
    "rejected": []
  }'::jsonb;
  allowed_next jsonb;
BEGIN
  -- Skip if status hasn't changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  allowed_next := valid_transitions -> OLD.status;

  IF allowed_next IS NULL OR NOT (allowed_next ? NEW.status) THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create the trigger if the connection_requests table has a status column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'connection_requests' AND column_name = 'status'
  ) THEN
    DROP TRIGGER IF EXISTS trg_connection_request_status_transition ON connection_requests;
    CREATE TRIGGER trg_connection_request_status_transition
      BEFORE UPDATE ON connection_requests
      FOR EACH ROW
      EXECUTE FUNCTION enforce_connection_request_status_transition();
  END IF;
END $$;
