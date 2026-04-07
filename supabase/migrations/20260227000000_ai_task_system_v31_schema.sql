-- ═══════════════════════════════════════════════════════════════════════
-- AI Task System v3.1 — Schema Migration
-- Extends existing daily_standup_tasks system with entity linking,
-- deal team membership, signals, cadence, comments, activity logs,
-- and supporting configuration tables.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Extend daily_standup_tasks ──────────────────────────────────

-- Entity linking columns
ALTER TABLE public.daily_standup_tasks
  ADD COLUMN IF NOT EXISTS entity_type text DEFAULT 'deal',
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS secondary_entity_type text,
  ADD COLUMN IF NOT EXISTS secondary_entity_id uuid;

ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_entity_type_check
    CHECK (entity_type IN ('listing','deal','buyer','contact'))
    NOT VALID;

ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_secondary_entity_type_check
    CHECK (secondary_entity_type IS NULL OR secondary_entity_type IN ('listing','deal','buyer','contact'))
    NOT VALID;

-- New status values — drop old constraint and add expanded one
DO $$
BEGIN
  -- Drop any existing status check constraint
  ALTER TABLE public.daily_standup_tasks
    DROP CONSTRAINT IF EXISTS daily_standup_tasks_status_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Some projects name the constraint differently
DO $$
BEGIN
  ALTER TABLE public.daily_standup_tasks
    DROP CONSTRAINT IF EXISTS dst_status_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_status_check
    CHECK (status IN ('pending','pending_approval','in_progress','completed','overdue','snoozed','cancelled','listing_closed'))
    NOT VALID;

-- Source tracking
ALTER TABLE public.daily_standup_tasks
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_source_check
    CHECK (source IN ('manual','ai','chatbot','system','template'))
    NOT VALID;

-- AI-specific fields
ALTER TABLE public.daily_standup_tasks
  ADD COLUMN IF NOT EXISTS ai_evidence_quote text,
  ADD COLUMN IF NOT EXISTS ai_relevance_score integer,
  ADD COLUMN IF NOT EXISTS ai_confidence text,
  ADD COLUMN IF NOT EXISTS ai_speaker_assigned_to text,
  ADD COLUMN IF NOT EXISTS transcript_id text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_ai_confidence_check
    CHECK (ai_confidence IS NULL OR ai_confidence IN ('high','medium'))
    NOT VALID;

ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_ai_speaker_check
    CHECK (ai_speaker_assigned_to IS NULL OR ai_speaker_assigned_to IN ('advisor','seller','buyer','unknown'))
    NOT VALID;

-- Completion evidence
ALTER TABLE public.daily_standup_tasks
  ADD COLUMN IF NOT EXISTS completion_notes text,
  ADD COLUMN IF NOT EXISTS completion_transcript_id text;

-- Team visibility & dependencies
ALTER TABLE public.daily_standup_tasks
  ADD COLUMN IF NOT EXISTS deal_team_visible boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS depends_on uuid,
  ADD COLUMN IF NOT EXISTS snoozed_until date,
  ADD COLUMN IF NOT EXISTS buyer_deal_score integer;

-- Self-referencing FK for depends_on
DO $$
BEGIN
  ALTER TABLE public.daily_standup_tasks
    ADD CONSTRAINT dst_depends_on_fk
    FOREIGN KEY (depends_on) REFERENCES public.daily_standup_tasks(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Priority text field
ALTER TABLE public.daily_standup_tasks
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium';

ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_priority_check
    CHECK (priority IN ('high','medium','low'))
    NOT VALID;

-- Created by
ALTER TABLE public.daily_standup_tasks
  ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$
BEGIN
  ALTER TABLE public.daily_standup_tasks
    ADD CONSTRAINT dst_created_by_fk
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_dst_entity ON public.daily_standup_tasks(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_dst_secondary_entity ON public.daily_standup_tasks(secondary_entity_type, secondary_entity_id);
CREATE INDEX IF NOT EXISTS idx_dst_status_due ON public.daily_standup_tasks(status, due_date);
CREATE INDEX IF NOT EXISTS idx_dst_assignee_status ON public.daily_standup_tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_dst_source ON public.daily_standup_tasks(source);
CREATE INDEX IF NOT EXISTS idx_dst_expires ON public.daily_standup_tasks(expires_at) WHERE expires_at IS NOT NULL;

-- ─── 2. Backfill entity fields from existing deal_id ────────────────

UPDATE public.daily_standup_tasks
SET entity_type = 'deal', entity_id = deal_id
WHERE deal_id IS NOT NULL AND entity_id IS NULL;

UPDATE public.daily_standup_tasks
SET source = CASE WHEN is_manual THEN 'manual' ELSE 'ai' END
WHERE source IS NULL OR (source = 'manual' AND NOT is_manual);

-- ─── 2b. Entity-linking constraint for AI tasks ───────────────────
-- AI-generated tasks MUST be linked to a real entity. This prevents
-- orphan tasks that don't relate to any deal or buyer.
ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_ai_entity_required
    CHECK (
      source != 'ai' OR entity_id IS NOT NULL
    )
    NOT VALID;

-- Chatbot tasks also require entity linking
ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_chatbot_entity_required
    CHECK (
      source != 'chatbot' OR entity_id IS NOT NULL
    )
    NOT VALID;

-- Template tasks also require entity linking
ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_template_entity_required
    CHECK (
      source != 'template' OR entity_id IS NOT NULL
    )
    NOT VALID;

-- Validate all constraints on new data going forward
ALTER TABLE public.daily_standup_tasks VALIDATE CONSTRAINT dst_entity_type_check;
ALTER TABLE public.daily_standup_tasks VALIDATE CONSTRAINT dst_source_check;
ALTER TABLE public.daily_standup_tasks VALIDATE CONSTRAINT dst_priority_check;
ALTER TABLE public.daily_standup_tasks VALIDATE CONSTRAINT dst_ai_entity_required;
ALTER TABLE public.daily_standup_tasks VALIDATE CONSTRAINT dst_chatbot_entity_required;
ALTER TABLE public.daily_standup_tasks VALIDATE CONSTRAINT dst_template_entity_required;


-- ─── 3. rm_deal_team (Deal Team Membership) ────────────────────────

CREATE TABLE IF NOT EXISTS public.rm_deal_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'analyst'
    CHECK (role IN ('lead','analyst','support')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id)
);

ALTER TABLE public.rm_deal_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own team memberships"
  ON public.rm_deal_team FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins manage deal teams"
  ON public.rm_deal_team FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin','owner')
    )
  );


