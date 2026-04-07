-- Add notes_analyzed_at timestamp to remarketing_buyers table
-- This tracks when buyer notes were last analyzed for data extraction

ALTER TABLE public.remarketing_buyers
ADD COLUMN IF NOT EXISTS notes_analyzed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.remarketing_buyers.notes_analyzed_at IS 'Timestamp when notes were last analyzed for data extraction';

-- Merged from: 20260208000000_chatbot_complete_v3_fixed.sql
-- ============================================================================
-- COMPLETE CHATBOT INFRASTRUCTURE MIGRATION (V3 - FIXED)
-- Handles ALL existing tables and adds missing columns
-- Fixed: Ensures base columns exist before adding generated columns
-- ============================================================================

-- ============================================================================
-- PART 1: CHAT CONVERSATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL,
  deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

-- Add missing columns for chat_conversations (NON-generated columns first)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'archived') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Now add generated columns (after base columns exist)
DO $$
BEGIN
  -- Drop the generated column if it exists (in case it was created with wrong definition)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'message_count') THEN
    ALTER TABLE public.chat_conversations DROP COLUMN message_count;
  END IF;

  -- Add it fresh
  ALTER TABLE public.chat_conversations ADD COLUMN message_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(messages)) STORED;
END $$;

-- ============================================================================
-- PART 2: CHAT ANALYTICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL,
  deal_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  response_text TEXT,
  response_time_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add ALL missing columns for chat_analytics
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'query_intent') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN query_intent TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'query_complexity') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN query_complexity TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'model_used') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN model_used TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tokens_input') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tokens_input INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tokens_output') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tokens_output INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tokens_total') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tokens_total INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tools_called') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tools_called JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tool_execution_time_ms') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tool_execution_time_ms INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'mentioned_buyer_ids') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN mentioned_buyer_ids UUID[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'mentioned_deal_ids') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN mentioned_deal_ids UUID[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'user_continued') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN user_continued BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'user_rating') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN user_rating INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'feedback_provided') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN feedback_provided BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'session_id') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN session_id TEXT;
  END IF;
END $$;

-- Add constraints for chat_analytics
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_context_type_check') THEN
    ALTER TABLE public.chat_analytics ADD CONSTRAINT chat_analytics_context_type_check
      CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_query_complexity_check') THEN
    ALTER TABLE public.chat_analytics ADD CONSTRAINT chat_analytics_query_complexity_check
      CHECK (query_complexity IN ('simple', 'medium', 'complex'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_user_rating_check') THEN
    ALTER TABLE public.chat_analytics ADD CONSTRAINT chat_analytics_user_rating_check
      CHECK (user_rating IN (-1, 0, 1));
  END IF;
END $$;

-- ============================================================================
-- PART 3: CHAT FEEDBACK TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  analytics_id UUID REFERENCES public.chat_analytics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  feedback_text TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns for chat_feedback
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_feedback' AND column_name = 'issue_type') THEN
    ALTER TABLE public.chat_feedback ADD COLUMN issue_type TEXT;
  END IF;
END $$;

-- Add constraints for chat_feedback
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_feedback_rating_check') THEN
    ALTER TABLE public.chat_feedback ADD CONSTRAINT chat_feedback_rating_check CHECK (rating IN (1, -1));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_feedback_issue_type_check') THEN
    ALTER TABLE public.chat_feedback ADD CONSTRAINT chat_feedback_issue_type_check
      CHECK (issue_type IN ('incorrect', 'incomplete', 'hallucination', 'poor_formatting', 'missing_data', 'slow_response', 'other'));
  END IF;
END $$;

-- ============================================================================
-- PART 4: SMART SUGGESTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_smart_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type TEXT NOT NULL,
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  previous_query TEXT NOT NULL,
  suggestions JSONB NOT NULL,
  suggestion_reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_shown_at TIMESTAMPTZ
);

-- Add base columns first (non-generated)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'times_shown') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN times_shown INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'times_clicked') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN times_clicked INTEGER DEFAULT 0;
  END IF;
END $$;

-- Now add generated column (after base columns exist)
DO $$
BEGIN
  -- Drop if exists (in case wrong definition)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'click_through_rate') THEN
    ALTER TABLE public.chat_smart_suggestions DROP COLUMN click_through_rate;
  END IF;

  -- Add fresh
  ALTER TABLE public.chat_smart_suggestions ADD COLUMN click_through_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN times_shown > 0 THEN (times_clicked::NUMERIC / times_shown::NUMERIC) ELSE 0 END
  ) STORED;
END $$;

-- Add constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_smart_suggestions_context_type_check') THEN
    ALTER TABLE public.chat_smart_suggestions ADD CONSTRAINT chat_smart_suggestions_context_type_check
      CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe'));
  END IF;
END $$;

-- ============================================================================
-- PART 5: PROACTIVE RECOMMENDATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL,
  recommendation_text TEXT NOT NULL,
  recommendation_data JSONB,
  shown BOOLEAN DEFAULT FALSE,
  shown_at TIMESTAMPTZ,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Add constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_recommendations_recommendation_type_check') THEN
    ALTER TABLE public.chat_recommendations ADD CONSTRAINT chat_recommendations_recommendation_type_check
      CHECK (recommendation_type IN ('explore_geography', 'explore_size', 'explore_services', 'review_transcripts', 'contact_buyers', 'expand_search', 'other'));
  END IF;
END $$;

