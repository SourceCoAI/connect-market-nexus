-- =============================================================================
-- Standup System Enhancements
--
-- 1. Task category column (deal_task vs platform_task vs operations_task)
-- 2. Parsed timestamp column (seconds from meeting start)
-- 3. Deal mention timeline tracking table
-- 4. Meeting effectiveness scoring columns on standup_meetings
-- 5. Auto-learned alias tracking flag on team_member_aliases
-- =============================================================================

-- 1. Task category: distinguishes deal tasks from platform/ops tasks
ALTER TABLE public.daily_standup_tasks
  ADD COLUMN IF NOT EXISTS task_category TEXT DEFAULT 'deal_task';

ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_task_category_check
    CHECK (task_category IN ('deal_task', 'platform_task', 'operations_task'))
    NOT VALID;

CREATE INDEX IF NOT EXISTS idx_standup_tasks_category
  ON public.daily_standup_tasks(task_category);

-- 2. Parsed source timestamp in seconds (from the raw MM:SS string)
ALTER TABLE public.daily_standup_tasks
  ADD COLUMN IF NOT EXISTS source_timestamp_seconds INT;

-- Backfill existing timestamps: parse "MM:SS" or "M:SS" to total seconds
UPDATE public.daily_standup_tasks
SET source_timestamp_seconds = (
  SPLIT_PART(source_timestamp, ':', 1)::INT * 60 +
  SPLIT_PART(source_timestamp, ':', 2)::INT
)
WHERE source_timestamp IS NOT NULL
  AND source_timestamp ~ '^\d{1,3}:\d{2}$'
  AND source_timestamp_seconds IS NULL;

-- 3. Deal mention timeline: tracks each deal mention across standup meetings
CREATE TABLE IF NOT EXISTS public.deal_mention_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deal_pipeline(id) ON DELETE CASCADE,
  deal_reference TEXT NOT NULL,
  meeting_id UUID NOT NULL REFERENCES standup_meetings(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  mentioned_by UUID REFERENCES profiles(id),
  context TEXT,  -- brief excerpt of what was said about the deal
  tasks_generated INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_mention_timeline_deal
  ON public.deal_mention_timeline(deal_id, meeting_date);
CREATE INDEX IF NOT EXISTS idx_deal_mention_timeline_meeting
  ON public.deal_mention_timeline(meeting_id);

ALTER TABLE public.deal_mention_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_deal_mention_timeline"
  ON public.deal_mention_timeline FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('owner', 'admin', 'moderator')
    )
  );

CREATE POLICY "service_role_deal_mention_timeline"
  ON public.deal_mention_timeline FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Meeting effectiveness scoring columns on standup_meetings
ALTER TABLE public.standup_meetings
  ADD COLUMN IF NOT EXISTS effectiveness_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS tasks_completed_from_previous INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasks_carried_over INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deals_mentioned INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_tasks_skipped INT DEFAULT 0;

-- 5. Auto-learned alias flag on team_member_aliases
ALTER TABLE public.team_member_aliases
  ADD COLUMN IF NOT EXISTS auto_learned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_transcript_id TEXT;
