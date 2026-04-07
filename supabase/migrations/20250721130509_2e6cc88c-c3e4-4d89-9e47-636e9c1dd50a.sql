-- Fix broken analytics functions with proper SQL syntax

-- Fix get_marketplace_analytics function to avoid window function in aggregates
CREATE OR REPLACE FUNCTION public.get_marketplace_analytics(days_back integer DEFAULT 30)
RETURNS TABLE(total_users bigint, new_users bigint, active_users bigint, avg_session_duration numeric, bounce_rate numeric, page_views bigint, top_pages jsonb, user_funnel jsonb, listing_performance jsonb, search_insights jsonb, user_segments jsonb, conversion_metrics jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  start_date TIMESTAMP := NOW() - (days_back || ' days')::INTERVAL;
BEGIN
  -- Total users
  SELECT COALESCE(COUNT(DISTINCT user_id), 0) INTO total_users
  FROM user_sessions
  WHERE started_at >= start_date;
  
  -- New users (based on profile creation)
  SELECT COALESCE(COUNT(*), 0) INTO new_users
  FROM profiles
  WHERE created_at >= start_date;
  
  -- Active users (had a session)
  SELECT COALESCE(COUNT(DISTINCT user_id), 0) INTO active_users
  FROM user_sessions
  WHERE started_at >= start_date AND user_id IS NOT NULL;
  
  -- Average session duration
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))/60), 0) INTO avg_session_duration
  FROM user_sessions
  WHERE started_at >= start_date;
  
  -- Bounce rate (sessions with only 1 page view)
  WITH session_pages AS (
    SELECT s.id, COUNT(pv.id) as page_count
    FROM user_sessions s
    LEFT JOIN page_views pv ON s.id = pv.session_id
    WHERE s.started_at >= start_date
    GROUP BY s.id
  )
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE (COUNT(*) FILTER (WHERE page_count = 1))::numeric / COUNT(*)::numeric * 100
    END INTO bounce_rate
  FROM session_pages;
  
  -- Total page views
  SELECT COALESCE(COUNT(*), 0) INTO page_views
  FROM page_views pv
  JOIN user_sessions s ON pv.session_id = s.id
  WHERE s.started_at >= start_date;
  
  -- Top pages
  WITH top_pages_data AS (
    SELECT 
      pv.page_path,
      COUNT(*) as view_count,
      COUNT(DISTINCT pv.session_id) as unique_views
    FROM page_views pv
    JOIN user_sessions s ON pv.session_id = s.id
    WHERE s.started_at >= start_date
    GROUP BY pv.page_path
    ORDER BY view_count DESC
    LIMIT 10
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'page', page_path,
      'views', view_count,
      'unique_views', unique_views
    ) ORDER BY view_count DESC
  ), '[]'::jsonb) INTO top_pages
  FROM top_pages_data;
  
  -- User registration funnel (fixed to avoid window function in aggregate)
  WITH funnel_steps AS (
    SELECT 
      step_name,
      step_order,
      COUNT(*) as step_count
    FROM registration_funnel
    WHERE completed_at >= start_date
    GROUP BY step_name, step_order
  ),
  funnel_with_conversion AS (
    SELECT 
      step_name,
      step_order,
      step_count,
      LAG(step_count) OVER (ORDER BY step_order) as prev_step_count
    FROM funnel_steps
    ORDER BY step_order
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'step', step_name,
      'count', step_count,
      'conversion_rate', 
      CASE 
        WHEN prev_step_count IS NULL THEN 100
        ELSE ROUND((step_count::numeric / prev_step_count::numeric * 100), 2)
      END
    ) ORDER BY step_order
  ), '[]'::jsonb) INTO user_funnel
  FROM funnel_with_conversion;
  
  -- Listing performance
  WITH listing_stats AS (
    SELECT
      COALESCE(SUM(CASE WHEN action_type = 'view' THEN 1 ELSE 0 END), 0) as total_views,
      COALESCE(SUM(CASE WHEN action_type = 'save' THEN 1 ELSE 0 END), 0) as total_saves,
      COALESCE(SUM(CASE WHEN action_type = 'request_connection' THEN 1 ELSE 0 END), 0) as total_connections,
      COALESCE(AVG(time_spent), 0) as avg_time_spent
    FROM listing_analytics
    WHERE created_at >= start_date
  ),
  top_listings_data AS (
    SELECT 
      listing_id,
      COUNT(*) as view_count
    FROM listing_analytics
    WHERE created_at >= start_date AND action_type = 'view'
    GROUP BY listing_id
    ORDER BY view_count DESC
    LIMIT 5
  )
  SELECT jsonb_build_object(
    'total_views', ls.total_views,
    'total_saves', ls.total_saves,
    'total_connections', ls.total_connections,
    'avg_time_spent', ls.avg_time_spent,
    'top_listings', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'listing_id', listing_id,
          'views', view_count
        ) ORDER BY view_count DESC
      )
      FROM top_listings_data
    ), '[]'::jsonb)
  ) INTO listing_performance
  FROM listing_stats ls;
  
  -- Search insights
  WITH search_stats AS (
    SELECT
      COUNT(*) as total_searches,
      COALESCE(AVG(results_count), 0) as avg_results,
      CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE (COUNT(*) FILTER (WHERE no_results = true))::numeric / COUNT(*)::numeric * 100
      END as no_results_rate
    FROM search_analytics
    WHERE created_at >= start_date
  ),
  top_queries_data AS (
    SELECT 
      search_query,
      COUNT(*) as query_count
    FROM search_analytics
    WHERE created_at >= start_date
    GROUP BY search_query
    ORDER BY query_count DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'total_searches', ss.total_searches,
    'avg_results', ss.avg_results,
    'no_results_rate', ss.no_results_rate,
    'top_queries', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'query', search_query,
          'count', query_count
        ) ORDER BY query_count DESC
      )
      FROM top_queries_data
    ), '[]'::jsonb)
  ) INTO search_insights
  FROM search_stats ss;
  
  -- User segments (based on engagement)
  SELECT COALESCE(jsonb_build_object(
    'high_engagement', COUNT(*) FILTER (WHERE score >= 80),
    'medium_engagement', COUNT(*) FILTER (WHERE score >= 40 AND score < 80),
    'low_engagement', COUNT(*) FILTER (WHERE score < 40),
    'at_risk', COUNT(*) FILTER (WHERE churn_risk_score >= 70)
  ), '{}'::jsonb) INTO user_segments
  FROM engagement_scores es
  WHERE es.updated_at >= start_date;
  
  -- Conversion metrics
  WITH funnel_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE step_name = 'started') as started_count,
      COUNT(*) FILTER (WHERE step_name = 'profile_completed') as completed_count
    FROM registration_funnel
    WHERE completed_at >= start_date
  ),
  listing_stats_conv AS (
    SELECT
      SUM(CASE WHEN action_type = 'view' THEN 1 ELSE 0 END) as view_count,
      SUM(CASE WHEN action_type = 'save' THEN 1 ELSE 0 END) as save_count,
      SUM(CASE WHEN action_type = 'request_connection' THEN 1 ELSE 0 END) as connection_count
    FROM listing_analytics
    WHERE created_at >= start_date
  )
  SELECT jsonb_build_object(
    'signup_to_profile_completion', 
      CASE 
        WHEN fs.started_count = 0 THEN 0
        ELSE (fs.completed_count::numeric / fs.started_count::numeric * 100)
      END,
    'view_to_save_rate',
      CASE 
        WHEN ls.view_count = 0 THEN 0
        ELSE (ls.save_count::numeric / ls.view_count::numeric * 100)
      END,
    'view_to_connection_rate',
      CASE 
        WHEN ls.view_count = 0 THEN 0
        ELSE (ls.connection_count::numeric / ls.view_count::numeric * 100)
      END
  ) INTO conversion_metrics
  FROM funnel_stats fs, listing_stats_conv ls;
  
  RETURN QUERY SELECT 
    get_marketplace_analytics.total_users,
    get_marketplace_analytics.new_users,
    get_marketplace_analytics.active_users,
    get_marketplace_analytics.avg_session_duration,
    get_marketplace_analytics.bounce_rate,
    get_marketplace_analytics.page_views,
    get_marketplace_analytics.top_pages,
    get_marketplace_analytics.user_funnel,
    get_marketplace_analytics.listing_performance,
    get_marketplace_analytics.search_insights,
    get_marketplace_analytics.user_segments,
    get_marketplace_analytics.conversion_metrics;