-- ============================================================================
-- PART 6: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON public.chat_conversations(user_id) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_deal_id ON public.chat_conversations(deal_id) WHERE deal_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_universe_id ON public.chat_conversations(universe_id) WHERE universe_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON public.chat_conversations(updated_at DESC) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_context_type ON public.chat_conversations(context_type) WHERE archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_analytics_user_created ON public.chat_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_conversation ON public.chat_analytics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_context ON public.chat_analytics(context_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_universe ON public.chat_analytics(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_deal ON public.chat_analytics(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_intent ON public.chat_analytics(query_intent) WHERE query_intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_tools ON public.chat_analytics USING GIN (tools_called) WHERE tools_called IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_rating ON public.chat_analytics(user_rating) WHERE user_rating IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_feedback_conversation ON public.chat_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_user_created ON public.chat_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_rating ON public.chat_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_issue_type ON public.chat_feedback(issue_type) WHERE issue_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_feedback_unresolved ON public.chat_feedback(created_at DESC) WHERE resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_smart_suggestions_context ON public.chat_smart_suggestions(context_type, universe_id, deal_id) WHERE created_at > NOW() - INTERVAL '7 days';
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_performance ON public.chat_smart_suggestions(click_through_rate DESC) WHERE times_shown > 10;

CREATE INDEX IF NOT EXISTS idx_chat_recommendations_user ON public.chat_recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_conversation ON public.chat_recommendations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_active ON public.chat_recommendations(created_at DESC) WHERE shown = FALSE AND (expires_at IS NULL OR expires_at > NOW());
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_type ON public.chat_recommendations(recommendation_type);

-- ============================================================================
-- PART 7: TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_chat_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_message_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_chat_conversations_updated_at ON public.chat_conversations;
CREATE TRIGGER set_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_conversations_updated_at();

-- ============================================================================
-- PART 8: RLS POLICIES
-- ============================================================================

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own conversations" ON public.chat_conversations;
CREATE POLICY "Users can view own conversations" ON public.chat_conversations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own conversations" ON public.chat_conversations;
CREATE POLICY "Users can create own conversations" ON public.chat_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own conversations" ON public.chat_conversations;
CREATE POLICY "Users can update own conversations" ON public.chat_conversations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.chat_conversations;
CREATE POLICY "Users can delete own conversations" ON public.chat_conversations FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access" ON public.chat_conversations;
CREATE POLICY "Admins have full access" ON public.chat_conversations FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE public.chat_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own analytics" ON public.chat_analytics;
CREATE POLICY "Users can view own analytics" ON public.chat_analytics FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own analytics" ON public.chat_analytics;
CREATE POLICY "Users can insert own analytics" ON public.chat_analytics FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access to analytics" ON public.chat_analytics;
CREATE POLICY "Admins have full access to analytics" ON public.chat_analytics FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own feedback" ON public.chat_feedback;
CREATE POLICY "Users can view own feedback" ON public.chat_feedback FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own feedback" ON public.chat_feedback;
CREATE POLICY "Users can insert own feedback" ON public.chat_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own feedback" ON public.chat_feedback;
CREATE POLICY "Users can update own feedback" ON public.chat_feedback FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access to feedback" ON public.chat_feedback;
CREATE POLICY "Admins have full access to feedback" ON public.chat_feedback FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE public.chat_smart_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "Anyone can view smart suggestions" ON public.chat_smart_suggestions FOR SELECT USING (true);
DROP POLICY IF EXISTS "System can insert smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can insert smart suggestions" ON public.chat_smart_suggestions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "System can update smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can update smart suggestions" ON public.chat_smart_suggestions FOR UPDATE USING (true);

ALTER TABLE public.chat_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own recommendations" ON public.chat_recommendations;
CREATE POLICY "Users can view own recommendations" ON public.chat_recommendations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own recommendations" ON public.chat_recommendations;
CREATE POLICY "Users can update own recommendations" ON public.chat_recommendations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "System can insert recommendations" ON public.chat_recommendations;
CREATE POLICY "System can insert recommendations" ON public.chat_recommendations FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admins have full access to recommendations" ON public.chat_recommendations;
CREATE POLICY "Admins have full access to recommendations" ON public.chat_recommendations FOR ALL USING (is_admin(auth.uid()));

-- ============================================================================
-- PART 9: HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_chat_analytics_summary(
  p_user_id UUID DEFAULT NULL,
  p_context_type TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_queries BIGINT,
  avg_response_time_ms NUMERIC,
  total_tokens INTEGER,
  unique_conversations BIGINT,
  continuation_rate NUMERIC,
  positive_feedback_rate NUMERIC,
  most_common_intent TEXT,
  tools_used_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_queries,
    AVG(response_time_ms)::NUMERIC as avg_response_time_ms,
    SUM(COALESCE(tokens_total, 0))::INTEGER as total_tokens,
    COUNT(DISTINCT conversation_id)::BIGINT as unique_conversations,
    (COUNT(*) FILTER (WHERE user_continued = TRUE)::NUMERIC / NULLIF(COUNT(*), 0)) as continuation_rate,
    (COUNT(*) FILTER (WHERE user_rating = 1)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE user_rating IS NOT NULL), 0)) as positive_feedback_rate,
    MODE() WITHIN GROUP (ORDER BY query_intent) as most_common_intent,
    COUNT(*) FILTER (WHERE tools_called IS NOT NULL AND jsonb_array_length(tools_called) > 0)::BIGINT as tools_used_count
  FROM chat_analytics
  WHERE
    created_at > NOW() - MAKE_INTERVAL(days => p_days)
    AND (p_user_id IS NULL OR user_id = p_user_id)
    AND (p_context_type IS NULL OR context_type = p_context_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_chat_analytics(
  p_conversation_id UUID,
  p_query_text TEXT,
  p_response_text TEXT,
  p_response_time_ms INTEGER,
  p_tokens_input INTEGER,
  p_tokens_output INTEGER,
  p_context_type TEXT,
  p_deal_id UUID DEFAULT NULL,
  p_universe_id UUID DEFAULT NULL,
  p_tools_called JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_analytics_id UUID;
BEGIN
  INSERT INTO chat_analytics (
    conversation_id, user_id, context_type, deal_id, universe_id,
    query_text, response_text, response_time_ms,
    tokens_input, tokens_output, tokens_total, tools_called
  ) VALUES (
    p_conversation_id, auth.uid(), p_context_type, p_deal_id, p_universe_id,
    p_query_text, p_response_text, p_response_time_ms,
    p_tokens_input, p_tokens_output, p_tokens_input + p_tokens_output, p_tools_called
  )
  RETURNING id INTO v_analytics_id;
  RETURN v_analytics_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Migration complete! All 5 chatbot tables created/updated.' AS status;

-- Merged from: 20260208000000_chatbot_complete_v4_ultra_robust.sql
-- ============================================================================
-- COMPLETE CHATBOT INFRASTRUCTURE MIGRATION (V4 - ULTRA ROBUST)
-- Handles ALL edge cases including partially created tables
-- ============================================================================

-- PART 1: CHAT CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add all missing base columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'context_type') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN context_type TEXT NOT NULL DEFAULT 'deals';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'deal_id') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'universe_id') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'last_message_at') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN last_message_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'archived') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Add generated column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'message_count') THEN
    ALTER TABLE public.chat_conversations DROP COLUMN message_count;
  END IF;
  ALTER TABLE public.chat_conversations ADD COLUMN message_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(messages)) STORED;
