-- Security & reliability: replace hardcoded admin emails in RLS, add password reset tables

-- 1. Fix hardcoded admin emails in RLS policies
-- First, drop the problematic policy with hardcoded emails
DROP POLICY IF EXISTS "Admins can view all activity" ON public.user_activity;

-- Create new policy using the is_admin function instead of hardcoded emails
CREATE POLICY "Admins can view all activity" 
ON public.user_activity 
FOR SELECT 
USING (public.is_admin(auth.uid()));

-- 2. Add password reset functionality tables
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on password reset tokens
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Policy for password reset tokens (users can only access their own)
CREATE POLICY "Users can view own reset tokens" 
ON public.password_reset_tokens 
FOR SELECT 
USING (auth.uid() = user_id);

-- 3. Create audit log table for better tracking
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  old_data JSONB,
  new_data JSONB,
  user_id UUID REFERENCES auth.users(id),
  admin_id UUID REFERENCES auth.users(id),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB
);

-- Enable RLS on audit logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy for audit logs (only admins can view)
CREATE POLICY "Admins can view audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (public.is_admin(auth.uid()));

-- Policy for audit logs (only admins can insert)
CREATE POLICY "Admins can insert audit logs" 
ON public.audit_logs 
FOR INSERT 
WITH CHECK (public.is_admin(auth.uid()));

-- 4. Create function to generate secure reset tokens
CREATE OR REPLACE FUNCTION public.create_password_reset_token(user_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- 5. Create function to validate and use reset tokens
CREATE OR REPLACE FUNCTION public.validate_reset_token(token_value TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- 6. Create audit trigger function for user profile changes
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- Create trigger for profile changes audit
DROP TRIGGER IF EXISTS audit_profiles_trigger ON public.profiles;
CREATE TRIGGER audit_profiles_trigger
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_profile_changes();

-- 7. Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON public.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON public.password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON public.password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_profiles_approval_status ON public.profiles(approval_status);
CREATE INDEX IF NOT EXISTS idx_profiles_email_verified ON public.profiles(email_verified);