-- ─── 4. rm_deal_signals (AI-Detected Intelligence) ─────────────────

CREATE TABLE IF NOT EXISTS public.rm_deal_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  buyer_id uuid REFERENCES public.remarketing_buyers(id) ON DELETE SET NULL,
  transcript_id text NOT NULL,
  signal_type text NOT NULL
    CHECK (signal_type IN ('positive','warning','critical','neutral')),
  signal_category text NOT NULL,
  summary text NOT NULL,
  verbatim_quote text,
  acknowledged_by uuid REFERENCES public.profiles(id),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rm_deal_signals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_signals_listing ON public.rm_deal_signals(listing_id);
CREATE INDEX IF NOT EXISTS idx_signals_deal ON public.rm_deal_signals(deal_id);
CREATE INDEX IF NOT EXISTS idx_signals_type ON public.rm_deal_signals(signal_type);

CREATE POLICY "Admins see all signals"
  ON public.rm_deal_signals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin','owner')
    )
  );

CREATE POLICY "Deal team sees listing signals"
  ON public.rm_deal_signals FOR SELECT
  USING (
    listing_id IN (
      SELECT listing_id FROM public.rm_deal_team WHERE user_id = auth.uid()
    )
  );


-- ─── 5. rm_buyer_deal_cadence (Stage-Aware Contact Schedules) ──────

CREATE TABLE IF NOT EXISTS public.rm_buyer_deal_cadence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.remarketing_buyers(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  deal_stage_name text NOT NULL,
  expected_contact_days integer NOT NULL DEFAULT 14,
  last_contacted_at timestamptz,
  last_contact_source text
    CHECK (last_contact_source IS NULL OR last_contact_source IN (
      'task','fireflies','smartlead','smartlead_reply','direct_email','meeting'
    )),
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(buyer_id, deal_id)
);

ALTER TABLE public.rm_buyer_deal_cadence ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cadence_buyer ON public.rm_buyer_deal_cadence(buyer_id);
CREATE INDEX IF NOT EXISTS idx_cadence_deal ON public.rm_buyer_deal_cadence(deal_id);
CREATE INDEX IF NOT EXISTS idx_cadence_overdue ON public.rm_buyer_deal_cadence(last_contacted_at)
  WHERE is_active = true;

CREATE POLICY "Admins manage cadence"
  ON public.rm_buyer_deal_cadence FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin','owner')
    )
  );


-- ─── 6. rm_task_extractions (Extraction Run Log) ───────────────────

CREATE TABLE IF NOT EXISTS public.rm_task_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id text NOT NULL,
  transcript_status text DEFAULT 'queued'
    CHECK (transcript_status IN ('queued','ready','processing','completed','failed')),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  deal_stage_at_extraction text,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  tasks_saved integer DEFAULT 0,
  tasks_discarded integer DEFAULT 0,
  signals_extracted integer DEFAULT 0,
  failure_reason text,
  run_at timestamptz DEFAULT now()
);

ALTER TABLE public.rm_task_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see extractions"
  ON public.rm_task_extractions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin','owner')
    )
  );


-- ─── 7. rm_task_discards (Guardrail Audit Log) ─────────────────────

CREATE TABLE IF NOT EXISTS public.rm_task_discards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id text,
  entity_type text,
  entity_id uuid,
  candidate_title text,
  discard_reason text
    CHECK (discard_reason IN (
      'failed_category','failed_relevance','failed_confidence',
      'failed_record_lookup','failed_stage','duplicate','auto_expired'
    )),
  ai_relevance_score integer,
  ai_confidence text,
  quote text,
  discarded_at timestamptz DEFAULT now()
);

