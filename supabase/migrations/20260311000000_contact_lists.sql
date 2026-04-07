-- ========================================
-- Contact Lists: Saved lists for PhoneBurner export
-- ========================================

-- 1. Contact Lists table - stores saved lists
CREATE TABLE public.contact_lists (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    list_type TEXT NOT NULL DEFAULT 'buyer',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    contact_count INTEGER NOT NULL DEFAULT 0,
    last_pushed_at TIMESTAMPTZ,
    last_pushed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    tags TEXT[] DEFAULT '{}',
    filter_snapshot JSONB,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contact lists"
ON public.contact_lists FOR ALL
USING (public.is_admin(auth.uid()));

CREATE INDEX idx_cl_list_type ON public.contact_lists(list_type);
CREATE INDEX idx_cl_created_by ON public.contact_lists(created_by);
CREATE INDEX idx_cl_created_at ON public.contact_lists(created_at DESC);
CREATE INDEX idx_cl_archived ON public.contact_lists(is_archived) WHERE is_archived = FALSE;
CREATE INDEX idx_cl_tags ON public.contact_lists USING GIN(tags);

-- 2. Contact List Members table - stores list membership
CREATE TABLE public.contact_list_members (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    list_id UUID NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
    contact_email TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    contact_company TEXT,
    contact_role TEXT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at TIMESTAMPTZ,
    UNIQUE(list_id, contact_email)
);

ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contact list members"
ON public.contact_list_members FOR ALL
USING (public.is_admin(auth.uid()));

CREATE INDEX idx_clm_list_id ON public.contact_list_members(list_id);
CREATE INDEX idx_clm_email ON public.contact_list_members(contact_email);
CREATE INDEX idx_clm_entity ON public.contact_list_members(entity_type, entity_id);
CREATE INDEX idx_clm_active ON public.contact_list_members(list_id) WHERE removed_at IS NULL;

-- 3. Add contact_email to contact_activities for cross-entity joining
ALTER TABLE public.contact_activities
    ADD COLUMN IF NOT EXISTS contact_email TEXT;

CREATE INDEX IF NOT EXISTS idx_ca_contact_email ON public.contact_activities(contact_email) WHERE contact_email IS NOT NULL;

-- 4. Add list_id to phoneburner_sessions for linking sessions to lists
ALTER TABLE public.phoneburner_sessions
    ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES public.contact_lists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pb_sessions_list_id ON public.phoneburner_sessions(list_id) WHERE list_id IS NOT NULL;

-- 5. Updated_at triggers
CREATE TRIGGER update_contact_lists_updated_at
    BEFORE UPDATE ON public.contact_lists
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- NOTE: contact_list_members has no updated_at column, so no updated_at trigger here.

-- 6. Function to auto-update contact_count on list membership changes
CREATE OR REPLACE FUNCTION public.update_contact_list_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE public.contact_lists
        SET contact_count = (
            SELECT COUNT(*) FROM public.contact_list_members
            WHERE list_id = NEW.list_id AND removed_at IS NULL
        )
        WHERE id = NEW.list_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.contact_lists
        SET contact_count = (
            SELECT COUNT(*) FROM public.contact_list_members
            WHERE list_id = OLD.list_id AND removed_at IS NULL
        )
        WHERE id = OLD.list_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_contact_list_count
    AFTER INSERT OR UPDATE OR DELETE ON public.contact_list_members
    FOR EACH ROW EXECUTE FUNCTION public.update_contact_list_count();

-- Merged from: 20260311000000_onboarding_email_crons.sql
-- Onboarding Day 2 email — runs daily at 9am UTC
SELECT cron.schedule(
  'send-onboarding-day2',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/send-onboarding-day2',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Onboarding Day 7 re-engagement — runs daily at 9am UTC
SELECT cron.schedule(
  'send-onboarding-day7',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/send-onboarding-day7',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- First request follow-up — runs every hour (checks 20-28hr window)
SELECT cron.schedule(
  'send-first-request-followup',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/send-first-request-followup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Merged from: 20260311000000_security_definer_to_invoker.sql
-- Migration: Convert pure utility functions from SECURITY DEFINER to SECURITY INVOKER
--
-- These functions do NOT need elevated privileges — they are pure computations
-- or simple triggers that should run with the caller's permissions.
--
-- Rationale:
--   SECURITY DEFINER runs as the function owner (typically superuser), bypassing RLS.
--   For pure utility functions this is unnecessary and widens the attack surface.
--   SECURITY INVOKER (the default) runs with the caller's permissions — safer.
--
-- Functions converted:
--   1. extract_domain(text)           — IMMUTABLE text extraction
--   2. normalize_company_name(text)   — IMMUTABLE text normalization
--   3. increment(integer, integer)    — IMMUTABLE arithmetic
--   4. update_updated_at_column()     — Simple trigger that sets updated_at = NOW()
--
-- Functions NOT converted (correctly use SECURITY DEFINER):
--   - get_deals_with_details()        — Needs to bypass RLS for admin aggregation
--   - merge_valuation_lead(...)       — Service-level upsert
--   - update_fee_agreement_firm_status() — Admin-guarded batch operation
--   - create_deal_from_connection_request() — Trigger needs INSERT on restricted tables
--   - All analytics/reporting RPCs    — Need cross-table reads bypassing RLS
--   - Cron-triggered functions         — Run without user context

BEGIN;

-- 1. extract_domain — pure string extraction, no table access
CREATE OR REPLACE FUNCTION public.extract_domain(url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT lower(regexp_replace(
    regexp_replace(url, '^https?://(www\.)?', ''),
    '/.*$', ''
  ));
$$;

-- 2. normalize_company_name — pure text normalization, no table access
CREATE OR REPLACE FUNCTION public.normalize_company_name(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT lower(regexp_replace(
    regexp_replace(name, '\s*(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|plc\.?|lp\.?|llp\.?|group|holdings?|partners?|capital|advisors?|management|consulting|services?|solutions?|enterprises?|international|global)\s*$', '', 'gi'),
    '[^a-z0-9]', '', 'g'
  ));
$$;

-- 3. increment — pure arithmetic, no table access
CREATE OR REPLACE FUNCTION public.increment(current_value integer, increment_by integer DEFAULT 1)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT current_value + increment_by;
$$;

-- 4. update_updated_at_column — trigger function, only touches the row being updated
--    SECURITY INVOKER is safe because the trigger fires with the privileges of
--    the user performing the UPDATE (they already passed RLS to reach the row).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMIT;
