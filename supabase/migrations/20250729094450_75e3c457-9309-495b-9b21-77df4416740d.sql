-- Data Recovery and Field Mapping Fix
-- Step 1: Update handle_new_user function to properly map camelCase to snake_case for Search Fund and Individual buyers

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    email_verified,
    approval_status,
    is_admin,
    company,
    website,
    linkedin_profile,
    phone_number,
    buyer_type,
    ideal_target_description,
    business_categories,
    target_locations,
    revenue_range_min,
    revenue_range_max,
    specific_business_search,
    estimated_revenue,
    fund_size,
    investment_size,
    aum,
    is_funded,
    funded_by,
    target_company_size,
    funding_source,
    needs_loan,
    ideal_target,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email_confirmed_at IS NOT NULL,
    'pending',
    FALSE,
    COALESCE(NEW.raw_user_meta_data->>'company', ''),
    COALESCE(NEW.raw_user_meta_data->>'website', ''),
    COALESCE(NEW.raw_user_meta_data->>'linkedin_profile', COALESCE(NEW.raw_user_meta_data->>'linkedinProfile', '')),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', COALESCE(NEW.raw_user_meta_data->>'phoneNumber', '')),
    COALESCE(NEW.raw_user_meta_data->>'buyer_type', COALESCE(NEW.raw_user_meta_data->>'buyerType', 'corporate')),
    COALESCE(NEW.raw_user_meta_data->>'ideal_target_description', COALESCE(NEW.raw_user_meta_data->>'idealTargetDescription', '')),
    CASE 
      WHEN NEW.raw_user_meta_data->>'business_categories' IS NOT NULL 
        AND NEW.raw_user_meta_data->>'business_categories' != ''
        AND NEW.raw_user_meta_data->>'business_categories' != '[]'
      THEN 
        CASE 
          WHEN jsonb_typeof((NEW.raw_user_meta_data->>'business_categories')::jsonb) = 'array'
          THEN (NEW.raw_user_meta_data->>'business_categories')::jsonb
          ELSE '[]'::jsonb
        END
      WHEN NEW.raw_user_meta_data->>'businessCategories' IS NOT NULL 
        AND NEW.raw_user_meta_data->>'businessCategories' != ''
        AND NEW.raw_user_meta_data->>'businessCategories' != '[]'
      THEN 
        CASE 
          WHEN jsonb_typeof((NEW.raw_user_meta_data->>'businessCategories')::jsonb) = 'array'
          THEN (NEW.raw_user_meta_data->>'businessCategories')::jsonb
          ELSE '[]'::jsonb
        END
      ELSE '[]'::jsonb
    END,
    COALESCE(NEW.raw_user_meta_data->>'target_locations', COALESCE(NEW.raw_user_meta_data->>'targetLocations', '')),
    CASE 
      WHEN NEW.raw_user_meta_data->>'revenue_range_min' IS NOT NULL 
        AND NEW.raw_user_meta_data->>'revenue_range_min' != ''
      THEN 
        CASE 
          WHEN NEW.raw_user_meta_data->>'revenue_range_min' ~ '^[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?$'
          THEN (NEW.raw_user_meta_data->>'revenue_range_min')::numeric
          ELSE NULL
        END
      WHEN NEW.raw_user_meta_data->>'revenueRangeMin' IS NOT NULL 
        AND NEW.raw_user_meta_data->>'revenueRangeMin' != ''
      THEN 
        CASE 
          WHEN NEW.raw_user_meta_data->>'revenueRangeMin' ~ '^[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?$'
          THEN (NEW.raw_user_meta_data->>'revenueRangeMin')::numeric
          ELSE NULL
        END
      ELSE NULL
    END,
    CASE 
      WHEN NEW.raw_user_meta_data->>'revenue_range_max' IS NOT NULL 
        AND NEW.raw_user_meta_data->>'revenue_range_max' != ''
      THEN 
        CASE 
          WHEN NEW.raw_user_meta_data->>'revenue_range_max' ~ '^[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?$'
          THEN (NEW.raw_user_meta_data->>'revenue_range_max')::numeric
          ELSE NULL
        END
      WHEN NEW.raw_user_meta_data->>'revenueRangeMax' IS NOT NULL 
        AND NEW.raw_user_meta_data->>'revenueRangeMax' != ''
      THEN 
        CASE 
          WHEN NEW.raw_user_meta_data->>'revenueRangeMax' ~ '^[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?$'
          THEN (NEW.raw_user_meta_data->>'revenueRangeMax')::numeric
          ELSE NULL
        END
      ELSE NULL
    END,
    COALESCE(NEW.raw_user_meta_data->>'specific_business_search', COALESCE(NEW.raw_user_meta_data->>'specificBusinessSearch', '')),
    COALESCE(NEW.raw_user_meta_data->>'estimated_revenue', COALESCE(NEW.raw_user_meta_data->>'estimatedRevenue', '')),
    COALESCE(NEW.raw_user_meta_data->>'fund_size', COALESCE(NEW.raw_user_meta_data->>'fundSize', '')),
    COALESCE(NEW.raw_user_meta_data->>'investment_size', COALESCE(NEW.raw_user_meta_data->>'investmentSize', '')),
    COALESCE(NEW.raw_user_meta_data->>'aum', ''),
    -- Search Fund specific fields - map camelCase to snake_case
    COALESCE(NEW.raw_user_meta_data->>'is_funded', COALESCE(NEW.raw_user_meta_data->>'isFunded', '')),
    COALESCE(NEW.raw_user_meta_data->>'funded_by', COALESCE(NEW.raw_user_meta_data->>'fundedBy', '')),
    COALESCE(NEW.raw_user_meta_data->>'target_company_size', COALESCE(NEW.raw_user_meta_data->>'targetCompanySize', '')),
    -- Individual buyer specific fields - map camelCase to snake_case
    COALESCE(NEW.raw_user_meta_data->>'funding_source', COALESCE(NEW.raw_user_meta_data->>'fundingSource', '')),
    COALESCE(NEW.raw_user_meta_data->>'needs_loan', COALESCE(NEW.raw_user_meta_data->>'needsLoan', '')),
    COALESCE(NEW.raw_user_meta_data->>'ideal_target', COALESCE(NEW.raw_user_meta_data->>'idealTarget', '')),
    NOW(),
    NOW()
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but still return NEW to allow user creation
  RAISE WARNING 'Error in handle_new_user: %, SQLSTATE: %', SQLERRM, SQLSTATE;
  -- Create a minimal profile record as fallback
  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    email_verified,
    approval_status,
    is_admin,
    buyer_type,
    business_categories,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email_confirmed_at IS NOT NULL,
    'pending',
    FALSE,
    'corporate',
    '[]'::jsonb,
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$;

