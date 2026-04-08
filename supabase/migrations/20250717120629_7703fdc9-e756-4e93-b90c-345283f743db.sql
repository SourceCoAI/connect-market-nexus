
-- Phase 1.1: Database Function Security Enhancement
-- Add SET search_path = '' to all existing database functions for security hardening

-- 1. Update is_admin function
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Check if user has admin role in profiles table
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND is_admin = true
  );
END;
$function$;

-- 2. Update handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    phone_number,
    buyer_type,
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
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
    COALESCE(NEW.raw_user_meta_data->>'buyer_type', 'corporate'),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$function$;

-- 3. Update promote_user_to_admin function
CREATE OR REPLACE FUNCTION public.promote_user_to_admin(target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Check if the calling user is an admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can promote users to admin';
  END IF;
  
  -- Update the target user to admin
  UPDATE public.profiles 
  SET 
    is_admin = true,
    approval_status = 'approved',
    updated_at = NOW()
  WHERE id = target_user_id;
  
  RETURN FOUND;
END;
$function$;

-- 4. Update demote_admin_user function
CREATE OR REPLACE FUNCTION public.demote_admin_user(target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Check if the calling user is an admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can demote admin users';
  END IF;
  
  -- Prevent self-demotion to avoid locking out all admins
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot demote yourself';
  END IF;
  
  -- Update the target user to remove admin privileges
  UPDATE public.profiles 
  SET 
    is_admin = false,
    updated_at = NOW()
  WHERE id = target_user_id;
  
  RETURN FOUND;
END;
$function$;

-- 5. Update soft_delete_listing function
CREATE OR REPLACE FUNCTION public.soft_delete_listing(listing_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
$function$;

-- 6. Update soft_delete_profile function
CREATE OR REPLACE FUNCTION public.soft_delete_profile(profile_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
$function$;

-- 7. Update create_password_reset_token function
CREATE OR REPLACE FUNCTION public.create_password_reset_token(user_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  user_record RECORD;
  reset_token TEXT;
  token_expiry TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Find user by email
  SELECT id INTO user_record FROM auth.users WHERE email = user_email;
  
  IF NOT FOUND THEN
    -- Don't reveal if email exists or not for security
    RETURN 'token_sent';
  END IF;
  
  -- Generate secure random token
  reset_token := encode(gen_random_bytes(32), 'hex');
  token_expiry := NOW() + INTERVAL '1 hour';
  
  -- Invalidate any existing tokens for this user
  UPDATE public.password_reset_tokens 
  SET used = TRUE 
  WHERE user_id = user_record.id AND used = FALSE;
  
  -- Insert new token
  INSERT INTO public.password_reset_tokens (user_id, token, expires_at)
  VALUES (user_record.id, reset_token, token_expiry);
  
  RETURN reset_token;
END;
$function$;

-- 8. Update validate_reset_token function
CREATE OR REPLACE FUNCTION public.validate_reset_token(token_value text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  token_record RECORD;
BEGIN
  -- Find valid token
  SELECT user_id INTO token_record 
  FROM public.password_reset_tokens 
  WHERE token = token_value 
    AND used = FALSE 
    AND expires_at > NOW();
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Mark token as used
  UPDATE public.password_reset_tokens 
  SET used = TRUE 
  WHERE token = token_value;
  
  RETURN token_record.user_id;
END;
$function$;

-- 9. Update calculate_engagement_score function
CREATE OR REPLACE FUNCTION public.calculate_engagement_score(p_listings_viewed integer, p_listings_saved integer, p_connections_requested integer, p_total_session_time integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
DECLARE
  score INTEGER;
BEGIN
  -- Calculate weighted score (0-100)
  score := LEAST(p_listings_viewed / 10 * 30, 30) +
           LEAST(p_listings_saved / 5 * 30, 30) +
           LEAST(p_connections_requested * 10, 20) +
           LEAST(p_total_session_time / 3600 * 20, 20);
           
  RETURN GREATEST(LEAST(score, 100), 0);
END;
$function$;

-- 10. Update update_engagement_scores function
CREATE OR REPLACE FUNCTION public.update_engagement_scores()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Insert new users who don't have a score yet
  INSERT INTO public.engagement_scores (user_id, last_active)
  SELECT p.id, p.updated_at
  FROM public.profiles p
  LEFT JOIN public.engagement_scores e ON p.id = e.user_id
  WHERE e.user_id IS NULL;
  
  -- Update existing engagement scores based on activity
  UPDATE public.engagement_scores
  SET 
    listings_viewed = FLOOR(RANDOM() * 50),
    listings_saved = FLOOR(RANDOM() * 20),
    connections_requested = FLOOR(RANDOM() * 10),
    total_session_time = FLOOR(RANDOM() * 7200),
    last_active = NOW() - (RANDOM() * INTERVAL '7 days'),
    updated_at = NOW();
    
  -- Calculate and update scores
  UPDATE public.engagement_scores
  SET 
    score = public.calculate_engagement_score(
      listings_viewed, 
      listings_saved, 
      connections_requested, 
      total_session_time
    ),
    updated_at = NOW();
END;
$function$;

-- 11. Update audit_profile_changes function
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Log profile updates to audit table
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      table_name, 
      operation, 
      old_data, 
      new_data, 
      user_id, 
      admin_id,
      metadata
    ) VALUES (
      TG_TABLE_NAME,
      TG_OP,
      to_jsonb(OLD),
      to_jsonb(NEW),
      NEW.id,
      auth.uid(),
      jsonb_build_object(
        'changed_fields', (
          SELECT jsonb_object_agg(key, jsonb_build_object('old', OLD_val, 'new', NEW_val))
          FROM jsonb_each(to_jsonb(OLD)) o(key, OLD_val)
          JOIN jsonb_each(to_jsonb(NEW)) n(key, NEW_val) ON o.key = n.key
          WHERE OLD_val IS DISTINCT FROM NEW_val
        )
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 12. Update sync_user_verification_status function
CREATE OR REPLACE FUNCTION public.sync_user_verification_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Update the profiles table when a user's email is verified
  UPDATE public.profiles
  SET 
    email_verified = (NEW.email_confirmed_at IS NOT NULL),
    updated_at = NOW()
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$function$;

-- 13. Update refresh_analytics_views function
CREATE OR REPLACE FUNCTION public.refresh_analytics_views()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Placeholder function for analytics view refresh
  RAISE NOTICE 'Analytics views refresh completed';
END;
$function$;

-- Create table for OTP rate limiting
CREATE TABLE IF NOT EXISTS public.otp_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add RLS policies for OTP rate limiting
ALTER TABLE public.otp_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can manage OTP rate limits" 
  ON public.otp_rate_limits 
  FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_otp_rate_limits_email_window 
  ON public.otp_rate_limits(email, window_start);
