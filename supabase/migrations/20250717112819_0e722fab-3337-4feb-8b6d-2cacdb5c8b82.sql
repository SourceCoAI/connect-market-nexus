
-- Phase 4.1: Performance Improvements - Add database indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_listings_status_created_at ON public.listings(status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_listings_category_status ON public.listings(category, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_listings_location_status ON public.listings(location, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_listings_revenue_range ON public.listings(revenue) WHERE status = 'active';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_listings_ebitda_range ON public.listings(ebitda) WHERE status = 'active';

-- Optimize connection requests queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_connection_requests_user_status ON public.connection_requests(user_id, status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_connection_requests_listing_status ON public.connection_requests(listing_id, status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_connection_requests_status_created ON public.connection_requests(status, created_at DESC);

-- Optimize saved listings queries  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_listings_user_created ON public.saved_listings(user_id, created_at DESC);

-- Optimize profiles queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_approval_status ON public.profiles(approval_status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_email_verified ON public.profiles(email_verified, approval_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_buyer_type ON public.profiles(buyer_type) WHERE approval_status = 'approved';

-- Optimize user activity tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_activity_user_type_created ON public.user_activity(user_id, activity_type, created_at DESC);

-- Phase 4.2: Data Integrity Enhancements - Add database-level constraints
ALTER TABLE public.listings 
ADD CONSTRAINT chk_listings_revenue_positive CHECK (revenue >= 0),
ADD CONSTRAINT chk_listings_ebitda_valid CHECK (ebitda >= -999999999), -- Allow negative EBITDA
ADD CONSTRAINT chk_listings_status_valid CHECK (status IN ('active', 'inactive', 'pending', 'sold'));

ALTER TABLE public.profiles
ADD CONSTRAINT chk_profiles_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
ADD CONSTRAINT chk_profiles_approval_status_valid CHECK (approval_status IN ('pending', 'approved', 'rejected')),
ADD CONSTRAINT chk_profiles_buyer_type_valid CHECK (buyer_type IN ('individual', 'corporate', 'fund', 'family_office'));

ALTER TABLE public.connection_requests
ADD CONSTRAINT chk_connection_requests_status_valid CHECK (status IN ('pending', 'approved', 'rejected'));

-- Add soft delete pattern to listings
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_listings_deleted_at ON public.listings(deleted_at) WHERE deleted_at IS NOT NULL;

-- Add soft delete pattern to profiles (for data retention compliance)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at) WHERE deleted_at IS NOT NULL;

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

-- Create unique index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_analytics_id ON public.listing_analytics(id);

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

-- Create unique index on user engagement analytics
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_engagement_analytics_id ON public.user_engagement_analytics(id);

-- Data validation triggers
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

-- Create function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.listing_analytics;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.user_engagement_analytics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
