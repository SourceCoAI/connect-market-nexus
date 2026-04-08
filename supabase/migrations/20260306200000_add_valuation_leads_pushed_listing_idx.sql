-- Add index on pushed_listing_id for reverse lookup from deal detail page
CREATE INDEX IF NOT EXISTS idx_valuation_leads_pushed_listing_id
  ON valuation_leads (pushed_listing_id)
  WHERE pushed_listing_id IS NOT NULL;

-- Merged from: 20260306200000_profiles_remarketing_buyer_fk.sql
-- ============================================================================
-- MIGRATION: Add stored remarketing_buyer_id FK to profiles
-- ============================================================================
-- Part of the Data Relationship Audit — replaces the trigger-only soft link
-- between marketplace profiles and remarketing_buyers with a stored FK.
--
-- Currently, a profile is linked to a remarketing_buyer only via the
-- sync_marketplace_buyer_on_approval trigger (company name / website match).
-- Adding a stored FK enables direct, queryable joins without trigger reliance.
--
-- SAFETY:
--   - ADDITIVE ONLY: One new nullable UUID column + index.
--   - NO DATA LOSS: Existing rows unchanged except for backfill.
--   - ZERO DOWNTIME: Safe for live production.
-- ============================================================================


-- ─── STEP 1: Add remarketing_buyer_id column ────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS remarketing_buyer_id
    UUID REFERENCES public.remarketing_buyers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_remarketing_buyer
  ON public.profiles(remarketing_buyer_id)
  WHERE remarketing_buyer_id IS NOT NULL;


-- ─── STEP 2: Backfill via contacts table ─────────────────────────────────────
-- The contacts table already links profile_id to remarketing_buyer_id.
-- Use it as the authoritative bridge.

UPDATE public.profiles p
SET remarketing_buyer_id = c.remarketing_buyer_id
FROM public.contacts c
WHERE p.remarketing_buyer_id IS NULL
  AND c.profile_id = p.id
  AND c.contact_type = 'buyer'
  AND c.remarketing_buyer_id IS NOT NULL
  AND c.archived = false;


-- ─── STEP 3: Backfill via firm_members → remarketing_buyers ─────────────────
-- For profiles that have a firm membership but no contact record yet,
-- find the remarketing_buyer linked to the same firm.

UPDATE public.profiles p
SET remarketing_buyer_id = rb.id
FROM public.firm_members fm
JOIN public.remarketing_buyers rb ON rb.marketplace_firm_id = fm.firm_id
WHERE p.remarketing_buyer_id IS NULL
  AND fm.user_id = p.id
  AND rb.archived = false;


-- ============================================================================
-- Summary:
--   1 new column: remarketing_buyer_id (UUID FK → remarketing_buyers)
--   1 partial index for efficient lookups
--   2 backfill passes: via contacts bridge, via firm_members bridge
-- ============================================================================
