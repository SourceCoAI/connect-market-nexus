
-- Fix deal source constraints to include all existing values + match_tool
ALTER TABLE public.deal_pipeline DROP CONSTRAINT IF EXISTS deals_source_check;
ALTER TABLE public.deal_pipeline ADD CONSTRAINT deals_source_check CHECK (source IN ('manual', 'marketplace', 'webflow', 'salesforce', 'valuation_calculator', 'valuation_lead', 'smartlead', 'gp_partners', 'sourceco', 'captarget', 'match_tool', 'website', 'referral', 'salesforce_remarketing'));

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS deals_source_check;
ALTER TABLE public.listings ADD CONSTRAINT deals_source_check CHECK (deal_source IN ('manual', 'marketplace', 'webflow', 'salesforce', 'valuation_calculator', 'valuation_lead', 'smartlead', 'gp_partners', 'sourceco', 'captarget', 'match_tool', 'website', 'referral', 'salesforce_remarketing'));
