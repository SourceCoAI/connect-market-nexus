-- Drop the problematic function and recreate with simple queries
DROP FUNCTION IF EXISTS get_marketplace_analytics(integer);

-- Create simple, working analytics function  
CREATE OR REPLACE FUNCTION get_simple_marketplace_analytics(days_back integer DEFAULT 30)
RETURNS TABLE(
  total_users bigint,
  new_users bigint,
  active_sessions bigint,
  total_page_views bigint,
  total_listings bigint,
  pending_connections bigint,
  session_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  start_date TIMESTAMP := NOW() - (days_back || ' days')::INTERVAL;
BEGIN
  -- Simple counts that work like Overview tab
  SELECT 
    COALESCE((SELECT COUNT(*) FROM profiles), 0) as total_users,
    COALESCE((SELECT COUNT(*) FROM profiles WHERE created_at >= start_date), 0) as new_users,
    COALESCE((SELECT COUNT(*) FROM user_sessions WHERE started_at >= start_date), 0) as active_sessions,
    COALESCE((SELECT COUNT(*) FROM page_views WHERE created_at >= start_date), 0) as total_page_views,
    COALESCE((SELECT COUNT(*) FROM listings WHERE deleted_at IS NULL), 0) as total_listings,
    COALESCE((SELECT COUNT(*) FROM connection_requests WHERE status = 'pending'), 0) as pending_connections,
    COALESCE((SELECT COUNT(*) FROM user_sessions), 0) as session_count
  INTO total_users, new_users, active_sessions, total_page_views, total_listings, pending_connections, session_count;
  
  RETURN QUERY SELECT 
    get_simple_marketplace_analytics.total_users,
    get_simple_marketplace_analytics.new_users,
    get_simple_marketplace_analytics.active_sessions,
    get_simple_marketplace_analytics.total_page_views,
    get_simple_marketplace_analytics.total_listings,
    get_simple_marketplace_analytics.pending_connections,
    get_simple_marketplace_analytics.session_count;
END;
$function$;