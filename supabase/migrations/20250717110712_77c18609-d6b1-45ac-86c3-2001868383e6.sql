-- Create email_delivery_logs table for tracking delivery status and retries
CREATE TABLE public.email_delivery_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  email_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  correlation_id text NOT NULL,
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_email_delivery_logs_email ON public.email_delivery_logs(email);
CREATE INDEX idx_email_delivery_logs_status ON public.email_delivery_logs(status);
CREATE INDEX idx_email_delivery_logs_correlation_id ON public.email_delivery_logs(correlation_id);
CREATE INDEX idx_email_delivery_logs_created_at ON public.email_delivery_logs(created_at);

-- Enable Row Level Security
ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for email delivery logs
CREATE POLICY "Admins can view all email delivery logs"
  ON public.email_delivery_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

CREATE POLICY "System can insert email delivery logs"
  ON public.email_delivery_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update email delivery logs"
  ON public.email_delivery_logs
  FOR UPDATE
  USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_email_delivery_logs_updated_at
  BEFORE UPDATE ON public.email_delivery_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
