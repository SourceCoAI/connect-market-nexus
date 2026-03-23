-- ============================================================
-- 1. Add is_ds_meeting flag to standup_meetings
-- 2. Backfill based on meeting_title containing <ds>
-- 3. Delete ALL non-<ds> meetings, their tasks, and related data
-- 4. Only <ds>-tagged meetings should appear in the standup tracker
-- ============================================================

-- Step 1: Add is_ds_meeting column
ALTER TABLE standup_meetings
  ADD COLUMN IF NOT EXISTS is_ds_meeting boolean NOT NULL DEFAULT false;

-- Step 2: Backfill — mark meetings whose title contains <ds> (case-insensitive, including HTML-encoded)
UPDATE standup_meetings
SET is_ds_meeting = true
WHERE lower(meeting_title) LIKE '%<ds>%'
   OR lower(meeting_title) LIKE '%&lt;ds&gt;%'
   OR lower(meeting_title) LIKE '%\%3cds\%3e%';

-- Step 3: Collect IDs of tasks to delete (from non-<ds> meetings)
-- Also delete any AI-extracted tasks with NULL source_meeting_id (orphans from before the filter)
-- but preserve manually-created tasks (is_manual = true)

-- 3a: Delete deal_activities referencing tasks from non-<ds> meetings
DELETE FROM deal_activities
WHERE (metadata->>'task_id') IN (
  SELECT id::text FROM daily_standup_tasks
  WHERE source_meeting_id IN (
    SELECT id FROM standup_meetings WHERE is_ds_meeting = false
  )
);

-- 3b: Delete tasks from non-<ds> meetings
DELETE FROM daily_standup_tasks
WHERE source_meeting_id IN (
  SELECT id FROM standup_meetings WHERE is_ds_meeting = false
);

-- 3c: Delete AI-extracted orphan tasks (no meeting link, not manual)
-- These are tasks that were extracted from non-<ds> meetings but lost their meeting reference
DELETE FROM daily_standup_tasks
WHERE source_meeting_id IS NULL
  AND is_manual = false
  AND source = 'ai';

-- Step 4: Delete non-<ds> meetings themselves
DELETE FROM standup_meetings
WHERE is_ds_meeting = false;

-- Step 5: Index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_standup_meetings_is_ds
  ON standup_meetings (is_ds_meeting)
  WHERE is_ds_meeting = true;
