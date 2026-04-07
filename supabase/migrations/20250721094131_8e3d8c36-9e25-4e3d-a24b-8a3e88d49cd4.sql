
-- Add indexes for better performance on user lookups and feedback queries
CREATE INDEX IF NOT EXISTS idx_feedback_messages_user_id_created_at ON public.feedback_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_status_priority ON public.feedback_messages(status, priority);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_category_created_at ON public.feedback_messages(category, created_at DESC);

-- Add conversation threading support
ALTER TABLE public.feedback_messages 
ADD COLUMN IF NOT EXISTS thread_id uuid DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS parent_message_id uuid REFERENCES public.feedback_messages(id),
ADD COLUMN IF NOT EXISTS is_internal_note boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS read_by_user boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS read_by_admin boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS satisfaction_rating integer CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5);

-- Create index for thread queries
CREATE INDEX IF NOT EXISTS idx_feedback_messages_thread_id ON public.feedback_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_parent_id ON public.feedback_messages(parent_message_id);

-- Update RLS policies to support conversation threading
DROP POLICY IF EXISTS "Users can view their own feedback messages" ON public.feedback_messages;
CREATE POLICY "Users can view their own feedback messages" 
ON public.feedback_messages 
FOR SELECT 
USING (auth.uid() = user_id OR (parent_message_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.feedback_messages parent 
  WHERE parent.id = parent_message_id AND parent.user_id = auth.uid()
)));

-- Create function to get user details for feedback
CREATE OR REPLACE FUNCTION public.get_feedback_with_user_details()
RETURNS TABLE (
  id uuid,
  message text,
  category text,
  priority text,
  status text,
  page_url text,
  user_agent text,
  admin_response text,
  thread_id uuid,
  parent_message_id uuid,
  is_internal_note boolean,
  attachments jsonb,
  read_by_user boolean,
  read_by_admin boolean,
  satisfaction_rating integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  user_id uuid,
  admin_id uuid,
  user_email text,
  user_first_name text,
  user_last_name text,
  user_company text,
  user_phone_number text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    fm.id,
    fm.message,
    fm.category,
    fm.priority,
    fm.status,
    fm.page_url,
    fm.user_agent,
    fm.admin_response,
    fm.thread_id,
    fm.parent_message_id,
    fm.is_internal_note,
    fm.attachments,
    fm.read_by_user,
    fm.read_by_admin,
    fm.satisfaction_rating,
    fm.created_at,
    fm.updated_at,
    fm.user_id,
    fm.admin_id,
    p.email as user_email,
    p.first_name as user_first_name,
    p.last_name as user_last_name,
    p.company as user_company,
    p.phone_number as user_phone_number
  FROM public.feedback_messages fm
  LEFT JOIN public.profiles p ON fm.user_id = p.id
  WHERE fm.deleted_at IS NULL OR fm.deleted_at IS NOT NULL
  ORDER BY fm.created_at DESC;
$$;

-- Grant execute permission to authenticated users and admins
GRANT EXECUTE ON FUNCTION public.get_feedback_with_user_details() TO authenticated;
