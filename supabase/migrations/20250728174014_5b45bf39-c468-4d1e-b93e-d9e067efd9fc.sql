-- Fix function search path mutable warning by setting explicit search path
CREATE OR REPLACE FUNCTION public.match_deal_alerts_with_listing(listing_data JSONB)
RETURNS TABLE(alert_id UUID, user_id UUID, user_email TEXT, alert_name TEXT, alert_frequency TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    da.id as alert_id,
    da.user_id,
    p.email as user_email,
    da.name as alert_name,
    da.frequency as alert_frequency
  FROM public.deal_alerts da
  JOIN public.profiles p ON da.user_id = p.id
  WHERE da.is_active = true
    AND p.approval_status = 'approved'
    AND p.email_verified = true
    AND (
      -- Match categories
      (da.criteria->>'category' IS NULL OR da.criteria->>'category' = '' OR da.criteria->>'category' = listing_data->>'category')
      AND
      -- Match location
      (da.criteria->>'location' IS NULL OR da.criteria->>'location' = '' OR da.criteria->>'location' = listing_data->>'location')
      AND
      -- Match revenue range
      (da.criteria->>'revenueMin' IS NULL OR (listing_data->>'revenue')::numeric >= (da.criteria->>'revenueMin')::numeric)
      AND
      (da.criteria->>'revenueMax' IS NULL OR (listing_data->>'revenue')::numeric <= (da.criteria->>'revenueMax')::numeric)
      AND
      -- Match EBITDA range
      (da.criteria->>'ebitdaMin' IS NULL OR (listing_data->>'ebitda')::numeric >= (da.criteria->>'ebitdaMin')::numeric)
      AND
      (da.criteria->>'ebitdaMax' IS NULL OR (listing_data->>'ebitda')::numeric <= (da.criteria->>'ebitdaMax')::numeric)
      AND
      -- Match search term (if provided)
      (da.criteria->>'search' IS NULL OR da.criteria->>'search' = '' OR 
       (listing_data->>'title' ILIKE '%' || (da.criteria->>'search') || '%' OR 
        listing_data->>'description' ILIKE '%' || (da.criteria->>'search') || '%'))
    );
END;
$$;

-- Fix function search path mutable warning for trigger function
CREATE OR REPLACE FUNCTION public.trigger_deal_alerts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  listing_json JSONB;
  matching_alerts RECORD;
BEGIN
  -- Only process for INSERT operations on active listings
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    -- Convert listing to JSON for matching
    listing_json := to_jsonb(NEW);
    
    -- Find matching alerts and send notifications
    FOR matching_alerts IN 
      SELECT * FROM public.match_deal_alerts_with_listing(listing_json)
    LOOP
      -- Only send instant alerts immediately, others will be handled by scheduled jobs
      IF matching_alerts.alert_frequency = 'instant' THEN
        -- Log the delivery attempt
        INSERT INTO public.alert_delivery_logs (alert_id, listing_id, user_id, delivery_status)
        VALUES (matching_alerts.alert_id, NEW.id, matching_alerts.user_id, 'pending');
        
        -- Call the edge function to send notification
        PERFORM net.http_post(
          url := 'https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/send-deal-alert',
          headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.supabase_service_role_key', true) || '"}'::jsonb,
          body := jsonb_build_object(
            'alert_id', matching_alerts.alert_id,
            'user_email', matching_alerts.user_email,
            'user_id', matching_alerts.user_id,
            'listing_id', NEW.id,
            'alert_name', matching_alerts.alert_name,
            'listing_data', listing_json
          )
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;