ALTER TABLE public.rm_task_discards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see discards"
  ON public.rm_task_discards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin','owner')
    )
  );


-- ─── 8. rm_task_activity_log (Audit Trail) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.rm_task_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.daily_standup_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL
    CHECK (action IN (
      'created','edited','reassigned','completed','reopened',
      'snoozed','cancelled','confirmed','dismissed','commented',
      'priority_changed','status_changed','dependency_added'
    )),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rm_task_activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_task_activity_task ON public.rm_task_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_user ON public.rm_task_activity_log(user_id);

CREATE POLICY "Admins see activity log"
  ON public.rm_task_activity_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin','owner')
    )
  );


-- ─── 9. rm_task_comments (Threaded Discussion) ─────────────────────

CREATE TABLE IF NOT EXISTS public.rm_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.daily_standup_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rm_task_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON public.rm_task_comments(task_id);

CREATE POLICY "Admins manage comments"
  ON public.rm_task_comments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin','owner')
    )
  );

CREATE POLICY "Comment authors see own"
  ON public.rm_task_comments FOR SELECT
  USING (user_id = auth.uid());


-- ─── 10. platform_settings (Configurable Thresholds) ────────────────

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read settings"
  ON public.platform_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins update settings"
  ON public.platform_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin','owner')
    )
  );

