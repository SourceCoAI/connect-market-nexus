-- Trigger to prevent approved users from changing their company name
-- This is a belt-and-suspenders protection on top of the PRIVILEGED_FIELDS blocklist in the frontend
CREATE OR REPLACE FUNCTION public.protect_company_on_approved_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only block if the user is already approved and company is being changed
  IF OLD.approval_status = 'approved'
     AND NEW.company IS DISTINCT FROM OLD.company THEN
    -- Allow if the caller is an admin (service_role or has admin role)
    IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' THEN
      RETURN NEW;
    END IF;
    
    -- Check if caller is an admin user
    IF EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
      RETURN NEW;
    END IF;
    
    RAISE EXCEPTION 'Company name cannot be changed after approval. Contact support@sourceco.com.';
  END IF;
  
  -- Same protection for buyer_type
  IF OLD.approval_status = 'approved'
     AND NEW.buyer_type IS DISTINCT FROM OLD.buyer_type THEN
    IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' THEN
      RETURN NEW;
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
      RETURN NEW;
    END IF;
    
    RAISE EXCEPTION 'Buyer type cannot be changed after approval. Contact support@sourceco.com.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop if exists to avoid duplicate trigger
DROP TRIGGER IF EXISTS protect_company_buyer_type_changes ON public.profiles;

CREATE TRIGGER protect_company_buyer_type_changes
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_company_on_approved_profile();