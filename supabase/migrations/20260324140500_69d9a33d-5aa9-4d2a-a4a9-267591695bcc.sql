CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

CREATE TABLE public.match_tool_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website text NOT NULL,
  business_name text,
  full_name text,
  email text,
  phone text,
  revenue text,
  profit text,
  timeline text,
  industry text,
  location text,
  submission_stage text NOT NULL DEFAULT 'browse',
  submission_count integer NOT NULL DEFAULT 1,
  raw_inputs jsonb,
  source text DEFAULT 'deal-match-ai',
  status text NOT NULL DEFAULT 'new',
  excluded boolean NOT NULL DEFAULT false,
  not_a_fit boolean NOT NULL DEFAULT false,
  pushed_to_all_deals boolean NOT NULL DEFAULT false,
  pushed_listing_id uuid REFERENCES public.listings(id),
  deal_owner_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_match_tool_leads_website ON public.match_tool_leads (lower(website));
CREATE INDEX idx_match_tool_leads_email ON public.match_tool_leads (lower(email)) WHERE email IS NOT NULL;

CREATE TRIGGER set_match_tool_leads_updated_at
  BEFORE UPDATE ON public.match_tool_leads
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

ALTER TABLE public.match_tool_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage match tool leads"
  ON public.match_tool_leads FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.merge_match_tool_lead(
  p_website text,
  p_email text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_revenue text DEFAULT NULL,
  p_profit text DEFAULT NULL,
  p_timeline text DEFAULT NULL,
  p_submission_stage text DEFAULT 'browse',
  p_raw_inputs text DEFAULT NULL,
  p_source text DEFAULT 'deal-match-ai'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_raw jsonb;
BEGIN
  v_raw := CASE WHEN p_raw_inputs IS NOT NULL THEN p_raw_inputs::jsonb ELSE NULL END;

  INSERT INTO match_tool_leads (
    website, email, full_name, phone, revenue, profit,
    timeline, submission_stage, raw_inputs, source
  )
  VALUES (
    lower(trim(p_website)),
    NULLIF(trim(COALESCE(p_email, '')), ''),
    NULLIF(trim(COALESCE(p_full_name, '')), ''),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_revenue, '')), ''),
    NULLIF(trim(COALESCE(p_profit, '')), ''),
    NULLIF(trim(COALESCE(p_timeline, '')), ''),
    p_submission_stage,
    v_raw,
    COALESCE(p_source, 'deal-match-ai')
  )
  ON CONFLICT (lower(website)) DO UPDATE SET
    email = COALESCE(NULLIF(trim(COALESCE(p_email, '')), ''), match_tool_leads.email),
    full_name = COALESCE(NULLIF(trim(COALESCE(p_full_name, '')), ''), match_tool_leads.full_name),
    phone = COALESCE(NULLIF(trim(COALESCE(p_phone, '')), ''), match_tool_leads.phone),
    revenue = COALESCE(NULLIF(trim(COALESCE(p_revenue, '')), ''), match_tool_leads.revenue),
    profit = COALESCE(NULLIF(trim(COALESCE(p_profit, '')), ''), match_tool_leads.profit),
    timeline = COALESCE(NULLIF(trim(COALESCE(p_timeline, '')), ''), match_tool_leads.timeline),
    submission_stage = CASE
      WHEN p_submission_stage = 'full_form' THEN 'full_form'
      WHEN p_submission_stage = 'financials' AND match_tool_leads.submission_stage = 'browse' THEN 'financials'
      ELSE match_tool_leads.submission_stage
    END,
    raw_inputs = COALESCE(v_raw, match_tool_leads.raw_inputs),
    submission_count = match_tool_leads.submission_count + 1,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;