END $$;

-- PART 2: CHAT ANALYTICS TABLE
CREATE TABLE IF NOT EXISTS public.chat_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  response_text TEXT,
  response_time_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add all missing columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'context_type') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN context_type TEXT NOT NULL DEFAULT 'deals';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'deal_id') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN deal_id UUID REFERENCES public.listings(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'universe_id') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'query_intent') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN query_intent TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'query_complexity') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN query_complexity TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'model_used') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN model_used TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tokens_input') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tokens_input INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tokens_output') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tokens_output INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tokens_total') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tokens_total INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tools_called') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tools_called JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tool_execution_time_ms') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tool_execution_time_ms INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'mentioned_buyer_ids') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN mentioned_buyer_ids UUID[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'mentioned_deal_ids') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN mentioned_deal_ids UUID[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'user_continued') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN user_continued BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'user_rating') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN user_rating INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'feedback_provided') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN feedback_provided BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'session_id') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN session_id TEXT;
  END IF;
END $$;

-- Add constraints (ONLY after columns exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_context_type_check') THEN
    ALTER TABLE public.chat_analytics ADD CONSTRAINT chat_analytics_context_type_check
      CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_query_complexity_check') THEN
    ALTER TABLE public.chat_analytics ADD CONSTRAINT chat_analytics_query_complexity_check
      CHECK (query_complexity IN ('simple', 'medium', 'complex'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_user_rating_check') THEN
    ALTER TABLE public.chat_analytics ADD CONSTRAINT chat_analytics_user_rating_check
      CHECK (user_rating IN (-1, 0, 1));
  END IF;
END $$;

-- PART 3: CHAT FEEDBACK TABLE
CREATE TABLE IF NOT EXISTS public.chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  analytics_id UUID REFERENCES public.chat_analytics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  feedback_text TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_feedback' AND column_name = 'issue_type') THEN
    ALTER TABLE public.chat_feedback ADD COLUMN issue_type TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_feedback_rating_check') THEN
    ALTER TABLE public.chat_feedback ADD CONSTRAINT chat_feedback_rating_check CHECK (rating IN (1, -1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_feedback_issue_type_check') THEN
    ALTER TABLE public.chat_feedback ADD CONSTRAINT chat_feedback_issue_type_check
      CHECK (issue_type IN ('incorrect', 'incomplete', 'hallucination', 'poor_formatting', 'missing_data', 'slow_response', 'other'));
  END IF;
END $$;

-- PART 4: SMART SUGGESTIONS TABLE
CREATE TABLE IF NOT EXISTS public.chat_smart_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_query TEXT NOT NULL,
  suggestions JSONB NOT NULL,
  suggestion_reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_shown_at TIMESTAMPTZ
);

-- Add all base columns first
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'context_type') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN context_type TEXT NOT NULL DEFAULT 'deals';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'universe_id') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'deal_id') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'times_shown') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN times_shown INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'times_clicked') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN times_clicked INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add generated column (after base columns exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'click_through_rate') THEN
    ALTER TABLE public.chat_smart_suggestions DROP COLUMN click_through_rate;
  END IF;
  ALTER TABLE public.chat_smart_suggestions ADD COLUMN click_through_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN times_shown > 0 THEN (times_clicked::NUMERIC / times_shown::NUMERIC) ELSE 0 END
  ) STORED;
END $$;