END;
$function$;

-- Fix get_feedback_analytics function to avoid nested aggregates
CREATE OR REPLACE FUNCTION public.get_feedback_analytics(days_back integer DEFAULT 30)
RETURNS TABLE(total_feedback bigint, unread_count bigint, avg_response_time_hours numeric, satisfaction_avg numeric, category_breakdown jsonb, priority_breakdown jsonb, daily_trends jsonb, top_users jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  start_date TIMESTAMP := NOW() - (days_back || ' days')::INTERVAL;
BEGIN
  -- Get basic metrics
  SELECT COUNT(*) INTO total_feedback
  FROM feedback_messages
  WHERE created_at >= start_date;
  
  SELECT COUNT(*) INTO unread_count
  FROM feedback_messages
  WHERE status = 'unread' AND created_at >= start_date;
  
  -- Calculate average response time (avoid nested aggregates)
  WITH response_times AS (
    SELECT EXTRACT(EPOCH FROM (updated_at - created_at))/3600 as hours_diff
    FROM feedback_messages
    WHERE admin_response IS NOT NULL 
      AND updated_at > created_at 
      AND created_at >= start_date
  )
  SELECT COALESCE(AVG(hours_diff), 0) INTO avg_response_time_hours
  FROM response_times;
  
  -- Set satisfaction average to null since column doesn't exist
  satisfaction_avg := NULL;
  
  -- Category breakdown
  SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb) INTO category_breakdown
  FROM (
    SELECT category, COUNT(*) as cnt
    FROM feedback_messages
    WHERE created_at >= start_date
    GROUP BY category
  ) t;
  
  -- Priority breakdown
  SELECT COALESCE(jsonb_object_agg(priority, cnt), '{}'::jsonb) INTO priority_breakdown
  FROM (
    SELECT priority, COUNT(*) as cnt
    FROM feedback_messages
    WHERE created_at >= start_date
    GROUP BY priority
  ) t;
  
  -- Daily trends (avoid nested aggregates)
  WITH daily_data AS (
    SELECT 
      date_trunc('day', created_at)::DATE as trend_date,
      COUNT(*) as daily_count,
      AVG(
        CASE WHEN admin_response IS NOT NULL AND updated_at > created_at
        THEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600
        ELSE NULL END
      ) as daily_avg_response_time
    FROM feedback_messages
    WHERE created_at >= start_date
    GROUP BY date_trunc('day', created_at)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', trend_date,
      'count', daily_count,
      'avg_response_time', daily_avg_response_time
    ) ORDER BY trend_date
  ), '[]'::jsonb) INTO daily_trends
  FROM daily_data;
  
  -- Top users by feedback volume
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'user_id', user_id,
      'feedback_count', cnt
    ) ORDER BY cnt DESC
  ), '[]'::jsonb) INTO top_users
  FROM (
    SELECT 
      user_id,
      COUNT(*) as cnt
    FROM feedback_messages
    WHERE created_at >= start_date AND user_id IS NOT NULL
    GROUP BY user_id
    ORDER BY cnt DESC
    LIMIT 10
  ) t;
  
  RETURN QUERY SELECT 
    get_feedback_analytics.total_feedback,
    get_feedback_analytics.unread_count,
    get_feedback_analytics.avg_response_time_hours,
    get_feedback_analytics.satisfaction_avg,
    get_feedback_analytics.category_breakdown,
    get_feedback_analytics.priority_breakdown,
    get_feedback_analytics.daily_trends,
    get_feedback_analytics.top_users;
END;
$function$;

-- Add performance indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at ON user_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id_started_at ON user_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_listing_analytics_created_at ON listing_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_listing_analytics_action_type ON listing_analytics(action_type);
CREATE INDEX IF NOT EXISTS idx_search_analytics_created_at ON search_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_created_at ON feedback_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_status ON feedback_messages(status);
CREATE INDEX IF NOT EXISTS idx_registration_funnel_completed_at ON registration_funnel(completed_at);
CREATE INDEX IF NOT EXISTS idx_engagement_scores_updated_at ON engagement_scores(updated_at);