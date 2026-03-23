-- Create the permission_audit_log table referenced by assign_role_for_invite RPC
CREATE TABLE IF NOT EXISTS public.permission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  old_role app_role,
  new_role app_role NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY "Admins can read audit log"
ON public.permission_audit_log
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Allow insert via service role / security definer functions (no direct user inserts needed)
-- The assign_role_for_invite function is SECURITY DEFINER so it bypasses RLS

-- Index for lookups by target user
CREATE INDEX idx_permission_audit_log_target ON public.permission_audit_log(target_user_id);
CREATE INDEX idx_permission_audit_log_created ON public.permission_audit_log(created_at DESC);