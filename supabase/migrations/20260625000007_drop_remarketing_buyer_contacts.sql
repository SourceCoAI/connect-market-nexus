-- ============================================================================
-- MIGRATION: Drop remarketing_buyer_contacts (dead mirror table)
-- ============================================================================
-- Part of the contact consolidation strategy (phase 5).
--
-- remarketing_buyer_contacts was the legacy contact store for remarketing
-- buyer universes. Since 20260228 all its data has been backfilled into the
-- canonical contacts table, and a mirror trigger (trg_mirror_rbc_to_contacts)
-- shims any new writes into contacts. In this same changeset:
--
--   * The single remaining reader (outlook-sync-emails) has been rewritten
--     to read from contacts.
--   * All writers were already going through contacts; zero direct writers
--     to remarketing_buyer_contacts exist in src/ or supabase/functions/.
--
-- This migration drops the mirror trigger, then the table. Using
-- IF EXISTS so a fresh DR replay (where the table may have never been
-- created due to the earlier DROP in 20260222032323) doesn't fail.
-- ============================================================================


-- 1. Drop the mirror trigger first (depends on table)
DROP TRIGGER IF EXISTS trg_mirror_rbc_to_contacts
  ON public.remarketing_buyer_contacts;

-- 2. Drop the mirror trigger function
DROP FUNCTION IF EXISTS public.mirror_rbc_to_contacts();

-- 3. Drop the updated_at trigger
DROP TRIGGER IF EXISTS update_remarketing_contacts_updated_at
  ON public.remarketing_buyer_contacts;

-- 4. Drop the table
DROP TABLE IF EXISTS public.remarketing_buyer_contacts;
