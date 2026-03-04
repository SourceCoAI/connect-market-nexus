
CREATE OR REPLACE FUNCTION public.merge_valuation_lead(
  p_calculator_type TEXT,
  p_full_name TEXT,
  p_email TEXT,
  p_website TEXT DEFAULT NULL,
  p_business_name TEXT DEFAULT NULL,
  p_industry TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_revenue NUMERIC DEFAULT NULL,
  p_ebitda NUMERIC DEFAULT NULL,
  p_valuation_low NUMERIC DEFAULT NULL,
  p_valuation_mid NUMERIC DEFAULT NULL,
  p_valuation_high NUMERIC DEFAULT NULL,
  p_quality_tier TEXT DEFAULT NULL,
  p_quality_label TEXT DEFAULT NULL,
  p_buyer_lane TEXT DEFAULT NULL,
  p_growth_trend TEXT DEFAULT NULL,
  p_owner_dependency TEXT DEFAULT NULL,
  p_locations_count INT DEFAULT NULL,
  p_lead_source TEXT DEFAULT NULL,
  p_source_submission_id TEXT DEFAULT NULL,
  p_raw_calculator_inputs JSONB DEFAULT NULL,
  p_raw_valuation_results JSONB DEFAULT NULL,
  p_calculator_specific_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO valuation_leads (
    calculator_type, full_name, email, website, business_name,
    industry, region, location, revenue, ebitda,
    valuation_low, valuation_mid, valuation_high,
    quality_tier, quality_label, buyer_lane,
    growth_trend, owner_dependency, locations_count,
    lead_source, source_submission_id,
    raw_calculator_inputs, raw_valuation_results, calculator_specific_data,
    submission_count, updated_at
  ) VALUES (
    p_calculator_type, p_full_name, p_email, p_website, p_business_name,
    p_industry, p_region, p_location, p_revenue, p_ebitda,
    p_valuation_low, p_valuation_mid, p_valuation_high,
    p_quality_tier, p_quality_label, p_buyer_lane,
    p_growth_trend, p_owner_dependency, p_locations_count,
    p_lead_source, p_source_submission_id,
    p_raw_calculator_inputs, p_raw_valuation_results, p_calculator_specific_data,
    1, now()
  )
  ON CONFLICT (email, calculator_type) WHERE excluded = false AND email IS NOT NULL
  DO UPDATE SET
    full_name = EXCLUDED.full_name,
    website = COALESCE(EXCLUDED.website, valuation_leads.website),
    business_name = COALESCE(EXCLUDED.business_name, valuation_leads.business_name),
    industry = COALESCE(EXCLUDED.industry, valuation_leads.industry),
    region = COALESCE(EXCLUDED.region, valuation_leads.region),
    location = COALESCE(EXCLUDED.location, valuation_leads.location),
    revenue = COALESCE(EXCLUDED.revenue, valuation_leads.revenue),
    ebitda = COALESCE(EXCLUDED.ebitda, valuation_leads.ebitda),
    valuation_low = COALESCE(EXCLUDED.valuation_low, valuation_leads.valuation_low),
    valuation_mid = COALESCE(EXCLUDED.valuation_mid, valuation_leads.valuation_mid),
    valuation_high = COALESCE(EXCLUDED.valuation_high, valuation_leads.valuation_high),
    quality_tier = COALESCE(EXCLUDED.quality_tier, valuation_leads.quality_tier),
    quality_label = COALESCE(EXCLUDED.quality_label, valuation_leads.quality_label),
    buyer_lane = COALESCE(EXCLUDED.buyer_lane, valuation_leads.buyer_lane),
    growth_trend = COALESCE(EXCLUDED.growth_trend, valuation_leads.growth_trend),
    owner_dependency = COALESCE(EXCLUDED.owner_dependency, valuation_leads.owner_dependency),
    locations_count = COALESCE(EXCLUDED.locations_count, valuation_leads.locations_count),
    lead_source = CASE 
      WHEN EXCLUDED.lead_source = 'full_report' AND valuation_leads.lead_source = 'initial_unlock' 
      THEN 'full_report'
      ELSE COALESCE(EXCLUDED.lead_source, valuation_leads.lead_source)
    END,
    initial_unlock_at = CASE
      WHEN EXCLUDED.lead_source = 'full_report' AND valuation_leads.lead_source = 'initial_unlock'
      THEN valuation_leads.created_at
      ELSE valuation_leads.initial_unlock_at
    END,
    raw_calculator_inputs = EXCLUDED.raw_calculator_inputs,
    raw_valuation_results = EXCLUDED.raw_valuation_results,
    calculator_specific_data = COALESCE(EXCLUDED.calculator_specific_data, valuation_leads.calculator_specific_data),
    submission_count = COALESCE(valuation_leads.submission_count, 1) + 1,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
