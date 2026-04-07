DROP FUNCTION IF EXISTS public.delete_user_completely(uuid);

CREATE OR REPLACE FUNCTION public.delete_user_completely(_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete users completely';
  END IF;
  
  IF _target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;

  DELETE FROM public.connection_messages
    WHERE connection_request_id IN (
      SELECT id FROM public.connection_requests WHERE user_id = _target_user_id
    );
  DELETE FROM public.connection_requests WHERE user_id = _target_user_id;
  DELETE FROM public.data_room_access WHERE marketplace_user_id = _target_user_id;
  DELETE FROM public.data_room_audit_log WHERE user_id = _target_user_id;
  DELETE FROM public.document_requests WHERE user_id = _target_user_id;
  DELETE FROM public.alert_delivery_logs WHERE user_id = _target_user_id;
  DELETE FROM public.deal_alerts WHERE user_id = _target_user_id;
  DELETE FROM public.ai_command_center_usage WHERE user_id = _target_user_id;
  DELETE FROM public.chat_analytics WHERE user_id = _target_user_id;
  DELETE FROM public.listing_analytics WHERE user_id = _target_user_id;
  DELETE FROM public.page_views WHERE user_id = _target_user_id;
  DELETE FROM public.search_analytics WHERE user_id = _target_user_id;
  DELETE FROM public.user_events WHERE user_id = _target_user_id;
  DELETE FROM public.user_sessions WHERE user_id = _target_user_id;
  DELETE FROM public.user_initial_session WHERE user_id = _target_user_id;
  DELETE FROM public.contact_search_log WHERE user_id = _target_user_id;
  DELETE FROM public.chat_conversations WHERE user_id = _target_user_id;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  DELETE FROM public.permission_audit_log WHERE target_user_id = _target_user_id;
  DELETE FROM public.feedback_messages WHERE user_id = _target_user_id;
  DELETE FROM public.admin_notifications WHERE admin_id = _target_user_id;
  DELETE FROM public.user_notifications WHERE user_id = _target_user_id;
  DELETE FROM public.admin_connection_requests_views WHERE admin_id = _target_user_id;
  DELETE FROM public.admin_users_views WHERE admin_id = _target_user_id;
  DELETE FROM public.admin_view_state WHERE admin_id = _target_user_id;
  DELETE FROM public.admin_deal_sourcing_views WHERE admin_id = _target_user_id;
  DELETE FROM public.admin_owner_leads_views WHERE admin_id = _target_user_id;
  DELETE FROM public.admin_signature_preferences WHERE admin_id = _target_user_id;
  DELETE FROM public.saved_listings WHERE user_id = _target_user_id;
  DELETE FROM public.filter_presets WHERE user_id = _target_user_id;
  DELETE FROM public.audit_logs WHERE user_id = _target_user_id;
  DELETE FROM public.audit_logs WHERE admin_id = _target_user_id;
  DELETE FROM public.password_reset_tokens WHERE user_id = _target_user_id;
  DELETE FROM public.phoneburner_oauth_tokens WHERE user_id = _target_user_id;
  DELETE FROM public.enriched_contacts WHERE workspace_id = _target_user_id;
  DELETE FROM public.firm_members WHERE user_id = _target_user_id;
  DELETE FROM public.user_activity WHERE user_id = _target_user_id;
  DELETE FROM public.engagement_scores WHERE user_id = _target_user_id;
  DELETE FROM public.profiles WHERE id = _target_user_id;
  DELETE FROM auth.users WHERE id = _target_user_id;

  RETURN FOUND;
END;
$$;