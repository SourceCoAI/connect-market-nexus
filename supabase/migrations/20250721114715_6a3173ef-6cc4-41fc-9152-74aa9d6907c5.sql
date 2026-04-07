
-- Create comprehensive analytics infrastructure

-- 1. User Sessions Table
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  country TEXT,
  city TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Page Views Table
CREATE TABLE public.page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.user_sessions(id),
  user_id UUID REFERENCES auth.users(id),
  page_path TEXT NOT NULL,
  page_title TEXT,
  referrer TEXT,
  time_on_page INTEGER, -- seconds
  scroll_depth INTEGER, -- percentage
  exit_page BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. User Events Table (for tracking specific actions)
CREATE TABLE public.user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.user_sessions(id),
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL, -- 'click', 'search', 'view_listing', 'save_listing', etc.
  event_category TEXT NOT NULL, -- 'navigation', 'engagement', 'conversion', etc.
  event_action TEXT NOT NULL,
  event_label TEXT,
  event_value NUMERIC,
  page_path TEXT,
  element_id TEXT,
  element_class TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Registration Funnel Table
CREATE TABLE public.registration_funnel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.user_sessions(id),
  email TEXT,
  step_name TEXT NOT NULL, -- 'started', 'form_filled', 'email_submitted', 'email_verified', 'profile_completed'
  step_order INTEGER NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  time_spent INTEGER, -- seconds spent on this step
  dropped_off BOOLEAN DEFAULT false,
  drop_off_reason TEXT,
  form_data JSONB, -- store form progress
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Listing Analytics Table
CREATE TABLE public.listing_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.listings(id),
  user_id UUID REFERENCES auth.users(id),
  session_id UUID REFERENCES public.user_sessions(id),
  action_type TEXT NOT NULL, -- 'view', 'save', 'unsave', 'request_connection', 'share'
  time_spent INTEGER, -- seconds spent viewing
  scroll_depth INTEGER, -- percentage scrolled
  clicked_elements JSONB, -- track which elements were clicked
  referrer_page TEXT,
  search_query TEXT, -- if came from search
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Search Analytics Table
CREATE TABLE public.search_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.user_sessions(id),
  user_id UUID REFERENCES auth.users(id),
  search_query TEXT NOT NULL,
  filters_applied JSONB,
  results_count INTEGER,
  results_clicked INTEGER,
  position_clicked INTEGER, -- which result was clicked
  no_results BOOLEAN DEFAULT false,
  refined_search BOOLEAN DEFAULT false,
  time_to_click INTEGER, -- seconds from search to click
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. User Engagement Scores (enhanced)
ALTER TABLE public.engagement_scores 
ADD COLUMN page_views INTEGER DEFAULT 0,
ADD COLUMN session_count INTEGER DEFAULT 0,
ADD COLUMN avg_session_duration INTEGER DEFAULT 0,
ADD COLUMN bounce_rate NUMERIC DEFAULT 0,
ADD COLUMN conversion_events INTEGER DEFAULT 0,
ADD COLUMN search_count INTEGER DEFAULT 0,
ADD COLUMN last_login TIMESTAMP WITH TIME ZONE,
ADD COLUMN days_since_signup INTEGER DEFAULT 0,
ADD COLUMN activity_streak INTEGER DEFAULT 0,
ADD COLUMN churn_risk_score INTEGER DEFAULT 0;

-- 8. Business Metrics Summary (daily aggregated data)
CREATE TABLE public.daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  total_users INTEGER DEFAULT 0,
  new_signups INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  returning_users INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  avg_session_duration NUMERIC DEFAULT 0,
  bounce_rate NUMERIC DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  unique_page_views INTEGER DEFAULT 0,
  new_listings INTEGER DEFAULT 0,
  listing_views INTEGER DEFAULT 0,
  connection_requests INTEGER DEFAULT 0,
  successful_connections INTEGER DEFAULT 0,
  searches_performed INTEGER DEFAULT 0,
  conversion_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_started_at ON public.user_sessions(started_at);
