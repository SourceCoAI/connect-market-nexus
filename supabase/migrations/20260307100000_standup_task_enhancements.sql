-- Add task_category, carried_over tracking, and source_timestamp_seconds to daily_standup_tasks
ALTER TABLE public.daily_standup_tasks
  ADD COLUMN IF NOT EXISTS task_category TEXT DEFAULT 'deal_task'
    CHECK (task_category IN ('deal_task', 'platform_task', 'operations_task')),
  ADD COLUMN IF NOT EXISTS carried_over BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS carry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_timestamp_seconds INTEGER;

-- Index for recurring task dedup lookups (find pending/overdue tasks by assignee)
CREATE INDEX IF NOT EXISTS idx_dst_assignee_status_title
  ON public.daily_standup_tasks (assignee_id, status)
  WHERE status IN ('pending', 'overdue', 'in_progress');
