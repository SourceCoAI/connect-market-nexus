-- Create deal_outreach_profiles table for buyer outreach configuration
CREATE TABLE public.deal_outreach_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  deal_descriptor TEXT NOT NULL,
  geography TEXT NOT NULL,
  ebitda TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(deal_id)
);

-- Enable RLS
ALTER TABLE public.deal_outreach_profiles ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage deal outreach profiles"
ON public.deal_outreach_profiles
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Service role bypass for edge functions (webhooks run without user session)
CREATE POLICY "Service role can manage deal_outreach_profiles"
ON public.deal_outreach_profiles
FOR ALL
USING (auth.role() = 'service_role');

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_deal_outreach_profiles_updated_at
BEFORE UPDATE ON public.deal_outreach_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();