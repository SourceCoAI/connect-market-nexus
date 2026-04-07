
-- Phase 4 Recovery: Add missing database changes without concurrent operations

-- Add soft delete columns that are missing
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;

-- Add data integrity constraints
ALTER TABLE public.listings 
ADD CONSTRAINT IF NOT EXISTS chk_listings_revenue_positive CHECK (revenue >= 0),
ADD CONSTRAINT IF NOT EXISTS chk_listings_ebitda_valid CHECK (ebitda >= -999999999),
ADD CONSTRAINT IF NOT EXISTS chk_listings_status_valid CHECK (status IN ('active', 'inactive', 'pending', 'sold'));

ALTER TABLE public.profiles
ADD CONSTRAINT IF NOT EXISTS chk_profiles_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
ADD CONSTRAINT IF NOT EXISTS chk_profiles_approval_status_valid CHECK (approval_status IN ('pending', 'approved', 'rejected')),
ADD CONSTRAINT IF NOT EXISTS chk_profiles_buyer_type_valid CHECK (buyer_type IN ('individual', 'corporate', 'fund', 'family_office'));

ALTER TABLE public.connection_requests
ADD CONSTRAINT IF NOT EXISTS chk_connection_requests_status_valid CHECK (status IN ('pending', 'approved', 'rejected'));

-- Create data validation function and trigger
CREATE OR REPLACE FUNCTION validate_listing_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure revenue is reasonable (between $1K and $1B)
  IF NEW.revenue < 1000 OR NEW.revenue > 1000000000 THEN
    RAISE EXCEPTION 'Revenue must be between $1,000 and $1,000,000,000';
  END IF;
  
  -- Ensure EBITDA is reasonable relative to revenue
  IF NEW.ebitda > NEW.revenue * 2 THEN
    RAISE EXCEPTION 'EBITDA cannot exceed 200%% of revenue';
  END IF;
  
  -- Validate title length
  IF LENGTH(NEW.title) < 5 OR LENGTH(NEW.title) > 200 THEN
    RAISE EXCEPTION 'Title must be between 5 and 200 characters';
  END IF;
  
  -- Validate description length
  IF LENGTH(NEW.description) < 20 OR LENGTH(NEW.description) > 5000 THEN
    RAISE EXCEPTION 'Description must be between 20 and 5000 characters';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for listing validation
DROP TRIGGER IF EXISTS trigger_validate_listing_data ON public.listings;
CREATE TRIGGER trigger_validate_listing_data
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION validate_listing_data();

-- Create function for soft delete listings
CREATE OR REPLACE FUNCTION soft_delete_listing(listing_id UUID)
RETURNS boolean AS $$
BEGIN
  -- Only admins can soft delete listings
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete listings';
  END IF;
  
  UPDATE public.listings 
  SET 
    deleted_at = NOW(),
    status = 'inactive',
    updated_at = NOW()
  WHERE id = listing_id AND deleted_at IS NULL;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for soft delete profiles (GDPR compliance)
CREATE OR REPLACE FUNCTION soft_delete_profile(profile_id UUID)
RETURNS boolean AS $$
BEGIN
  -- Only admins or the user themselves can soft delete profiles
  IF NOT (public.is_admin(auth.uid()) OR auth.uid() = profile_id) THEN
    RAISE EXCEPTION 'Unauthorized to delete this profile';
  END IF;
  
  UPDATE public.profiles 
  SET 
    deleted_at = NOW(),
    email = 'deleted_' || id || '@example.com',
    first_name = 'Deleted',
    last_name = 'User',
    updated_at = NOW()
  WHERE id = profile_id AND deleted_at IS NULL;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create materialized view for analytics performance
CREATE MATERIALIZED VIEW IF NOT EXISTS public.listing_analytics AS
SELECT 
  l.id,
  l.title,
  l.category,
  l.location,
  l.revenue,
  l.ebitda,
  l.status,
  l.created_at,
  COUNT(DISTINCT sl.user_id) as save_count,
  COUNT(DISTINCT cr.user_id) as connection_request_count,
  AVG(CASE WHEN cr.status = 'approved' THEN 1.0 ELSE 0.0 END) as approval_rate
FROM public.listings l
LEFT JOIN public.saved_listings sl ON l.id = sl.listing_id
LEFT JOIN public.connection_requests cr ON l.id = cr.listing_id
WHERE l.deleted_at IS NULL
GROUP BY l.id, l.title, l.category, l.location, l.revenue, l.ebitda, l.status, l.created_at;

-- Create user engagement analytics materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS public.user_engagement_analytics AS
SELECT 
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  p.buyer_type,
  p.approval_status,
  p.created_at,
  COUNT(DISTINCT sl.listing_id) as listings_saved,
  COUNT(DISTINCT cr.listing_id) as connection_requests_made,
  COUNT(DISTINCT CASE WHEN cr.status = 'approved' THEN cr.id END) as approved_connections,
  MAX(ua.created_at) as last_activity_at
FROM public.profiles p
LEFT JOIN public.saved_listings sl ON p.id = sl.user_id
LEFT JOIN public.connection_requests cr ON p.id = cr.user_id
LEFT JOIN public.user_activity ua ON p.id = ua.user_id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.email, p.first_name, p.last_name, p.buyer_type, p.approval_status, p.created_at;

-- Create function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.listing_analytics;
  REFRESH MATERIALIZED VIEW public.user_engagement_analytics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies to respect soft deletes
DROP POLICY IF EXISTS "Approved users can view listings" ON public.listings;
CREATE POLICY "Approved users can view active listings" 
  ON public.listings 
  FOR SELECT 
  USING (
    deleted_at IS NULL 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND approval_status = 'approved' 
      AND email_verified = true
      AND deleted_at IS NULL
    )
  );

-- Grant permissions for materialized view refresh
GRANT EXECUTE ON FUNCTION refresh_analytics_views() TO authenticated;
GRANT SELECT ON public.listing_analytics TO authenticated;
GRANT SELECT ON public.user_engagement_analytics TO authenticated;
