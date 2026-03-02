-- ============================================================================
-- MIGRATION: Drop duplicate contact columns from deal_pipeline
--
-- Only run AFTER verifying the data migration (20260601100000) completed
-- successfully and contact data has been confirmed in connection_requests
-- (for marketplace deals) or contacts table (for manual deals).
--
-- Dropped columns:
--   contact_name    → sourced from connection_requests.lead_name or contacts
--   contact_email   → sourced from connection_requests.lead_email or contacts
--   contact_company → sourced from connection_requests.lead_company or contacts
--   contact_phone   → sourced from connection_requests.lead_phone or contacts
--   contact_role    → sourced from connection_requests.lead_role or contacts
--   company_address → sourced from listings address fields via listing_id JOIN
--   contact_title   → redundant with contact_role
-- ============================================================================

ALTER TABLE public.deal_pipeline
  DROP COLUMN IF EXISTS contact_name,
  DROP COLUMN IF EXISTS contact_email,
  DROP COLUMN IF EXISTS contact_company,
  DROP COLUMN IF EXISTS contact_phone,
  DROP COLUMN IF EXISTS contact_role,
  DROP COLUMN IF EXISTS company_address,
  DROP COLUMN IF EXISTS contact_title;

-- Drop the now-orphaned index on the removed contact_company column
DROP INDEX IF EXISTS idx_deal_pipeline_contact_company;
