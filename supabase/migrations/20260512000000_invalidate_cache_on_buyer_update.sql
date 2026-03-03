-- Invalidate buyer recommendation cache when scoring-relevant buyer fields change.
-- Without this, stale cached results persist for up to 4 hours after buyer edits.
-- We expire ALL cache entries because every deal is scored against every buyer.
-- The cache table is small (one row per deal) so the UPDATE is cheap even if
-- triggered multiple times in a bulk operation.

CREATE OR REPLACE FUNCTION invalidate_buyer_recommendation_cache()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'DELETE') THEN
    -- New or removed buyers always affect scoring results
    UPDATE buyer_recommendation_cache SET expires_at = NOW();
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Only invalidate when scoring-relevant fields actually changed
    IF (
      OLD.target_services    IS DISTINCT FROM NEW.target_services OR
      OLD.target_industries  IS DISTINCT FROM NEW.target_industries OR
      OLD.industry_vertical  IS DISTINCT FROM NEW.industry_vertical OR
      OLD.target_geographies IS DISTINCT FROM NEW.target_geographies OR
      OLD.geographic_footprint IS DISTINCT FROM NEW.geographic_footprint OR
      OLD.target_ebitda_min  IS DISTINCT FROM NEW.target_ebitda_min OR
      OLD.target_ebitda_max  IS DISTINCT FROM NEW.target_ebitda_max OR
      OLD.has_fee_agreement  IS DISTINCT FROM NEW.has_fee_agreement OR
      OLD.acquisition_appetite IS DISTINCT FROM NEW.acquisition_appetite OR
      OLD.total_acquisitions IS DISTINCT FROM NEW.total_acquisitions OR
      OLD.thesis_summary     IS DISTINCT FROM NEW.thesis_summary OR
      OLD.hq_state           IS DISTINCT FROM NEW.hq_state OR
      OLD.archived           IS DISTINCT FROM NEW.archived
    ) THEN
      UPDATE buyer_recommendation_cache SET expires_at = NOW();
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS invalidate_rec_cache_on_buyer_change ON remarketing_buyers;
CREATE TRIGGER invalidate_rec_cache_on_buyer_change
  AFTER INSERT OR UPDATE OR DELETE ON remarketing_buyers
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_buyer_recommendation_cache();
