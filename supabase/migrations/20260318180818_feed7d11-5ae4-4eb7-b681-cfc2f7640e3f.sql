ALTER TABLE public.smartlead_reply_inbox
  ADD COLUMN IF NOT EXISTS lead_first_name text,
  ADD COLUMN IF NOT EXISTS lead_last_name text,
  ADD COLUMN IF NOT EXISTS lead_company_name text,
  ADD COLUMN IF NOT EXISTS lead_website text,
  ADD COLUMN IF NOT EXISTS lead_phone text,
  ADD COLUMN IF NOT EXISTS lead_mobile text,
  ADD COLUMN IF NOT EXISTS lead_linkedin_url text,
  ADD COLUMN IF NOT EXISTS lead_title text,
  ADD COLUMN IF NOT EXISTS lead_location text,
  ADD COLUMN IF NOT EXISTS lead_custom_fields jsonb,
  ADD COLUMN IF NOT EXISTS smartlead_lead_data jsonb,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;