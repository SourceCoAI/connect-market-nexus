-- ============================================================
-- Retroactively assign orphaned standup tasks (assignee_id IS NULL)
-- by matching speaker names from task descriptions against profiles
-- and team_member_aliases.
-- ============================================================

-- Step 1: Match tasks by exact alias match against the description "Speaker: <name>" pattern
UPDATE daily_standup_tasks t
SET assignee_id = matched.profile_id
FROM (
  SELECT DISTINCT ON (t2.id) t2.id AS task_id, a.profile_id
  FROM daily_standup_tasks t2
  JOIN team_member_aliases a
    ON t2.description ILIKE '%Speaker: ' || a.alias || '%'
  WHERE t2.assignee_id IS NULL
    AND t2.is_manual = false
  ORDER BY t2.id, length(a.alias) DESC  -- prefer longest alias match
) matched
WHERE t.id = matched.task_id;

-- Step 2: Match remaining tasks by profile first_name from the description
UPDATE daily_standup_tasks t
SET assignee_id = matched.profile_id
FROM (
  SELECT DISTINCT ON (t2.id) t2.id AS task_id, p.id AS profile_id
  FROM daily_standup_tasks t2
  JOIN profiles p
    ON t2.description ILIKE '%Speaker: ' || p.first_name || '%'
       AND p.first_name IS NOT NULL
       AND length(p.first_name) >= 2  -- avoid spurious single-letter matches
  JOIN user_roles ur
    ON ur.user_id = p.id
    AND ur.role IN ('owner', 'admin', 'moderator')
  WHERE t2.assignee_id IS NULL
    AND t2.is_manual = false
  ORDER BY t2.id, length(p.first_name) DESC
) matched
WHERE t.id = matched.task_id;

-- Step 3: Match remaining tasks by profile full name (first_name || ' ' || last_name)
UPDATE daily_standup_tasks t
SET assignee_id = matched.profile_id
FROM (
  SELECT DISTINCT ON (t2.id) t2.id AS task_id, p.id AS profile_id
  FROM daily_standup_tasks t2
  JOIN profiles p
    ON t2.description ILIKE '%Speaker: ' || p.first_name || ' ' || p.last_name || '%'
       AND p.first_name IS NOT NULL
       AND p.last_name IS NOT NULL
  JOIN user_roles ur
    ON ur.user_id = p.id
    AND ur.role IN ('owner', 'admin', 'moderator')
  WHERE t2.assignee_id IS NULL
    AND t2.is_manual = false
  ORDER BY t2.id
) matched
WHERE t.id = matched.task_id;

-- Step 4: For tasks still unassigned, try matching the task title itself
-- against aliases (some tasks reference people by name in the title)
UPDATE daily_standup_tasks t
SET assignee_id = matched.profile_id
FROM (
  SELECT DISTINCT ON (t2.id) t2.id AS task_id, a.profile_id
  FROM daily_standup_tasks t2
  JOIN team_member_aliases a
    ON t2.title ILIKE '%' || a.alias || '%'
       AND length(a.alias) >= 3  -- avoid short false positives
  WHERE t2.assignee_id IS NULL
    AND t2.is_manual = false
  ORDER BY t2.id, length(a.alias) DESC
) matched
WHERE t.id = matched.task_id;

-- Step 5: Update needs_review flag — tasks that now have an assignee
-- but were flagged for review due to missing assignee can be cleared
UPDATE daily_standup_tasks
SET needs_review = false
WHERE assignee_id IS NOT NULL
  AND needs_review = true
  AND extraction_confidence IN ('high', 'medium');

-- Step 6: Auto-approve tasks that now have assignees and high confidence
-- (same logic as the edge function's auto-approve)
UPDATE daily_standup_tasks
SET status = 'pending'
WHERE assignee_id IS NOT NULL
  AND status = 'pending_approval'
  AND extraction_confidence = 'high'
  AND needs_review = false;

-- Step 7: Update meeting-level unassigned counts
UPDATE standup_meetings sm
SET tasks_unassigned = sub.unassigned_count
FROM (
  SELECT source_meeting_id, COUNT(*) FILTER (WHERE assignee_id IS NULL) AS unassigned_count
  FROM daily_standup_tasks
  WHERE source_meeting_id IS NOT NULL
  GROUP BY source_meeting_id
) sub
WHERE sm.id = sub.source_meeting_id;
