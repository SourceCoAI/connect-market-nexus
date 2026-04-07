-- Create feedback_messages table
CREATE TABLE public.feedback_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  page_url TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'responded')),
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'bug', 'feature', 'ui', 'other')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  admin_response TEXT,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_feedback_messages_user_id ON public.feedback_messages(user_id);
CREATE INDEX idx_feedback_messages_status ON public.feedback_messages(status);
CREATE INDEX idx_feedback_messages_created_at ON public.feedback_messages(created_at DESC);
CREATE INDEX idx_feedback_messages_category ON public.feedback_messages(category);

-- Enable RLS
ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own feedback messages" 
ON public.feedback_messages 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own feedback messages" 
ON public.feedback_messages 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all feedback messages" 
ON public.feedback_messages 
FOR SELECT 
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update feedback messages" 
ON public.feedback_messages 
FOR UPDATE 
USING (is_admin(auth.uid()));

-- Create updated_at trigger
CREATE TRIGGER update_feedback_messages_updated_at
BEFORE UPDATE ON public.feedback_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add feedback_messages to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_messages;