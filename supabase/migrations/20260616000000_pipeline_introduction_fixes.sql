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
