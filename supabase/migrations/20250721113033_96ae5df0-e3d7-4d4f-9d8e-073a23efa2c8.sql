-- Fix the get_feedback_analytics function to remove satisfaction_rating references
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
  
  -- Calculate average response time
  SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) INTO avg_response_time_hours
  FROM feedback_messages
  WHERE admin_response IS NOT NULL 
    AND updated_at > created_at 
    AND created_at >= start_date;
  
  -- Set satisfaction average to null since column doesn't exist
  satisfaction_avg := NULL;
  
  -- Category breakdown
  SELECT jsonb_object_agg(category, cnt) INTO category_breakdown
  FROM (
    SELECT category, COUNT(*) as cnt
    FROM feedback_messages
    WHERE created_at >= start_date
    GROUP BY category
  ) t;
  
  -- Priority breakdown
  SELECT jsonb_object_agg(priority, cnt) INTO priority_breakdown
  FROM (
    SELECT priority, COUNT(*) as cnt
    FROM feedback_messages
    WHERE created_at >= start_date
    GROUP BY priority
  ) t;
  
  -- Daily trends
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', date_trunc('day', created_at)::DATE,
      'count', COUNT(*),
      'avg_response_time', AVG(
        CASE WHEN admin_response IS NOT NULL AND updated_at > created_at
        THEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600
        ELSE NULL END
      )
    ) ORDER BY date_trunc('day', created_at)
  ) INTO daily_trends
  FROM feedback_messages
  WHERE created_at >= start_date
  GROUP BY date_trunc('day', created_at);
  
  -- Top users by feedback volume (without satisfaction rating)
  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id', user_id,
      'feedback_count', cnt
    ) ORDER BY cnt DESC
  ) INTO top_users
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
$function$