-- Seed defaults (values as proper JSONB numbers)
INSERT INTO public.platform_settings (key, value) VALUES
  ('ai_relevance_threshold', '7'::jsonb),
  ('ai_task_expiry_days', '7'::jsonb),
  ('ai_task_expiry_warning_days', '5'::jsonb),
  ('buyer_spotlight_default_cadence_days', '14'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ─── 11. Add is_retained flag to listings ───────────────────────────

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_retained boolean DEFAULT false;


-- ─── 12. Index for deal-team RLS path ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_deals_listing ON public.deals(listing_id);


-- ─── 13. Deal lifecycle triggers ────────────────────────────────────

-- Function: auto-handle tasks when listing status changes
CREATE OR REPLACE FUNCTION public.handle_listing_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- listing -> sold: close all open tasks
  IF NEW.status = 'sold' AND OLD.status != 'sold' THEN
    UPDATE public.daily_standup_tasks
    SET status = 'listing_closed',
        updated_at = now()
    WHERE entity_type = 'listing' AND entity_id = NEW.id
      AND status IN ('pending','pending_approval','in_progress','overdue');

    -- Also close tasks on deals under this listing
    UPDATE public.daily_standup_tasks
    SET status = 'listing_closed',
        updated_at = now()
    WHERE entity_type = 'deal' AND entity_id IN (
      SELECT id FROM public.deals WHERE listing_id = NEW.id
    )
    AND status IN ('pending','pending_approval','in_progress','overdue');
  END IF;

  -- listing -> inactive: snooze all open tasks (30 days)
  IF NEW.status = 'inactive' AND OLD.status = 'active' THEN
    UPDATE public.daily_standup_tasks
    SET status = 'snoozed',
        snoozed_until = CURRENT_DATE + INTERVAL '30 days',
        updated_at = now()
    WHERE entity_type = 'listing' AND entity_id = NEW.id
      AND status IN ('pending','pending_approval','in_progress','overdue');
  END IF;

  -- listing -> active (re-activated): wake snoozed tasks
  IF NEW.status = 'active' AND OLD.status = 'inactive' THEN
    UPDATE public.daily_standup_tasks
    SET status = 'pending',
        snoozed_until = NULL,
        updated_at = now()
    WHERE entity_type = 'listing' AND entity_id = NEW.id
      AND status = 'snoozed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listing_status_change ON public.listings;
CREATE TRIGGER trg_listing_status_change
  AFTER UPDATE OF status ON public.listings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.handle_listing_status_change();


-- Function: auto-handle tasks when deal reaches terminal stage
CREATE OR REPLACE FUNCTION public.handle_deal_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_stage_name text;
BEGIN
  -- Look up stage name
  SELECT name INTO new_stage_name
  FROM public.deal_stages
  WHERE id = NEW.stage_id;

  -- Closed Won: auto-complete tasks on this deal
  IF new_stage_name = 'Closed Won' THEN
    UPDATE public.daily_standup_tasks
    SET status = 'completed',
        completion_notes = 'Deal closed won — auto-completed',
        completed_at = now(),
        updated_at = now()
    WHERE entity_type = 'deal' AND entity_id = NEW.id
      AND status IN ('pending','pending_approval','in_progress','overdue');
  END IF;

  -- Closed Lost: auto-cancel tasks on this deal
  IF new_stage_name = 'Closed Lost' THEN
    UPDATE public.daily_standup_tasks
    SET status = 'cancelled',
        updated_at = now()
    WHERE entity_type = 'deal' AND entity_id = NEW.id
      AND status IN ('pending','pending_approval','in_progress','overdue');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_stage_change ON public.deals;
CREATE TRIGGER trg_deal_stage_change
  AFTER UPDATE OF stage_id ON public.deals
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION public.handle_deal_stage_change();


-- ─── 14. Snoozed task wake-up function (call via pg_cron daily) ─────

CREATE OR REPLACE FUNCTION public.wake_snoozed_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.daily_standup_tasks
  SET status = 'pending',
      snoozed_until = NULL,
      updated_at = now()
  WHERE status = 'snoozed'
    AND snoozed_until IS NOT NULL
    AND snoozed_until <= CURRENT_DATE;
END;
$$;


-- ─── 15. AI task expiry function (call via pg_cron daily) ───────────

CREATE OR REPLACE FUNCTION public.expire_unreviewed_ai_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Move to discards table
  INSERT INTO public.rm_task_discards (transcript_id, entity_type, entity_id, candidate_title, discard_reason, ai_relevance_score, ai_confidence)
  SELECT transcript_id, entity_type, entity_id, title, 'auto_expired', ai_relevance_score, ai_confidence
  FROM public.daily_standup_tasks
  WHERE source = 'ai'
    AND confirmed_at IS NULL
    AND dismissed_at IS NULL
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  -- Delete expired tasks
  DELETE FROM public.daily_standup_tasks
  WHERE source = 'ai'
    AND confirmed_at IS NULL
    AND dismissed_at IS NULL
    AND expires_at IS NOT NULL
    AND expires_at <= now();
END;
$$;


-- ─── 16. Privacy purge function (call via pg_cron nightly) ──────────

CREATE OR REPLACE FUNCTION public.purge_ai_quotes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.daily_standup_tasks
  SET ai_evidence_quote = '[Quote purged — 90-day retention policy]'
  WHERE ai_evidence_quote IS NOT NULL
    AND ai_evidence_quote != '[Quote purged — 90-day retention policy]'
    AND created_at < now() - INTERVAL '90 days';

  UPDATE public.rm_deal_signals
  SET verbatim_quote = '[Quote purged — 90-day retention policy]'
  WHERE verbatim_quote IS NOT NULL
    AND verbatim_quote != '[Quote purged — 90-day retention policy]'
    AND created_at < now() - INTERVAL '90 days';

  DELETE FROM public.rm_task_discards
  WHERE discarded_at < now() - INTERVAL '90 days';
END;
$$;


-- ─── 17. task_type CHECK constraint ──────────────────────────────

-- Drop any existing constraint first
DO $$
BEGIN
  ALTER TABLE public.daily_standup_tasks
    DROP CONSTRAINT IF EXISTS dst_task_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_task_type_check
    CHECK (task_type IN (
      'contact_owner','build_buyer_universe','follow_up_with_buyer',
      'send_materials','update_pipeline','schedule_call',
      'nda_execution','ioi_loi_process','due_diligence',
      'buyer_qualification','seller_relationship','buyer_ic_followup',
      'other'
    ))
    NOT VALID;

ALTER TABLE public.daily_standup_tasks VALIDATE CONSTRAINT dst_task_type_check;


-- ─── 18. Dynamic priority_score calculation ──────────────────────
-- Computes a 0-100 score based on task type weight, due-date urgency,
-- buyer deal score, and entity importance. Called on insert/update.

CREATE OR REPLACE FUNCTION public.compute_task_priority_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  type_weight integer;
  urgency_score integer;
  buyer_bonus integer;
  days_until_due integer;
BEGIN
  -- Task type weight (mirrors TASK_TYPE_SCORES from TypeScript)
  type_weight := CASE NEW.task_type
    WHEN 'contact_owner' THEN 90
    WHEN 'schedule_call' THEN 80
    WHEN 'follow_up_with_buyer' THEN 75
    WHEN 'send_materials' THEN 70
    WHEN 'nda_execution' THEN 65
    WHEN 'ioi_loi_process' THEN 60
    WHEN 'due_diligence' THEN 55
    WHEN 'buyer_qualification' THEN 50
    WHEN 'build_buyer_universe' THEN 50
    WHEN 'seller_relationship' THEN 45
    WHEN 'buyer_ic_followup' THEN 40
    WHEN 'update_pipeline' THEN 30
    ELSE 40 -- 'other'
  END;

  -- Due-date urgency: overdue tasks get max boost, far-future tasks get none
  days_until_due := (NEW.due_date - CURRENT_DATE);
  urgency_score := CASE
    WHEN days_until_due < 0  THEN 30                              -- overdue: max urgency
    WHEN days_until_due = 0  THEN 25                              -- due today
    WHEN days_until_due = 1  THEN 20                              -- due tomorrow
    WHEN days_until_due <= 3 THEN 15                              -- due within 3 days
    WHEN days_until_due <= 7 THEN 10                              -- due this week
    ELSE 0                                                        -- future
  END;

  -- Buyer deal score bonus (if available): 0-15 range
  buyer_bonus := COALESCE(LEAST(NEW.buyer_deal_score / 7, 15), 0);

  -- Priority text modifier
  IF NEW.priority = 'urgent' THEN
    type_weight := type_weight + 10;
  ELSIF NEW.priority = 'high' THEN
    type_weight := type_weight + 5;
  ELSIF NEW.priority = 'low' THEN
    type_weight := type_weight - 10;
  END IF;

  -- Composite score: 35% type + 40% urgency + 25% buyer bonus, scaled to 0-100
  -- type_weight is 30-100, urgency is 0-30, buyer is 0-15
  NEW.priority_score := LEAST(
    GREATEST(
      (type_weight * 0.55 + urgency_score * 1.0 + buyer_bonus * 1.0)::integer,
      1
    ),
    100
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_priority_score ON public.daily_standup_tasks;
CREATE TRIGGER trg_compute_priority_score
  BEFORE INSERT OR UPDATE OF task_type, due_date, priority, buyer_deal_score
  ON public.daily_standup_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_task_priority_score();

-- Backfill existing tasks with computed scores
UPDATE public.daily_standup_tasks
SET priority_score = priority_score  -- triggers the BEFORE UPDATE trigger
WHERE status IN ('pending', 'pending_approval', 'in_progress', 'overdue');


-- ─── 19. pg_cron scheduling ─────────────────────────────────────
-- Schedule recurring maintenance jobs. pg_cron must be enabled in
-- Supabase dashboard (Database → Extensions → pg_cron).
-- These are wrapped in DO blocks so the migration doesn't fail if
-- pg_cron is not yet enabled.

DO $$
BEGIN
  -- Wake snoozed tasks every morning at 6:00 AM UTC
  PERFORM cron.schedule(
    'wake-snoozed-tasks',
    '0 6 * * *',
    'SELECT public.wake_snoozed_tasks()'
  );
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'pg_cron not available — skipping wake-snoozed-tasks schedule';
END $$;

DO $$
BEGIN
  -- Expire unreviewed AI tasks every morning at 6:05 AM UTC
  PERFORM cron.schedule(
    'expire-ai-tasks',
    '5 6 * * *',
    'SELECT public.expire_unreviewed_ai_tasks()'
  );
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'pg_cron not available — skipping expire-ai-tasks schedule';
END $$;

DO $$
BEGIN
  -- Purge old AI quotes nightly at 3:00 AM UTC
  PERFORM cron.schedule(
    'purge-ai-quotes',
    '0 3 * * *',
    'SELECT public.purge_ai_quotes()'
  );
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'pg_cron not available — skipping purge-ai-quotes schedule';
END $$;

DO $$
BEGIN
  -- Mark overdue tasks every morning at 5:55 AM UTC
  PERFORM cron.schedule(
    'mark-overdue-tasks',
    '55 5 * * *',
    $$UPDATE public.daily_standup_tasks
      SET status = 'overdue', updated_at = now()
      WHERE status IN ('pending','in_progress')
        AND due_date < CURRENT_DATE$$
  );
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'pg_cron not available — skipping mark-overdue-tasks schedule';
END $$;


-- ─── 20. Additional performance indexes ──────────────────────────

CREATE INDEX IF NOT EXISTS idx_task_activity_created
  ON public.rm_task_activity_log(created_at);

CREATE INDEX IF NOT EXISTS idx_signals_unacknowledged
  ON public.rm_deal_signals(acknowledged_at)
  WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cadence_active_contact
  ON public.rm_buyer_deal_cadence(is_active, last_contacted_at)
  WHERE is_active = true;

-- Merged from: 20260227000000_captarget_scheduled_sync.sql
-- ═══════════════════════════════════════════════════════════════
-- Migration: captarget_scheduled_sync
-- Date: 2026-02-27
-- Purpose: Schedules automatic CapTarget Google Sheet sync via
--          pg_cron, calling the sync-captarget-sheet edge function
--          daily at 6 AM ET (11:00 UTC). Includes a wrapper function
--          that handles pagination (the sync function may need
--          multiple passes for large sheets).
-- Tables affected: captarget_sync_log (write), listings (write)
-- ═══════════════════════════════════════════════════════════════

-- Ensure pg_net is available for HTTP calls from within the database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ─── Wrapper function that invokes the edge function ────────────
-- The sync-captarget-sheet function supports pagination via
-- { startTab, startRow } body params. This wrapper does a single
-- invocation; if the sheet is very large, the edge function will
-- log partial results and the next cron run picks up where it left off.

CREATE OR REPLACE FUNCTION invoke_captarget_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _supabase_url text;
  _service_key text;
BEGIN
  -- Read config from Supabase vault / settings
  _supabase_url := current_setting('app.settings.supabase_url', true);
  _service_key  := current_setting('app.settings.service_role_key', true);

  -- Fallback: try environment-style settings
  IF _supabase_url IS NULL THEN
    _supabase_url := current_setting('supabase.url', true);
  END IF;
  IF _service_key IS NULL THEN
    _service_key := current_setting('supabase.service_role_key', true);
  END IF;

  IF _supabase_url IS NULL OR _service_key IS NULL THEN
    RAISE WARNING 'captarget_sync: Missing supabase_url or service_role_key settings — skipping';
    RETURN;
  END IF;

  -- Fire-and-forget HTTP POST to the edge function
  PERFORM net.http_post(
    url     := _supabase_url || '/functions/v1/sync-captarget-sheet',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- ─── Schedule the cron job ──────────────────────────────────────
-- Runs daily at 11:00 UTC (6:00 AM Eastern).
-- The job name allows easy unscheduling later:
--   SELECT cron.unschedule('captarget-daily-sync');

DO $$
BEGIN
  -- Remove existing job if it exists (idempotent)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'captarget-daily-sync') THEN
    PERFORM cron.unschedule('captarget-daily-sync');
  END IF;

  -- Schedule: daily at 11:00 UTC (6 AM ET / 5 AM CT)
  PERFORM cron.schedule(
    'captarget-daily-sync',
    '0 11 * * *',
    'SELECT invoke_captarget_sync()'
  );
END;
$$;

-- ─── Verification ───────────────────────────────────────────────
-- After running this migration, verify with:
--   SELECT * FROM cron.job WHERE jobname = 'captarget-daily-sync';

-- Merged from: 20260227000000_document_distribution_system.sql
-- ============================================================================
-- DOCUMENT DISTRIBUTION & DATA ROOM SYSTEM
--
-- Phase 1: Core database schema for document tracking, tracked links,
-- immutable release log, data room access, and marketplace approval queue.
--
-- Table name mappings (spec → actual):
--   companies → listings
--   buyers → remarketing_buyers
--   marketplace_inquiries → connection_requests
--   profiles → profiles (unchanged)
--
-- Existing tables preserved:
--   data_room_documents, data_room_access, data_room_audit_log,
--   lead_memos, memo_distribution_log, lead_memo_versions
-- ============================================================================


-- ============================================================================
-- MIGRATION 1 of 6: Add project_name to listings
-- ============================================================================
-- The project_name is the anonymous codename used in all external comms.
-- Anonymous Teaser cannot be distributed until this is set.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS project_name_set_at TIMESTAMPTZ;


-- ============================================================================
-- MIGRATION 2 of 6: deal_documents
-- ============================================================================
-- Documents associated with a deal — AI-generated memos and manually uploaded files.
-- This extends the existing data_room_documents concept with document_type tiers:
--   full_detail_memo: INTERNAL ONLY — never distributed to buyers
--   anonymous_teaser: Pre-NDA distribution to buyers
--   data_room_file: Post-NDA diligence materials

CREATE TABLE IF NOT EXISTS public.deal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.listings(id) ON DELETE RESTRICT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'full_detail_memo', 'anonymous_teaser', 'data_room_file'
  )),
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT DEFAULT 'application/pdf',
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_documents_deal_id ON public.deal_documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_documents_type ON public.deal_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_deal_documents_current ON public.deal_documents(deal_id, document_type)
  WHERE is_current = true AND status = 'active';

