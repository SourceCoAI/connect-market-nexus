-- Create a function that calls the notify-buyer-new-message edge function
-- when an admin sends a message, ensuring the notification fires server-side
-- even if the admin's browser disconnects.
CREATE OR REPLACE FUNCTION public.notify_buyer_on_admin_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only notify when an admin sends a message
  IF NEW.sender_role = 'admin' THEN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/notify-buyer-new-message',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'connection_request_id', NEW.connection_request_id,
        'message_preview', LEFT(NEW.body, 200)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_buyer_on_admin_message
  AFTER INSERT ON public.connection_messages
  FOR EACH ROW
  WHEN (NEW.sender_role = 'admin')
  EXECUTE FUNCTION public.notify_buyer_on_admin_message();
