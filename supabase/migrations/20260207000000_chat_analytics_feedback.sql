-- Chat Analytics & Feedback Tables
-- Tracks chatbot usage, performance, and user feedback

-- ============================================================================
-- CHAT ANALYTICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Context
  context_type TEXT NOT NULL CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe')),
  deal_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE SET NULL,

  -- Query details
  query_text TEXT NOT NULL,
  query_intent TEXT, -- 'find_buyers', 'score_explanation', 'transcript_search', 'general'
  query_complexity TEXT CHECK (query_complexity IN ('simple', 'medium', 'complex')),

  -- Response details
  response_text TEXT,
  response_time_ms INTEGER NOT NULL,
  model_used TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,

  -- Tool usage
  tools_called JSONB, -- Array of tool names used
  tool_execution_time_ms INTEGER,

  -- Entities mentioned
  mentioned_buyer_ids UUID[],
  mentioned_deal_ids UUID[],

  -- Quality metrics
  user_continued BOOLEAN DEFAULT FALSE, -- Did user ask follow-up?
  user_rating INTEGER CHECK (user_rating IN (-1, 0, 1)), -- -1: negative, 0: neutral, 1: positive
  feedback_provided BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Session tracking
  session_id TEXT -- For grouping related queries
);

-- Indexes for analytics queries
CREATE INDEX idx_chat_analytics_user_created ON public.chat_analytics(user_id, created_at DESC);
CREATE INDEX idx_chat_analytics_conversation ON public.chat_analytics(conversation_id);
CREATE INDEX idx_chat_analytics_context ON public.chat_analytics(context_type, created_at DESC);
CREATE INDEX idx_chat_analytics_universe ON public.chat_analytics(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX idx_chat_analytics_deal ON public.chat_analytics(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX idx_chat_analytics_intent ON public.chat_analytics(query_intent) WHERE query_intent IS NOT NULL;
CREATE INDEX idx_chat_analytics_tools ON public.chat_analytics USING GIN (tools_called) WHERE tools_called IS NOT NULL;
CREATE INDEX idx_chat_analytics_rating ON public.chat_analytics(user_rating) WHERE user_rating IS NOT NULL;

-- ============================================================================
-- CHAT FEEDBACK TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  analytics_id UUID REFERENCES public.chat_analytics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Feedback details
  message_index INTEGER NOT NULL, -- Which message in conversation
  rating INTEGER NOT NULL CHECK (rating IN (1, -1)), -- 1: thumbs up, -1: thumbs down

  -- Issue categorization
  issue_type TEXT CHECK (issue_type IN (
    'incorrect',
    'incomplete',
    'hallucination',
    'poor_formatting',
    'missing_data',
    'slow_response',
    'other'
  )),
  feedback_text TEXT,

  -- Resolution
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_chat_feedback_conversation ON public.chat_feedback(conversation_id);
CREATE INDEX idx_chat_feedback_user_created ON public.chat_feedback(user_id, created_at DESC);
CREATE INDEX idx_chat_feedback_rating ON public.chat_feedback(rating);
CREATE INDEX idx_chat_feedback_issue_type ON public.chat_feedback(issue_type) WHERE issue_type IS NOT NULL;
CREATE INDEX idx_chat_feedback_unresolved ON public.chat_feedback(created_at DESC) WHERE resolved = FALSE;

-- ============================================================================
-- SMART SUGGESTIONS CACHE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_smart_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  context_type TEXT NOT NULL CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe')),
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,

  -- Suggestion details
  previous_query TEXT NOT NULL, -- What was asked before
  suggestions JSONB NOT NULL, -- Array of suggested follow-ups
  suggestion_reasoning TEXT, -- Why these suggestions

  -- Performance tracking
  times_shown INTEGER DEFAULT 0,
  times_clicked INTEGER DEFAULT 0,
  click_through_rate NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN times_shown > 0 THEN (times_clicked::NUMERIC / times_shown::NUMERIC)
      ELSE 0
    END
  ) STORED,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_shown_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_smart_suggestions_context ON public.chat_smart_suggestions(context_type, universe_id, deal_id)
  WHERE created_at > NOW() - INTERVAL '7 days';
CREATE INDEX idx_smart_suggestions_performance ON public.chat_smart_suggestions(click_through_rate DESC)
  WHERE times_shown > 10;

-- ============================================================================
-- PROACTIVE RECOMMENDATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Recommendation details
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
    'explore_geography',
    'explore_size',
    'explore_services',
    'review_transcripts',
    'contact_buyers',
    'expand_search',
    'other'
  )),
  recommendation_text TEXT NOT NULL,
  recommendation_data JSONB, -- Additional structured data

  -- User interaction
  shown BOOLEAN DEFAULT FALSE,
  shown_at TIMESTAMPTZ,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_chat_recommendations_user ON public.chat_recommendations(user_id, created_at DESC);
CREATE INDEX idx_chat_recommendations_conversation ON public.chat_recommendations(conversation_id);
CREATE INDEX idx_chat_recommendations_active ON public.chat_recommendations(created_at DESC)
  WHERE shown = FALSE AND (expires_at IS NULL OR expires_at > NOW());
CREATE INDEX idx_chat_recommendations_type ON public.chat_recommendations(recommendation_type);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Chat Analytics
ALTER TABLE public.chat_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analytics"
  ON public.chat_analytics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analytics"
  ON public.chat_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins have full access to analytics"
  ON public.chat_analytics FOR ALL
  USING (is_admin(auth.uid()));

-- Chat Feedback
ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback"
  ON public.chat_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
  ON public.chat_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback"
  ON public.chat_feedback FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins have full access to feedback"
  ON public.chat_feedback FOR ALL
  USING (is_admin(auth.uid()));

