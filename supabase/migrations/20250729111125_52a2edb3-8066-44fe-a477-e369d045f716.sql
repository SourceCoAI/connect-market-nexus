-- Create table for tracking registration funnel and form validation
CREATE TABLE IF NOT EXISTS public.registration_funnel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  email TEXT,
  step_name TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  time_spent INTEGER, -- in seconds
  dropped_off BOOLEAN DEFAULT FALSE,
  drop_off_reason TEXT,
  form_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.registration_funnel ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view registration funnel" ON public.registration_funnel
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "System can manage registration funnel" ON public.registration_funnel
  FOR ALL USING (true) WITH CHECK (true);

-- Create edge function for real email recovery campaign
-- This will integrate with the existing send-notification-email function