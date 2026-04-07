
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL, -- 'hard_bounce', 'spam_complaint', 'unsubscribed'
  source_event TEXT, -- brevo event type
  source_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email, reason)
);

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_suppressed_emails_email ON public.suppressed_emails(email);
