-- Migrate description → executive_summary for internal/remarketing deals
-- The codebase no longer reads `description` for remarketing deals; all UI,
-- scoring, enrichment, and outreach now use `executive_summary`.  This
-- migration back-fills executive_summary from description for any internal
-- deal that has a description but no executive_summary, so no data is lost.

BEGIN;

-- 1. Copy description into executive_summary where executive_summary is empty
UPDATE listings
SET    executive_summary = description,
       updated_at        = now()
WHERE  is_internal_deal = true
  AND  (executive_summary IS NULL OR executive_summary = '')
  AND  description IS NOT NULL
  AND  description <> '';

-- 2. Clear description on internal deals so there is a single source of truth.
--    Public listings (is_internal_deal = false) keep their description/
--    description_html/description_json untouched.
UPDATE listings
SET    description = NULL,
       updated_at  = now()
WHERE  is_internal_deal = true
  AND  description IS NOT NULL;

COMMIT;
