
-- Add new fields to the profiles table for enhanced buyer profiling
ALTER TABLE public.profiles 
ADD COLUMN linkedin_profile TEXT,
ADD COLUMN ideal_target_description TEXT,
ADD COLUMN business_categories JSONB DEFAULT '[]'::jsonb,
ADD COLUMN target_locations TEXT,
ADD COLUMN revenue_range_min NUMERIC,
ADD COLUMN revenue_range_max NUMERIC,
ADD COLUMN specific_business_search TEXT;
