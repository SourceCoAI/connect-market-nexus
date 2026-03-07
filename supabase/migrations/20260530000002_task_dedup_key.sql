-- =============================================================================
-- Cross-extraction task deduplication
--
-- Adds a dedup_key column and partial unique index to prevent duplicate tasks
-- when a meeting is re-processed or a manual re-run is triggered.
--
-- dedup_key = lower(trim(title)) || ':' || source_meeting_id || ':' || due_date
-- Only enforced for AI-extracted tasks (source = 'ai') to avoid blocking
-- intentional manual duplicates.
-- =============================================================================

ALTER TABLE daily_standup_tasks
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

-- Backfill existing AI-extracted tasks
-- Format: lower(trim(title)):meeting_id:due_date — must match computeDedupKey() in extract-standup-tasks
UPDATE daily_standup_tasks
SET dedup_key = lower(trim(title)) || ':' || coalesce(source_meeting_id::text, 'none') || ':' || coalesce(due_date::text, 'none')
WHERE source = 'ai' AND dedup_key IS NULL;

-- Partial unique index: only enforced for AI tasks
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_dedup_key
  ON daily_standup_tasks(dedup_key)
  WHERE dedup_key IS NOT NULL AND source = 'ai';