CREATE INDEX idx_page_views_session_id ON public.page_views(session_id);
CREATE INDEX idx_page_views_created_at ON public.page_views(created_at);
CREATE INDEX idx_user_events_session_id ON public.user_events(session_id);
CREATE INDEX idx_user_events_event_type ON public.user_events(event_type);
CREATE INDEX idx_user_events_created_at ON public.user_events(created_at);
CREATE INDEX idx_listing_analytics_listing_id ON public.listing_analytics(listing_id);
CREATE INDEX idx_listing_analytics_created_at ON public.listing_analytics(created_at);
CREATE INDEX idx_search_analytics_created_at ON public.search_analytics(created_at);
CREATE INDEX idx_daily_metrics_date ON public.daily_metrics(date);

-- Enable RLS on all tables
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_funnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Analytics Tables

-- User Sessions
CREATE POLICY "Users can view own sessions" ON public.user_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert sessions" ON public.user_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update sessions" ON public.user_sessions FOR UPDATE USING (true);
CREATE POLICY "Admins can view all sessions" ON public.user_sessions FOR SELECT USING (is_admin(auth.uid()));

-- Page Views
CREATE POLICY "Users can view own page views" ON public.page_views FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert page views" ON public.page_views FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all page views" ON public.page_views FOR SELECT USING (is_admin(auth.uid()));

-- User Events
CREATE POLICY "Users can view own events" ON public.user_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert events" ON public.user_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all events" ON public.user_events FOR SELECT USING (is_admin(auth.uid()));

-- Registration Funnel
CREATE POLICY "System can manage registration funnel" ON public.registration_funnel FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view registration funnel" ON public.registration_funnel FOR SELECT USING (is_admin(auth.uid()));

-- Listing Analytics
CREATE POLICY "Users can view own listing analytics" ON public.listing_analytics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert listing analytics" ON public.listing_analytics FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all listing analytics" ON public.listing_analytics FOR SELECT USING (is_admin(auth.uid()));

-- Search Analytics
CREATE POLICY "Users can view own search analytics" ON public.search_analytics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert search analytics" ON public.search_analytics FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all search analytics" ON public.search_analytics FOR SELECT USING (is_admin(auth.uid()));

-- Daily Metrics
CREATE POLICY "Admins can view daily metrics" ON public.daily_metrics FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "System can manage daily metrics" ON public.daily_metrics FOR ALL USING (true) WITH CHECK (true);

-- Analytics Functions

