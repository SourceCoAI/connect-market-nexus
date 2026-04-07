
-- Fix session_id data type mismatch by making all session_id columns consistent as text
ALTER TABLE page_views ALTER COLUMN session_id TYPE text;
ALTER TABLE listing_analytics ALTER COLUMN session_id TYPE text;
ALTER TABLE user_events ALTER COLUMN session_id TYPE text;
ALTER TABLE search_analytics ALTER COLUMN session_id TYPE text;

-- Add indexes for better performance on session_id lookups
CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_listing_analytics_session_id ON listing_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_user_events_session_id ON user_events(session_id);
CREATE INDEX IF NOT EXISTS idx_search_analytics_session_id ON search_analytics(session_id);

-- Add indexes for better performance on user_id and created_at columns
CREATE INDEX IF NOT EXISTS idx_page_views_user_id_created_at ON page_views(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_analytics_user_id_created_at ON listing_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_user_id_created_at ON user_events(user_id, created_at DESC);
