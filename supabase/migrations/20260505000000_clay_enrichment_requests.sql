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

-- Merged from: 20260505000000_deal_financial_sync_trigger.sql
-- ============================================================================
-- Deal → Marketplace Listing Financial Sync
-- ============================================================================
-- Enforces the rule: deals are the source of truth for financial data.
-- When a deal's financials are updated, all marketplace listings created
-- from that deal (via source_deal_id) are automatically kept in sync.
--
-- This prevents data drift where a deal shows $5M revenue but its
-- marketplace listing still shows the $3M that was copied at creation time.
-- ============================================================================

-- 1. Trigger function: propagate financial changes from deal to marketplace listing(s)
CREATE OR REPLACE FUNCTION sync_deal_financials_to_listings()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when financial or key display fields actually changed
  IF (
    OLD.revenue IS DISTINCT FROM NEW.revenue OR
    OLD.ebitda IS DISTINCT FROM NEW.ebitda OR
    OLD.ebitda_margin IS DISTINCT FROM NEW.ebitda_margin OR
    OLD.full_time_employees IS DISTINCT FROM NEW.full_time_employees OR
    OLD.location IS DISTINCT FROM NEW.location OR
    OLD.address_state IS DISTINCT FROM NEW.address_state OR
    OLD.category IS DISTINCT FROM NEW.category OR
    OLD.categories IS DISTINCT FROM NEW.categories OR
    OLD.industry IS DISTINCT FROM NEW.industry
  ) THEN
    UPDATE listings
    SET
      revenue = NEW.revenue,
      ebitda = NEW.ebitda,
      ebitda_margin = NEW.ebitda_margin,
      full_time_employees = NEW.full_time_employees,
      location = COALESCE(NEW.address_state, NEW.location),
      category = NEW.category,
      categories = NEW.categories,
      updated_at = NOW()
    WHERE source_deal_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach trigger to listings table (fires when a deal row is updated)
DROP TRIGGER IF EXISTS trg_sync_deal_financials ON listings;
CREATE TRIGGER trg_sync_deal_financials
  AFTER UPDATE ON listings
  FOR EACH ROW
  -- Only fire for deal rows (not marketplace listings themselves)
  WHEN (OLD.source_deal_id IS NULL)
  EXECUTE FUNCTION sync_deal_financials_to_listings();

-- 3. One-time backfill: sync any currently drifted marketplace listings
-- with their source deal's current financial data
UPDATE listings AS ml
SET
  revenue = deal.revenue,
  ebitda = deal.ebitda,
  ebitda_margin = deal.ebitda_margin,
  full_time_employees = deal.full_time_employees,
  location = COALESCE(deal.address_state, deal.location),
  category = deal.category,
  categories = deal.categories,
  updated_at = NOW()
FROM listings AS deal
WHERE ml.source_deal_id = deal.id
  AND ml.source_deal_id IS NOT NULL;

-- 4. Update the marketplace_listings view to pull financials from source deal
-- when available, ensuring buyers always see current deal data
CREATE OR REPLACE VIEW public.marketplace_listings AS
SELECT
  ml.id,
  ml.title,
  ml.description,
  ml.description_html,
  ml.description_json,
  ml.hero_description,
  -- Financial data: always from source deal if linked
  COALESCE(deal.category, ml.category) AS category,
  COALESCE(deal.categories, ml.categories) AS categories,
  COALESCE(deal.address_state, deal.location, ml.location) AS location,
  COALESCE(deal.revenue, ml.revenue) AS revenue,
  COALESCE(deal.ebitda, ml.ebitda) AS ebitda,
  COALESCE(deal.full_time_employees, ml.full_time_employees) AS full_time_employees,
  -- Presentation-only fields: always from the marketplace listing itself
  ml.image_url,
  ml.status,
  ml.status_tag,
  ml.tags,
  ml.created_at,
  ml.updated_at,
  ml.published_at,
  ml.is_internal_deal,
  ml.deleted_at,
  ml.visible_to_buyer_types,
  ml.acquisition_type,
  ml.part_time_employees,
  ml.custom_metric_label,
  ml.custom_metric_value,
  ml.custom_metric_subtitle,
  ml.metric_3_type,
  ml.metric_3_custom_label,
  ml.metric_3_custom_value,
  ml.metric_3_custom_subtitle,
  ml.metric_4_type,
  ml.metric_4_custom_label,
  ml.metric_4_custom_value,
  ml.metric_4_custom_subtitle,
  ml.revenue_metric_subtitle,
  ml.ebitda_metric_subtitle,
  ml.custom_sections,
  ml.source_deal_id
FROM public.listings ml
LEFT JOIN public.listings deal ON ml.source_deal_id = deal.id
WHERE ml.status = 'active'
  AND ml.deleted_at IS NULL
  AND ml.is_internal_deal = false;

COMMENT ON VIEW public.marketplace_listings IS
'Marketplace view with single-source-of-truth enforcement: financial data (revenue, EBITDA, employees, location, categories) is pulled from the source deal when available. Presentation fields (title, description, hero, image, sections) come from the marketplace listing. This prevents data drift between deals and their marketplace listings.';

-- 5. Consolidate duplicate columns: need_owner_contact vs needs_owner_contact
-- Migrate data from need_owner_contact → needs_owner_contact, then drop the duplicate
DO $$
BEGIN
  -- Only run if both columns exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'need_owner_contact'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'needs_owner_contact'
  ) THEN
    -- Merge: if needs_owner_contact is null but need_owner_contact has data, copy it
    UPDATE listings
    SET needs_owner_contact = need_owner_contact
    WHERE needs_owner_contact IS NULL
      AND need_owner_contact IS NOT NULL;

    -- Drop the duplicate column
    ALTER TABLE listings DROP COLUMN IF EXISTS need_owner_contact;
  END IF;
END $$;
