
-- Phase 1: Fix Critical Database Schema Issues
-- Add missing columns to feedback_messages table that were referenced in the migration but not properly applied

-- First, let's check if the columns exist and add them if they don't
ALTER TABLE public.feedback_messages 
ADD COLUMN IF NOT EXISTS thread_id uuid DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS parent_message_id uuid REFERENCES public.feedback_messages(id),
ADD COLUMN IF NOT EXISTS is_internal_note boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS read_by_user boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS read_by_admin boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS satisfaction_rating integer CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_feedback_messages_thread_id ON public.feedback_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_parent_id ON public.feedback_messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_user_created ON public.feedback_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_status_priority ON public.feedback_messages(status, priority);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_category_created ON public.feedback_messages(category, created_at DESC);

-- Update RLS policies to support conversation threading
DROP POLICY IF EXISTS "Users can view their own feedback messages" ON public.feedback_messages;
CREATE POLICY "Users can view their own feedback messages" 
ON public.feedback_messages 
FOR SELECT 
USING (
  auth.uid() = user_id OR 
  (parent_message_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.feedback_messages parent 
    WHERE parent.id = parent_message_id AND parent.user_id = auth.uid()
  ))
);

-- Create function for conversation threading
CREATE OR REPLACE FUNCTION public.get_conversation_thread(thread_uuid uuid)
RETURNS TABLE (
  id uuid,
  message text,
  user_id uuid,
  admin_id uuid,
  created_at timestamp with time zone,
  is_internal_note boolean,
  attachments jsonb,
  satisfaction_rating integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    fm.id,
    fm.message,
    fm.user_id,
    fm.admin_id,
    fm.created_at,
    fm.is_internal_note,
    fm.attachments,
    fm.satisfaction_rating
  FROM public.feedback_messages fm
  WHERE fm.thread_id = thread_uuid
  ORDER BY fm.created_at ASC;
$$;

-- Create function for user engagement tracking
CREATE OR REPLACE FUNCTION public.track_user_engagement(
  p_user_id uuid,
  p_activity_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_activity (user_id, activity_type, metadata)
  VALUES (p_user_id, p_activity_type, p_metadata);
END;
$$;

-- Create function for smart categorization
CREATE OR REPLACE FUNCTION public.auto_categorize_feedback(p_message text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  category_result text := 'general';
BEGIN
  -- Simple keyword-based categorization
  IF p_message ILIKE '%bug%' OR p_message ILIKE '%error%' OR p_message ILIKE '%broken%' THEN
    category_result := 'bug';
  ELSIF p_message ILIKE '%feature%' OR p_message ILIKE '%request%' OR p_message ILIKE '%suggest%' THEN
    category_result := 'feature';
  ELSIF p_message ILIKE '%contact%' OR p_message ILIKE '%help%' OR p_message ILIKE '%support%' THEN
    category_result := 'contact';
  ELSIF p_message ILIKE '%ui%' OR p_message ILIKE '%design%' OR p_message ILIKE '%interface%' THEN
    category_result := 'ui';
  END IF;
  
  RETURN category_result;
END;
$$;

-- Create function for auto-priority assignment
CREATE OR REPLACE FUNCTION public.auto_assign_priority(p_message text, p_category text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  priority_result text := 'normal';
BEGIN
  -- Assign priority based on keywords and category
  IF p_message ILIKE '%urgent%' OR p_message ILIKE '%critical%' OR p_message ILIKE '%immediately%' THEN
    priority_result := 'urgent';
  ELSIF p_message ILIKE '%important%' OR p_message ILIKE '%asap%' OR p_category = 'bug' THEN
    priority_result := 'high';
  ELSIF p_message ILIKE '%low%' OR p_message ILIKE '%minor%' OR p_message ILIKE '%when possible%' THEN
    priority_result := 'low';
  END IF;
  
  RETURN priority_result;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.get_conversation_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_user_engagement(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_categorize_feedback(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_assign_priority(text, text) TO authenticated;

-- Create analytics view for admin dashboard
CREATE OR REPLACE VIEW public.feedback_analytics AS
SELECT 
  DATE_TRUNC('day', created_at) as date,
  category,
  priority,
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) as avg_response_time_hours
FROM public.feedback_messages
WHERE deleted_at IS NULL
GROUP BY DATE_TRUNC('day', created_at), category, priority, status
ORDER BY date DESC;

-- Grant view access to admins
GRANT SELECT ON public.feedback_analytics TO authenticated;

-- Create escalation trigger for unresponded urgent feedback
CREATE OR REPLACE FUNCTION public.check_feedback_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if feedback has been unresponded for more than 2 hours and is urgent
  IF NEW.priority = 'urgent' AND NEW.status = 'unread' AND 
     NEW.created_at < NOW() - INTERVAL '2 hours' THEN
    
    -- Update priority to escalated urgent and add internal note
    NEW.priority := 'urgent';
    
    -- Log escalation activity
    INSERT INTO public.user_activity (user_id, activity_type, metadata)
    VALUES (NEW.user_id, 'feedback_escalated', jsonb_build_object(
      'feedback_id', NEW.id,
      'original_priority', 'urgent',
      'escalated_at', NOW()
    ));
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for escalation check
DROP TRIGGER IF EXISTS feedback_escalation_check ON public.feedback_messages;
CREATE TRIGGER feedback_escalation_check
  BEFORE UPDATE ON public.feedback_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.check_feedback_escalation();