-- Smart Suggestions
ALTER TABLE public.chat_smart_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view smart suggestions"
  ON public.chat_smart_suggestions FOR SELECT
  USING (true); -- Public data

CREATE POLICY "System can insert smart suggestions"
  ON public.chat_smart_suggestions FOR INSERT
  WITH CHECK (true); -- Service role only

CREATE POLICY "System can update smart suggestions"
  ON public.chat_smart_suggestions FOR UPDATE
  USING (true); -- Service role only

-- Proactive Recommendations
ALTER TABLE public.chat_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recommendations"
  ON public.chat_recommendations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own recommendations"
  ON public.chat_recommendations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can insert recommendations"
  ON public.chat_recommendations FOR INSERT
  WITH CHECK (true); -- Service role only

CREATE POLICY "Admins have full access to recommendations"
  ON public.chat_recommendations FOR ALL
  USING (is_admin(auth.uid()));

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get analytics summary
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

-- Function to log chat analytics
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
    conversation_id,
    user_id,
    context_type,
    deal_id,
    universe_id,
    query_text,
    response_text,
    response_time_ms,
    tokens_input,
    tokens_output,
    tokens_total,
    tools_called
  ) VALUES (
    p_conversation_id,
    auth.uid(),
    p_context_type,
    p_deal_id,
    p_universe_id,
    p_query_text,
    p_response_text,
    p_response_time_ms,
    p_tokens_input,
    p_tokens_output,
    p_tokens_input + p_tokens_output,
    p_tools_called
  )
  RETURNING id INTO v_analytics_id;

  RETURN v_analytics_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.chat_analytics IS 'Tracks chatbot usage, performance, and query patterns';
COMMENT ON TABLE public.chat_feedback IS 'User feedback on chatbot responses (thumbs up/down and detailed feedback)';
COMMENT ON TABLE public.chat_smart_suggestions IS 'Caches smart follow-up suggestions with performance tracking';
COMMENT ON TABLE public.chat_recommendations IS 'Proactive recommendations shown to users based on conversation analysis';

COMMENT ON FUNCTION get_chat_analytics_summary IS 'Get summary analytics for chat usage over specified period';
COMMENT ON FUNCTION log_chat_analytics IS 'Helper function to log chat analytics with automatic user_id resolution';

-- Merged from: 20260207000000_chat_conversations.sql
-- Chat Conversations Persistence
-- Stores chat conversation history for user sessions

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Context
  context_type TEXT NOT NULL CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe')),
  deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,

  -- Conversation metadata
  title TEXT, -- Optional user-provided or auto-generated title
  messages JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {role, content, timestamp}

  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  message_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(messages)) STORED,

  -- Soft delete
  archived BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes
CREATE INDEX idx_chat_conversations_user_id ON public.chat_conversations(user_id) WHERE archived = FALSE;
CREATE INDEX idx_chat_conversations_deal_id ON public.chat_conversations(deal_id) WHERE deal_id IS NOT NULL AND archived = FALSE;
CREATE INDEX idx_chat_conversations_universe_id ON public.chat_conversations(universe_id) WHERE universe_id IS NOT NULL AND archived = FALSE;
CREATE INDEX idx_chat_conversations_updated_at ON public.chat_conversations(updated_at DESC) WHERE archived = FALSE;
CREATE INDEX idx_chat_conversations_context_type ON public.chat_conversations(context_type) WHERE archived = FALSE;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_chat_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_message_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_conversations_updated_at();

-- RLS Policies
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- Users can view their own conversations
CREATE POLICY "Users can view own conversations"
  ON public.chat_conversations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own conversations
CREATE POLICY "Users can create own conversations"
  ON public.chat_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own conversations
CREATE POLICY "Users can update own conversations"
  ON public.chat_conversations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete (archive) their own conversations
CREATE POLICY "Users can delete own conversations"
  ON public.chat_conversations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Admins have full access
CREATE POLICY "Admins have full access"
  ON public.chat_conversations
  FOR ALL
  USING (is_admin(auth.uid()));

-- Comments
COMMENT ON TABLE public.chat_conversations IS 'Stores chat conversation history for buyer/deal analysis sessions';
COMMENT ON COLUMN public.chat_conversations.messages IS 'JSONB array of message objects: [{role: "user"|"assistant", content: string, timestamp: ISO8601}]';
COMMENT ON COLUMN public.chat_conversations.context_type IS 'Type of chat context: deal (single deal), deals (all deals), buyers (all buyers), universe (specific universe)';
COMMENT ON COLUMN public.chat_conversations.message_count IS 'Auto-computed count of messages in the conversation';

-- Merged from: 20260207000000_chatbot_complete.sql
-- ============================================================================
-- COMPLETE CHATBOT INFRASTRUCTURE MIGRATION
-- Run this entire file in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: CHAT CONVERSATIONS TABLE
-- ============================================================================

-- Chat Conversations Persistence
-- Stores chat conversation history for user sessions

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Context
  context_type TEXT NOT NULL CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe')),
  deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,

  -- Conversation metadata
  title TEXT, -- Optional user-provided or auto-generated title
  messages JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {role, content, timestamp}

  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  message_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(messages)) STORED,

  -- Soft delete
  archived BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON public.chat_conversations(user_id) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_deal_id ON public.chat_conversations(deal_id) WHERE deal_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_universe_id ON public.chat_conversations(universe_id) WHERE universe_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON public.chat_conversations(updated_at DESC) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_context_type ON public.chat_conversations(context_type) WHERE archived = FALSE;

-- Updated_at trigger
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

-- RLS Policies
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own conversations" ON public.chat_conversations;
CREATE POLICY "Users can view own conversations"
  ON public.chat_conversations
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own conversations" ON public.chat_conversations;
CREATE POLICY "Users can create own conversations"
  ON public.chat_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own conversations" ON public.chat_conversations;
