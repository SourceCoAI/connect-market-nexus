-- ============================================================================
-- COMPREHENSIVE WORKFLOW AUTOMATION MIGRATION
-- Date: 2026-04-07
-- Purpose: Fix deal_activities population, add auto-task creation,
--          recurring tasks, task templates, stale deal detection,
--          daily digest, and overdue escalation infrastructure.
-- ============================================================================

-- ============================================================================
-- 0. FIX daily_standup_tasks STATUS CONSTRAINT
--    Migration 20260330000002 restricted to only 4 statuses, losing
--    in_progress, snoozed, cancelled, listing_closed. Restore them.
-- ============================================================================
ALTER TABLE daily_standup_tasks DROP CONSTRAINT IF EXISTS daily_standup_tasks_status_check;
ALTER TABLE daily_standup_tasks ADD CONSTRAINT daily_standup_tasks_status_check
  CHECK (status IN (
    'pending_approval', 'pending', 'in_progress', 'completed',
    'overdue', 'snoozed', 'cancelled', 'listing_closed'
  ));

-- ============================================================================
-- 1. EXPAND deal_activities activity_type CHECK CONSTRAINT
--    Add new types needed by webhook handlers and automation
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE deal_activities DROP CONSTRAINT IF EXISTS deal_activities_activity_type_check;
  ALTER TABLE deal_activities ADD CONSTRAINT deal_activities_activity_type_check
    CHECK (activity_type IN (
      -- Original types
      'stage_change', 'task_created', 'task_completed', 'note_added',
      'email_sent', 'call_made', 'meeting_scheduled', 'document_shared',
      'nda_sent', 'nda_signed', 'fee_agreement_sent', 'fee_agreement_signed',
      'follow_up',
      -- New types for webhook automation
      'call_completed', 'email_received', 'buyer_response',
      'linkedin_message', 'linkedin_connection',
      'transcript_linked', 'enrichment_completed',
      'buyer_status_change', 'assignment_changed',
      'deal_created', 'deal_updated', 'deal_deleted', 'deal_restored',
      'task_assigned', 'task_overdue', 'task_snoozed',
      'meeting_linked', 'meeting_summary_generated',
      'stale_deal_flagged', 'auto_followup_created'
    ));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not alter deal_activities constraint: %', SQLERRM;
END $$;

-- ============================================================================
-- 2. ADD last_activity_at TO deals FOR FAST STALE DETECTION
-- ============================================================================
ALTER TABLE deal_pipeline ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now();

-- Backfill last_activity_at from existing deal_activities
UPDATE deal_pipeline d
SET last_activity_at = COALESCE(
  (SELECT MAX(created_at) FROM deal_activities WHERE deal_id = d.id),
  d.updated_at,
  d.created_at
)
WHERE d.last_activity_at IS NULL OR d.last_activity_at = d.created_at;

-- ============================================================================
-- 3. AUTO-UPDATE deals.last_activity_at ON NEW deal_activities
-- ============================================================================
CREATE OR REPLACE FUNCTION update_deal_last_activity()
RETURNS trigger AS $$
BEGIN
  UPDATE deal_pipeline SET last_activity_at = NEW.created_at
  WHERE id = NEW.deal_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_deal_last_activity ON deal_activities;
CREATE TRIGGER trg_update_deal_last_activity
  AFTER INSERT ON deal_activities
  FOR EACH ROW
  EXECUTE FUNCTION update_deal_last_activity();

