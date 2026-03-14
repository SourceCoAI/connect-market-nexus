-- Add work_email column to valuation_leads
-- Stores an enriched work email found via Blitz/Clay, separate from the
-- calculator submission email which lives in the existing email column.
ALTER TABLE valuation_leads ADD COLUMN IF NOT EXISTS work_email TEXT;
