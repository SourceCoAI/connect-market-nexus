-- CRITICAL FIX: Storage setup and enhanced analytics (skip existing constraints)

-- Create storage bucket for feedback attachments (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'feedback-attachments', 'feedback-attachments', true, 52428800, 
       ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'feedback-attachments');

-- Create storage policies for feedback attachments
DROP POLICY IF EXISTS "Users can upload feedback attachments" ON storage.objects;
CREATE POLICY "Users can upload feedback attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'feedback-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can view feedback attachments" ON storage.objects;
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

DROP POLICY IF EXISTS "Admins can manage all feedback attachments" ON storage.objects;
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

-- Create policies for notifications (with IF NOT EXISTS equivalent)
DROP POLICY IF EXISTS "Admins can view their own notifications" ON public.admin_notifications;
CREATE POLICY "Admins can view their own notifications"
ON public.admin_notifications
FOR SELECT
USING (auth.uid() = admin_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.admin_notifications;
CREATE POLICY "System can insert notifications"
ON public.admin_notifications
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can update their own notifications" ON public.admin_notifications;
CREATE POLICY "Admins can update their own notifications"
ON public.admin_notifications
FOR UPDATE
USING (auth.uid() = admin_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_read ON public.admin_notifications(admin_id, is_read);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON public.admin_notifications(created_at DESC);