CREATE POLICY "Users can update own conversations"
  ON public.chat_conversations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own conversations" ON public.chat_conversations;
CREATE POLICY "Users can delete own conversations"
  ON public.chat_conversations
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins have full access" ON public.chat_conversations;
CREATE POLICY "Admins have full access"
  ON public.chat_conversations
  FOR ALL
  USING (is_admin(auth.uid()));

-- Comments
COMMENT ON TABLE public.chat_conversations IS 'Stores chat conversation history for buyer/deal analysis sessions';
COMMENT ON COLUMN public.chat_conversations.messages IS 'JSONB array of message objects: [{role: "user"|"assistant", content: string, timestamp: ISO8601}]';
COMMENT ON COLUMN public.chat_conversations.context_type IS 'Type of chat context: deal (single deal), deals (all deals), buyers (all buyers), universe (specific universe)';
COMMENT ON COLUMN public.chat_conversations.message_count IS 'Auto-computed count of messages in the conversation';

-- ============================================================================
-- PART 2: CHAT ANALYTICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Context
  context_type TEXT NOT NULL CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe')),
  deal_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE SET NULL,

  -- Query details
  query_text TEXT NOT NULL,
  query_intent TEXT, -- 'find_buyers', 'score_explanation', 'transcript_search', 'general'
  query_complexity TEXT CHECK (query_complexity IN ('simple', 'medium', 'complex')),

  -- Response details
  response_text TEXT,
  response_time_ms INTEGER NOT NULL,
  model_used TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,

  -- Tool usage
  tools_called JSONB, -- Array of tool names used
  tool_execution_time_ms INTEGER,

  -- Entities mentioned
  mentioned_buyer_ids UUID[],
  mentioned_deal_ids UUID[],

  -- Quality metrics
  user_continued BOOLEAN DEFAULT FALSE, -- Did user ask follow-up?
  user_rating INTEGER CHECK (user_rating IN (-1, 0, 1)), -- -1: negative, 0: neutral, 1: positive
  feedback_provided BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Session tracking
  session_id TEXT -- For grouping related queries
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_chat_analytics_user_created ON public.chat_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_conversation ON public.chat_analytics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_context ON public.chat_analytics(context_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_universe ON public.chat_analytics(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_deal ON public.chat_analytics(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_intent ON public.chat_analytics(query_intent) WHERE query_intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_tools ON public.chat_analytics USING GIN (tools_called) WHERE tools_called IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_rating ON public.chat_analytics(user_rating) WHERE user_rating IS NOT NULL;

-- ============================================================================
-- PART 3: CHAT FEEDBACK TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  analytics_id UUID REFERENCES public.chat_analytics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Feedback details
  message_index INTEGER NOT NULL, -- Which message in conversation
  rating INTEGER NOT NULL CHECK (rating IN (1, -1)), -- 1: thumbs up, -1: thumbs down

  -- Issue categorization
  issue_type TEXT CHECK (issue_type IN (
    'incorrect',
    'incomplete',
    'hallucination',
    'poor_formatting',
    'missing_data',
    'slow_response',
    'other'
  )),
  feedback_text TEXT,

  -- Resolution
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_feedback_conversation ON public.chat_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_user_created ON public.chat_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_rating ON public.chat_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_issue_type ON public.chat_feedback(issue_type) WHERE issue_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_feedback_unresolved ON public.chat_feedback(created_at DESC) WHERE resolved = FALSE;

-- ============================================================================
-- PART 4: SMART SUGGESTIONS CACHE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_smart_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  context_type TEXT NOT NULL CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe')),
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,

  -- Suggestion details
  previous_query TEXT NOT NULL, -- What was asked before
  suggestions JSONB NOT NULL, -- Array of suggested follow-ups
  suggestion_reasoning TEXT, -- Why these suggestions

  -- Performance tracking
  times_shown INTEGER DEFAULT 0,
  times_clicked INTEGER DEFAULT 0,
  click_through_rate NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN times_shown > 0 THEN (times_clicked::NUMERIC / times_shown::NUMERIC)
      ELSE 0
    END
  ) STORED,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_shown_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_context ON public.chat_smart_suggestions(context_type, universe_id, deal_id)
  WHERE created_at > NOW() - INTERVAL '7 days';
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_performance ON public.chat_smart_suggestions(click_through_rate DESC)
  WHERE times_shown > 10;

-- ============================================================================
-- PART 5: PROACTIVE RECOMMENDATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Recommendation details
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
    'explore_geography',
    'explore_size',
    'explore_services',
    'review_transcripts',
    'contact_buyers',
    'expand_search',
    'other'
  )),
  recommendation_text TEXT NOT NULL,
  recommendation_data JSONB, -- Additional structured data

  -- User interaction
  shown BOOLEAN DEFAULT FALSE,
  shown_at TIMESTAMPTZ,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_user ON public.chat_recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_conversation ON public.chat_recommendations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_active ON public.chat_recommendations(created_at DESC)
  WHERE shown = FALSE AND (expires_at IS NULL OR expires_at > NOW());
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_type ON public.chat_recommendations(recommendation_type);

-- ============================================================================
-- PART 6: RLS POLICIES
-- ============================================================================

-- Chat Analytics
ALTER TABLE public.chat_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own analytics" ON public.chat_analytics;
CREATE POLICY "Users can view own analytics"
  ON public.chat_analytics FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own analytics" ON public.chat_analytics;
CREATE POLICY "Users can insert own analytics"
  ON public.chat_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins have full access to analytics" ON public.chat_analytics;
CREATE POLICY "Admins have full access to analytics"
  ON public.chat_analytics FOR ALL
  USING (is_admin(auth.uid()));

