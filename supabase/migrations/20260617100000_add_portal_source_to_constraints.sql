-- Add 'portal' as a valid source value for connection_requests and deal_pipeline.
-- Required by the Client Portal "Convert to Pipeline Deal" flow which creates
-- connection requests with source = 'portal'.
--
-- This migration ONLY modifies CHECK constraints (not table structure).

-- ── connection_requests.source ───────────────────────────────────────
ALTER TABLE public.connection_requests DROP CONSTRAINT IF EXISTS check_valid_source;
ALTER TABLE public.connection_requests
ADD CONSTRAINT check_valid_source
CHECK (
  source IN (
    'marketplace', 'webflow', 'manual', 'import', 'api',
    'website', 'referral', 'cold_outreach', 'networking',
    'linkedin', 'email', 'portal'
  )
);

-- ── deal_pipeline.source ─────────────────────────────────────────────
ALTER TABLE public.deal_pipeline DROP CONSTRAINT IF EXISTS deals_source_check;
ALTER TABLE public.deal_pipeline
ADD CONSTRAINT deals_source_check
CHECK (
  source IN (
    'manual', 'marketplace', 'webflow', 'salesforce',
    'valuation_calculator', 'valuation_lead', 'smartlead',
    'gp_partners', 'sourceco', 'captarget', 'match_tool',
    'website', 'referral', 'salesforce_remarketing', 'portal'
  )
);