COMMENT ON TABLE public.deal_documents IS
  'All documents for a deal: full_detail_memo (internal only), '
  'anonymous_teaser (pre-NDA), data_room_file (post-NDA). '
  'Version tracking via version + is_current flag.';


-- ============================================================================
-- MIGRATION 3 of 6: document_tracked_links
-- ============================================================================
-- One record per unique tracked link. Each link is per-buyer per-document.
-- Links open in a clean viewer with no SourceCo login required.

CREATE TABLE IF NOT EXISTS public.document_tracked_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.listings(id) NOT NULL,
  document_id UUID REFERENCES public.deal_documents(id) NOT NULL,
  buyer_id UUID REFERENCES public.remarketing_buyers(id),
  buyer_email TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_firm TEXT,
  link_token TEXT UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::TEXT, '-', ''),
  is_active BOOLEAN DEFAULT true,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id),
  revoke_reason TEXT,
  expires_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- idx_tracked_links_token omitted: UNIQUE constraint on link_token already creates an index
CREATE INDEX IF NOT EXISTS idx_tracked_links_deal_id ON public.document_tracked_links(deal_id);
CREATE INDEX IF NOT EXISTS idx_tracked_links_buyer ON public.document_tracked_links(buyer_id)
  WHERE buyer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracked_links_document ON public.document_tracked_links(document_id);

