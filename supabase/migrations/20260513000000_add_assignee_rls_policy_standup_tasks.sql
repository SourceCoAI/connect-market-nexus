-- ============================================================
-- Add RLS policy for task assignees on daily_standup_tasks
--
-- Previously only admin/owner/moderator roles could read tasks.
-- Non-admin users assigned tasks could not see them at all,
-- causing the "My Tasks" view to be blank for regular users.
-- ============================================================

-- Allow users to SELECT tasks assigned to them
CREATE POLICY "assignees_read_own_tasks"
  ON daily_standup_tasks FOR SELECT
  USING (assignee_id = auth.uid());

-- Allow users to UPDATE tasks assigned to them (e.g. mark complete)
CREATE POLICY "assignees_update_own_tasks"
  ON daily_standup_tasks FOR UPDATE
  USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());

-- Allow users to SELECT meetings linked to their tasks
-- (needed for the source_meeting join in task queries)
CREATE POLICY "authenticated_read_standup_meetings"
  ON standup_meetings FOR SELECT
  USING (auth.role() = 'authenticated');