-- Add constraints (ONLY after columns exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_smart_suggestions_context_type_check') THEN
    ALTER TABLE public.chat_smart_suggestions ADD CONSTRAINT chat_smart_suggestions_context_type_check
      CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe'));
  END IF;
END $$;

-- PART 5: RECOMMENDATIONS TABLE
CREATE TABLE IF NOT EXISTS public.chat_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL,
  recommendation_text TEXT NOT NULL,
  recommendation_data JSONB,
  shown BOOLEAN DEFAULT FALSE,
  shown_at TIMESTAMPTZ,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_recommendations_recommendation_type_check') THEN
    ALTER TABLE public.chat_recommendations ADD CONSTRAINT chat_recommendations_recommendation_type_check
      CHECK (recommendation_type IN ('explore_geography', 'explore_size', 'explore_services', 'review_transcripts', 'contact_buyers', 'expand_search', 'other'));
  END IF;
END $$;

-- PART 6: INDEXES
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON public.chat_conversations(user_id) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_deal_id ON public.chat_conversations(deal_id) WHERE deal_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_universe_id ON public.chat_conversations(universe_id) WHERE universe_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON public.chat_conversations(updated_at DESC) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_context_type ON public.chat_conversations(context_type) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_user_created ON public.chat_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_conversation ON public.chat_analytics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_context ON public.chat_analytics(context_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_universe ON public.chat_analytics(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_deal ON public.chat_analytics(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_intent ON public.chat_analytics(query_intent) WHERE query_intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_tools ON public.chat_analytics USING GIN (tools_called) WHERE tools_called IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_rating ON public.chat_analytics(user_rating) WHERE user_rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_feedback_conversation ON public.chat_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_user_created ON public.chat_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_rating ON public.chat_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_issue_type ON public.chat_feedback(issue_type) WHERE issue_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_feedback_unresolved ON public.chat_feedback(created_at DESC) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_context ON public.chat_smart_suggestions(context_type, universe_id, deal_id) WHERE created_at > NOW() - INTERVAL '7 days';
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_performance ON public.chat_smart_suggestions(click_through_rate DESC) WHERE times_shown > 10;
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_user ON public.chat_recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_conversation ON public.chat_recommendations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_active ON public.chat_recommendations(created_at DESC) WHERE shown = FALSE AND (expires_at IS NULL OR expires_at > NOW());
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_type ON public.chat_recommendations(recommendation_type);

-- PART 7: TRIGGERS
CREATE OR REPLACE FUNCTION update_chat_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_message_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_chat_conversations_updated_at ON public.chat_conversations;
CREATE TRIGGER set_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_conversations_updated_at();

-- PART 8: RLS POLICIES
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own conversations" ON public.chat_conversations;
CREATE POLICY "Users can view own conversations" ON public.chat_conversations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own conversations" ON public.chat_conversations;
CREATE POLICY "Users can create own conversations" ON public.chat_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own conversations" ON public.chat_conversations;
CREATE POLICY "Users can update own conversations" ON public.chat_conversations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.chat_conversations;
CREATE POLICY "Users can delete own conversations" ON public.chat_conversations FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access" ON public.chat_conversations;
CREATE POLICY "Admins have full access" ON public.chat_conversations FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE public.chat_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own analytics" ON public.chat_analytics;
CREATE POLICY "Users can view own analytics" ON public.chat_analytics FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own analytics" ON public.chat_analytics;
CREATE POLICY "Users can insert own analytics" ON public.chat_analytics FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access to analytics" ON public.chat_analytics;
CREATE POLICY "Admins have full access to analytics" ON public.chat_analytics FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own feedback" ON public.chat_feedback;
CREATE POLICY "Users can view own feedback" ON public.chat_feedback FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own feedback" ON public.chat_feedback;
CREATE POLICY "Users can insert own feedback" ON public.chat_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own feedback" ON public.chat_feedback;
CREATE POLICY "Users can update own feedback" ON public.chat_feedback FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access to feedback" ON public.chat_feedback;
CREATE POLICY "Admins have full access to feedback" ON public.chat_feedback FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE public.chat_smart_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "Anyone can view smart suggestions" ON public.chat_smart_suggestions FOR SELECT USING (true);
DROP POLICY IF EXISTS "System can insert smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can insert smart suggestions" ON public.chat_smart_suggestions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "System can update smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can update smart suggestions" ON public.chat_smart_suggestions FOR UPDATE USING (true);

ALTER TABLE public.chat_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own recommendations" ON public.chat_recommendations;
CREATE POLICY "Users can view own recommendations" ON public.chat_recommendations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own recommendations" ON public.chat_recommendations;
CREATE POLICY "Users can update own recommendations" ON public.chat_recommendations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "System can insert recommendations" ON public.chat_recommendations;
CREATE POLICY "System can insert recommendations" ON public.chat_recommendations FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admins have full access to recommendations" ON public.chat_recommendations;
CREATE POLICY "Admins have full access to recommendations" ON public.chat_recommendations FOR ALL USING (is_admin(auth.uid()));

-- PART 9: HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION get_chat_analytics_summary(
  p_user_id UUID DEFAULT NULL,
  p_context_type TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_queries BIGINT,
  avg_response_time_ms NUMERIC,
  total_tokens INTEGER,
  unique_conversations BIGINT,
  continuation_rate NUMERIC,
  positive_feedback_rate NUMERIC,
  most_common_intent TEXT,
  tools_used_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    AVG(response_time_ms)::NUMERIC,
    SUM(COALESCE(tokens_total, 0))::INTEGER,
    COUNT(DISTINCT conversation_id)::BIGINT,
    (COUNT(*) FILTER (WHERE user_continued = TRUE)::NUMERIC / NULLIF(COUNT(*), 0)),
    (COUNT(*) FILTER (WHERE user_rating = 1)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE user_rating IS NOT NULL), 0)),
    MODE() WITHIN GROUP (ORDER BY query_intent),
    COUNT(*) FILTER (WHERE tools_called IS NOT NULL AND jsonb_array_length(tools_called) > 0)::BIGINT
  FROM chat_analytics
  WHERE created_at > NOW() - MAKE_INTERVAL(days => p_days)
    AND (p_user_id IS NULL OR user_id = p_user_id)
    AND (p_context_type IS NULL OR context_type = p_context_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_chat_analytics(
  p_conversation_id UUID,
  p_query_text TEXT,
  p_response_text TEXT,
  p_response_time_ms INTEGER,
  p_tokens_input INTEGER,
  p_tokens_output INTEGER,
  p_context_type TEXT,
  p_deal_id UUID DEFAULT NULL,
  p_universe_id UUID DEFAULT NULL,
  p_tools_called JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_analytics_id UUID;
BEGIN
  INSERT INTO chat_analytics (
    conversation_id, user_id, context_type, deal_id, universe_id,
    query_text, response_text, response_time_ms,
    tokens_input, tokens_output, tokens_total, tools_called
  ) VALUES (
    p_conversation_id, auth.uid(), p_context_type, p_deal_id, p_universe_id,
    p_query_text, p_response_text, p_response_time_ms,
    p_tokens_input, p_tokens_output, p_tokens_input + p_tokens_output, p_tools_called
  )
  RETURNING id INTO v_analytics_id;
  RETURN v_analytics_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Migration complete! All 5 chatbot tables created/updated.' AS status;

-- Merged from: 20260208000000_chatbot_complete_v5_final.sql
-- ============================================================================
-- COMPLETE CHATBOT INFRASTRUCTURE MIGRATION (V5 - FINAL)
-- Handles ALL edge cases + fixes GIN index operator class
-- ============================================================================

-- PART 1: CHAT CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'context_type') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN context_type TEXT NOT NULL DEFAULT 'deals';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'deal_id') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'universe_id') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'last_message_at') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN last_message_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'archived') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'message_count') THEN
    ALTER TABLE public.chat_conversations DROP COLUMN message_count;
  END IF;
  ALTER TABLE public.chat_conversations ADD COLUMN message_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(messages)) STORED;
END $$;

