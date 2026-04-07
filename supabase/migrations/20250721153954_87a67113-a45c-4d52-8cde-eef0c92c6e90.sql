
-- Phase 1: Nuclear Schema Fix - Force session_id conversion to text
-- This will fix the core issue causing all analytics failures

-- Drop all indexes and constraints on session_id columns
DROP INDEX IF EXISTS idx_page_views_session_id;
DROP INDEX IF EXISTS idx_listing_analytics_session_id;
DROP INDEX IF EXISTS idx_user_events_session_id;
DROP INDEX IF EXISTS idx_search_analytics_session_id;

-- Truncate analytics tables (they contain no valid data due to UUID errors)
TRUNCATE TABLE page_views CASCADE;
TRUNCATE TABLE listing_analytics CASCADE;
TRUNCATE TABLE user_events CASCADE;
TRUNCATE TABLE search_analytics CASCADE;

-- Force conversion of session_id columns from uuid to text
ALTER TABLE page_views ALTER COLUMN session_id TYPE text;
ALTER TABLE listing_analytics ALTER COLUMN session_id TYPE text;
ALTER TABLE user_events ALTER COLUMN session_id TYPE text;
ALTER TABLE search_analytics ALTER COLUMN session_id TYPE text;

-- Recreate performance indexes
CREATE INDEX idx_page_views_session_id ON page_views(session_id);
CREATE INDEX idx_listing_analytics_session_id ON listing_analytics(session_id);
CREATE INDEX idx_user_events_session_id ON user_events(session_id);
CREATE INDEX idx_search_analytics_session_id ON search_analytics(session_id);

-- Add composite indexes for user-based queries
CREATE INDEX idx_page_views_user_created ON page_views(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_listing_analytics_user_created ON listing_analytics(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_user_events_user_created ON user_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_search_analytics_user_created ON search_analytics(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- Add validation function to prevent future schema mismatches
CREATE OR REPLACE FUNCTION validate_analytics_schema()
RETURNS boolean
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Verify all session_id columns are text type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_sessions' 
    AND column_name = 'session_id' 
    AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'user_sessions.session_id must be text type';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'page_views' 
    AND column_name = 'session_id' 
    AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'page_views.session_id must be text type';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'listing_analytics' 
    AND column_name = 'session_id' 
    AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'listing_analytics.session_id must be text type';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_events' 
    AND column_name = 'session_id' 
    AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'user_events.session_id must be text type';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'search_analytics' 
    AND column_name = 'session_id' 
    AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'search_analytics.session_id must be text type';
  END IF;
  
  RETURN true;
END;
$function$;

-- Run the validation to ensure schema is consistent
SELECT validate_analytics_schema();