COMMENT ON TABLE public.document_tracked_links IS
  'Per-buyer, per-document tracked links. Public URL: /view/{link_token}. '
  'Tracks opens, supports revocation, and serves current document version.';


-- ============================================================================
-- MIGRATION 4 of 6: document_release_log (IMMUTABLE)
-- ============================================================================
-- Permanent audit record of every document release event.
-- RLS: INSERT + SELECT only. No UPDATE (except engagement fields via service role).
-- No DELETE ever.

CREATE TABLE IF NOT EXISTS public.document_release_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.listings(id) NOT NULL,
  document_id UUID REFERENCES public.deal_documents(id) NOT NULL,
  buyer_id UUID REFERENCES public.remarketing_buyers(id),
  buyer_name TEXT NOT NULL,
  buyer_firm TEXT,
  buyer_email TEXT NOT NULL,
  release_method TEXT NOT NULL CHECK (release_method IN (
    'tracked_link', 'pdf_download', 'auto_campaign', 'data_room_grant'
  )),
  nda_status_at_release TEXT,
  fee_agreement_status_at_release TEXT,
  released_by UUID REFERENCES public.profiles(id) NOT NULL,
  released_at TIMESTAMPTZ DEFAULT now(),
  tracked_link_id UUID REFERENCES public.document_tracked_links(id),
  first_opened_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,
  last_opened_at TIMESTAMPTZ,
  release_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_release_log_deal_id ON public.document_release_log(deal_id);