-- Function to get comprehensive analytics
CREATE OR REPLACE FUNCTION public.get_marketplace_analytics(days_back integer DEFAULT 30)
RETURNS TABLE(
  total_users bigint,
  new_users bigint,
  active_users bigint,
  avg_session_duration numeric,
  bounce_rate numeric,
  page_views bigint,
  top_pages jsonb,
  user_funnel jsonb,
  listing_performance jsonb,
  search_insights jsonb,
  user_segments jsonb,
  conversion_metrics jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  start_date TIMESTAMP := NOW() - (days_back || ' days')::INTERVAL;
BEGIN
  -- Total users
  SELECT COUNT(DISTINCT user_id) INTO total_users
  FROM user_sessions
  WHERE started_at >= start_date;
  
  -- New users (based on profile creation)
  SELECT COUNT(*) INTO new_users
  FROM profiles
  WHERE created_at >= start_date;
  
  -- Active users (had a session)
  SELECT COUNT(DISTINCT user_id) INTO active_users
  FROM user_sessions
  WHERE started_at >= start_date AND user_id IS NOT NULL;
  
  -- Average session duration
  SELECT AVG(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))/60) INTO avg_session_duration
  FROM user_sessions
  WHERE started_at >= start_date;
  
  -- Bounce rate (sessions with only 1 page view)
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE (COUNT(*) FILTER (WHERE page_count = 1))::numeric / COUNT(*)::numeric * 100
    END INTO bounce_rate
  FROM (
    SELECT s.id, COUNT(pv.id) as page_count
    FROM user_sessions s
    LEFT JOIN page_views pv ON s.id = pv.session_id
    WHERE s.started_at >= start_date
    GROUP BY s.id
  ) session_pages;
  
  -- Total page views
  SELECT COUNT(*) INTO page_views
  FROM page_views pv
  JOIN user_sessions s ON pv.session_id = s.id
  WHERE s.started_at >= start_date;
  
  -- Top pages
  SELECT jsonb_agg(
    jsonb_build_object(
      'page', page_path,
      'views', view_count,
      'unique_views', unique_views
    ) ORDER BY view_count DESC
  ) INTO top_pages
  FROM (
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
  ) top_pages_data;
  
  -- User registration funnel
  SELECT jsonb_agg(
    jsonb_build_object(
      'step', step_name,
      'count', step_count,
      'conversion_rate', 
      CASE 
        WHEN LAG(step_count) OVER (ORDER BY step_order) IS NULL THEN 100
        ELSE ROUND((step_count::numeric / LAG(step_count) OVER (ORDER BY step_order)::numeric * 100), 2)
      END
    ) ORDER BY step_order
  ) INTO user_funnel
  FROM (
    SELECT 
      step_name,
      step_order,
      COUNT(*) as step_count
    FROM registration_funnel
    WHERE completed_at >= start_date
    GROUP BY step_name, step_order
  ) funnel_data;
  
  -- Listing performance
  SELECT jsonb_build_object(
    'total_views', COALESCE(SUM(CASE WHEN action_type = 'view' THEN 1 ELSE 0 END), 0),
    'total_saves', COALESCE(SUM(CASE WHEN action_type = 'save' THEN 1 ELSE 0 END), 0),
    'total_connections', COALESCE(SUM(CASE WHEN action_type = 'request_connection' THEN 1 ELSE 0 END), 0),
    'avg_time_spent', COALESCE(AVG(time_spent), 0),
    'top_listings', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'listing_id', listing_id,
          'views', view_count
        ) ORDER BY view_count DESC
      )
      FROM (
        SELECT 
          listing_id,
          COUNT(*) as view_count
        FROM listing_analytics
        WHERE created_at >= start_date AND action_type = 'view'
        GROUP BY listing_id
        ORDER BY view_count DESC
        LIMIT 5
      ) top_listings_data
    )
  ) INTO listing_performance
  FROM listing_analytics
  WHERE created_at >= start_date;
  
  -- Search insights
  SELECT jsonb_build_object(
    'total_searches', COUNT(*),
    'avg_results', AVG(results_count),
    'no_results_rate', 
      CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE (COUNT(*) FILTER (WHERE no_results = true))::numeric / COUNT(*)::numeric * 100
      END,
    'top_queries', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'query', search_query,
          'count', query_count
        ) ORDER BY query_count DESC
      )
      FROM (
        SELECT 
          search_query,
          COUNT(*) as query_count
        FROM search_analytics
        WHERE created_at >= start_date
        GROUP BY search_query
        ORDER BY query_count DESC
        LIMIT 10
      ) top_queries_data
    )
  ) INTO search_insights
  FROM search_analytics
  WHERE created_at >= start_date;
  
  -- User segments (based on engagement)
  SELECT jsonb_build_object(
    'high_engagement', COUNT(*) FILTER (WHERE score >= 80),
    'medium_engagement', COUNT(*) FILTER (WHERE score >= 40 AND score < 80),
    'low_engagement', COUNT(*) FILTER (WHERE score < 40),
    'at_risk', COUNT(*) FILTER (WHERE churn_risk_score >= 70)
  ) INTO user_segments
  FROM engagement_scores es
  WHERE es.updated_at >= start_date;
  
  -- Conversion metrics
  SELECT jsonb_build_object(
    'signup_to_profile_completion', 
      CASE 
        WHEN COUNT(*) FILTER (WHERE step_name = 'started') = 0 THEN 0
        ELSE (COUNT(*) FILTER (WHERE step_name = 'profile_completed'))::numeric / 
             (COUNT(*) FILTER (WHERE step_name = 'started'))::numeric * 100
      END,
    'view_to_save_rate',
      CASE 
        WHEN COALESCE((SELECT SUM(CASE WHEN action_type = 'view' THEN 1 ELSE 0 END) FROM listing_analytics WHERE created_at >= start_date), 0) = 0 THEN 0
        ELSE (SELECT SUM(CASE WHEN action_type = 'save' THEN 1 ELSE 0 END) FROM listing_analytics WHERE created_at >= start_date)::numeric /
             (SELECT SUM(CASE WHEN action_type = 'view' THEN 1 ELSE 0 END) FROM listing_analytics WHERE created_at >= start_date)::numeric * 100
      END,
    'view_to_connection_rate',
      CASE 
        WHEN COALESCE((SELECT SUM(CASE WHEN action_type = 'view' THEN 1 ELSE 0 END) FROM listing_analytics WHERE created_at >= start_date), 0) = 0 THEN 0
        ELSE (SELECT SUM(CASE WHEN action_type = 'request_connection' THEN 1 ELSE 0 END) FROM listing_analytics WHERE created_at >= start_date)::numeric /
             (SELECT SUM(CASE WHEN action_type = 'view' THEN 1 ELSE 0 END) FROM listing_analytics WHERE created_at >= start_date)::numeric * 100
      END
  ) INTO conversion_metrics
  FROM registration_funnel
  WHERE completed_at >= start_date;
  
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

