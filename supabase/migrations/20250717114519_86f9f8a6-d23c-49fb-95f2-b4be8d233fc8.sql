
-- Add deleted_at column to listings table for soft delete functionality
ALTER TABLE public.listings 
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create soft delete function for listings
CREATE OR REPLACE FUNCTION public.soft_delete_listing(listing_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the calling user is an admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete listings';
  END IF;
  
  -- Soft delete the listing by setting deleted_at timestamp
  UPDATE public.listings 
  SET 
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = listing_id AND deleted_at IS NULL;
  
  RETURN FOUND;
END;
$$;

-- Create refresh analytics views function (placeholder for now)
CREATE OR REPLACE FUNCTION public.refresh_analytics_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Placeholder function for analytics view refresh
  -- This can be expanded later when analytics views are implemented
  RAISE NOTICE 'Analytics views refresh completed';
END;
$$;

-- Add deleted_at column to profiles table for consistency
ALTER TABLE public.profiles 
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create soft delete function for profiles
CREATE OR REPLACE FUNCTION public.soft_delete_profile(profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the calling user is an admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete profiles';
  END IF;
  
  -- Soft delete the profile by setting deleted_at timestamp
  UPDATE public.profiles 
  SET 
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = profile_id AND deleted_at IS NULL;
  
  RETURN FOUND;
END;
$$;
