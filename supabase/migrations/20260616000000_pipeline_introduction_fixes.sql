-- Pipeline & Introduction System Fixes
-- Issues #30, #36, #40 from remarketing audit

-- #30: Add buyer_introduction_id to deal_pipeline for traceability
ALTER TABLE deal_pipeline ADD COLUMN IF NOT EXISTS buyer_introduction_id UUID
  REFERENCES buyer_introductions(id) ON DELETE SET NULL;

-- #36: Drop orphaned introduction_activity table (never used, replaced by introduction_status_log)
DROP VIEW IF EXISTS not_yet_introduced_buyers CASCADE;
DROP TABLE IF EXISTS introduction_activity CASCADE;

-- #40: Invalidate recommendation cache when deal's universe links change
CREATE OR REPLACE FUNCTION invalidate_cache_on_universe_change()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE buyer_recommendation_cache SET expires_at = now()
  WHERE listing_id = COALESCE(NEW.listing_id, OLD.listing_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invalidate_cache_universe ON remarketing_universe_deals;
CREATE TRIGGER trg_invalidate_cache_universe
  AFTER INSERT OR UPDATE OR DELETE ON remarketing_universe_deals
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_cache_on_universe_change();

-- #44: Sync pipeline close to buyer introduction status
CREATE OR REPLACE FUNCTION sync_pipeline_close_to_introduction()
RETURNS TRIGGER AS $$
DECLARE
  new_stage_type TEXT;
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.buyer_introduction_id IS NOT NULL THEN
    SELECT stage_type INTO new_stage_type
    FROM deal_stages WHERE id = NEW.stage_id;

    IF new_stage_type IN ('closed_won', 'closed_lost') THEN
      UPDATE buyer_introductions
      SET introduction_status = 'deal_created',
          updated_at = now()
      WHERE id = NEW.buyer_introduction_id
        AND introduction_status = 'fit_and_interested';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_pipeline_to_introduction ON deal_pipeline;
CREATE TRIGGER trg_sync_pipeline_to_introduction
  AFTER UPDATE OF stage_id ON deal_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION sync_pipeline_close_to_introduction();

-- Merged from: 20260616000000_smartlead_gp_automation.sql
-- ============================================================
-- Smartlead GP Response Automation
-- Adds columns for auto-creating GP partner deals from
-- Smartlead replies, phone enrichment tracking, and seeds
-- the "Smartlead GP Responses" calling list.
-- ============================================================

-- 1. Listings: link back to smartlead reply that created the deal
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS smartlead_reply_inbox_id uuid,
  ADD COLUMN IF NOT EXISTS smartlead_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS smartlead_ai_category text,
  ADD COLUMN IF NOT EXISTS auto_created_from_smartlead boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_listings_smartlead_reply
  ON public.listings(smartlead_reply_inbox_id)
  WHERE smartlead_reply_inbox_id IS NOT NULL;

-- 2. Reply inbox: phone enrichment tracking
ALTER TABLE public.smartlead_reply_inbox
  ADD COLUMN IF NOT EXISTS phone_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_enrichment_source text,
  ADD COLUMN IF NOT EXISTS phone_enrichment_linkedin_url text;

-- 3. Index for GP campaign filtering
CREATE INDEX IF NOT EXISTS idx_smartlead_reply_inbox_campaign_name
  ON public.smartlead_reply_inbox(campaign_name);

-- 4. Seed the permanent "Smartlead GP Responses" calling list
DO $$
DECLARE
  v_list_id uuid;
BEGIN
  SELECT id INTO v_list_id
    FROM public.contact_lists
   WHERE name = 'Smartlead GP Responses'
     AND is_archived = false
   LIMIT 1;

  IF v_list_id IS NULL THEN
    INSERT INTO public.contact_lists (name, description, list_type, tags, contact_count)
    VALUES (
      'Smartlead GP Responses',
      'Auto-populated from Smartlead GP campaign replies where contact has a phone number. Loadable daily for dialing.',
      'mixed',
      ARRAY['smartlead', 'gp', 'auto-populated', 'calling'],
      0
    );
  END IF;
END $$;