-- Chat Feedback
ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own feedback" ON public.chat_feedback;
CREATE POLICY "Users can view own feedback"
  ON public.chat_feedback FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own feedback" ON public.chat_feedback;
CREATE POLICY "Users can insert own feedback"
  ON public.chat_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own feedback" ON public.chat_feedback;
CREATE POLICY "Users can update own feedback"
  ON public.chat_feedback FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins have full access to feedback" ON public.chat_feedback;
CREATE POLICY "Admins have full access to feedback"
  ON public.chat_feedback FOR ALL
  USING (is_admin(auth.uid()));

-- Smart Suggestions
ALTER TABLE public.chat_smart_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "Anyone can view smart suggestions"
  ON public.chat_smart_suggestions FOR SELECT
  USING (true); -- Public data

DROP POLICY IF EXISTS "System can insert smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can insert smart suggestions"
  ON public.chat_smart_suggestions FOR INSERT
  WITH CHECK (true); -- Service role only

DROP POLICY IF EXISTS "System can update smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can update smart suggestions"
  ON public.chat_smart_suggestions FOR UPDATE
  USING (true); -- Service role only

-- Proactive Recommendations
ALTER TABLE public.chat_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recommendations" ON public.chat_recommendations;
CREATE POLICY "Users can view own recommendations"
  ON public.chat_recommendations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own recommendations" ON public.chat_recommendations;
CREATE POLICY "Users can update own recommendations"
  ON public.chat_recommendations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert recommendations" ON public.chat_recommendations;
CREATE POLICY "System can insert recommendations"
  ON public.chat_recommendations FOR INSERT
  WITH CHECK (true); -- Service role only

DROP POLICY IF EXISTS "Admins have full access to recommendations" ON public.chat_recommendations;
CREATE POLICY "Admins have full access to recommendations"
  ON public.chat_recommendations FOR ALL
  USING (is_admin(auth.uid()));

-- ============================================================================
-- PART 7: HELPER FUNCTIONS
-- ============================================================================

-- Function to get analytics summary
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

-- Function to log chat analytics
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
    conversation_id,
    user_id,
    context_type,
    deal_id,
    universe_id,
    query_text,
    response_text,
    response_time_ms,
    tokens_input,
    tokens_output,
    tokens_total,
    tools_called
  ) VALUES (
    p_conversation_id,
    auth.uid(),
    p_context_type,
    p_deal_id,
    p_universe_id,
    p_query_text,
    p_response_text,
    p_response_time_ms,
    p_tokens_input,
    p_tokens_output,
    p_tokens_input + p_tokens_output,
    p_tools_called
  )
  RETURNING id INTO v_analytics_id;

  RETURN v_analytics_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 8: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.chat_analytics IS 'Tracks chatbot usage, performance, and query patterns';
COMMENT ON TABLE public.chat_feedback IS 'User feedback on chatbot responses (thumbs up/down and detailed feedback)';
COMMENT ON TABLE public.chat_smart_suggestions IS 'Caches smart follow-up suggestions with performance tracking';
COMMENT ON TABLE public.chat_recommendations IS 'Proactive recommendations shown to users based on conversation analysis';

COMMENT ON FUNCTION get_chat_analytics_summary IS 'Get summary analytics for chat usage over specified period';
COMMENT ON FUNCTION log_chat_analytics IS 'Helper function to log chat analytics with automatic user_id resolution';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables were created
DO $$
BEGIN
  RAISE NOTICE 'Migration complete! Created tables:';
  RAISE NOTICE '  - chat_conversations';
  RAISE NOTICE '  - chat_analytics';
  RAISE NOTICE '  - chat_feedback';
  RAISE NOTICE '  - chat_smart_suggestions';
  RAISE NOTICE '  - chat_recommendations';
  RAISE NOTICE '';
  RAISE NOTICE 'Run this to verify:';
  RAISE NOTICE '  SELECT tablename FROM pg_tables WHERE schemaname = ''public'' AND tablename LIKE ''chat_%'';';
END $$;

-- Merged from: 20260207000000_chatbot_complete_fixed.sql
-- ============================================================================
-- COMPLETE CHATBOT INFRASTRUCTURE MIGRATION (FIXED)
-- Handles existing tables and adds missing columns
-- ============================================================================

-- ============================================================================
-- PART 1: CHAT CONVERSATIONS TABLE
-- ============================================================================

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe')),
  deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add archived column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'chat_conversations'
    AND column_name = 'archived'
  ) THEN
    ALTER TABLE public.chat_conversations ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- Add message_count column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'chat_conversations'
    AND column_name = 'message_count'
  ) THEN
    ALTER TABLE public.chat_conversations
    ADD COLUMN message_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(messages)) STORED;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON public.chat_conversations(user_id) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_deal_id ON public.chat_conversations(deal_id) WHERE deal_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_universe_id ON public.chat_conversations(universe_id) WHERE universe_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON public.chat_conversations(updated_at DESC) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_context_type ON public.chat_conversations(context_type) WHERE archived = FALSE;

-- Updated_at trigger
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

-- RLS Policies
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own conversations" ON public.chat_conversations;
CREATE POLICY "Users can view own conversations"
  ON public.chat_conversations
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own conversations" ON public.chat_conversations;
CREATE POLICY "Users can create own conversations"
  ON public.chat_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own conversations" ON public.chat_conversations;
CREATE POLICY "Users can update own conversations"
  ON public.chat_conversations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own conversations" ON public.chat_conversations;
CREATE POLICY "Users can delete own conversations"
  ON public.chat_conversations
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins have full access" ON public.chat_conversations;
CREATE POLICY "Admins have full access"
  ON public.chat_conversations
  FOR ALL
  USING (is_admin(auth.uid()));