-- Step 2: Historical Data Recovery - Update existing users with their data from raw_user_meta_data
UPDATE public.profiles 
SET 
  is_funded = COALESCE(
    (SELECT raw_user_meta_data->>'is_funded' FROM auth.users WHERE id = profiles.id),
    (SELECT raw_user_meta_data->>'isFunded' FROM auth.users WHERE id = profiles.id)
  ),
  funded_by = COALESCE(
    (SELECT raw_user_meta_data->>'funded_by' FROM auth.users WHERE id = profiles.id),
    (SELECT raw_user_meta_data->>'fundedBy' FROM auth.users WHERE id = profiles.id)
  ),
  target_company_size = COALESCE(
    (SELECT raw_user_meta_data->>'target_company_size' FROM auth.users WHERE id = profiles.id),
    (SELECT raw_user_meta_data->>'targetCompanySize' FROM auth.users WHERE id = profiles.id)
  ),
  funding_source = COALESCE(
    (SELECT raw_user_meta_data->>'funding_source' FROM auth.users WHERE id = profiles.id),
    (SELECT raw_user_meta_data->>'fundingSource' FROM auth.users WHERE id = profiles.id)
  ),
  needs_loan = COALESCE(
    (SELECT raw_user_meta_data->>'needs_loan' FROM auth.users WHERE id = profiles.id),
    (SELECT raw_user_meta_data->>'needsLoan' FROM auth.users WHERE id = profiles.id)
  ),
  ideal_target = COALESCE(
    (SELECT raw_user_meta_data->>'ideal_target' FROM auth.users WHERE id = profiles.id),
    (SELECT raw_user_meta_data->>'idealTarget' FROM auth.users WHERE id = profiles.id)
  ),
  updated_at = NOW()
WHERE buyer_type IN ('searchFund', 'individual');