-- PART 2: CHAT ANALYTICS TABLE
CREATE TABLE IF NOT EXISTS public.chat_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  response_text TEXT,
  response_time_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'context_type') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN context_type TEXT NOT NULL DEFAULT 'deals';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'deal_id') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN deal_id UUID REFERENCES public.listings(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'universe_id') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'query_intent') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN query_intent TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'query_complexity') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN query_complexity TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'model_used') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN model_used TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tokens_input') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tokens_input INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tokens_output') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tokens_output INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tokens_total') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tokens_total INTEGER;
  END IF;

  -- Fix tools_called column - ensure it's JSONB, not TEXT
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tools_called' AND data_type != 'jsonb') THEN
    -- Drop and recreate if wrong type
    ALTER TABLE public.chat_analytics DROP COLUMN tools_called;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tools_called') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tools_called JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'tool_execution_time_ms') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN tool_execution_time_ms INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'mentioned_buyer_ids') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN mentioned_buyer_ids UUID[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'mentioned_deal_ids') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN mentioned_deal_ids UUID[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'user_continued') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN user_continued BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'user_rating') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN user_rating INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'feedback_provided') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN feedback_provided BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_analytics' AND column_name = 'session_id') THEN
    ALTER TABLE public.chat_analytics ADD COLUMN session_id TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_context_type_check') THEN
    ALTER TABLE public.chat_analytics ADD CONSTRAINT chat_analytics_context_type_check
      CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_query_complexity_check') THEN
    ALTER TABLE public.chat_analytics ADD CONSTRAINT chat_analytics_query_complexity_check
      CHECK (query_complexity IN ('simple', 'medium', 'complex'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_user_rating_check') THEN
    ALTER TABLE public.chat_analytics ADD CONSTRAINT chat_analytics_user_rating_check
      CHECK (user_rating IN (-1, 0, 1));
  END IF;
END $$;

-- PART 3: CHAT FEEDBACK TABLE
CREATE TABLE IF NOT EXISTS public.chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  analytics_id UUID REFERENCES public.chat_analytics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  feedback_text TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_feedback' AND column_name = 'issue_type') THEN
    ALTER TABLE public.chat_feedback ADD COLUMN issue_type TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_feedback_rating_check') THEN
    ALTER TABLE public.chat_feedback ADD CONSTRAINT chat_feedback_rating_check CHECK (rating IN (1, -1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_feedback_issue_type_check') THEN
    ALTER TABLE public.chat_feedback ADD CONSTRAINT chat_feedback_issue_type_check
      CHECK (issue_type IN ('incorrect', 'incomplete', 'hallucination', 'poor_formatting', 'missing_data', 'slow_response', 'other'));
  END IF;
END $$;

-- PART 4: SMART SUGGESTIONS TABLE
CREATE TABLE IF NOT EXISTS public.chat_smart_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_query TEXT NOT NULL,
  suggestions JSONB NOT NULL,
  suggestion_reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_shown_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'context_type') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN context_type TEXT NOT NULL DEFAULT 'deals';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'universe_id') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'deal_id') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'times_shown') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN times_shown INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'times_clicked') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN times_clicked INTEGER DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'click_through_rate') THEN
    ALTER TABLE public.chat_smart_suggestions DROP COLUMN click_through_rate;
  END IF;
  ALTER TABLE public.chat_smart_suggestions ADD COLUMN click_through_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN times_shown > 0 THEN (times_clicked::NUMERIC / times_shown::NUMERIC) ELSE 0 END
  ) STORED;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_smart_suggestions_context_type_check') THEN
    ALTER TABLE public.chat_smart_suggestions ADD CONSTRAINT chat_smart_suggestions_context_type_check
      CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe'));
  END IF;
END $$;

-- PART 5: RECOMMENDATIONS TABLE
CREATE TABLE IF NOT EXISTS public.chat_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL,
  recommendation_text TEXT NOT NULL,
  recommendation_data JSONB,
  shown BOOLEAN DEFAULT FALSE,
  shown_at TIMESTAMPTZ,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_recommendations_recommendation_type_check') THEN
    ALTER TABLE public.chat_recommendations ADD CONSTRAINT chat_recommendations_recommendation_type_check
      CHECK (recommendation_type IN ('explore_geography', 'explore_size', 'explore_services', 'review_transcripts', 'contact_buyers', 'expand_search', 'other'));
  END IF;
END $$;

