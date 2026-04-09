-- Client Portal cleanup: remove unused response types and push statuses.
--
-- The portal deal detail UI now offers only three client actions:
--   • Connect with Owner        → response_type = 'interested'
--   • Learn More From SourceCo  → response_type = 'need_more_info'
--   • Pass                      → response_type = 'pass'
--
-- The previously-allowed 'reviewing' and 'internal_review' response types
-- are no longer reachable from any UI, and the downstream 'reviewing'
-- push status is therefore unreachable as well. This migration:
--   1. Remaps any existing rows that still carry those legacy values.
--   2. Tightens the CHECK constraints to reflect the new, smaller set.

-- ── 1. Remap legacy portal_deal_responses.response_type values ──────────
UPDATE portal_deal_responses
SET    response_type = 'need_more_info'
WHERE  response_type IN ('reviewing', 'internal_review');

-- ── 2. Remap legacy portal_deal_pushes.status values ────────────────────
UPDATE portal_deal_pushes
SET    status = 'needs_info'
WHERE  status = 'reviewing';

-- ── 3. Tighten portal_deal_responses.response_type CHECK constraint ─────
ALTER TABLE portal_deal_responses
  DROP CONSTRAINT IF EXISTS portal_deal_responses_response_type_check;

ALTER TABLE portal_deal_responses
  ADD CONSTRAINT portal_deal_responses_response_type_check
  CHECK (response_type IN ('interested', 'pass', 'need_more_info'));

-- ── 4. Tighten portal_deal_pushes.status CHECK constraint ───────────────
ALTER TABLE portal_deal_pushes
  DROP CONSTRAINT IF EXISTS portal_deal_pushes_status_check;

ALTER TABLE portal_deal_pushes
  ADD CONSTRAINT portal_deal_pushes_status_check
  CHECK (status IN (
    'pending_review', 'viewed', 'interested', 'passed',
    'needs_info', 'under_nda', 'archived'
  ));
