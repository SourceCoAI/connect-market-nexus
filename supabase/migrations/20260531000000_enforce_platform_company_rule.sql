-- Enforce Platform Company Rule: if pe_firm_name is set, buyer_type must be 'corporate' + is_pe_backed=true
-- This prevents operating companies under PE firms from being misclassified as 'private_equity'

-- 1. One-time fix: correct existing misclassified buyers
-- Only fix when pe_firm_name differs from company_name (i.e., the buyer is a portfolio
-- company under a PE firm, not the PE firm itself where pe_firm_name = company_name).
UPDATE public.buyers
SET
  buyer_type = 'corporate',
  is_pe_backed = true,
  updated_at = now()
WHERE buyer_type = 'private_equity'
  AND pe_firm_name IS NOT NULL
  AND pe_firm_name != ''
  AND LOWER(TRIM(pe_firm_name)) != LOWER(TRIM(company_name))
  AND (buyer_type_source IS NULL OR buyer_type_source != 'admin_manual');

-- 2. Trigger function to enforce the rule on all future writes
CREATE OR REPLACE FUNCTION enforce_platform_company_rule()
RETURNS TRIGGER AS $$
BEGIN
  -- If pe_firm_name is set AND differs from company_name, the buyer is a platform company.
  -- When pe_firm_name = company_name, the buyer IS the PE firm (self-reference is normal).
  IF NEW.pe_firm_name IS NOT NULL
     AND NEW.pe_firm_name != ''
     AND NEW.buyer_type = 'private_equity'
     AND LOWER(TRIM(NEW.pe_firm_name)) != LOWER(TRIM(NEW.company_name))
  THEN
    NEW.buyer_type := 'corporate';
    NEW.is_pe_backed := true;
  END IF;

  -- Also enforce when parent_pe_firm_id is set (always means it's a portfolio company)
  IF NEW.parent_pe_firm_id IS NOT NULL AND NEW.buyer_type = 'private_equity' THEN
    NEW.buyer_type := 'corporate';
    NEW.is_pe_backed := true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to buyers table
DROP TRIGGER IF EXISTS trg_enforce_platform_company_rule ON public.buyers;
CREATE TRIGGER trg_enforce_platform_company_rule
  BEFORE INSERT OR UPDATE ON public.buyers
  FOR EACH ROW
  EXECUTE FUNCTION enforce_platform_company_rule();
