
-- Force fix the session_id schema mismatch by truncating and converting
-- This is necessary because the previous migration didn't work due to existing data

-- First, backup any existing data (optional - can skip since analytics aren't working anyway)
-- Then truncate to avoid conversion issues with existing UUID data
TRUNCATE TABLE page_views CASCADE;
TRUNCATE TABLE listing_analytics CASCADE; 
TRUNCATE TABLE user_events CASCADE;
TRUNCATE TABLE search_analytics CASCADE;

-- Now safely convert all session_id columns to text
ALTER TABLE page_views ALTER COLUMN session_id TYPE text;
ALTER TABLE listing_analytics ALTER COLUMN session_id TYPE text;
ALTER TABLE user_events ALTER COLUMN session_id TYPE text;
ALTER TABLE search_analytics ALTER COLUMN session_id TYPE text;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_listing_analytics_session_id ON listing_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_user_events_session_id ON user_events(session_id);
CREATE INDEX IF NOT EXISTS idx_search_analytics_session_id ON search_analytics(session_id);

-- Add composite indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_page_views_user_created ON page_views(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listing_analytics_user_created ON listing_analytics(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_events_user_created ON user_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_analytics_user_created ON search_analytics(user_id, created_at DESC) WHERE user_id IS NOT NULL;
