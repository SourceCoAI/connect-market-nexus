
-- Create the smartlead_reply_inbox table
CREATE TABLE public.smartlead_reply_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_status text,
  campaign_name text,
  campaign_id integer,
  stats_id text,
  sl_email_lead_id text,
  sl_email_lead_map_id text,
  sl_lead_email text,
  from_email text,
  to_email text,
  to_name text,
  cc_emails text[] DEFAULT '{}',
  subject text,
  message_id text,
  sent_message_body text,
  sent_message text,
  time_replied timestamptz,
  event_timestamp timestamptz,
  reply_message text,
  reply_body text,
  preview_text text,
  sequence_number integer,
  secret_key text,
  app_url text,
  ui_master_inbox_link text,
  description text,
  metadata jsonb,
  lead_correspondence jsonb,
  webhook_url text,
  webhook_id text,
  webhook_name text,
  event_type text,
  client_id text,
  ai_category text,
  ai_sentiment text,
  ai_is_positive boolean DEFAULT false,
  ai_confidence numeric,
  ai_reasoning text,
  categorized_at timestamptz,
  raw_payload jsonb,
  -- Manual override fields
  manual_category text,
  manual_sentiment text,
  recategorized_by uuid,
  recategorized_at timestamptz,
  -- Bulk action status
  status text DEFAULT 'new',
  -- Deal link
  linked_deal_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add indexes
CREATE INDEX idx_smartlead_reply_inbox_message_id ON public.smartlead_reply_inbox (message_id);
CREATE INDEX idx_smartlead_reply_inbox_from_email ON public.smartlead_reply_inbox (from_email);
CREATE INDEX idx_smartlead_reply_inbox_time_replied ON public.smartlead_reply_inbox (time_replied);
CREATE INDEX idx_smartlead_reply_inbox_ai_category ON public.smartlead_reply_inbox (ai_category);
CREATE INDEX idx_smartlead_reply_inbox_ai_sentiment ON public.smartlead_reply_inbox (ai_sentiment);
CREATE INDEX idx_smartlead_reply_inbox_status ON public.smartlead_reply_inbox (status);

-- Enable RLS
ALTER TABLE public.smartlead_reply_inbox ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT all rows
CREATE POLICY "Authenticated users can read inbox"
  ON public.smartlead_reply_inbox
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to UPDATE only override/status fields
CREATE POLICY "Authenticated users can update status and overrides"
  ON public.smartlead_reply_inbox
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Enable realtime
ALTER publication supabase_realtime ADD TABLE public.smartlead_reply_inbox;