-- Comments
COMMENT ON TABLE public.chat_conversations IS 'Stores chat conversation history for buyer/deal analysis sessions';
COMMENT ON COLUMN public.chat_conversations.messages IS 'JSONB array of message objects: [{role: "user"|"assistant", content: string, timestamp: ISO8601}]';
COMMENT ON COLUMN public.chat_conversations.context_type IS 'Type of chat context: deal (single deal), deals (all deals), buyers (all buyers), universe (specific universe)';

-- ============================================================================
-- PART 2: CHAT ANALYTICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe')),
  deal_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  query_intent TEXT,
  query_complexity TEXT CHECK (query_complexity IN ('simple', 'medium', 'complex')),
  response_text TEXT,
  response_time_ms INTEGER NOT NULL,
  model_used TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,
  tools_called JSONB,
  tool_execution_time_ms INTEGER,
  mentioned_buyer_ids UUID[],
  mentioned_deal_ids UUID[],
  user_continued BOOLEAN DEFAULT FALSE,
  user_rating INTEGER CHECK (user_rating IN (-1, 0, 1)),
  feedback_provided BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_chat_analytics_user_created ON public.chat_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_conversation ON public.chat_analytics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_context ON public.chat_analytics(context_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_universe ON public.chat_analytics(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_deal ON public.chat_analytics(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_intent ON public.chat_analytics(query_intent) WHERE query_intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_tools ON public.chat_analytics USING GIN (tools_called) WHERE tools_called IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_rating ON public.chat_analytics(user_rating) WHERE user_rating IS NOT NULL;

-- ============================================================================
-- PART 3: CHAT FEEDBACK TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  analytics_id UUID REFERENCES public.chat_analytics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating IN (1, -1)),
  issue_type TEXT CHECK (issue_type IN (
    'incorrect',
    'incomplete',
    'hallucination',
    'poor_formatting',
    'missing_data',
    'slow_response',
    'other'
  )),
  feedback_text TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_feedback_conversation ON public.chat_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_user_created ON public.chat_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_rating ON public.chat_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_issue_type ON public.chat_feedback(issue_type) WHERE issue_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_feedback_unresolved ON public.chat_feedback(created_at DESC) WHERE resolved = FALSE;

-- ============================================================================
-- PART 4: SMART SUGGESTIONS CACHE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_smart_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type TEXT NOT NULL CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe')),
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  previous_query TEXT NOT NULL,
  suggestions JSONB NOT NULL,
  suggestion_reasoning TEXT,
  times_shown INTEGER DEFAULT 0,
  times_clicked INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_shown_at TIMESTAMPTZ
);

-- Add computed column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'chat_smart_suggestions'
    AND column_name = 'click_through_rate'
  ) THEN
    ALTER TABLE public.chat_smart_suggestions
    ADD COLUMN click_through_rate NUMERIC GENERATED ALWAYS AS (
      CASE
        WHEN times_shown > 0 THEN (times_clicked::NUMERIC / times_shown::NUMERIC)
        ELSE 0
      END
    ) STORED;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_context ON public.chat_smart_suggestions(context_type, universe_id, deal_id)
  WHERE created_at > NOW() - INTERVAL '7 days';
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_performance ON public.chat_smart_suggestions(click_through_rate DESC)
  WHERE times_shown > 10;

-- ============================================================================
-- PART 5: PROACTIVE RECOMMENDATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
    'explore_geography',
    'explore_size',
    'explore_services',
    'review_transcripts',
    'contact_buyers',
    'expand_search',
    'other'
  )),
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_user ON public.chat_recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_conversation ON public.chat_recommendations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_active ON public.chat_recommendations(created_at DESC)
  WHERE shown = FALSE AND (expires_at IS NULL OR expires_at > NOW());
CREATE INDEX IF NOT EXISTS idx_chat_recommendations_type ON public.chat_recommendations(recommendation_type);

-- ============================================================================
-- PART 6: RLS POLICIES
-- ============================================================================

-- Chat Analytics
ALTER TABLE public.chat_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own analytics" ON public.chat_analytics;
CREATE POLICY "Users can view own analytics"
  ON public.chat_analytics FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own analytics" ON public.chat_analytics;
CREATE POLICY "Users can insert own analytics"
  ON public.chat_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins have full access to analytics" ON public.chat_analytics;
CREATE POLICY "Admins have full access to analytics"
  ON public.chat_analytics FOR ALL
  USING (is_admin(auth.uid()));

-- Chat Feedback
ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own feedback" ON public.chat_feedback;
CREATE POLICY "Users can view own feedback"
  ON public.chat_feedback FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own feedback" ON public.chat_feedback;
CREATE POLICY "Users can insert own feedback"
  ON public.chat_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own feedback" ON public.chat_feedback;
CREATE POLICY "Users can update own feedback"
  ON public.chat_feedback FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins have full access to feedback" ON public.chat_feedback;
CREATE POLICY "Admins have full access to feedback"
  ON public.chat_feedback FOR ALL
  USING (is_admin(auth.uid()));

-- Smart Suggestions
ALTER TABLE public.chat_smart_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "Anyone can view smart suggestions"
  ON public.chat_smart_suggestions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "System can insert smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can insert smart suggestions"
  ON public.chat_smart_suggestions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "System can update smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can update smart suggestions"
  ON public.chat_smart_suggestions FOR UPDATE
  USING (true);

-- Proactive Recommendations
ALTER TABLE public.chat_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recommendations" ON public.chat_recommendations;
CREATE POLICY "Users can view own recommendations"
  ON public.chat_recommendations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own recommendations" ON public.chat_recommendations;
