ALTER TABLE public.listings 
ADD COLUMN IF NOT EXISTS financial_notes TEXT,
ADD COLUMN IF NOT EXISTS financial_followup_questions TEXT[];