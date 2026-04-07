-- Update handle_new_user function to support new buyer profile fields
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
    COALESCE(NEW.raw_user_meta_data->>'linkedin_profile', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
    COALESCE(NEW.raw_user_meta_data->>'buyer_type', 'corporate'),
    COALESCE(NEW.raw_user_meta_data->>'ideal_target_description', ''),
    CASE 
      WHEN NEW.raw_user_meta_data->'business_categories' IS NOT NULL 
      THEN NEW.raw_user_meta_data->'business_categories'::jsonb
      ELSE '[]'::jsonb
    END,
    COALESCE(NEW.raw_user_meta_data->>'target_locations', ''),
    CASE 
      WHEN NEW.raw_user_meta_data->>'revenue_range_min' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'revenue_range_min')::numeric
      ELSE NULL
    END,
    CASE 
      WHEN NEW.raw_user_meta_data->>'revenue_range_max' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'revenue_range_max')::numeric
      ELSE NULL
    END,
    COALESCE(NEW.raw_user_meta_data->>'specific_business_search', ''),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$;