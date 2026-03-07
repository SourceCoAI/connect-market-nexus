-- =============================================================================
-- Safety-net trigger: auto-set completed_at when status transitions to
-- 'completed', and clear it when status moves away from 'completed'.
--
-- The app layer (useToggleTaskComplete) already sets completed_at, but this
-- trigger ensures any other code path that updates status is also covered.
-- =============================================================================

CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- Only set if the app layer hasn't already set it in this UPDATE
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at = NOW();
    END IF;
  ELSIF NEW.status IS DISTINCT FROM 'completed' AND OLD.status = 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_task_completed_at
  BEFORE UPDATE ON daily_standup_tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_completed_at();
