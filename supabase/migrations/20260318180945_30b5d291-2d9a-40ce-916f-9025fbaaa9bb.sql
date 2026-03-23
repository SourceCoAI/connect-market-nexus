ALTER TABLE public.smartlead_reply_inbox
  ADD COLUMN IF NOT EXISTS lead_industry text;