-- ============================================================================
-- 4. HELPER FUNCTION: log_deal_activity (callable from edge functions)
-- ============================================================================
CREATE OR REPLACE FUNCTION log_deal_activity(
  p_deal_id uuid,
  p_activity_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO deal_activities (id, deal_id, admin_id, activity_type, title, description, metadata)
  VALUES (gen_random_uuid(), p_deal_id, p_admin_id, p_activity_type, p_title, p_description, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'log_deal_activity failed for deal %: %', p_deal_id, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. RECURRING TASK SUPPORT ON daily_standup_tasks
-- ============================================================================
ALTER TABLE daily_standup_tasks ADD COLUMN IF NOT EXISTS recurrence_rule text;
-- Format: 'daily', 'weekly', 'biweekly', 'monthly', or cron expression
ALTER TABLE daily_standup_tasks ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid REFERENCES daily_standup_tasks(id);
ALTER TABLE daily_standup_tasks ADD COLUMN IF NOT EXISTS template_id uuid;
ALTER TABLE daily_standup_tasks ADD COLUMN IF NOT EXISTS auto_generated boolean DEFAULT false;
ALTER TABLE daily_standup_tasks ADD COLUMN IF NOT EXISTS generation_source text;
-- Source: 'call_disposition', 'email_reply', 'stage_entry', 'stale_deal', 'recurrence', 'meeting_extraction', 'template'

-- ============================================================================
-- 6. TASK TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text DEFAULT 'general',
  stage_trigger text,
  -- When a deal enters this stage, auto-create these tasks
  tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Array of: { title, description, task_type, priority, due_offset_days, depends_on_index }
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage task templates"
  ON task_templates FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Service role full access to task_templates"
  ON task_templates FOR ALL
  USING (auth.role() = 'service_role');

-- Seed default templates
INSERT INTO task_templates (name, description, category, stage_trigger, tasks) VALUES
(
  'New Deal Intake',
  'Standard tasks when a new deal is created',
  'deal_process',
  NULL,
  '[
    {"title": "Research company background", "task_type": "other", "priority": "high", "due_offset_days": 1},
    {"title": "Build buyer universe", "task_type": "build_buyer_universe", "priority": "high", "due_offset_days": 3},
    {"title": "Contact deal owner for intro call", "task_type": "contact_owner", "priority": "high", "due_offset_days": 2}
  ]'::jsonb
),
(
  'Buyer Outreach Launch',
  'Tasks when buyer outreach begins for a deal',
  'deal_process',
  NULL,
  '[
    {"title": "Launch email campaign", "task_type": "contact_buyers", "priority": "high", "due_offset_days": 1},
    {"title": "Launch LinkedIn outreach", "task_type": "contact_buyers", "priority": "medium", "due_offset_days": 2},
    {"title": "Prepare call list for PhoneBurner", "task_type": "find_buyers", "priority": "medium", "due_offset_days": 1},
    {"title": "Review initial outreach responses", "task_type": "follow_up_with_buyer", "priority": "high", "due_offset_days": 5}
  ]'::jsonb
),
(
  'Due Diligence Checklist',
  'Standard DD tasks when deal enters due diligence',
  'deal_process',
  'Due Diligence',
  '[
    {"title": "Request financial statements (3 years)", "task_type": "send_materials", "priority": "high", "due_offset_days": 1},
    {"title": "Request customer concentration data", "task_type": "send_materials", "priority": "high", "due_offset_days": 1},
    {"title": "Request employee roster and org chart", "task_type": "send_materials", "priority": "medium", "due_offset_days": 3},
    {"title": "Schedule management team call", "task_type": "schedule_call", "priority": "high", "due_offset_days": 5},
    {"title": "Review lease agreements", "task_type": "due_diligence", "priority": "medium", "due_offset_days": 7},
    {"title": "Verify revenue quality and recurring %", "task_type": "due_diligence", "priority": "high", "due_offset_days": 5},
    {"title": "Assess technology and systems", "task_type": "due_diligence", "priority": "medium", "due_offset_days": 7},
    {"title": "Customer reference calls", "task_type": "schedule_call", "priority": "high", "due_offset_days": 10}
  ]'::jsonb
),
(
  'Post-Call Follow-up',
  'Standard follow-up tasks after a buyer/seller call',
  'follow_up',
  NULL,
  '[
    {"title": "Send call summary to team", "task_type": "email", "priority": "high", "due_offset_days": 0},
    {"title": "Update deal notes with key takeaways", "task_type": "update_pipeline", "priority": "high", "due_offset_days": 0},
    {"title": "Send follow-up email to contact", "task_type": "follow_up_with_buyer", "priority": "high", "due_offset_days": 1},
    {"title": "Schedule next touchpoint", "task_type": "schedule_call", "priority": "medium", "due_offset_days": 2}
  ]'::jsonb
),
(
  'Interested Buyer Response',
  'Tasks when a buyer responds positively to outreach',
  'buyer_response',
  NULL,
  '[
    {"title": "Schedule introductory call", "task_type": "schedule_call", "priority": "high", "due_offset_days": 1},
    {"title": "Prepare buyer brief and talking points", "task_type": "send_materials", "priority": "high", "due_offset_days": 1},
    {"title": "Qualify buyer investment criteria", "task_type": "buyer_qualification", "priority": "high", "due_offset_days": 3}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. AUTO-CREATE TASKS WHEN DEAL STAGE CHANGES (trigger)
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_create_stage_tasks()
RETURNS trigger AS $$
DECLARE
  v_template record;
  v_task jsonb;
  v_stage_name text;
  v_assignee_id uuid;
BEGIN
  -- Only fire on stage_id change
  IF OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
    RETURN NEW;
  END IF;

  -- Get the new stage name
  SELECT name INTO v_stage_name FROM deal_stages WHERE id = NEW.stage_id;
  IF v_stage_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get deal assignee for task assignment
  v_assignee_id := NEW.assigned_to;

  -- Find matching templates
  FOR v_template IN
    SELECT * FROM task_templates
    WHERE is_active = true AND stage_trigger = v_stage_name
  LOOP
    -- Create tasks from template
    FOR v_task IN SELECT * FROM jsonb_array_elements(v_template.tasks)
    LOOP
      INSERT INTO daily_standup_tasks (
        title, description, assignee_id, task_type, priority,
        status, due_date, entity_type, entity_id,
        deal_id, auto_generated, generation_source, template_id,
        source, created_at
      ) VALUES (
        v_task->>'title',
        v_task->>'description',
        v_assignee_id,
        COALESCE(v_task->>'task_type', 'other'),
        COALESCE(v_task->>'priority', 'medium'),
        'pending',
        CURRENT_DATE + (COALESCE((v_task->>'due_offset_days')::int, 3)),
        'deal',
        NEW.id,
        NEW.id,
        true,
        'stage_entry',
        v_template.id,
        'template',
        now()
      );
    END LOOP;

    -- Log to deal_activities
    PERFORM log_deal_activity(
      NEW.id,
      'task_created',
      format('Auto-created tasks from template: %s', v_template.name),
      format('Stage changed to %s — created %s tasks', v_stage_name, jsonb_array_length(v_template.tasks)),
      v_assignee_id,
      jsonb_build_object('template_id', v_template.id, 'stage', v_stage_name)
    );
  END LOOP;

  -- Log stage change to deal_activities
  PERFORM log_deal_activity(
    NEW.id,
    'stage_change',
    format('Stage changed to %s', v_stage_name),
    NULL,
    v_assignee_id,
    jsonb_build_object(
      'old_stage_id', OLD.stage_id,
      'new_stage_id', NEW.stage_id,
      'stage_name', v_stage_name
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_create_stage_tasks ON deal_pipeline;
CREATE TRIGGER trg_auto_create_stage_tasks
  AFTER UPDATE ON deal_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_stage_tasks();

-- ============================================================================
-- 8. AUTO-LOG deal_activities ON DEAL ASSIGNMENT CHANGE
-- ============================================================================
CREATE OR REPLACE FUNCTION log_deal_assignment_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    PERFORM log_deal_activity(
      NEW.id,
      'assignment_changed',
      'Deal ownership changed',
      NULL,
      NEW.assigned_to,
      jsonb_build_object(
        'old_assignee', OLD.assigned_to,
        'new_assignee', NEW.assigned_to
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_deal_assignment_change ON deal_pipeline;
CREATE TRIGGER trg_log_deal_assignment_change
  AFTER UPDATE ON deal_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION log_deal_assignment_change();

-- ============================================================================
-- 9. AUTO-RECUR COMPLETED TASKS
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_recur_completed_task()
RETURNS trigger AS $$
DECLARE
  v_next_due date;
  v_new_id uuid;
BEGIN
  -- Only fire when status changes to completed
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Only for tasks with recurrence rules
  IF NEW.recurrence_rule IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate next due date
  v_next_due := CASE NEW.recurrence_rule
    WHEN 'daily' THEN CURRENT_DATE + 1
    WHEN 'weekly' THEN CURRENT_DATE + 7
    WHEN 'biweekly' THEN CURRENT_DATE + 14
    WHEN 'monthly' THEN CURRENT_DATE + 30
    ELSE CURRENT_DATE + 7 -- default weekly
  END;

  -- Create next instance
  INSERT INTO daily_standup_tasks (
    title, description, assignee_id, task_type, priority,
    status, due_date, entity_type, entity_id,
    deal_id, recurrence_rule, recurrence_parent_id,
    auto_generated, generation_source, source,
    created_at
  ) VALUES (
    NEW.title,
    NEW.description,
    NEW.assignee_id,
    NEW.task_type,
    NEW.priority,
    'pending',
    v_next_due,
    NEW.entity_type,
    NEW.entity_id,
    NEW.deal_id,
    NEW.recurrence_rule,
    COALESCE(NEW.recurrence_parent_id, NEW.id),
    true,
    'recurrence',
    'system',
    now()
  )
  RETURNING id INTO v_new_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_recur_completed_task ON daily_standup_tasks;
CREATE TRIGGER trg_auto_recur_completed_task
  AFTER UPDATE ON daily_standup_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_recur_completed_task();

-- ============================================================================
-- 10. OVERDUE TASK ESCALATION TRACKING
-- ============================================================================
ALTER TABLE daily_standup_tasks ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE daily_standup_tasks ADD COLUMN IF NOT EXISTS escalation_level int DEFAULT 0;
-- 0 = not escalated, 1 = assignee notified, 2 = manager notified, 3 = leadership notified

-- ============================================================================
-- 11. CRON JOBS FOR AUTOMATION
-- ============================================================================

-- 11a. Check overdue tasks and trigger escalation (every hour)
CREATE OR REPLACE FUNCTION trigger_overdue_task_check()
RETURNS void AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT current_setting('app.settings.supabase_url', true) INTO v_url;
  SELECT current_setting('app.settings.service_role_key', true) INTO v_key;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'Missing supabase_url or service_role_key settings';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/check-overdue-tasks',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );

  INSERT INTO cron_job_logs (job_name, result, created_at)
  VALUES ('check-overdue-tasks', jsonb_build_object('status', 'triggered'), now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11b. Detect stale deals (daily at 9 AM ET = 13:00 or 14:00 UTC)
CREATE OR REPLACE FUNCTION trigger_stale_deal_detection()
RETURNS void AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT current_setting('app.settings.supabase_url', true) INTO v_url;
  SELECT current_setting('app.settings.service_role_key', true) INTO v_key;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'Missing supabase_url or service_role_key settings';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/detect-stale-deals',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );

  INSERT INTO cron_job_logs (job_name, result, created_at)
  VALUES ('detect-stale-deals', jsonb_build_object('status', 'triggered'), now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11c. Send daily digest (daily at 7 AM ET = 11:00 or 12:00 UTC)
CREATE OR REPLACE FUNCTION trigger_daily_digest()
RETURNS void AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT current_setting('app.settings.supabase_url', true) INTO v_url;
  SELECT current_setting('app.settings.service_role_key', true) INTO v_key;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'Missing supabase_url or service_role_key settings';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/send-daily-digest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );

  INSERT INTO cron_job_logs (job_name, result, created_at)
  VALUES ('send-daily-digest', jsonb_build_object('status', 'triggered'), now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11d. Auto-sync ALL Fireflies transcripts (every 2 hours)
CREATE OR REPLACE FUNCTION trigger_auto_fireflies_sync()
RETURNS void AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT current_setting('app.settings.supabase_url', true) INTO v_url;
  SELECT current_setting('app.settings.service_role_key', true) INTO v_key;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'Missing supabase_url or service_role_key settings';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/auto-pair-all-fireflies',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := '{"lookback_hours": 4}'::jsonb
  );

  INSERT INTO cron_job_logs (job_name, result, created_at)
  VALUES ('auto-fireflies-sync', jsonb_build_object('status', 'triggered'), now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the cron jobs (handles both EDT and EST)
DO $$
BEGIN
  -- Overdue task check: every hour
  PERFORM cron.schedule(
    'check-overdue-tasks',
    '0 * * * *',
    'SELECT trigger_overdue_task_check()'
  );

  -- Stale deal detection: 9 AM ET (13:00 and 14:00 UTC for EDT/EST)
  PERFORM cron.schedule(
    'detect-stale-deals-edt',
    '0 13 * * *',
    'SELECT trigger_stale_deal_detection()'
  );
  PERFORM cron.schedule(
    'detect-stale-deals-est',
    '0 14 * * *',
    'SELECT trigger_stale_deal_detection()'
  );

  -- Daily digest: 7 AM ET (11:00 and 12:00 UTC for EDT/EST)
  PERFORM cron.schedule(
    'send-daily-digest-edt',
    '0 11 * * 1-5',
    'SELECT trigger_daily_digest()'
  );
  PERFORM cron.schedule(
    'send-daily-digest-est',
    '0 12 * * 1-5',
    'SELECT trigger_daily_digest()'
  );

  -- Auto Fireflies sync: every 2 hours
  PERFORM cron.schedule(
    'auto-fireflies-sync',
    '30 */2 * * *',
    'SELECT trigger_auto_fireflies_sync()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling failed (extension may not be available in this environment): %', SQLERRM;
END $$;

-- ============================================================================
-- 12. ADD INDEX FOR STALE DEAL QUERIES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_deals_last_activity_at ON deal_pipeline (last_activity_at)
  WHERE last_activity_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_id_created ON deal_activities (deal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_standup_tasks_overdue
  ON daily_standup_tasks (assignee_id, due_date)
  WHERE status IN ('pending', 'in_progress') AND due_date < CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_daily_standup_tasks_recurrence
  ON daily_standup_tasks (recurrence_rule)
  WHERE recurrence_rule IS NOT NULL;

-- ============================================================================
-- 13. TASK COMPLETION → deal_activities TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION log_task_completion_to_deal()
RETURNS trigger AS $$
BEGIN
  -- Log when task is completed
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.deal_id IS NOT NULL THEN
    PERFORM log_deal_activity(
      NEW.deal_id,
      'task_completed',
      format('Task completed: %s', NEW.title),
      NEW.completion_notes,
      NEW.assignee_id,
      jsonb_build_object(
        'task_id', NEW.id,
        'task_type', NEW.task_type,
        'completed_at', NEW.completed_at
      )
    );
  END IF;

  -- Log when task becomes overdue
  IF NEW.status = 'overdue' AND OLD.status != 'overdue' AND NEW.deal_id IS NOT NULL THEN
    PERFORM log_deal_activity(
      NEW.deal_id,
      'task_overdue',
      format('Task overdue: %s', NEW.title),
      NULL,
      NEW.assignee_id,
      jsonb_build_object('task_id', NEW.id, 'due_date', NEW.due_date)
    );
  END IF;

  -- Log when task is snoozed
  IF NEW.status = 'snoozed' AND OLD.status != 'snoozed' AND NEW.deal_id IS NOT NULL THEN
    PERFORM log_deal_activity(
      NEW.deal_id,
      'task_snoozed',
      format('Task snoozed: %s (until %s)', NEW.title, NEW.snoozed_until),
      NULL,
      NEW.assignee_id,
      jsonb_build_object('task_id', NEW.id, 'snoozed_until', NEW.snoozed_until)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_task_completion_to_deal ON daily_standup_tasks;
CREATE TRIGGER trg_log_task_completion_to_deal
  AFTER UPDATE ON daily_standup_tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_completion_to_deal();

-- ============================================================================
-- 14. GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION log_deal_activity TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_deal_last_activity TO service_role;
GRANT EXECUTE ON FUNCTION auto_create_stage_tasks TO service_role;
GRANT EXECUTE ON FUNCTION log_deal_assignment_change TO service_role;
GRANT EXECUTE ON FUNCTION auto_recur_completed_task TO service_role;
GRANT EXECUTE ON FUNCTION log_task_completion_to_deal TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON task_templates TO authenticated, service_role;
