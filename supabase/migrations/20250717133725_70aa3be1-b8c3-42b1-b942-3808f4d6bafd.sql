-- Fix foreign key constraint issue for user deletion
-- Drop the existing foreign key constraint that prevents user deletion
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

-- Add a new foreign key constraint with CASCADE delete to automatically remove audit logs when user is deleted
ALTER TABLE public.audit_logs 
ADD CONSTRAINT audit_logs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) 
ON DELETE CASCADE;