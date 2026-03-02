-- Phase 3: Drop confirmed-dead columns from listings table
-- Verified zero references in src/, supabase/functions/, and supabase/migrations/
-- (beyond original creation and this drop migration)
--
-- NOT dropped: financial_followup_questions — actively used by AI transcript extraction pipeline

ALTER TABLE public.listings
  DROP COLUMN IF EXISTS seller_interest_analyzed_at,
  DROP COLUMN IF EXISTS seller_interest_notes,
  DROP COLUMN IF EXISTS manual_rank_set_at,
  DROP COLUMN IF EXISTS lead_source_id;