CREATE INDEX IF NOT EXISTS idx_release_log_released_at ON public.document_release_log(released_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_log_buyer ON public.document_release_log(buyer_id)
  WHERE buyer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_release_log_document ON public.document_release_log(document_id);

-- RLS: IMMUTABLE — admin INSERT + SELECT only. No UPDATE/DELETE for authenticated.
ALTER TABLE public.document_release_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "log_insert" ON public.document_release_log;
CREATE POLICY "log_insert" ON public.document_release_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "log_select" ON public.document_release_log;
CREATE POLICY "log_select" ON public.document_release_log
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Service role can update engagement fields (open_count, first_opened_at, last_opened_at)
DROP POLICY IF EXISTS "service_role_update_engagement" ON public.document_release_log;
CREATE POLICY "service_role_update_engagement" ON public.document_release_log
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.document_release_log;
CREATE POLICY "service_role_all" ON public.document_release_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- No DELETE policies for authenticated — records are permanent

COMMENT ON TABLE public.document_release_log IS
  'IMMUTABLE audit record of every document release. '
  'NDA/fee agreement status captured at release time and never changes. '
  'Only engagement fields (open_count, first/last_opened_at) can be updated via service role.';


-- ============================================================================
-- MIGRATION 5 of 6: deal_data_room_access
-- ============================================================================
-- Post-NDA buyer data room access. One record per buyer per deal.
-- Buyer uses a single access_token URL to view all granted documents.

CREATE TABLE IF NOT EXISTS public.deal_data_room_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.listings(id) NOT NULL,
  buyer_id UUID REFERENCES public.remarketing_buyers(id),
  buyer_email TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_firm TEXT,
  access_token TEXT UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::TEXT, '-', ''),
  granted_document_ids UUID[],
  is_active BOOLEAN DEFAULT true,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id),
  nda_signed_at TIMESTAMPTZ,
  fee_agreement_signed_at TIMESTAMPTZ,
  granted_by UUID REFERENCES public.profiles(id) NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  last_accessed_at TIMESTAMPTZ,
  UNIQUE(deal_id, buyer_email)
);