-- PART 6: INDEXES (with explicit operator class for GIN)
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON public.chat_conversations(user_id) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_deal_id ON public.chat_conversations(deal_id) WHERE deal_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_universe_id ON public.chat_conversations(universe_id) WHERE universe_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON public.chat_conversations(updated_at DESC) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_context_type ON public.chat_conversations(context_type) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_user_created ON public.chat_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_conversation ON public.chat_analytics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_context ON public.chat_analytics(context_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_universe ON public.chat_analytics(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_deal ON public.chat_analytics(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_intent ON public.chat_analytics(query_intent) WHERE query_intent IS NOT NULL;

-- GIN index with explicit operator class for JSONB
DROP INDEX IF EXISTS idx_chat_analytics_tools;
CREATE INDEX idx_chat_analytics_tools ON public.chat_analytics USING GIN (tools_called jsonb_path_ops) WHERE tools_called IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_analytics_rating ON public.chat_analytics(user_rating) WHERE user_rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_feedback_conversation ON public.chat_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_user_created ON public.chat_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_rating ON public.chat_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_issue_type ON public.chat_feedback(issue_type) WHERE issue_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_feedback_unresolved ON public.chat_feedback(created_at DESC) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_context ON public.chat_smart_suggestions(context_type, universe_id, deal_id);
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_performance ON public.chat_smart_suggestions(click_through_rate DESC) WHERE times_shown > 10;
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_user ON public.chat_recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_conversation ON public.chat_recommendations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_active ON public.chat_recommendations(created_at DESC) WHERE shown = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_type ON public.chat_recommendations(recommendation_type);

-- PART 7: TRIGGERS
CREATE OR REPLACE FUNCTION update_chat_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_message_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_chat_conversations_updated_at ON public.chat_conversations;
CREATE TRIGGER set_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_conversations_updated_at();

-- PART 8: RLS POLICIES
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own conversations" ON public.chat_conversations;
CREATE POLICY "Users can view own conversations" ON public.chat_conversations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own conversations" ON public.chat_conversations;
CREATE POLICY "Users can create own conversations" ON public.chat_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own conversations" ON public.chat_conversations;
CREATE POLICY "Users can update own conversations" ON public.chat_conversations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.chat_conversations;
CREATE POLICY "Users can delete own conversations" ON public.chat_conversations FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access" ON public.chat_conversations;
CREATE POLICY "Admins have full access" ON public.chat_conversations FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE public.chat_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own analytics" ON public.chat_analytics;
CREATE POLICY "Users can view own analytics" ON public.chat_analytics FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own analytics" ON public.chat_analytics;
CREATE POLICY "Users can insert own analytics" ON public.chat_analytics FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access to analytics" ON public.chat_analytics;
CREATE POLICY "Admins have full access to analytics" ON public.chat_analytics FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own feedback" ON public.chat_feedback;
CREATE POLICY "Users can view own feedback" ON public.chat_feedback FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own feedback" ON public.chat_feedback;
CREATE POLICY "Users can insert own feedback" ON public.chat_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own feedback" ON public.chat_feedback;
CREATE POLICY "Users can update own feedback" ON public.chat_feedback FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access to feedback" ON public.chat_feedback;
CREATE POLICY "Admins have full access to feedback" ON public.chat_feedback FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE public.chat_smart_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "Anyone can view smart suggestions" ON public.chat_smart_suggestions FOR SELECT USING (true);
DROP POLICY IF EXISTS "System can insert smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can insert smart suggestions" ON public.chat_smart_suggestions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "System can update smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can update smart suggestions" ON public.chat_smart_suggestions FOR UPDATE USING (true);

ALTER TABLE public.chat_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own recommendations" ON public.chat_recommendations;
CREATE POLICY "Users can view own recommendations" ON public.chat_recommendations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own recommendations" ON public.chat_recommendations;
CREATE POLICY "Users can update own recommendations" ON public.chat_recommendations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "System can insert recommendations" ON public.chat_recommendations;
CREATE POLICY "System can insert recommendations" ON public.chat_recommendations FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admins have full access to recommendations" ON public.chat_recommendations;
CREATE POLICY "Admins have full access to recommendations" ON public.chat_recommendations FOR ALL USING (is_admin(auth.uid()));

-- PART 9: HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION get_chat_analytics_summary(
  p_user_id UUID DEFAULT NULL,
  p_context_type TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_queries BIGINT,
  avg_response_time_ms NUMERIC,
  total_tokens INTEGER,
  unique_conversations BIGINT,
  continuation_rate NUMERIC,
  positive_feedback_rate NUMERIC,
  most_common_intent TEXT,
  tools_used_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    AVG(response_time_ms)::NUMERIC,
    SUM(COALESCE(tokens_total, 0))::INTEGER,
    COUNT(DISTINCT conversation_id)::BIGINT,
    (COUNT(*) FILTER (WHERE user_continued = TRUE)::NUMERIC / NULLIF(COUNT(*), 0)),
    (COUNT(*) FILTER (WHERE user_rating = 1)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE user_rating IS NOT NULL), 0)),
    MODE() WITHIN GROUP (ORDER BY query_intent),
    COUNT(*) FILTER (WHERE tools_called IS NOT NULL AND jsonb_array_length(tools_called) > 0)::BIGINT
  FROM chat_analytics
  WHERE created_at > NOW() - MAKE_INTERVAL(days => p_days)
    AND (p_user_id IS NULL OR user_id = p_user_id)
    AND (p_context_type IS NULL OR context_type = p_context_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_chat_analytics(
  p_conversation_id UUID,
  p_query_text TEXT,
  p_response_text TEXT,
  p_response_time_ms INTEGER,
  p_tokens_input INTEGER,
  p_tokens_output INTEGER,
  p_context_type TEXT,
  p_deal_id UUID DEFAULT NULL,
  p_universe_id UUID DEFAULT NULL,
  p_tools_called JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_analytics_id UUID;
BEGIN
  INSERT INTO chat_analytics (
    conversation_id, user_id, context_type, deal_id, universe_id,
    query_text, response_text, response_time_ms,
    tokens_input, tokens_output, tokens_total, tools_called
  ) VALUES (
    p_conversation_id, auth.uid(), p_context_type, p_deal_id, p_universe_id,
    p_query_text, p_response_text, p_response_time_ms,
    p_tokens_input, p_tokens_output, p_tokens_input + p_tokens_output, p_tools_called
  )
  RETURNING id INTO v_analytics_id;
  RETURN v_analytics_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Migration complete! All 5 chatbot tables created/updated.' AS status;

-- Merged from: 20260208000000_chatbot_v6_restructured.sql
-- ============================================================================
-- CHATBOT MIGRATION V6 - COMPLETELY RESTRUCTURED FOR GUARANTEED SUCCESS
-- Phase 1: Tables, Phase 2: Columns, Phase 3: Indexes, Phase 4: Everything Else
-- ============================================================================

-- ===== PHASE 1: CREATE BASE TABLES =====
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  response_text TEXT,
  response_time_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  analytics_id UUID REFERENCES public.chat_analytics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  feedback_text TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_smart_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_query TEXT NOT NULL,
  suggestions JSONB NOT NULL,
  suggestion_reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_shown_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.chat_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL,
  recommendation_text TEXT NOT NULL,
  recommendation_data JSONB,
  shown BOOLEAN DEFAULT FALSE,
  shown_at TIMESTAMPTZ,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- ===== PHASE 2A: ADD ALL BASE COLUMNS (NON-GENERATED) =====

-- chat_conversations columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_conversations' AND column_name = 'context_type') THEN
    ALTER TABLE chat_conversations ADD COLUMN context_type TEXT NOT NULL DEFAULT 'deals';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_conversations' AND column_name = 'deal_id') THEN
    ALTER TABLE chat_conversations ADD COLUMN deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_conversations' AND column_name = 'universe_id') THEN
    ALTER TABLE chat_conversations ADD COLUMN universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_conversations' AND column_name = 'last_message_at') THEN
    ALTER TABLE chat_conversations ADD COLUMN last_message_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_conversations' AND column_name = 'archived') THEN
    ALTER TABLE chat_conversations ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- chat_analytics columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'context_type') THEN
    ALTER TABLE chat_analytics ADD COLUMN context_type TEXT NOT NULL DEFAULT 'deals';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'deal_id') THEN
    ALTER TABLE chat_analytics ADD COLUMN deal_id UUID REFERENCES public.listings(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'universe_id') THEN
    ALTER TABLE chat_analytics ADD COLUMN universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'query_intent') THEN
    ALTER TABLE chat_analytics ADD COLUMN query_intent TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'query_complexity') THEN
    ALTER TABLE chat_analytics ADD COLUMN query_complexity TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'model_used') THEN
    ALTER TABLE chat_analytics ADD COLUMN model_used TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'tokens_input') THEN
    ALTER TABLE chat_analytics ADD COLUMN tokens_input INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'tokens_output') THEN
    ALTER TABLE chat_analytics ADD COLUMN tokens_output INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'tokens_total') THEN
    ALTER TABLE chat_analytics ADD COLUMN tokens_total INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'tool_execution_time_ms') THEN
    ALTER TABLE chat_analytics ADD COLUMN tool_execution_time_ms INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'mentioned_buyer_ids') THEN
    ALTER TABLE chat_analytics ADD COLUMN mentioned_buyer_ids UUID[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'mentioned_deal_ids') THEN
    ALTER TABLE chat_analytics ADD COLUMN mentioned_deal_ids UUID[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'user_continued') THEN
    ALTER TABLE chat_analytics ADD COLUMN user_continued BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'user_rating') THEN
    ALTER TABLE chat_analytics ADD COLUMN user_rating INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'feedback_provided') THEN
    ALTER TABLE chat_analytics ADD COLUMN feedback_provided BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'session_id') THEN
    ALTER TABLE chat_analytics ADD COLUMN session_id TEXT;
  END IF;

  -- Fix tools_called to be JSONB
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'tools_called' AND data_type != 'jsonb') THEN
    ALTER TABLE chat_analytics DROP COLUMN tools_called;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_analytics' AND column_name = 'tools_called') THEN
    ALTER TABLE chat_analytics ADD COLUMN tools_called JSONB;
  END IF;
