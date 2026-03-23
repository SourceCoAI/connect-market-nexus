-- Migration: Convert pure utility functions from SECURITY DEFINER to SECURITY INVOKER
--
-- These functions do NOT need elevated privileges — they are pure computations
-- or simple triggers that should run with the caller's permissions.
--
-- Rationale:
--   SECURITY DEFINER runs as the function owner (typically superuser), bypassing RLS.
--   For pure utility functions this is unnecessary and widens the attack surface.
--   SECURITY INVOKER (the default) runs with the caller's permissions — safer.
--
-- Functions converted:
--   1. extract_domain(text)           — IMMUTABLE text extraction
--   2. normalize_company_name(text)   — IMMUTABLE text normalization
--   3. increment(integer, integer)    — IMMUTABLE arithmetic
--   4. update_updated_at_column()     — Simple trigger that sets updated_at = NOW()
--
-- Functions NOT converted (correctly use SECURITY DEFINER):
--   - get_deals_with_details()        — Needs to bypass RLS for admin aggregation
--   - merge_valuation_lead(...)       — Service-level upsert
--   - update_fee_agreement_firm_status() — Admin-guarded batch operation
--   - create_deal_from_connection_request() — Trigger needs INSERT on restricted tables
--   - All analytics/reporting RPCs    — Need cross-table reads bypassing RLS
--   - Cron-triggered functions         — Run without user context

BEGIN;

-- 1. extract_domain — pure string extraction, no table access
CREATE OR REPLACE FUNCTION public.extract_domain(url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT lower(regexp_replace(
    regexp_replace(url, '^https?://(www\.)?', ''),
    '/.*$', ''
  ));
$$;

-- 2. normalize_company_name — pure text normalization, no table access
CREATE OR REPLACE FUNCTION public.normalize_company_name(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT lower(regexp_replace(
    regexp_replace(name, '\s*(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|plc\.?|lp\.?|llp\.?|group|holdings?|partners?|capital|advisors?|management|consulting|services?|solutions?|enterprises?|international|global)\s*$', '', 'gi'),
    '[^a-z0-9]', '', 'g'
  ));
$$;

-- 3. increment — pure arithmetic, no table access
CREATE OR REPLACE FUNCTION public.increment(current_value integer, increment_by integer DEFAULT 1)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT current_value + increment_by;
$$;

-- 4. update_updated_at_column — trigger function, only touches the row being updated
--    SECURITY INVOKER is safe because the trigger fires with the privileges of
--    the user performing the UPDATE (they already passed RLS to reach the row).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMIT;
