-- Phase 2: New email data model for the rebuilt email architecture
-- This replaces the ambiguous email_delivery_logs as the runtime source of truth

-- Lifecycle status enum
CREATE TYPE public.email_lifecycle_status AS ENUM (
  'queued',
  'accepted',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'blocked',
  'spam',
  'failed',
  'unsubscribed'
);

-- One record per logical email sent
CREATE TABLE public.outbound_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Template/purpose
  template_name TEXT NOT NULL,
  -- Recipient
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  -- Sender identity
  sender_email TEXT NOT NULL DEFAULT 'adam.haile@sourcecodeals.com',
  sender_name TEXT NOT NULL DEFAULT 'Adam Haile - SourceCo',
  reply_to_email TEXT,
  -- Provider tracking
  provider_message_id TEXT,  -- The Brevo message-id, canonical external key
  -- Internal correlation
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  -- Lifecycle
  status email_lifecycle_status NOT NULL DEFAULT 'queued',
  -- Context
  subject TEXT,
  has_attachment BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Error tracking
  last_error TEXT,
  send_attempts INTEGER DEFAULT 0,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only event stream
CREATE TABLE public.email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_email_id UUID NOT NULL REFERENCES public.outbound_emails(id) ON DELETE CASCADE,
  event_type email_lifecycle_status NOT NULL,
  provider_event_id TEXT,  -- Brevo's event identifier
  event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_outbound_emails_status ON public.outbound_emails(status);
CREATE INDEX idx_outbound_emails_recipient ON public.outbound_emails(recipient_email);
CREATE INDEX idx_outbound_emails_provider_msg ON public.outbound_emails(provider_message_id);
CREATE INDEX idx_outbound_emails_correlation ON public.outbound_emails(correlation_id);
CREATE INDEX idx_outbound_emails_template ON public.outbound_emails(template_name);
CREATE INDEX idx_outbound_emails_created ON public.outbound_emails(created_at DESC);
CREATE INDEX idx_email_events_email ON public.email_events(outbound_email_id);
CREATE INDEX idx_email_events_type ON public.email_events(event_type);

-- Enable RLS
ALTER TABLE public.outbound_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- Admin read access
CREATE POLICY "Admins can view outbound emails"
  ON public.outbound_emails FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view email events"
  ON public.email_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.outbound_emails oe
    WHERE oe.id = email_events.outbound_email_id
    AND public.has_role(auth.uid(), 'admin')
  ));

-- Service role has full access (edge functions use service_role key)
-- No explicit INSERT/UPDATE policies needed for service_role as it bypasses RLS

-- Updated_at trigger
CREATE TRIGGER update_outbound_emails_updated_at
  BEFORE UPDATE ON public.outbound_emails
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();