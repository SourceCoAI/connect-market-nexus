-- Add missing contact columns to deal_pipeline that code references
ALTER TABLE public.deal_pipeline ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE public.deal_pipeline ADD COLUMN IF NOT EXISTS contact_company TEXT;
ALTER TABLE public.deal_pipeline ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.deal_pipeline ADD COLUMN IF NOT EXISTS contact_phone TEXT;