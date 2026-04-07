-- CRITICAL FIX: Create proper foreign key relationships and storage setup

-- Add foreign key constraint between feedback_messages and profiles
ALTER TABLE public.feedback_messages 
ADD CONSTRAINT feedback_messages_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraint for admin_id to profiles
ALTER TABLE public.feedback_messages 
ADD CONSTRAINT feedback_messages_admin_id_fkey 
FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create storage bucket for feedback attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-attachments', 
  'feedback-attachments', 
  true, 
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- Create storage policies for feedback attachments
CREATE POLICY "Users can upload feedback attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'feedback-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view feedback attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'feedback-attachments' AND
  (
    auth.uid()::text = (storage.foldername(name))[1] OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  )
);

CREATE POLICY "Admins can manage all feedback attachments"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'feedback-attachments' AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Create enhanced feedback analytics function
CREATE OR REPLACE FUNCTION public.get_feedback_analytics(
  days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_feedback BIGINT,
  unread_count BIGINT,
  avg_response_time_hours NUMERIC,
  satisfaction_avg NUMERIC,
  category_breakdown JSONB,
  priority_breakdown JSONB,
  daily_trends JSONB,
  top_users JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date TIMESTAMP := NOW() - (days_back || ' days')::INTERVAL;
BEGIN
  -- Get basic metrics
  SELECT COUNT(*) INTO total_feedback
  FROM feedback_messages
  WHERE created_at >= start_date;
  
  SELECT COUNT(*) INTO unread_count
  FROM feedback_messages
  WHERE status = 'unread' AND created_at >= start_date;
  
  -- Calculate average response time
  SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) INTO avg_response_time_hours
  FROM feedback_messages
  WHERE admin_response IS NOT NULL 
    AND updated_at > created_at 
    AND created_at >= start_date;
  
  -- Calculate satisfaction average
  SELECT AVG(satisfaction_rating) INTO satisfaction_avg
  FROM feedback_messages
  WHERE satisfaction_rating IS NOT NULL AND created_at >= start_date;
  
  -- Category breakdown
  SELECT jsonb_object_agg(category, cnt) INTO category_breakdown
  FROM (
    SELECT category, COUNT(*) as cnt
    FROM feedback_messages
    WHERE created_at >= start_date
    GROUP BY category
  ) t;
  
  -- Priority breakdown
  SELECT jsonb_object_agg(priority, cnt) INTO priority_breakdown
  FROM (
    SELECT priority, COUNT(*) as cnt
    FROM feedback_messages
    WHERE created_at >= start_date
    GROUP BY priority
  ) t;
  
  -- Daily trends
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', date_trunc('day', created_at)::DATE,
      'count', COUNT(*),
      'avg_response_time', AVG(
        CASE WHEN admin_response IS NOT NULL AND updated_at > created_at
        THEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600
        ELSE NULL END
      )
    ) ORDER BY date_trunc('day', created_at)
  ) INTO daily_trends
  FROM feedback_messages
  WHERE created_at >= start_date
  GROUP BY date_trunc('day', created_at);
  
  -- Top users by feedback volume
  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id', user_id,
      'feedback_count', cnt,
      'avg_rating', avg_rating
    ) ORDER BY cnt DESC
  ) INTO top_users
  FROM (
    SELECT 
      user_id,
      COUNT(*) as cnt,
      AVG(satisfaction_rating) as avg_rating
    FROM feedback_messages
    WHERE created_at >= start_date AND user_id IS NOT NULL
    GROUP BY user_id
    ORDER BY cnt DESC
    LIMIT 10
  ) t;
  
  RETURN QUERY SELECT 
    get_feedback_analytics.total_feedback,
    get_feedback_analytics.unread_count,
    get_feedback_analytics.avg_response_time_hours,
    get_feedback_analytics.satisfaction_avg,
    get_feedback_analytics.category_breakdown,
    get_feedback_analytics.priority_breakdown,
    get_feedback_analytics.daily_trends,
    get_feedback_analytics.top_users;
END;
$$;

-- Create smart routing function for auto-assignment
CREATE OR REPLACE FUNCTION public.assign_feedback_to_admin(
  feedback_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_admin UUID;
  feedback_category TEXT;
  feedback_priority TEXT;
BEGIN
  -- Get feedback details
  SELECT category, priority INTO feedback_category, feedback_priority
  FROM feedback_messages
  WHERE id = feedback_id;
  
  -- Simple round-robin assignment based on category
  SELECT id INTO assigned_admin
  FROM profiles
  WHERE is_admin = true
  ORDER BY 
    CASE 
      WHEN feedback_category = 'bug' THEN 1
      WHEN feedback_category = 'feature' THEN 2
      ELSE 3
    END,
    RANDOM()
  LIMIT 1;
  
  -- Update feedback with assigned admin
  UPDATE feedback_messages
  SET admin_id = assigned_admin
  WHERE id = feedback_id;
  
  RETURN assigned_admin;
END;
$$;

-- Create notification system for real-time updates
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  feedback_id UUID NOT NULL REFERENCES public.feedback_messages(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'new_feedback', 'urgent_escalation', 'response_due'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT admin_notifications_admin_id_fkey 
  FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS on notifications
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Create policies for notifications
CREATE POLICY "Admins can view their own notifications"
ON public.admin_notifications
FOR SELECT
USING (auth.uid() = admin_id);

CREATE POLICY "System can insert notifications"
ON public.admin_notifications
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can update their own notifications"
ON public.admin_notifications
FOR UPDATE
USING (auth.uid() = admin_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_read ON public.admin_notifications(admin_id, is_read);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON public.admin_notifications(created_at DESC);

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_feedback_analytics(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_feedback_to_admin(UUID) TO authenticated;