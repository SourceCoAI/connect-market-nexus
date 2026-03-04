CREATE TABLE public.incoming_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_lead_id text,
  full_name text NOT NULL,
  email text NOT NULL,
  website text NOT NULL,
  lead_source text,
  calculator_inputs jsonb NOT NULL,
  valuation_result jsonb NOT NULL,
  ip_address text,
  city text,
  region text,
  country text,
  country_code text,
  created_at timestamptz DEFAULT now(),
  received_at timestamptz DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.incoming_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage incoming_leads"
  ON public.incoming_leads FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));