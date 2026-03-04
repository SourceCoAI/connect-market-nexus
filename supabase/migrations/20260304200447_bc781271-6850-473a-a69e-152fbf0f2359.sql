-- Normalize all auto-related calculator types to 'auto_shop'
UPDATE valuation_leads 
SET calculator_type = 'auto_shop', updated_at = now()
WHERE calculator_type IN ('collision', 'mechanical', 'specialty');