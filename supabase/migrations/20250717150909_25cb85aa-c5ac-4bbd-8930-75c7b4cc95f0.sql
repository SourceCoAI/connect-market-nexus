
-- Create function to completely delete a user from both profiles and auth.users
CREATE OR REPLACE FUNCTION public.delete_user_completely(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Check if the calling user is an admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete users completely';
  END IF;
  
  -- Prevent self-deletion to avoid locking out all admins
  IF user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;
  
  -- Delete from profiles table first (due to foreign key constraints)
  DELETE FROM public.profiles WHERE id = user_id;
  
  -- Delete from auth.users table
  DELETE FROM auth.users WHERE id = user_id;
  
  RETURN FOUND;
END;
$$;
