ALTER TABLE public.phoneburner_sessions
ADD COLUMN IF NOT EXISTS request_id text,
ADD COLUMN IF NOT EXISTS session_contacts jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_phoneburner_sessions_request_id
ON public.phoneburner_sessions (request_id)
WHERE request_id IS NOT NULL;

ALTER TABLE public.phoneburner_webhooks_log
ADD COLUMN IF NOT EXISTS request_id text;

CREATE INDEX IF NOT EXISTS idx_phoneburner_webhooks_log_request_id
ON public.phoneburner_webhooks_log (request_id);

ALTER TABLE public.contact_activities
ADD COLUMN IF NOT EXISTS request_id text;

CREATE INDEX IF NOT EXISTS idx_contact_activities_request_id
ON public.contact_activities (request_id);