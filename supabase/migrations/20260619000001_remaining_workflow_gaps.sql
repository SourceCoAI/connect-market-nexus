-- ============================================================================
-- REMAINING WORKFLOW GAPS MIGRATION
-- Date: 2026-04-07
-- Purpose: Auto-completion rules, per-deal cadence, last_contacted_at,
--          auto-approve threshold, and enrichment diff tracking.
-- ============================================================================

-- ============================================================================
-- 1. TASK AUTO-COMPLETION RULES (Gap #2)
--    Maps task types to database state changes for auto-detection
-- ============================================================================
CREATE TABLE IF NOT EXISTS task_auto_completion_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL,
  watch_table text NOT NULL,
  watch_column text NOT NULL,
  trigger_value text NOT NULL,
  match_via text NOT NULL DEFAULT 'deal_id',
  -- How to link the task to the watched row: 'deal_id', 'entity_id', 'listing_id'
  is_active boolean DEFAULT true,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE task_auto_completion_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to task_auto_completion_rules"
  ON task_auto_completion_rules FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admins can read task_auto_completion_rules"
  ON task_auto_completion_rules FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Seed rules for common task types
INSERT INTO task_auto_completion_rules (task_type, watch_table, watch_column, trigger_value, match_via, description)
VALUES
  ('nda_execution', 'deal_pipeline', 'nda_status', 'signed', 'deal_id', 'Auto-complete when NDA is signed on the deal'),
  ('send_materials', 'deal_pipeline', 'nda_status', 'sent', 'deal_id', 'Auto-complete when NDA/materials are sent'),
  ('schedule_call', 'deal_activities', 'activity_type', 'call_completed', 'deal_id', 'Auto-complete when a call is logged on the deal'),
  ('build_buyer_universe', 'remarketing_buyer_universes', 'id', 'EXISTS', 'deal_id', 'Auto-complete when a buyer universe is created for this deal')
ON CONFLICT DO NOTHING;

-- Function to check and auto-complete matching tasks
CREATE OR REPLACE FUNCTION check_task_auto_completion()
RETURNS void AS $$
DECLARE
  v_rule record;
  v_task record;
  v_sql text;
  v_match boolean;
BEGIN
  FOR v_rule IN
    SELECT * FROM task_auto_completion_rules WHERE is_active = true
  LOOP
    -- Find open tasks matching this rule's task_type
    FOR v_task IN
      SELECT id, deal_id, entity_id, entity_type, title
      FROM daily_standup_tasks
      WHERE task_type = v_rule.task_type
        AND status IN ('pending', 'in_progress')
        AND deal_id IS NOT NULL
    LOOP
      -- Check if the watched condition is met
      BEGIN
        IF v_rule.trigger_value = 'EXISTS' THEN
          EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I WHERE %I IS NOT NULL LIMIT 1)',
            v_rule.watch_table, v_rule.watch_column
          ) INTO v_match;
        ELSE
          IF v_rule.match_via = 'deal_id' THEN
            EXECUTE format(
              'SELECT EXISTS(SELECT 1 FROM %I WHERE %I = %L AND id = %L LIMIT 1)',
              v_rule.watch_table, v_rule.watch_column, v_rule.trigger_value, v_task.deal_id
            ) INTO v_match;
          ELSE
            -- For deal-level matching, check if any row in the watched table matches
            EXECUTE format(
              'SELECT EXISTS(SELECT 1 FROM %I WHERE %I = %L LIMIT 1)',
              v_rule.watch_table, v_rule.watch_column, v_rule.trigger_value
            ) INTO v_match;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_match := false;
      END;

      IF v_match THEN
        UPDATE daily_standup_tasks
        SET status = 'completed',
            completed_at = now(),
            completion_notes = format('Auto-completed: %s', v_rule.description)
        WHERE id = v_task.id;

        -- Log to deal_activities
        IF v_task.deal_id IS NOT NULL THEN
          PERFORM log_deal_activity(
            v_task.deal_id,
            'task_completed',
            format('Auto-completed: %s', v_task.title),
            v_rule.description,
            NULL,
            jsonb_build_object('auto_completed', true, 'rule_id', v_rule.id)
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule auto-completion check every 30 minutes
DO $$
BEGIN
  PERFORM cron.schedule(
    'check-task-auto-completion',
    '*/30 * * * *',
    'SELECT check_task_auto_completion()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling failed: %', SQLERRM;
END $$;

-- ============================================================================
-- 2. PER-DEAL FOLLOW-UP CADENCE (Gap #3)
-- ============================================================================
ALTER TABLE deal_pipeline ADD COLUMN IF NOT EXISTS follow_up_cadence_days int DEFAULT 7;

-- Update detect-stale-deals to use per-deal cadence (the edge function reads this column)

-- ============================================================================
-- 3. LAST_CONTACTED_AT ON CONTACTS (Gap #19)
-- ============================================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;

-- Backfill from existing history
UPDATE contacts c
SET last_contacted_at = GREATEST(
  (SELECT MAX(sent_at) FROM contact_email_history WHERE contact_id = c.id),
  (SELECT MAX(called_at) FROM contact_call_history WHERE contact_id = c.id),
  (SELECT MAX(activity_timestamp) FROM contact_linkedin_history WHERE contact_id = c.id)
)
WHERE c.last_contacted_at IS NULL;

-- Trigger: update last_contacted_at on new email
CREATE OR REPLACE FUNCTION update_contact_last_contacted_email()
RETURNS trigger AS $$
BEGIN
  UPDATE contacts SET last_contacted_at = NEW.sent_at
  WHERE id = NEW.contact_id
    AND (last_contacted_at IS NULL OR last_contacted_at < NEW.sent_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_contact_last_contacted_email ON contact_email_history;
CREATE TRIGGER trg_update_contact_last_contacted_email
  AFTER INSERT ON contact_email_history
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_last_contacted_email();

-- Trigger: update last_contacted_at on new call
CREATE OR REPLACE FUNCTION update_contact_last_contacted_call()
RETURNS trigger AS $$
BEGIN
  UPDATE contacts SET last_contacted_at = NEW.called_at
  WHERE id = NEW.contact_id
    AND (last_contacted_at IS NULL OR last_contacted_at < NEW.called_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_contact_last_contacted_call ON contact_call_history;
CREATE TRIGGER trg_update_contact_last_contacted_call
  AFTER INSERT ON contact_call_history
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_last_contacted_call();

-- Trigger: update last_contacted_at on new LinkedIn activity
CREATE OR REPLACE FUNCTION update_contact_last_contacted_linkedin()
RETURNS trigger AS $$
BEGIN
  UPDATE contacts SET last_contacted_at = NEW.activity_timestamp
  WHERE id = NEW.contact_id
    AND (last_contacted_at IS NULL OR last_contacted_at < NEW.activity_timestamp);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_contact_last_contacted_linkedin ON contact_linkedin_history;
CREATE TRIGGER trg_update_contact_last_contacted_linkedin
  AFTER INSERT ON contact_linkedin_history
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_last_contacted_linkedin();

-- Index for sorting contacts by staleness
CREATE INDEX IF NOT EXISTS idx_contacts_last_contacted_at
  ON contacts (last_contacted_at)
  WHERE last_contacted_at IS NOT NULL;

-- ============================================================================
-- 4. AUTO-APPROVE THRESHOLD SETTING (Gap #15)
-- ============================================================================
INSERT INTO app_settings (key, value)
VALUES ('standup_auto_approve_confidence', '"high"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 5. GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION check_task_auto_completion TO service_role;
GRANT EXECUTE ON FUNCTION update_contact_last_contacted_email TO service_role;
GRANT EXECUTE ON FUNCTION update_contact_last_contacted_call TO service_role;
GRANT EXECUTE ON FUNCTION update_contact_last_contacted_linkedin TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON task_auto_completion_rules TO service_role;
