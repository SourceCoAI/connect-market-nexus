-- NUCLEAR FIX: Force schema conversion by dropping and recreating columns
-- This will finally fix the UUID/text session_id mismatch

-- Step 1: Drop foreign key constraints that might prevent column changes
ALTER TABLE page_views DROP CONSTRAINT IF EXISTS page_views_session_id_fkey;
ALTER TABLE listing_analytics DROP CONSTRAINT IF EXISTS listing_analytics_session_id_fkey;  
ALTER TABLE user_events DROP CONSTRAINT IF EXISTS user_events_session_id_fkey;
ALTER TABLE search_analytics DROP CONSTRAINT IF EXISTS search_analytics_session_id_fkey;

-- Step 2: Drop all indexes on session_id columns
DROP INDEX IF EXISTS idx_page_views_session_id;
DROP INDEX IF EXISTS idx_listing_analytics_session_id;
DROP INDEX IF EXISTS idx_user_events_session_id;  
DROP INDEX IF EXISTS idx_search_analytics_session_id;

-- Step 3: Truncate tables to remove any bad data
TRUNCATE TABLE page_views CASCADE;
TRUNCATE TABLE listing_analytics CASCADE;
TRUNCATE TABLE user_events CASCADE;
TRUNCATE TABLE search_analytics CASCADE;

-- Step 4: Drop and recreate session_id columns as text
ALTER TABLE page_views DROP COLUMN session_id;
ALTER TABLE page_views ADD COLUMN session_id text;

ALTER TABLE listing_analytics DROP COLUMN session_id;
ALTER TABLE listing_analytics ADD COLUMN session_id text;

ALTER TABLE user_events DROP COLUMN session_id;  
ALTER TABLE user_events ADD COLUMN session_id text;

ALTER TABLE search_analytics DROP COLUMN session_id;
ALTER TABLE search_analytics ADD COLUMN session_id text;

-- Step 5: Recreate indexes
CREATE INDEX idx_page_views_session_id ON page_views(session_id);
CREATE INDEX idx_listing_analytics_session_id ON listing_analytics(session_id);
CREATE INDEX idx_user_events_session_id ON user_events(session_id);
CREATE INDEX idx_search_analytics_session_id ON search_analytics(session_id);

-- Step 6: Add foreign key relationships back (optional, for referential integrity)
-- ALTER TABLE page_views ADD CONSTRAINT page_views_session_id_fkey FOREIGN KEY (session_id) REFERENCES user_sessions(session_id);
-- ALTER TABLE listing_analytics ADD CONSTRAINT listing_analytics_session_id_fkey FOREIGN KEY (session_id) REFERENCES user_sessions(session_id);
-- ALTER TABLE user_events ADD CONSTRAINT user_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES user_sessions(session_id);
-- ALTER TABLE search_analytics ADD CONSTRAINT search_analytics_session_id_fkey FOREIGN KEY (session_id) REFERENCES user_sessions(session_id);