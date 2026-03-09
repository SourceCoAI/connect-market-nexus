-- Drop buyer_type_profiles table
--
-- This table was created in 20260204_buyer_fit_criteria_extraction.sql to store
-- detailed profiles for different buyer types in a universe. It has zero .from()
-- calls in any edge function or frontend code — no code reads or writes to it.
-- The buyer_type_profiles_buyer_type_check constraint was last updated in
-- 20260519000000_drop_dead_columns.sql but the table itself was never used.
--
-- The related criteria_extraction_sources and criteria_extraction_history tables
-- ARE actively used (by extract-buyer-criteria, extract-deal-document, etc.)
-- and are NOT dropped here.

-- Drop dependent objects first
DROP TRIGGER IF EXISTS update_buyer_type_profiles_updated_at ON public.buyer_type_profiles;
DROP POLICY IF EXISTS "Admins can manage buyer type profiles" ON public.buyer_type_profiles;

-- Drop the table
DROP TABLE IF EXISTS public.buyer_type_profiles;