-- idx_deal_data_room_access_token omitted: UNIQUE constraint on access_token already creates an index
CREATE INDEX IF NOT EXISTS idx_deal_data_room_access_deal ON public.deal_data_room_access(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_data_room_access_buyer ON public.deal_data_room_access(buyer_id)
  WHERE buyer_id IS NOT NULL;

-- RLS
ALTER TABLE public.deal_data_room_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage deal data room access" ON public.deal_data_room_access;
CREATE POLICY "Admins can manage deal data room access"
  ON public.deal_data_room_access FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role full access" ON public.deal_data_room_access;
CREATE POLICY "Service role full access"
  ON public.deal_data_room_access FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.deal_data_room_access IS
  'Post-NDA buyer data room access. One access_token per buyer per deal. '
  'NDA/fee agreement timestamps captured at grant time as permanent record.';


-- ============================================================================
-- MIGRATION 6 of 6: marketplace_approval_queue
-- ============================================================================
-- Screens every inbound marketplace connection request before document release.
-- Manual approval required — never automated.

CREATE TABLE IF NOT EXISTS public.marketplace_approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_request_id UUID REFERENCES public.connection_requests(id) NOT NULL,
  deal_id UUID REFERENCES public.listings(id) NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_firm TEXT,
  buyer_role TEXT,
  buyer_message TEXT,
  matched_buyer_id UUID REFERENCES public.remarketing_buyers(id),
  match_confidence TEXT CHECK (match_confidence IN (
    'email_exact', 'firm_name', 'none'
  )),
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'declined'
  )),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  decline_reason TEXT,
  decline_category TEXT CHECK (decline_category IS NULL OR decline_category IN (
    'not_qualified', 'wrong_size', 'competitor', 'duplicate', 'other'
  )),
  decline_email_sent BOOLEAN DEFAULT false,
  release_log_id UUID REFERENCES public.document_release_log(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_queue_status ON public.marketplace_approval_queue(status);
CREATE INDEX IF NOT EXISTS idx_approval_queue_deal_id ON public.marketplace_approval_queue(deal_id);
CREATE INDEX IF NOT EXISTS idx_approval_queue_pending ON public.marketplace_approval_queue(created_at ASC)
  WHERE status = 'pending';

-- RLS
ALTER TABLE public.marketplace_approval_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage approval queue" ON public.marketplace_approval_queue;
CREATE POLICY "Admins can manage approval queue"
  ON public.marketplace_approval_queue FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role full access on approval queue" ON public.marketplace_approval_queue;
CREATE POLICY "Service role full access on approval queue"
  ON public.marketplace_approval_queue FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.marketplace_approval_queue IS
  'Mandatory screening for inbound marketplace connection requests. '
  'No documents released until a team member explicitly approves. '
  'Auto-matches buyer against remarketing_buyers universe on insert.';


-- ============================================================================
-- RLS & Grants for deal_documents and document_tracked_links
-- ============================================================================

ALTER TABLE public.deal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage deal documents" ON public.deal_documents;
CREATE POLICY "Admins can manage deal documents"
  ON public.deal_documents FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role full access on deal documents" ON public.deal_documents;
CREATE POLICY "Service role full access on deal documents"
  ON public.deal_documents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.document_tracked_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage tracked links" ON public.document_tracked_links;
CREATE POLICY "Admins can manage tracked links"
  ON public.document_tracked_links FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role full access on tracked links" ON public.document_tracked_links;
CREATE POLICY "Service role full access on tracked links"
  ON public.document_tracked_links FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ============================================================================
-- Grants
-- ============================================================================

GRANT ALL ON public.deal_documents TO authenticated;
GRANT ALL ON public.deal_documents TO service_role;

GRANT ALL ON public.document_tracked_links TO authenticated;
GRANT ALL ON public.document_tracked_links TO service_role;

-- Release log: authenticated can only SELECT and INSERT (immutable — no UPDATE/DELETE)
GRANT SELECT, INSERT ON public.document_release_log TO authenticated;
GRANT ALL ON public.document_release_log TO service_role;

GRANT ALL ON public.deal_data_room_access TO authenticated;
GRANT ALL ON public.deal_data_room_access TO service_role;

GRANT ALL ON public.marketplace_approval_queue TO authenticated;
GRANT ALL ON public.marketplace_approval_queue TO service_role;


-- ============================================================================
-- Storage bucket: deal-documents
-- ============================================================================
-- Folder structure per deal:
--   {deal_id}/internal/     ← Full Detail Memos
--   {deal_id}/marketing/    ← Anonymous Teasers
--   {deal_id}/data-room/    ← Uploaded diligence files
-- Files served via edge functions with 60s presigned URLs only.

INSERT INTO storage.buckets (id, name, public)
VALUES ('deal-documents', 'deal-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Admins can manage all files
DROP POLICY IF EXISTS "Admins can manage deal document files" ON storage.objects;
CREATE POLICY "Admins can manage deal document files"
ON storage.objects FOR ALL
USING (bucket_id = 'deal-documents' AND public.is_admin(auth.uid()))
WITH CHECK (bucket_id = 'deal-documents' AND public.is_admin(auth.uid()));

-- Service role full access (edge functions generate presigned URLs via service_role)
DROP POLICY IF EXISTS "Service role deal document files" ON storage.objects;
CREATE POLICY "Service role deal document files"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'deal-documents')
WITH CHECK (bucket_id = 'deal-documents');


-- ============================================================================
-- Additional indexes for buyer_email lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tracked_links_buyer_email
  ON public.document_tracked_links(buyer_email);
CREATE INDEX IF NOT EXISTS idx_release_log_buyer_email
  ON public.document_release_log(buyer_email);
CREATE INDEX IF NOT EXISTS idx_approval_queue_buyer_email
  ON public.marketplace_approval_queue(buyer_email);
CREATE INDEX IF NOT EXISTS idx_approval_queue_connection_request
  ON public.marketplace_approval_queue(connection_request_id);


-- ============================================================================
-- RPC: Atomic open_count increment (avoids read-then-write race condition)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_link_open_count(p_link_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_first_open BOOLEAN;
  v_result jsonb;
BEGIN
  -- Atomically increment and set timestamps
  UPDATE document_tracked_links
  SET
    open_count = open_count + 1,
    last_opened_at = now(),
    first_opened_at = COALESCE(first_opened_at, now())
  WHERE id = p_link_id
  RETURNING (first_opened_at = now()) INTO v_first_open;

  -- Also update the release log if this is the first open
  IF v_first_open THEN
    UPDATE document_release_log
    SET first_opened_at = now()
    WHERE tracked_link_id = p_link_id
      AND first_opened_at IS NULL;
  END IF;

  v_result := jsonb_build_object('first_open', v_first_open);
  RETURN v_result;
END;
$$;


-- ============================================================================
-- Summary:
--   1 column added to listings: project_name, project_name_set_at
--   4 new tables: deal_documents, document_tracked_links,
--                 document_release_log, deal_data_room_access,
--                 marketplace_approval_queue
--   1 storage bucket: deal-documents
--   RLS: Admin-only for all tables. Release log is INSERT+SELECT only.
--   All FKs reference actual table names (listings, remarketing_buyers, etc.)
-- ============================================================================
