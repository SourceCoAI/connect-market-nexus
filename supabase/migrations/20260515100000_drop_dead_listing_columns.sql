-- Drop confirmed dead columns from listings table.
--
-- Evidence for each column being dead:
--
-- linkedin_headquarters: Written by LinkedIn scraper (Apify), but NEVER read
--   anywhere in frontend or edge function code. Zero display, zero logic references.
--
-- status_label: Only appeared in auto-generated types. Zero reads/writes in
--   any component, hook, or edge function. (status_tag is the active UI label field.)
--
-- financial_notes: Added in migration 20260205 but never written to or read from
--   in any application code. Zero references outside types file.

ALTER TABLE public.listings
  DROP COLUMN IF EXISTS linkedin_headquarters,
  DROP COLUMN IF EXISTS status_label,
  DROP COLUMN IF EXISTS financial_notes;