-- Function to update daily metrics (to be run daily)
CREATE OR REPLACE FUNCTION public.update_daily_metrics(target_date date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  start_date TIMESTAMP := target_date::timestamp;
  end_date TIMESTAMP := (target_date + INTERVAL '1 day')::timestamp;
BEGIN
  INSERT INTO daily_metrics (
    date,
    total_users,
    new_signups,
    active_users,
    returning_users,
    total_sessions,
    avg_session_duration,
    bounce_rate,
    page_views,
    unique_page_views,
    new_listings,
    listing_views,
    connection_requests,
    searches_performed,
    conversion_rate
  )
  VALUES (
    target_date,
    (SELECT COUNT(*) FROM profiles WHERE created_at < end_date),
    (SELECT COUNT(*) FROM profiles WHERE created_at >= start_date AND created_at < end_date),
    (SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE started_at >= start_date AND started_at < end_date AND user_id IS NOT NULL),
    (SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE started_at >= start_date AND started_at < end_date AND user_id IN (SELECT DISTINCT user_id FROM user_sessions WHERE started_at < start_date)),
    (SELECT COUNT(*) FROM user_sessions WHERE started_at >= start_date AND started_at < end_date),
    (SELECT AVG(EXTRACT(EPOCH FROM (COALESCE(ended_at, started_at + INTERVAL '30 minutes') - started_at))/60) FROM user_sessions WHERE started_at >= start_date AND started_at < end_date),
    (SELECT 
      CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE (COUNT(*) FILTER (WHERE page_count = 1))::numeric / COUNT(*)::numeric * 100
      END
     FROM (
       SELECT s.id, COUNT(pv.id) as page_count
       FROM user_sessions s
       LEFT JOIN page_views pv ON s.id = pv.session_id
       WHERE s.started_at >= start_date AND s.started_at < end_date
       GROUP BY s.id
     ) session_pages),
    (SELECT COUNT(*) FROM page_views pv JOIN user_sessions s ON pv.session_id = s.id WHERE s.started_at >= start_date AND s.started_at < end_date),
    (SELECT COUNT(DISTINCT pv.page_path) FROM page_views pv JOIN user_sessions s ON pv.session_id = s.id WHERE s.started_at >= start_date AND s.started_at < end_date),
    (SELECT COUNT(*) FROM listings WHERE created_at >= start_date AND created_at < end_date),
    (SELECT COUNT(*) FROM listing_analytics WHERE created_at >= start_date AND created_at < end_date AND action_type = 'view'),
    (SELECT COUNT(*) FROM connection_requests WHERE created_at >= start_date AND created_at < end_date),
    (SELECT COUNT(*) FROM search_analytics WHERE created_at >= start_date AND created_at < end_date),
    0 -- Will calculate conversion rate in a separate update
  )
  ON CONFLICT (date) DO UPDATE SET
    total_users = EXCLUDED.total_users,
    new_signups = EXCLUDED.new_signups,
    active_users = EXCLUDED.active_users,
    returning_users = EXCLUDED.returning_users,
    total_sessions = EXCLUDED.total_sessions,
    avg_session_duration = EXCLUDED.avg_session_duration,
    bounce_rate = EXCLUDED.bounce_rate,
    page_views = EXCLUDED.page_views,
    unique_page_views = EXCLUDED.unique_page_views,
    new_listings = EXCLUDED.new_listings,
    listing_views = EXCLUDED.listing_views,
    connection_requests = EXCLUDED.connection_requests,
    searches_performed = EXCLUDED.searches_performed,
    updated_at = NOW();
END;
$function$;

-- Add updated_at trigger to user_sessions
CREATE TRIGGER update_user_sessions_updated_at
  BEFORE UPDATE ON user_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
