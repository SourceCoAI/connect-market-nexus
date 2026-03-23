-- Add index on pushed_listing_id for reverse lookup from deal detail page
CREATE INDEX IF NOT EXISTS idx_valuation_leads_pushed_listing_id
  ON valuation_leads (pushed_listing_id)
  WHERE pushed_listing_id IS NOT NULL;
