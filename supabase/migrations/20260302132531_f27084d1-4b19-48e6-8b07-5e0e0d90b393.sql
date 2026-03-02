-- Drop broken triggers that reference the now-deleted connection_request_stages table
DROP TRIGGER IF EXISTS trigger_auto_assign_connection_request_stage ON connection_requests;
DROP TRIGGER IF EXISTS on_connection_request_stage_update ON connection_requests;

-- Drop the associated functions
DROP FUNCTION IF EXISTS auto_assign_connection_request_stage();
DROP FUNCTION IF EXISTS notify_user_on_stage_change();