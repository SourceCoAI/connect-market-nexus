-- Migration: Expand buyer_type to support independent sponsors and search funds
--
-- Adds 'independent_sponsor' and 'search_fund' to the buyer_type CHECK
-- constraints on remarketing_buyers and buyer_type_profiles tables.
-- These new types receive the same PE firm page treatment in the UI —
-- they are capital deployers with their own investment thesis, contacts,
-- and deal activity.

-- 1. Update remarketing_buyers.buyer_type CHECK constraint
-- The inline CHECK constraint created during CREATE TABLE gets an auto-generated
-- name like "remarketing_buyers_buyer_type_check". We drop it and re-add.
ALTER TABLE public.remarketing_buyers
  DROP CONSTRAINT IF EXISTS remarketing_buyers_buyer_type_check;

ALTER TABLE public.remarketing_buyers
  ADD CONSTRAINT remarketing_buyers_buyer_type_check
  CHECK (buyer_type IN (
    'pe_firm',
    'platform',
    'strategic',
    'family_office',
    'independent_sponsor',
    'search_fund',
    'other'
  ));

-- 2. Update buyer_type_profiles.buyer_type CHECK constraint
ALTER TABLE public.buyer_type_profiles
  DROP CONSTRAINT IF EXISTS buyer_type_profiles_buyer_type_check;

ALTER TABLE public.buyer_type_profiles
  ADD CONSTRAINT buyer_type_profiles_buyer_type_check
  CHECK (buyer_type IN (
    'pe_firm',
    'platform',
    'strategic',
    'family_office',
    'independent_sponsor',
    'search_fund',
    'other'
  ));

-- Merged from: 20260226000000_phoneburner_manual_tokens.sql
-- Migration: Support manual PhoneBurner access tokens
--
-- Allows admins to paste a PhoneBurner access token directly
-- instead of going through the OAuth flow. Manual tokens are
-- not refreshed automatically — the user must update them if they expire.

-- Make refresh_token nullable (not needed for manual tokens)
ALTER TABLE phoneburner_oauth_tokens
  ALTER COLUMN refresh_token DROP NOT NULL;

-- Flag to identify manually-entered tokens (vs OAuth tokens)
ALTER TABLE phoneburner_oauth_tokens
  ADD COLUMN IF NOT EXISTS is_manual_token boolean NOT NULL DEFAULT false;