END $$;

-- chat_feedback columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_feedback' AND column_name = 'issue_type') THEN
    ALTER TABLE chat_feedback ADD COLUMN issue_type TEXT;
  END IF;
END $$;

-- chat_smart_suggestions columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_smart_suggestions' AND column_name = 'context_type') THEN
    ALTER TABLE chat_smart_suggestions ADD COLUMN context_type TEXT NOT NULL DEFAULT 'deals';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_smart_suggestions' AND column_name = 'universe_id') THEN
    ALTER TABLE chat_smart_suggestions ADD COLUMN universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_smart_suggestions' AND column_name = 'deal_id') THEN
    ALTER TABLE chat_smart_suggestions ADD COLUMN deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_smart_suggestions' AND column_name = 'times_shown') THEN
    ALTER TABLE chat_smart_suggestions ADD COLUMN times_shown INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_smart_suggestions' AND column_name = 'times_clicked') THEN
    ALTER TABLE chat_smart_suggestions ADD COLUMN times_clicked INTEGER DEFAULT 0;
  END IF;
END $$;

-- ===== PHASE 2B: ADD GENERATED COLUMNS =====
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_conversations' AND column_name = 'message_count') THEN
    ALTER TABLE chat_conversations DROP COLUMN message_count;
  END IF;
  ALTER TABLE chat_conversations ADD COLUMN message_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(messages)) STORED;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_smart_suggestions' AND column_name = 'click_through_rate') THEN
    ALTER TABLE chat_smart_suggestions DROP COLUMN click_through_rate;
  END IF;
  ALTER TABLE chat_smart_suggestions ADD COLUMN click_through_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN times_shown > 0 THEN (times_clicked::NUMERIC / times_shown::NUMERIC) ELSE 0 END
  ) STORED;
END $$;

