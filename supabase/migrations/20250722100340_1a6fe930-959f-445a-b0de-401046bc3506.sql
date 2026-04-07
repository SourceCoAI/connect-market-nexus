-- Fix the delete_user_completely function to handle all foreign key dependencies
CREATE OR REPLACE FUNCTION public.delete_user_completely(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Check if the calling user is an admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete users completely';
  END IF;
  
  -- Prevent self-deletion to avoid locking out all admins
  IF user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;
  
  -- Delete all related data first to avoid foreign key constraint violations
  
  -- Delete user sessions
  DELETE FROM public.user_sessions WHERE user_id = user_id;
  
  -- Delete user activity
  DELETE FROM public.user_activity WHERE user_id = user_id;
  
  -- Delete page views
  DELETE FROM public.page_views WHERE user_id = user_id;
  
  -- Delete user events
  DELETE FROM public.user_events WHERE user_id = user_id;
  
  -- Delete engagement scores
  DELETE FROM public.engagement_scores WHERE user_id = user_id;
  
  -- Delete listing analytics
  DELETE FROM public.listing_analytics WHERE user_id = user_id;
  
  -- Delete search analytics
  DELETE FROM public.search_analytics WHERE user_id = user_id;
  
  -- Delete saved listings
  DELETE FROM public.saved_listings WHERE user_id = user_id;
  
  -- Delete connection requests
  DELETE FROM public.connection_requests WHERE user_id = user_id;
  
  -- Delete feedback messages
  DELETE FROM public.feedback_messages WHERE user_id = user_id;
  
  -- Delete admin notifications
  DELETE FROM public.admin_notifications WHERE admin_id = user_id;
  
  -- Delete from profiles table
  DELETE FROM public.profiles WHERE id = user_id;
  
  -- Finally, delete from auth.users table
  DELETE FROM auth.users WHERE id = user_id;
  
  RETURN FOUND;
END;
$function$;