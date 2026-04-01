INSERT INTO enrichment_queue (listing_id, status, attempts, queued_at, force)
SELECT id, 'pending', 0, now(), true
FROM listings
WHERE deal_source = 'gp_partners' AND deleted_at IS NULL AND enriched_at IS NULL
ON CONFLICT (listing_id) DO UPDATE SET status = 'pending', attempts = 0, queued_at = now(), force = true;