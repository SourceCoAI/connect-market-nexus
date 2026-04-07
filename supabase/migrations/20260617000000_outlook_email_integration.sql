-- =============================================================================
-- Microsoft Outlook Email Integration
-- Creates tables for email messages, connections, access logging, and
-- contact assignments for the SourceCo remarketing tool.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Contact Assignments Table
--    Tracks which team members are assigned to which contacts/deals.
--    This is the source of truth for email access control.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sourceco_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT contact_or_deal_required CHECK (contact_id IS NOT NULL OR deal_id IS NOT NULL)
);

CREATE INDEX idx_contact_assignments_user ON public.contact_assignments(sourceco_user_id) WHERE is_active = true;
CREATE INDEX idx_contact_assignments_contact ON public.contact_assignments(contact_id) WHERE is_active = true;
CREATE INDEX idx_contact_assignments_deal ON public.contact_assignments(deal_id) WHERE is_active = true;
-- Separate unique indexes for contact-only and deal-only assignments
-- (PostgreSQL treats NULLs as distinct in unique indexes, so a composite
-- index on nullable columns would allow unwanted duplicates)
CREATE UNIQUE INDEX idx_contact_assignments_unique_contact
  ON public.contact_assignments(sourceco_user_id, contact_id)
  WHERE is_active = true AND contact_id IS NOT NULL;

CREATE UNIQUE INDEX idx_contact_assignments_unique_deal
  ON public.contact_assignments(sourceco_user_id, deal_id)
  WHERE is_active = true AND deal_id IS NOT NULL;

ALTER TABLE public.contact_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contact assignments"
  ON public.contact_assignments FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own assignments"
  ON public.contact_assignments FOR SELECT
  USING (auth.uid() = sourceco_user_id AND is_active = true);

-- ---------------------------------------------------------------------------
-- 2. Email Connections Table
--    Stores OAuth connections between team members and their Outlook accounts.
-- ---------------------------------------------------------------------------
CREATE TYPE public.email_connection_status AS ENUM ('active', 'expired', 'revoked', 'error');

CREATE TABLE IF NOT EXISTS public.email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sourceco_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  microsoft_user_id TEXT NOT NULL,
  email_address TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  webhook_subscription_id TEXT,
  webhook_expires_at TIMESTAMPTZ,
  status public.email_connection_status NOT NULL DEFAULT 'active',
  last_sync_at TIMESTAMPTZ,
  last_sync_error_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_connection_per_user UNIQUE (sourceco_user_id)
);

CREATE INDEX idx_email_connections_status ON public.email_connections(status);
CREATE INDEX idx_email_connections_webhook_expires ON public.email_connections(webhook_expires_at)
  WHERE status = 'active';

ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all email connections"
  ON public.email_connections FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own connection"
  ON public.email_connections FOR SELECT
  USING (auth.uid() = sourceco_user_id);

CREATE POLICY "Users can update their own connection"
  ON public.email_connections FOR UPDATE
  USING (auth.uid() = sourceco_user_id)
  WITH CHECK (auth.uid() = sourceco_user_id);

-- ---------------------------------------------------------------------------
-- 3. Email Messages Table
--    Stores synced email messages matched to known contacts.
-- ---------------------------------------------------------------------------
CREATE TYPE public.email_direction AS ENUM ('inbound', 'outbound');

CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  microsoft_message_id TEXT NOT NULL UNIQUE,
  microsoft_conversation_id TEXT,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  sourceco_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction public.email_direction NOT NULL,
  from_address TEXT NOT NULL,
  to_addresses TEXT[] NOT NULL DEFAULT '{}',
  cc_addresses TEXT[] DEFAULT '{}',
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  sent_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  attachment_metadata JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_messages_contact ON public.email_messages(contact_id);
CREATE INDEX idx_email_messages_deal ON public.email_messages(deal_id);
CREATE INDEX idx_email_messages_user ON public.email_messages(sourceco_user_id);
CREATE INDEX idx_email_messages_conversation ON public.email_messages(microsoft_conversation_id);
CREATE INDEX idx_email_messages_sent_at ON public.email_messages(sent_at DESC);
CREATE INDEX idx_email_messages_contact_sent ON public.email_messages(contact_id, sent_at DESC);

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

-- Admins see everything
CREATE POLICY "Admins can manage all email messages"
  ON public.email_messages FOR ALL
  USING (public.is_admin(auth.uid()));

-- Team members see emails for contacts/deals they are assigned to
CREATE POLICY "Users can view emails for assigned contacts"
  ON public.email_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_assignments ca
      WHERE ca.sourceco_user_id = auth.uid()
        AND ca.is_active = true
        AND (
          ca.contact_id = email_messages.contact_id
          OR ca.deal_id = email_messages.deal_id
        )
    )
  );

-- Users can insert emails they sent (sourceco_user_id must match)
CREATE POLICY "Users can insert their own sent emails"
  ON public.email_messages FOR INSERT
  WITH CHECK (auth.uid() = sourceco_user_id);

-- ---------------------------------------------------------------------------
-- 4. Email Access Log (Audit Trail)
-- ---------------------------------------------------------------------------
CREATE TYPE public.email_access_action AS ENUM ('viewed', 'sent', 'replied');

CREATE TABLE IF NOT EXISTS public.email_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sourceco_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_message_id UUID REFERENCES public.email_messages(id) ON DELETE SET NULL,
  action public.email_access_action NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_email_access_log_user ON public.email_access_log(sourceco_user_id);
CREATE INDEX idx_email_access_log_message ON public.email_access_log(email_message_id);
CREATE INDEX idx_email_access_log_accessed ON public.email_access_log(accessed_at DESC);

ALTER TABLE public.email_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all access logs"
  ON public.email_access_log FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can insert their own access logs"
  ON public.email_access_log FOR INSERT
  WITH CHECK (auth.uid() = sourceco_user_id);

CREATE POLICY "Users can view their own access logs"
  ON public.email_access_log FOR SELECT
  USING (auth.uid() = sourceco_user_id);

-- ---------------------------------------------------------------------------
-- 5. Helper function: Check if user has access to a contact's emails
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_email_access(
  _user_id UUID,
  _contact_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Admins always have access
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_admin = true) THEN
    RETURN true;
  END IF;

  -- Check contact assignment
  RETURN EXISTS (
    SELECT 1 FROM public.contact_assignments
    WHERE sourceco_user_id = _user_id
      AND contact_id = _contact_id
      AND is_active = true
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Updated_at trigger for email_connections
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_email_connection_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_email_connections_updated_at
  BEFORE UPDATE ON public.email_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_email_connection_timestamp();
