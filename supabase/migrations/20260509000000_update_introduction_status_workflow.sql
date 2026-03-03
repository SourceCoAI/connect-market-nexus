-- Migration: 20260509000000_update_introduction_status_workflow.sql
-- Updates buyer introduction statuses from old workflow to new:
--   Old: not_introduced, introduction_scheduled, introduced, passed, rejected
--   New: outreach_initiated, meeting_scheduled, not_a_fit, fit_and_interested

-- 1. Migrate existing data to new status values
UPDATE buyer_introductions
SET introduction_status = CASE
  WHEN introduction_status = 'not_introduced' THEN 'outreach_initiated'
  WHEN introduction_status = 'introduction_scheduled' THEN 'meeting_scheduled'
  WHEN introduction_status = 'introduced' THEN 'outreach_initiated'
  WHEN introduction_status = 'passed' THEN 'fit_and_interested'
  WHEN introduction_status = 'rejected' THEN 'not_a_fit'
  ELSE introduction_status
END
WHERE introduction_status IN ('not_introduced', 'introduction_scheduled', 'introduced', 'passed', 'rejected');

-- 2. Drop old constraint and add new one
ALTER TABLE buyer_introductions
  DROP CONSTRAINT IF EXISTS buyer_introductions_introduction_status_check;

ALTER TABLE buyer_introductions
  ADD CONSTRAINT buyer_introductions_introduction_status_check
  CHECK (introduction_status IN ('outreach_initiated', 'meeting_scheduled', 'not_a_fit', 'fit_and_interested'));

-- 3. Update views to use new statuses
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
WHERE bi.introduction_status IN ('outreach_initiated', 'meeting_scheduled')
  AND bi.archived_at IS NULL
ORDER BY bi.created_at DESC;

CREATE OR REPLACE VIEW introduced_and_passed_buyers AS
SELECT
  bi.id, bi.buyer_name, bi.buyer_firm_name,
  bi.company_name, bi.introduction_date, bi.introduced_by,
  bi.passed_date, bi.passed_reason, bi.buyer_feedback,
  bi.next_step, bi.expected_next_step_date, bi.listing_id,
  CASE
    WHEN bi.introduction_status = 'fit_and_interested' THEN 'Fit & Interested'
    WHEN bi.introduction_status = 'not_a_fit' THEN 'Not a Fit'
  END as stage,
  (CURRENT_DATE - bi.introduction_date) as days_since_introduction
FROM buyer_introductions bi
WHERE bi.introduction_status IN ('fit_and_interested', 'not_a_fit')
  AND bi.archived_at IS NULL
ORDER BY
  CASE WHEN bi.introduction_status = 'fit_and_interested' THEN 0 ELSE 1 END,
  bi.updated_at DESC NULLS LAST;

CREATE OR REPLACE VIEW buyer_introduction_summary AS
SELECT
  l.id as listing_id,
  l.title as company_name,
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
