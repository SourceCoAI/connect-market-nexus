-- ============================================================================
-- MIGRATION: Idempotent chat and analytics indexes (defensive)
-- ============================================================================
-- Part of the database-duplicates remediation plan tracked in
-- DATABASE_DUPLICATES_AUDIT_2026-04-09.md §5.
--
-- Historical migrations defined a handful of indexes with a mix of
-- `CREATE INDEX` (bare) and `CREATE INDEX IF NOT EXISTS` forms across
-- multiple files. Today's replay order is safe — the bare form always
-- runs first — but the ordering is fragile: any future re-ordering or
-- migration squash could produce a replay that hits the bare form after
-- the IF NOT EXISTS form and fails.
--
-- This migration re-declares the affected indexes with `CREATE INDEX IF
-- NOT EXISTS` as a one-shot idempotent safety net. On a live database
-- every statement is a no-op (the indexes already exist). On a fresh
-- DR replay it guarantees the indexes exist regardless of prior history.
-- ============================================================================


-- chat_conversations: partial indexes used by the buyer-chat feature.
-- Historical forms in 20260207000000_chat_analytics_feedback.sql:392-395
-- were bare; follow-ups used IF NOT EXISTS. Pinning both here.
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id
  ON public.chat_conversations(user_id)
  WHERE archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at
  ON public.chat_conversations(updated_at DESC)
  WHERE archived = FALSE;


-- page_views / user_events session_id indexes.
-- Historical forms in 20250721114715_*.sql:143 and 20250721155255_*.sql
-- were bare; follow-ups used IF NOT EXISTS. Pinning both here.
-- Guarded by table existence because these analytics tables are on
-- the Phase 1 drop list and may be removed by a future migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'page_views') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_page_views_session_id '
            'ON public.page_views(session_id)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'user_events') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_events_session_id '
            'ON public.user_events(session_id)';
  END IF;
END $$;