CREATE POLICY "Users can update own recommendations"
  ON public.chat_recommendations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert recommendations" ON public.chat_recommendations;
CREATE POLICY "System can insert recommendations"
  ON public.chat_recommendations FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins have full access to recommendations" ON public.chat_recommendations;
CREATE POLICY "Admins have full access to recommendations"
  ON public.chat_recommendations FOR ALL
  USING (is_admin(auth.uid()));

-- ============================================================================
-- PART 7: HELPER FUNCTIONS
-- ============================================================================

-- Function to get analytics summary
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

-- Function to log chat analytics
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
    conversation_id,
    user_id,
    context_type,
    deal_id,
    universe_id,
    query_text,
    response_text,
    response_time_ms,
    tokens_input,
    tokens_output,
    tokens_total,
    tools_called
  ) VALUES (
    p_conversation_id,
    auth.uid(),
    p_context_type,
    p_deal_id,
    p_universe_id,
    p_query_text,
    p_response_text,
    p_response_time_ms,
    p_tokens_input,
    p_tokens_output,
    p_tokens_input + p_tokens_output,
    p_tools_called
  )
  RETURNING id INTO v_analytics_id;

  RETURN v_analytics_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 8: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.chat_analytics IS 'Tracks chatbot usage, performance, and query patterns';
COMMENT ON TABLE public.chat_feedback IS 'User feedback on chatbot responses (thumbs up/down and detailed feedback)';
COMMENT ON TABLE public.chat_smart_suggestions IS 'Caches smart follow-up suggestions with performance tracking';
COMMENT ON TABLE public.chat_recommendations IS 'Proactive recommendations shown to users based on conversation analysis';

COMMENT ON FUNCTION get_chat_analytics_summary IS 'Get summary analytics for chat usage over specified period';
COMMENT ON FUNCTION log_chat_analytics IS 'Helper function to log chat analytics with automatic user_id resolution';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables were created
DO $$
BEGIN
  RAISE NOTICE 'Migration complete! Created/updated tables:';
  RAISE NOTICE '  - chat_conversations';
  RAISE NOTICE '  - chat_analytics';
  RAISE NOTICE '  - chat_feedback';
  RAISE NOTICE '  - chat_smart_suggestions';
  RAISE NOTICE '  - chat_recommendations';
  RAISE NOTICE '';
  RAISE NOTICE 'Run this to verify:';
  RAISE NOTICE '  SELECT tablename FROM pg_tables WHERE schemaname = ''public'' AND tablename LIKE ''chat_%'';';
END $$;

-- Merged from: 20260207000000_chatbot_complete_v2.sql
-- ============================================================================
-- COMPLETE CHATBOT INFRASTRUCTURE MIGRATION (V2)
-- Handles ALL existing tables and adds missing columns
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

-- Add ALL missing columns for chat_conversations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'archived') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'message_count') THEN
    ALTER TABLE public.chat_conversations ADD COLUMN message_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(messages)) STORED;
  END IF;
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
  -- Add check constraint for context_type if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_context_type_check'
  ) THEN
    ALTER TABLE public.chat_analytics ADD CONSTRAINT chat_analytics_context_type_check
      CHECK (context_type IN ('deal', 'deals', 'buyers', 'universe'));
  END IF;

  -- Add check constraint for query_complexity if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_query_complexity_check'
  ) THEN
    ALTER TABLE public.chat_analytics ADD CONSTRAINT chat_analytics_query_complexity_check
      CHECK (query_complexity IN ('simple', 'medium', 'complex'));
  END IF;

  -- Add check constraint for user_rating if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_analytics_user_rating_check'
  ) THEN
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
  times_shown INTEGER DEFAULT 0,
  times_clicked INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_shown_at TIMESTAMPTZ
);

-- Add missing columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_smart_suggestions' AND column_name = 'click_through_rate') THEN
    ALTER TABLE public.chat_smart_suggestions ADD COLUMN click_through_rate NUMERIC GENERATED ALWAYS AS (
      CASE WHEN times_shown > 0 THEN (times_clicked::NUMERIC / times_shown::NUMERIC) ELSE 0 END
    ) STORED;
  END IF;
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
-- PART 6: INDEXES (created after all columns exist)
-- ============================================================================

-- chat_conversations indexes
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON public.chat_conversations(user_id) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_deal_id ON public.chat_conversations(deal_id) WHERE deal_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_universe_id ON public.chat_conversations(universe_id) WHERE universe_id IS NOT NULL AND archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON public.chat_conversations(updated_at DESC) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_context_type ON public.chat_conversations(context_type) WHERE archived = FALSE;

