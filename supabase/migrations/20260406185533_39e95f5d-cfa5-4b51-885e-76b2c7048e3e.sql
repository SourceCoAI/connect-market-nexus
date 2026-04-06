
-- ============================================================
-- 1. Change RESTRICT FK to CASCADE (user-owned data)
-- ============================================================
ALTER TABLE public.data_room_access
  DROP CONSTRAINT IF EXISTS data_room_access_marketplace_user_id_fkey;
ALTER TABLE public.data_room_access
  ADD CONSTRAINT data_room_access_marketplace_user_id_fkey
  FOREIGN KEY (marketplace_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- 2. Change NO ACTION admin-reference FKs to SET NULL
-- ============================================================

-- agreement_audit_log
ALTER TABLE public.agreement_audit_log DROP CONSTRAINT IF EXISTS agreement_audit_log_changed_by_fkey;
ALTER TABLE public.agreement_audit_log ADD CONSTRAINT agreement_audit_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ai_command_center_usage
ALTER TABLE public.ai_command_center_usage DROP CONSTRAINT IF EXISTS ai_command_center_usage_user_id_fkey;
ALTER TABLE public.ai_command_center_usage ADD CONSTRAINT ai_command_center_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- audit_logs.admin_id
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_admin_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- buyer_introductions
ALTER TABLE public.buyer_introductions DROP CONSTRAINT IF EXISTS buyer_introductions_created_by_fkey;
ALTER TABLE public.buyer_introductions ADD CONSTRAINT buyer_introductions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- buyer_learning_history
ALTER TABLE public.buyer_learning_history DROP CONSTRAINT IF EXISTS buyer_learning_history_action_by_fkey;
ALTER TABLE public.buyer_learning_history ADD CONSTRAINT buyer_learning_history_action_by_fkey FOREIGN KEY (action_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- buyers.verified_by
ALTER TABLE public.buyers DROP CONSTRAINT IF EXISTS remarketing_buyers_verified_by_fkey;
ALTER TABLE public.buyers ADD CONSTRAINT remarketing_buyers_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- buyer_search_jobs
ALTER TABLE public.buyer_search_jobs DROP CONSTRAINT IF EXISTS buyer_search_jobs_created_by_fkey;
ALTER TABLE public.buyer_search_jobs ADD CONSTRAINT buyer_search_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- buyer_transcripts
ALTER TABLE public.buyer_transcripts DROP CONSTRAINT IF EXISTS buyer_transcripts_linked_by_fkey;
ALTER TABLE public.buyer_transcripts ADD CONSTRAINT buyer_transcripts_linked_by_fkey FOREIGN KEY (linked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- buyer_universes
ALTER TABLE public.buyer_universes DROP CONSTRAINT IF EXISTS remarketing_buyer_universes_created_by_fkey;
ALTER TABLE public.buyer_universes ADD CONSTRAINT remarketing_buyer_universes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- connection_requests admin columns
ALTER TABLE public.connection_requests DROP CONSTRAINT IF EXISTS connection_requests_approved_by_fkey;
ALTER TABLE public.connection_requests ADD CONSTRAINT connection_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.connection_requests DROP CONSTRAINT IF EXISTS connection_requests_claimed_by_fkey;
ALTER TABLE public.connection_requests ADD CONSTRAINT connection_requests_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.connection_requests DROP CONSTRAINT IF EXISTS connection_requests_followed_up_by_fkey;
ALTER TABLE public.connection_requests ADD CONSTRAINT connection_requests_followed_up_by_fkey FOREIGN KEY (followed_up_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.connection_requests DROP CONSTRAINT IF EXISTS connection_requests_lead_fee_agreement_email_sent_by_fkey;
ALTER TABLE public.connection_requests ADD CONSTRAINT connection_requests_lead_fee_agreement_email_sent_by_fkey FOREIGN KEY (lead_fee_agreement_email_sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.connection_requests DROP CONSTRAINT IF EXISTS connection_requests_lead_fee_agreement_signed_by_fkey;
ALTER TABLE public.connection_requests ADD CONSTRAINT connection_requests_lead_fee_agreement_signed_by_fkey FOREIGN KEY (lead_fee_agreement_signed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.connection_requests DROP CONSTRAINT IF EXISTS connection_requests_lead_nda_email_sent_by_fkey;
ALTER TABLE public.connection_requests ADD CONSTRAINT connection_requests_lead_nda_email_sent_by_fkey FOREIGN KEY (lead_nda_email_sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.connection_requests DROP CONSTRAINT IF EXISTS connection_requests_lead_nda_signed_by_fkey;
ALTER TABLE public.connection_requests ADD CONSTRAINT connection_requests_lead_nda_signed_by_fkey FOREIGN KEY (lead_nda_signed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.connection_requests DROP CONSTRAINT IF EXISTS connection_requests_rejected_by_fkey;
ALTER TABLE public.connection_requests ADD CONSTRAINT connection_requests_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- data_room_access admin columns
ALTER TABLE public.data_room_access DROP CONSTRAINT IF EXISTS data_room_access_fee_agreement_override_by_fkey;
ALTER TABLE public.data_room_access ADD CONSTRAINT data_room_access_fee_agreement_override_by_fkey FOREIGN KEY (fee_agreement_override_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.data_room_access DROP CONSTRAINT IF EXISTS data_room_access_granted_by_fkey;
ALTER TABLE public.data_room_access ADD CONSTRAINT data_room_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.data_room_access DROP CONSTRAINT IF EXISTS data_room_access_last_modified_by_fkey;
ALTER TABLE public.data_room_access ADD CONSTRAINT data_room_access_last_modified_by_fkey FOREIGN KEY (last_modified_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- data_room_documents
ALTER TABLE public.data_room_documents DROP CONSTRAINT IF EXISTS data_room_documents_uploaded_by_fkey;
ALTER TABLE public.data_room_documents ADD CONSTRAINT data_room_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- deal_outreach_profiles
ALTER TABLE public.deal_outreach_profiles DROP CONSTRAINT IF EXISTS deal_outreach_profiles_created_by_fkey;
ALTER TABLE public.deal_outreach_profiles ADD CONSTRAINT deal_outreach_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- deal_pipeline
ALTER TABLE public.deal_pipeline DROP CONSTRAINT IF EXISTS deals_negative_followed_up_by_fkey;
ALTER TABLE public.deal_pipeline ADD CONSTRAINT deals_negative_followed_up_by_fkey FOREIGN KEY (negative_followed_up_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- deal_scoring_adjustments
ALTER TABLE public.deal_scoring_adjustments DROP CONSTRAINT IF EXISTS deal_scoring_adjustments_created_by_fkey;
ALTER TABLE public.deal_scoring_adjustments ADD CONSTRAINT deal_scoring_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- deal_transcripts
ALTER TABLE public.deal_transcripts DROP CONSTRAINT IF EXISTS deal_transcripts_created_by_fkey;
ALTER TABLE public.deal_transcripts ADD CONSTRAINT deal_transcripts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- document_requests admin columns
ALTER TABLE public.document_requests DROP CONSTRAINT IF EXISTS document_requests_requested_by_admin_id_fkey;
ALTER TABLE public.document_requests ADD CONSTRAINT document_requests_requested_by_admin_id_fkey FOREIGN KEY (requested_by_admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.document_requests DROP CONSTRAINT IF EXISTS document_requests_signed_toggled_by_fkey;
ALTER TABLE public.document_requests ADD CONSTRAINT document_requests_signed_toggled_by_fkey FOREIGN KEY (signed_toggled_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- enrichment_jobs
ALTER TABLE public.enrichment_jobs DROP CONSTRAINT IF EXISTS enrichment_jobs_triggered_by_fkey;
ALTER TABLE public.enrichment_jobs ADD CONSTRAINT enrichment_jobs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- firm_agreements
ALTER TABLE public.firm_agreements DROP CONSTRAINT IF EXISTS firm_agreements_fee_agreement_email_sent_by_fkey;
ALTER TABLE public.firm_agreements ADD CONSTRAINT firm_agreements_fee_agreement_email_sent_by_fkey FOREIGN KEY (fee_agreement_email_sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.firm_agreements DROP CONSTRAINT IF EXISTS firm_agreements_fee_agreement_signed_by_fkey;
ALTER TABLE public.firm_agreements ADD CONSTRAINT firm_agreements_fee_agreement_signed_by_fkey FOREIGN KEY (fee_agreement_signed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.firm_agreements DROP CONSTRAINT IF EXISTS firm_agreements_nda_email_sent_by_fkey;
ALTER TABLE public.firm_agreements ADD CONSTRAINT firm_agreements_nda_email_sent_by_fkey FOREIGN KEY (nda_email_sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.firm_agreements DROP CONSTRAINT IF EXISTS firm_agreements_nda_signed_by_fkey;
ALTER TABLE public.firm_agreements ADD CONSTRAINT firm_agreements_nda_signed_by_fkey FOREIGN KEY (nda_signed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- firm_domain_aliases
ALTER TABLE public.firm_domain_aliases DROP CONSTRAINT IF EXISTS firm_domain_aliases_created_by_fkey;
ALTER TABLE public.firm_domain_aliases ADD CONSTRAINT firm_domain_aliases_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- firm_members
ALTER TABLE public.firm_members DROP CONSTRAINT IF EXISTS firm_members_added_by_fkey;
ALTER TABLE public.firm_members ADD CONSTRAINT firm_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- global_activity_queue
ALTER TABLE public.global_activity_queue DROP CONSTRAINT IF EXISTS global_activity_queue_actor_id_fkey;
ALTER TABLE public.global_activity_queue ADD CONSTRAINT global_activity_queue_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.global_activity_queue DROP CONSTRAINT IF EXISTS global_activity_queue_created_by_fkey;
ALTER TABLE public.global_activity_queue ADD CONSTRAINT global_activity_queue_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- introduction_activity
ALTER TABLE public.introduction_activity DROP CONSTRAINT IF EXISTS introduction_activity_created_by_fkey;
ALTER TABLE public.introduction_activity ADD CONSTRAINT introduction_activity_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- introduction_status_log
ALTER TABLE public.introduction_status_log DROP CONSTRAINT IF EXISTS introduction_status_log_changed_by_fkey;
ALTER TABLE public.introduction_status_log ADD CONSTRAINT introduction_status_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- lead_memos
ALTER TABLE public.lead_memos DROP CONSTRAINT IF EXISTS lead_memos_created_by_fkey;
ALTER TABLE public.lead_memos ADD CONSTRAINT lead_memos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.lead_memos DROP CONSTRAINT IF EXISTS lead_memos_published_by_fkey;
ALTER TABLE public.lead_memos ADD CONSTRAINT lead_memos_published_by_fkey FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- lead_memo_versions
ALTER TABLE public.lead_memo_versions DROP CONSTRAINT IF EXISTS lead_memo_versions_edited_by_fkey;
ALTER TABLE public.lead_memo_versions ADD CONSTRAINT lead_memo_versions_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- listing_analytics
ALTER TABLE public.listing_analytics DROP CONSTRAINT IF EXISTS listing_analytics_user_id_fkey;
ALTER TABLE public.listing_analytics ADD CONSTRAINT listing_analytics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- listings
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_needs_buyer_search_by_fkey;
ALTER TABLE public.listings ADD CONSTRAINT listings_needs_buyer_search_by_fkey FOREIGN KEY (needs_buyer_search_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_needs_owner_contact_by_fkey;
ALTER TABLE public.listings ADD CONSTRAINT listings_needs_owner_contact_by_fkey FOREIGN KEY (needs_owner_contact_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_universe_build_flagged_by_fkey;
ALTER TABLE public.listings ADD CONSTRAINT listings_universe_build_flagged_by_fkey FOREIGN KEY (universe_build_flagged_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- memo_distribution_log
ALTER TABLE public.memo_distribution_log DROP CONSTRAINT IF EXISTS memo_distribution_log_sent_by_fkey;
ALTER TABLE public.memo_distribution_log ADD CONSTRAINT memo_distribution_log_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- outreach_records
ALTER TABLE public.outreach_records DROP CONSTRAINT IF EXISTS outreach_records_cim_sent_by_fkey;
ALTER TABLE public.outreach_records ADD CONSTRAINT outreach_records_cim_sent_by_fkey FOREIGN KEY (cim_sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.outreach_records DROP CONSTRAINT IF EXISTS outreach_records_contacted_by_fkey;
ALTER TABLE public.outreach_records ADD CONSTRAINT outreach_records_contacted_by_fkey FOREIGN KEY (contacted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.outreach_records DROP CONSTRAINT IF EXISTS outreach_records_created_by_fkey;
ALTER TABLE public.outreach_records ADD CONSTRAINT outreach_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.outreach_records DROP CONSTRAINT IF EXISTS outreach_records_nda_sent_by_fkey;
ALTER TABLE public.outreach_records ADD CONSTRAINT outreach_records_nda_sent_by_fkey FOREIGN KEY (nda_sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- page_views
ALTER TABLE public.page_views DROP CONSTRAINT IF EXISTS page_views_user_id_fkey;
ALTER TABLE public.page_views ADD CONSTRAINT page_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- remarketing_scores
ALTER TABLE public.remarketing_scores DROP CONSTRAINT IF EXISTS remarketing_scores_scored_by_fkey;
ALTER TABLE public.remarketing_scores ADD CONSTRAINT remarketing_scores_scored_by_fkey FOREIGN KEY (scored_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- remarketing_universe_deals
ALTER TABLE public.remarketing_universe_deals DROP CONSTRAINT IF EXISTS remarketing_universe_deals_added_by_fkey;
ALTER TABLE public.remarketing_universe_deals ADD CONSTRAINT remarketing_universe_deals_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- search_analytics
ALTER TABLE public.search_analytics DROP CONSTRAINT IF EXISTS search_analytics_user_id_fkey;
ALTER TABLE public.search_analytics ADD CONSTRAINT search_analytics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_events
ALTER TABLE public.user_events DROP CONSTRAINT IF EXISTS user_events_user_id_fkey;
ALTER TABLE public.user_events ADD CONSTRAINT user_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_roles.granted_by
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_assigned_by_fkey;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- user_sessions
ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- 3. Recreate delete_user_completely with comprehensive coverage
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_user_completely(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the calling user is an admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete users completely';
  END IF;
  
  -- Prevent self-deletion
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;

  -- ========== User-owned data (explicit DELETE) ==========
  
  -- Messages on user's connection requests
  DELETE FROM public.connection_messages
    WHERE connection_request_id IN (
      SELECT id FROM public.connection_requests WHERE user_id = target_user_id
    );

  -- Connection requests themselves
  DELETE FROM public.connection_requests WHERE user_id = target_user_id;

  -- Data room access & audit
  DELETE FROM public.data_room_access WHERE marketplace_user_id = target_user_id;
  DELETE FROM public.data_room_audit_log WHERE user_id = target_user_id;

  -- Document requests
  DELETE FROM public.document_requests WHERE user_id = target_user_id;

  -- Deal alerts & delivery logs
  DELETE FROM public.alert_delivery_logs WHERE user_id = target_user_id;
  DELETE FROM public.deal_alerts WHERE user_id = target_user_id;

  -- Analytics & tracking
  DELETE FROM public.ai_command_center_usage WHERE user_id = target_user_id;
  DELETE FROM public.chat_analytics WHERE user_id = target_user_id;
  DELETE FROM public.listing_analytics WHERE user_id = target_user_id;
  DELETE FROM public.page_views WHERE user_id = target_user_id;
  DELETE FROM public.search_analytics WHERE user_id = target_user_id;
  DELETE FROM public.user_events WHERE user_id = target_user_id;
  DELETE FROM public.user_sessions WHERE user_id = target_user_id;
  DELETE FROM public.user_initial_session WHERE user_id = target_user_id;
  DELETE FROM public.contact_search_log WHERE user_id = target_user_id;

  -- Chat conversations
  DELETE FROM public.chat_conversations WHERE user_id = target_user_id;

  -- User roles & permissions
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  DELETE FROM public.permission_audit_log WHERE target_user_id = target_user_id;

  -- Feedback
  DELETE FROM public.feedback_messages WHERE user_id = target_user_id;

  -- Notifications
  DELETE FROM public.admin_notifications WHERE admin_id = target_user_id;
  DELETE FROM public.user_notifications WHERE user_id = target_user_id;

  -- Admin view states
  DELETE FROM public.admin_connection_requests_views WHERE admin_id = target_user_id;
  DELETE FROM public.admin_users_views WHERE admin_id = target_user_id;
  DELETE FROM public.admin_view_state WHERE admin_id = target_user_id;
  DELETE FROM public.admin_deal_sourcing_views WHERE admin_id = target_user_id;
  DELETE FROM public.admin_owner_leads_views WHERE admin_id = target_user_id;
  DELETE FROM public.admin_signature_preferences WHERE admin_id = target_user_id;

  -- Saved listings & filter presets
  DELETE FROM public.saved_listings WHERE user_id = target_user_id;
  DELETE FROM public.filter_presets WHERE user_id = target_user_id;

  -- Audit logs
  DELETE FROM public.audit_logs WHERE user_id = target_user_id;
  DELETE FROM public.audit_logs WHERE admin_id = target_user_id;

  -- Password reset tokens
  DELETE FROM public.password_reset_tokens WHERE user_id = target_user_id;

  -- Phone burner
  DELETE FROM public.phoneburner_oauth_tokens WHERE user_id = target_user_id;

  -- Enriched contacts workspace
  DELETE FROM public.enriched_contacts WHERE workspace_id = target_user_id;

  -- Firm members (user's membership, not the firm)
  DELETE FROM public.firm_members WHERE user_id = target_user_id;

  -- User activity & engagement
  DELETE FROM public.user_activity WHERE user_id = target_user_id;
  DELETE FROM public.engagement_scores WHERE user_id = target_user_id;

  -- Profile
  DELETE FROM public.profiles WHERE id = target_user_id;

  -- Finally delete auth user
  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN FOUND;
END;
$$;