-- ===== PHASE 3: ADD CONSTRAINTS =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_context_type_check') THEN
    ALTER TABLE chat_analytics ADD CONSTRAINT chat_analytics_context_type_check
      CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_query_complexity_check') THEN
    ALTER TABLE chat_analytics ADD CONSTRAINT chat_analytics_query_complexity_check
      CHECK (query_complexity IN ('simple', 'medium', 'complex'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_user_rating_check') THEN
    ALTER TABLE chat_analytics ADD CONSTRAINT chat_analytics_user_rating_check
      CHECK (user_rating IN (-1, 0, 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_feedback_rating_check') THEN
    ALTER TABLE chat_feedback ADD CONSTRAINT chat_feedback_rating_check CHECK (rating IN (1, -1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_feedback_issue_type_check') THEN
    ALTER TABLE chat_feedback ADD CONSTRAINT chat_feedback_issue_type_check
      CHECK (issue_type IN ('incorrect', 'incomplete', 'hallucination', 'poor_formatting', 'missing_data', 'slow_response', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_smart_suggestions_context_type_check') THEN
    ALTER TABLE chat_smart_suggestions ADD CONSTRAINT chat_smart_suggestions_context_type_check
      CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_recommendations_recommendation_type_check') THEN
    ALTER TABLE chat_recommendations ADD CONSTRAINT chat_recommendations_recommendation_type_check
      CHECK (recommendation_type IN ('explore_geography', 'explore_size', 'explore_services', 'review_transcripts', 'contact_buyers', 'expand_search', 'other'));
  END IF;
END $$;

-- ===== PHASE 4: CREATE INDEXES (after ALL columns exist) =====
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_deal_id ON chat_conversations(deal_id) WHERE deal_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_universe_id ON chat_conversations(universe_id) WHERE universe_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON chat_conversations(updated_at DESC) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_context_type ON chat_conversations(context_type) WHERE archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_analytics_user_created ON chat_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_conversation ON chat_analytics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_context ON chat_analytics(context_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_universe ON chat_analytics(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_deal ON chat_analytics(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_intent ON chat_analytics(query_intent) WHERE query_intent IS NOT NULL;
DROP INDEX IF EXISTS idx_chat_analytics_tools;
CREATE INDEX idx_chat_analytics_tools ON chat_analytics USING GIN (tools_called jsonb_path_ops) WHERE tools_called IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_rating ON chat_analytics(user_rating) WHERE user_rating IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_feedback_conversation ON chat_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_user_created ON chat_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_rating ON chat_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_issue_type ON chat_feedback(issue_type) WHERE issue_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_feedback_unresolved ON chat_feedback(created_at DESC) WHERE resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_smart_suggestions_context ON chat_smart_suggestions(context_type, universe_id, deal_id);
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_performance ON chat_smart_suggestions(click_through_rate DESC) WHERE times_shown > 10;

CREATE INDEX IF NOT EXISTS idx_chat_recommendations_user ON chat_recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_conversation ON chat_recommendations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_active ON chat_recommendations(created_at DESC) WHERE shown = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_type ON chat_recommendations(recommendation_type);

-- ===== PHASE 5: TRIGGERS =====
CREATE OR REPLACE FUNCTION update_chat_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_message_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_chat_conversations_updated_at ON chat_conversations;
CREATE TRIGGER set_chat_conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_conversations_updated_at();

-- ===== PHASE 6: RLS POLICIES =====
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own conversations" ON chat_conversations;
CREATE POLICY "Users can view own conversations" ON chat_conversations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own conversations" ON chat_conversations;
CREATE POLICY "Users can create own conversations" ON chat_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own conversations" ON chat_conversations;
CREATE POLICY "Users can update own conversations" ON chat_conversations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own conversations" ON chat_conversations;
CREATE POLICY "Users can delete own conversations" ON chat_conversations FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access" ON chat_conversations;
CREATE POLICY "Admins have full access" ON chat_conversations FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE chat_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own analytics" ON chat_analytics;
CREATE POLICY "Users can view own analytics" ON chat_analytics FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own analytics" ON chat_analytics;
CREATE POLICY "Users can insert own analytics" ON chat_analytics FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access to analytics" ON chat_analytics;
CREATE POLICY "Admins have full access to analytics" ON chat_analytics FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE chat_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own feedback" ON chat_feedback;
CREATE POLICY "Users can view own feedback" ON chat_feedback FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own feedback" ON chat_feedback;
CREATE POLICY "Users can insert own feedback" ON chat_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own feedback" ON chat_feedback;
CREATE POLICY "Users can update own feedback" ON chat_feedback FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access to feedback" ON chat_feedback;
CREATE POLICY "Admins have full access to feedback" ON chat_feedback FOR ALL USING (is_admin(auth.uid()));

ALTER TABLE chat_smart_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view smart suggestions" ON chat_smart_suggestions;
CREATE POLICY "Anyone can view smart suggestions" ON chat_smart_suggestions FOR SELECT USING (true);
DROP POLICY IF EXISTS "System can insert smart suggestions" ON chat_smart_suggestions;
CREATE POLICY "System can insert smart suggestions" ON chat_smart_suggestions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "System can update smart suggestions" ON chat_smart_suggestions;
CREATE POLICY "System can update smart suggestions" ON chat_smart_suggestions FOR UPDATE USING (true);

ALTER TABLE chat_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own recommendations" ON chat_recommendations;
CREATE POLICY "Users can view own recommendations" ON chat_recommendations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own recommendations" ON chat_recommendations;
CREATE POLICY "Users can update own recommendations" ON chat_recommendations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "System can insert recommendations" ON chat_recommendations;
CREATE POLICY "System can insert recommendations" ON chat_recommendations FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admins have full access to recommendations" ON chat_recommendations;
CREATE POLICY "Admins have full access to recommendations" ON chat_recommendations FOR ALL USING (is_admin(auth.uid()));

-- ===== PHASE 7: HELPER FUNCTIONS =====
CREATE OR REPLACE FUNCTION get_chat_analytics_summary(
  p_user_id UUID DEFAULT NULL,
  p_context_type TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_queries BIGINT,
  avg_response_time_ms NUMERIC,
  total_tokens INTEGER,
  unique_conversations BIGINT,
  continuation_rate NUMERIC,
  positive_feedback_rate NUMERIC,
  most_common_intent TEXT,
  tools_used_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    AVG(response_time_ms)::NUMERIC,
    SUM(COALESCE(tokens_total, 0))::INTEGER,
    COUNT(DISTINCT conversation_id)::BIGINT,
    (COUNT(*) FILTER (WHERE user_continued = TRUE)::NUMERIC / NULLIF(COUNT(*), 0)),
    (COUNT(*) FILTER (WHERE user_rating = 1)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE user_rating IS NOT NULL), 0)),
    MODE() WITHIN GROUP (ORDER BY query_intent),
    COUNT(*) FILTER (WHERE tools_called IS NOT NULL AND jsonb_array_length(tools_called) > 0)::BIGINT
  FROM chat_analytics
  WHERE created_at > NOW() - MAKE_INTERVAL(days => p_days)
    AND (p_user_id IS NULL OR user_id = p_user_id)
    AND (p_context_type IS NULL OR context_type = p_context_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_chat_analytics(
  p_conversation_id UUID,
  p_query_text TEXT,
  p_response_text TEXT,
  p_response_time_ms INTEGER,
  p_tokens_input INTEGER,
  p_tokens_output INTEGER,
  p_context_type TEXT,
  p_deal_id UUID DEFAULT NULL,
  p_universe_id UUID DEFAULT NULL,
  p_tools_called JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_analytics_id UUID;
BEGIN
  INSERT INTO chat_analytics (
    conversation_id, user_id, context_type, deal_id, universe_id,
    query_text, response_text, response_time_ms,
    tokens_input, tokens_output, tokens_total, tools_called
  ) VALUES (
    p_conversation_id, auth.uid(), p_context_type, p_deal_id, p_universe_id,
    p_query_text, p_response_text, p_response_time_ms,
    p_tokens_input, p_tokens_output, p_tokens_input + p_tokens_output, p_tools_called
  )
  RETURNING id INTO v_analytics_id;
  RETURN v_analytics_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Migration complete! All 5 chatbot tables created/updated.' AS status;