-- chat_analytics indexes
CREATE INDEX IF NOT EXISTS idx_chat_analytics_user_created ON public.chat_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_conversation ON public.chat_analytics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_context ON public.chat_analytics(context_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_universe ON public.chat_analytics(universe_id) WHERE universe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_deal ON public.chat_analytics(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_intent ON public.chat_analytics(query_intent) WHERE query_intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_tools ON public.chat_analytics USING GIN (tools_called) WHERE tools_called IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_analytics_rating ON public.chat_analytics(user_rating) WHERE user_rating IS NOT NULL;

-- chat_feedback indexes
CREATE INDEX IF NOT EXISTS idx_chat_feedback_conversation ON public.chat_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_user_created ON public.chat_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_rating ON public.chat_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_issue_type ON public.chat_feedback(issue_type) WHERE issue_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_feedback_unresolved ON public.chat_feedback(created_at DESC) WHERE resolved = FALSE;

-- chat_smart_suggestions indexes
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_context ON public.chat_smart_suggestions(context_type, universe_id, deal_id) WHERE created_at > NOW() - INTERVAL '7 days';
CREATE INDEX IF NOT EXISTS idx_smart_suggestions_performance ON public.chat_smart_suggestions(click_through_rate DESC) WHERE times_shown > 10;

-- chat_recommendations indexes
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

-- chat_conversations RLS
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

-- chat_analytics RLS
ALTER TABLE public.chat_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own analytics" ON public.chat_analytics;
CREATE POLICY "Users can view own analytics" ON public.chat_analytics FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own analytics" ON public.chat_analytics;
CREATE POLICY "Users can insert own analytics" ON public.chat_analytics FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access to analytics" ON public.chat_analytics;
CREATE POLICY "Admins have full access to analytics" ON public.chat_analytics FOR ALL USING (is_admin(auth.uid()));

-- chat_feedback RLS
ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own feedback" ON public.chat_feedback;
CREATE POLICY "Users can view own feedback" ON public.chat_feedback FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own feedback" ON public.chat_feedback;
CREATE POLICY "Users can insert own feedback" ON public.chat_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own feedback" ON public.chat_feedback;
CREATE POLICY "Users can update own feedback" ON public.chat_feedback FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins have full access to feedback" ON public.chat_feedback;
CREATE POLICY "Admins have full access to feedback" ON public.chat_feedback FOR ALL USING (is_admin(auth.uid()));

-- chat_smart_suggestions RLS
ALTER TABLE public.chat_smart_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "Anyone can view smart suggestions" ON public.chat_smart_suggestions FOR SELECT USING (true);
DROP POLICY IF EXISTS "System can insert smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can insert smart suggestions" ON public.chat_smart_suggestions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "System can update smart suggestions" ON public.chat_smart_suggestions;
CREATE POLICY "System can update smart suggestions" ON public.chat_smart_suggestions FOR UPDATE USING (true);

-- chat_recommendations RLS
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

-- ============================================================================
-- PART 10: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.chat_analytics IS 'Tracks chatbot usage, performance, and query patterns';
COMMENT ON TABLE public.chat_feedback IS 'User feedback on chatbot responses (thumbs up/down and detailed feedback)';
COMMENT ON TABLE public.chat_smart_suggestions IS 'Caches smart follow-up suggestions with performance tracking';
COMMENT ON TABLE public.chat_recommendations IS 'Proactive recommendations shown to users based on conversation analysis';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

SELECT 'Migration complete! All 5 tables created/updated.' AS status;

-- Merged from: 20260207000000_fix_scores_unique_constraint.sql
-- ============================================================================
-- Fix: Update remarketing_scores unique constraint to include universe_id
-- ============================================================================
-- Previously, (listing_id, buyer_id) was unique, meaning scoring the same
-- buyer for the same listing in two different universes would overwrite.
-- Now each (listing_id, buyer_id, universe_id) is unique.
-- ============================================================================

-- Drop the old unique constraint
ALTER TABLE remarketing_scores
  DROP CONSTRAINT IF EXISTS remarketing_scores_listing_id_buyer_id_key;

-- Add new unique constraint including universe_id
ALTER TABLE remarketing_scores
  ADD CONSTRAINT remarketing_scores_listing_buyer_universe_key
  UNIQUE (listing_id, buyer_id, universe_id);

-- Merged from: 20260207000000_linkedin_match_confidence.sql
-- Add LinkedIn match quality tracking columns
-- Enables monitoring and manual review of LinkedIn profile matches

-- Add confidence level column
ALTER TABLE listings ADD COLUMN IF NOT EXISTS linkedin_match_confidence TEXT
  CHECK (linkedin_match_confidence IN ('high', 'medium', 'low', 'manual', 'failed'));

-- Add match signals JSONB column to store verification details
ALTER TABLE listings ADD COLUMN IF NOT EXISTS linkedin_match_signals JSONB;

-- Add timestamp for when LinkedIn was verified
ALTER TABLE listings ADD COLUMN IF NOT EXISTS linkedin_verified_at TIMESTAMPTZ;

-- Create index for finding low-confidence matches that need review
CREATE INDEX IF NOT EXISTS idx_listings_linkedin_confidence
  ON listings(linkedin_match_confidence)
  WHERE linkedin_match_confidence IN ('low', 'failed');

-- Create index for recent verifications
CREATE INDEX IF NOT EXISTS idx_listings_linkedin_verified
  ON listings(linkedin_verified_at DESC)
  WHERE linkedin_verified_at IS NOT NULL;

-- Comments
COMMENT ON COLUMN listings.linkedin_match_confidence IS
  'Confidence level of LinkedIn profile match: high (verified match), medium (likely correct), low (uncertain), manual (user provided), failed (verification failed)';

COMMENT ON COLUMN listings.linkedin_match_signals IS
  'JSON object storing verification signals: { websiteMatch: boolean, locationMatch: { match: boolean, confidence: string, reason: string }, foundViaSearch: boolean, employeeCountRatio: number }';

COMMENT ON COLUMN listings.linkedin_verified_at IS
  'Timestamp when LinkedIn profile was last verified/matched';

-- Create view for manual review queue
CREATE OR REPLACE VIEW linkedin_manual_review_queue AS
SELECT
  l.id,
  l.title,
  l.internal_company_name,
  l.address_city,
  l.address_state,
  l.website,
  l.linkedin_url,
  l.linkedin_match_confidence,
  l.linkedin_match_signals,
  l.full_time_employees,
  l.linkedin_employee_count,
  l.linkedin_headquarters,
  l.linkedin_verified_at,
  -- Calculate employee count ratio for red flags
  CASE
    WHEN l.full_time_employees > 0 AND l.linkedin_employee_count IS NOT NULL
    THEN ROUND((l.linkedin_employee_count::numeric / l.full_time_employees::numeric), 2)
    ELSE NULL
  END as employee_count_ratio,
  -- Flag for suspicious mismatches
  CASE
    WHEN l.full_time_employees > 0 AND l.linkedin_employee_count IS NOT NULL
         AND (l.linkedin_employee_count > l.full_time_employees * 5 OR l.linkedin_employee_count < l.full_time_employees / 5)
    THEN true
    ELSE false
  END as suspicious_employee_mismatch,
  l.updated_at
FROM listings l
WHERE
  -- Include profiles that need review
  (
    l.linkedin_match_confidence IN ('low', 'failed')
    OR (
      -- Or profiles with suspicious employee count mismatches
      l.full_time_employees > 0
      AND l.linkedin_employee_count IS NOT NULL
      AND (l.linkedin_employee_count > l.full_time_employees * 5 OR l.linkedin_employee_count < l.full_time_employees / 5)
    )
  )
  AND l.linkedin_url IS NOT NULL  -- Only for profiles that have LinkedIn data
ORDER BY
  CASE l.linkedin_match_confidence
    WHEN 'failed' THEN 1
    WHEN 'low' THEN 2
    ELSE 3
  END,
  l.updated_at DESC;

COMMENT ON VIEW linkedin_manual_review_queue IS
  'Queue of LinkedIn profiles that need manual review due to low confidence or suspicious data mismatches';

-- Create helper function to update match confidence
CREATE OR REPLACE FUNCTION update_linkedin_match_confidence(
  p_listing_id UUID,
  p_confidence TEXT,
  p_signals JSONB DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE listings
  SET
    linkedin_match_confidence = p_confidence,
    linkedin_match_signals = COALESCE(p_signals, linkedin_match_signals),
    linkedin_verified_at = NOW()
  WHERE id = p_listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_linkedin_match_confidence IS
  'Helper function to update LinkedIn match confidence and verification timestamp';

-- Merged from: 20260207000000_quality_scoring_v2.sql
-- Add new quality scoring columns for v2 scoring methodology
-- Enables tracking of individual score components and LinkedIn boost

-- Add revenue score column (0-60 pts)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS revenue_score INTEGER;

-- Add EBITDA score column (0-40 pts)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ebitda_score INTEGER;

-- Add LinkedIn employee boost column (0-25 pts)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS linkedin_boost INTEGER;

-- Add quality calculation version column for tracking methodology changes
ALTER TABLE listings ADD COLUMN IF NOT EXISTS quality_calculation_version TEXT;

-- Create indexes for querying by score components
CREATE INDEX IF NOT EXISTS idx_listings_revenue_score
  ON listings(revenue_score DESC)
  WHERE revenue_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_ebitda_score
  ON listings(ebitda_score DESC)
  WHERE ebitda_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_linkedin_boost
  ON listings(linkedin_boost DESC)
  WHERE linkedin_boost IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_quality_version
  ON listings(quality_calculation_version)
  WHERE quality_calculation_version IS NOT NULL;

-- Comments
COMMENT ON COLUMN listings.revenue_score IS
  'Revenue component score (0-60 pts) from quality scoring v2. Uses exponential curve: $1-5M = 15-40 pts, $5-10M = 40-54 pts, $10M+ = 54-60 pts';

COMMENT ON COLUMN listings.ebitda_score IS
  'EBITDA component score (0-40 pts) from quality scoring v2. Uses exponential curve: $300K-1M = 5-20 pts, $1-3M = 20-35 pts, $3M+ = 35-40 pts';

COMMENT ON COLUMN listings.linkedin_boost IS
  'LinkedIn employee count boost (0-25 pts) applied even when financials exist. 100+ employees = +20-25 pts, 50-99 = +10-15 pts, 25-49 = +5-10 pts';

COMMENT ON COLUMN listings.quality_calculation_version IS
  'Version of quality scoring methodology used. v2.0 = exponential curves + LinkedIn boost';

-- Create view for scoring analysis
CREATE OR REPLACE VIEW deal_quality_analysis AS
SELECT
  l.id,
  l.title,
  l.internal_company_name,
  l.deal_total_score,
  l.deal_size_score,
  l.revenue_score,
  l.ebitda_score,
  l.linkedin_boost,
  l.quality_calculation_version,
  l.revenue,
  l.ebitda,
  l.linkedin_employee_count,
  -- Calculate score breakdown percentages
  CASE
    WHEN l.deal_total_score > 0 THEN ROUND((l.revenue_score::numeric / l.deal_total_score::numeric) * 100, 1)
    ELSE NULL
  END as revenue_pct,
  CASE
    WHEN l.deal_total_score > 0 THEN ROUND((l.ebitda_score::numeric / l.deal_total_score::numeric) * 100, 1)
    ELSE NULL
  END as ebitda_pct,
  CASE
    WHEN l.deal_total_score > 0 THEN ROUND((l.linkedin_boost::numeric / l.deal_total_score::numeric) * 100, 1)
    ELSE NULL
  END as linkedin_boost_pct,
  -- Identify scoring path
  CASE
    WHEN l.revenue > 0 OR l.ebitda > 0 THEN 'financials'
    WHEN l.linkedin_employee_count > 0 THEN 'linkedin_proxy'
    WHEN l.google_review_count > 0 THEN 'reviews_proxy'
    ELSE 'no_data'
  END as scoring_path,
  -- Flag deals that would benefit from LinkedIn boost
  CASE
    WHEN l.linkedin_employee_count >= 100 AND l.linkedin_boost IS NULL THEN true
    ELSE false
  END as missing_linkedin_boost
FROM listings l
WHERE l.deal_total_score IS NOT NULL
ORDER BY l.deal_total_score DESC;

COMMENT ON VIEW deal_quality_analysis IS
  'Analysis view for quality scoring breakdown and identifying scoring improvements';
