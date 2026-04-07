-- Security hardening: Fix function search paths
-- All functions must have SET search_path TO '' for security

-- Fix calculate_engagement_score function
CREATE OR REPLACE FUNCTION public.calculate_engagement_score(p_listings_viewed integer, p_listings_saved integer, p_connections_requested integer, p_total_session_time integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  score INTEGER;
BEGIN
  -- Calculate weighted score (0-100)
  score := LEAST(p_listings_viewed / 10 * 30, 30) +
           LEAST(p_listings_saved / 5 * 30, 30) +
           LEAST(p_connections_requested * 10, 20) +
           LEAST(p_total_session_time / 3600 * 20, 20);
           
  RETURN GREATEST(LEAST(score, 100), 0);
END;
$function$;

-- Fix update_engagement_scores function  
CREATE OR REPLACE FUNCTION public.update_engagement_scores()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Insert new users who don't have a score yet
  INSERT INTO public.engagement_scores (user_id, last_active)
  SELECT p.id, p.updated_at
  FROM public.profiles p
  LEFT JOIN public.engagement_scores e ON p.id = e.user_id
  WHERE e.user_id IS NULL;
  
  -- Update existing engagement scores based on activity
  UPDATE public.engagement_scores
  SET 
    listings_viewed = FLOOR(RANDOM() * 50),
    listings_saved = FLOOR(RANDOM() * 20),
    connections_requested = FLOOR(RANDOM() * 10),
    total_session_time = FLOOR(RANDOM() * 7200),
    last_active = NOW() - (RANDOM() * INTERVAL '7 days'),
    updated_at = NOW();
    
  -- Calculate and update scores
  UPDATE public.engagement_scores
  SET 
    score = public.calculate_engagement_score(
      listings_viewed, 
      listings_saved, 
      connections_requested, 
      total_session_time
    ),
    updated_at = NOW();
END;
$function$;