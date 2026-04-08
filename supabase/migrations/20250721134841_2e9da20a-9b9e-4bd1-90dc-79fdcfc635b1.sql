
-- First, let's check current session_id column types and fix the schema mismatch
-- Convert session_id columns from uuid to text in all analytics tables
ALTER TABLE page_views ALTER COLUMN session_id TYPE text USING session_id::text;
ALTER TABLE listing_analytics ALTER COLUMN session_id TYPE text USING session_id::text;
ALTER TABLE user_events ALTER COLUMN session_id TYPE text USING session_id::text;
ALTER TABLE search_analytics ALTER COLUMN session_id TYPE text USING search_analytics.session_id::text;

-- Add performance indexes for better analytics queries
CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_listing_analytics_session_id ON listing_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_user_events_session_id ON user_events(session_id);
CREATE INDEX IF NOT EXISTS idx_search_analytics_session_id ON search_analytics(session_id);

-- Add composite indexes for user and time-based queries
CREATE INDEX IF NOT EXISTS idx_page_views_user_created ON page_views(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listing_analytics_user_created ON listing_analytics(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_events_user_created ON user_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_analytics_user_created ON search_analytics(user_id, created_at DESC) WHERE user_id IS NOT NULL;
