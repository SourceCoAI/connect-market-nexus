-- Migration: Add 'need_to_show_deal' as the initial introduction status
-- This adds a new first phase before 'outreach_initiated' in the buyer introduction workflow.

-- 1. Drop old constraint and add new one with 'need_to_show_deal'
ALTER TABLE buyer_introductions
  DROP CONSTRAINT IF EXISTS buyer_introductions_introduction_status_check;

ALTER TABLE buyer_introductions
  ADD CONSTRAINT buyer_introductions_introduction_status_check
  CHECK (introduction_status IN ('need_to_show_deal', 'outreach_initiated', 'meeting_scheduled', 'not_a_fit', 'fit_and_interested'));

-- 2. Update views to include new status in the "not yet introduced" group
CREATE OR REPLACE VIEW not_yet_introduced_buyers AS
SELECT
  bi.id, bi.buyer_name, bi.buyer_firm_name,
  bi.buyer_email, bi.buyer_phone, bi.buyer_linkedin_url,
  bi.company_name, bi.targeting_reason,
  bi.expected_deal_size_low, bi.expected_deal_size_high,
  bi.internal_champion, bi.created_at, bi.listing_id,
  COALESCE((SELECT COUNT(*) FROM introduction_activity WHERE buyer_introduction_id = bi.id), 0) as activity_count,
  COALESCE((SELECT MAX(activity_date) FROM introduction_activity WHERE buyer_introduction_id = bi.id), bi.created_at) as last_activity
FROM buyer_introductions bi
WHERE bi.introduction_status IN ('need_to_show_deal', 'outreach_initiated', 'meeting_scheduled')
  AND bi.archived_at IS NULL
ORDER BY bi.created_at DESC;

-- 3. Drop and recreate the summary view (CREATE OR REPLACE cannot change columns)
DROP VIEW IF EXISTS buyer_introduction_summary;

CREATE VIEW buyer_introduction_summary AS
SELECT
  l.id as listing_id,
  l.title as company_name,
  COUNT(CASE WHEN bi.introduction_status = 'need_to_show_deal' THEN 1 END) as need_to_show_deal,
  COUNT(CASE WHEN bi.introduction_status = 'outreach_initiated' THEN 1 END) as pending_introductions,
  COUNT(CASE WHEN bi.introduction_status = 'meeting_scheduled' THEN 1 END) as meetings_scheduled,
  COUNT(CASE WHEN bi.introduction_status = 'fit_and_interested' THEN 1 END) as fit_and_interested_buyers,
  COUNT(CASE WHEN bi.introduction_status = 'not_a_fit' THEN 1 END) as not_a_fit_buyers,
  COUNT(*) as total_tracked_buyers
FROM listings l
LEFT JOIN buyer_introductions bi ON l.id = bi.listing_id
WHERE l.deleted_at IS NULL
GROUP BY l.id, l.title
ORDER BY l.title;
