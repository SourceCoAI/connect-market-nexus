-- Populate analytics tables with sample data for testing
-- Note: This is sample data for demonstration purposes

-- Insert sample user sessions
INSERT INTO user_sessions (session_id, user_id, started_at, ended_at, user_agent, device_type, browser, os) VALUES
('session_sample_1', (SELECT id FROM profiles LIMIT 1), NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'desktop', 'Chrome', 'Windows'),
('session_sample_2', (SELECT id FROM profiles LIMIT 1 OFFSET 0), NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '45 minutes', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'desktop', 'Safari', 'macOS'),
('session_sample_3', NULL, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X)', 'mobile', 'Safari', 'iOS');

-- Insert sample page views
INSERT INTO page_views (session_id, user_id, page_path, page_title, time_on_page, scroll_depth) VALUES
('session_sample_1', (SELECT id FROM profiles LIMIT 1), '/', 'Marketplace', 120, 85),
('session_sample_1', (SELECT id FROM profiles LIMIT 1), '/listing/1', 'Listing Details', 180, 90),
('session_sample_2', (SELECT id FROM profiles LIMIT 1), '/', 'Marketplace', 90, 70),
('session_sample_2', (SELECT id FROM profiles LIMIT 1), '/profile', 'Profile', 60, 50),
('session_sample_3', NULL, '/', 'Marketplace', 45, 30);

-- Insert sample listing analytics (only if listings exist)
DO $$
DECLARE
    sample_listing_id UUID;
BEGIN
    SELECT id INTO sample_listing_id FROM listings LIMIT 1;
    
    IF sample_listing_id IS NOT NULL THEN
        INSERT INTO listing_analytics (listing_id, user_id, session_id, action_type, time_spent, referrer_page) VALUES
        (sample_listing_id, (SELECT id FROM profiles LIMIT 1), 'session_sample_1', 'view', 180, '/'),
        (sample_listing_id, (SELECT id FROM profiles LIMIT 1), 'session_sample_1', 'save', NULL, '/listing/' || sample_listing_id),
        (sample_listing_id, (SELECT id FROM profiles LIMIT 1 OFFSET 0), 'session_sample_2', 'view', 120, '/'),
        (sample_listing_id, NULL, 'session_sample_3', 'view', 45, '/');
    END IF;
END $$;

-- Insert sample search analytics
INSERT INTO search_analytics (session_id, user_id, search_query, filters_applied, results_count, no_results) VALUES
('session_sample_1', (SELECT id FROM profiles LIMIT 1), 'technology', '{"category": "Technology"}', 5, false),
('session_sample_2', (SELECT id FROM profiles LIMIT 1), 'saas business', '{"revenueMin": 1000000}', 3, false),
('session_sample_3', NULL, 'manufacturing', '{}', 0, true);

-- Insert sample registration funnel data
INSERT INTO registration_funnel (session_id, email, step_name, step_order, time_spent, dropped_off) VALUES
('session_sample_new_1', 'test1@example.com', 'started', 1, 0, false),
('session_sample_new_1', 'test1@example.com', 'form_filled', 2, 45, false),
('session_sample_new_1', 'test1@example.com', 'email_verified', 3, 120, false),
('session_sample_new_1', 'test1@example.com', 'profile_completed', 4, 180, false),
('session_sample_new_2', 'test2@example.com', 'started', 1, 0, false),
('session_sample_new_2', 'test2@example.com', 'form_filled', 2, 30, true);

-- Insert sample user events
INSERT INTO user_events (session_id, user_id, event_type, event_category, event_action, page_path) VALUES
('session_sample_1', (SELECT id FROM profiles LIMIT 1), 'listing_interaction', 'engagement', 'view', '/'),
('session_sample_1', (SELECT id FROM profiles LIMIT 1), 'search', 'engagement', 'has_results', '/'),
('session_sample_2', (SELECT id FROM profiles LIMIT 1), 'listing_interaction', 'engagement', 'save', '/listing/1'),
('session_sample_3', NULL, 'search', 'engagement', 'no_results', '/');

-- Update daily metrics for the past few days
DO $$
DECLARE
    target_date DATE;
BEGIN
    FOR i IN 0..3 LOOP
        target_date := CURRENT_DATE - i;
        PERFORM update_daily_metrics(target_date);
    END LOOP;
END $$;

-- Update engagement scores for existing users
PERFORM update_engagement_scores();