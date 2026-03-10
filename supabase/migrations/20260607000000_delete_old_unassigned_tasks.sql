-- ============================================================
-- Delete all old unassigned standup tasks.
-- These are AI-extracted tasks that were never assigned to anyone
-- and are no longer useful. Clean slate for the new deal-only
-- extraction system.
-- ============================================================

-- Step 1: Remove deal_activities referencing unassigned tasks
DELETE FROM deal_activities
WHERE (metadata->>'task_id') IN (
  SELECT id::text FROM daily_standup_tasks
  WHERE assignee_id IS NULL
);

-- Step 2: Delete all unassigned tasks
DELETE FROM daily_standup_tasks
WHERE assignee_id IS NULL;

-- Step 3: Also delete any tasks that are old (> 30 days) and still pending_approval
-- These were never reviewed and are stale
DELETE FROM deal_activities
WHERE (metadata->>'task_id') IN (
  SELECT id::text FROM daily_standup_tasks
  WHERE status = 'pending_approval'
    AND created_at < now() - INTERVAL '30 days'
);

DELETE FROM daily_standup_tasks
WHERE status = 'pending_approval'
  AND created_at < now() - INTERVAL '30 days';
