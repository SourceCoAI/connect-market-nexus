
-- Soft-delete GP Partner deals that have no active engagement
-- Keeps: published listings, deals with pipeline entries, connection requests, or buyer introductions
UPDATE listings
SET deleted_at = now(), updated_at = now()
WHERE deal_source = 'gp_partners'
  AND deleted_at IS NULL
  AND is_internal_deal = true
  AND NOT EXISTS (SELECT 1 FROM deal_pipeline dp WHERE dp.listing_id = listings.id)
  AND NOT EXISTS (SELECT 1 FROM connection_requests cr WHERE cr.listing_id = listings.id)
  AND NOT EXISTS (SELECT 1 FROM buyer_introductions bi WHERE bi.listing_id = listings.id);
