ALTER TABLE valuation_leads DROP CONSTRAINT IF EXISTS chk_calculator_type;
ALTER TABLE valuation_leads ADD CONSTRAINT chk_calculator_type 
  CHECK (calculator_type = ANY(ARRAY[
    'general','auto_shop','hvac','collision','dental','plumbing',
    'electrical','landscaping','pest_control','specialty','mechanical'
  ]));