-- Migration: Drop Dead Objects Phase 2
-- Part of comprehensive technical debt cleanup
-- Every object verified: 0 .rpc() calls, 0 .from() calls, 0 trigger refs, 0 RLS policy refs, 0 edge function refs
-- Nothing in this migration touches any of the 24 critical functions, 26 critical tables, or 16 critical triggers

BEGIN;

-- ============================================================================
-- SECTION A: Drop Dead Functions (15)
-- ============================================================================

-- 1. get_conversation_thread(uuid) — Only GRANT statement exists, never called from any code path
DROP FUNCTION IF EXISTS public.get_conversation_thread(uuid) CASCADE;

-- 2. track_user_engagement(uuid, text, jsonb) — Only GRANT statement, never called
DROP FUNCTION IF EXISTS public.track_user_engagement(uuid, text, jsonb) CASCADE;

-- 3. auto_categorize_feedback(text) — Only GRANT statement, never called
DROP FUNCTION IF EXISTS public.auto_categorize_feedback(text) CASCADE;

-- 4. auto_assign_priority(text, text) — Only GRANT statement, never called
DROP FUNCTION IF EXISTS public.auto_assign_priority(text, text) CASCADE;

-- 5. verify_production_readiness() — One-time validation function, ran once at schema creation
DROP FUNCTION IF EXISTS public.verify_production_readiness() CASCADE;

-- 6. get_feedback_with_user_details() — Only GRANT statement, never called
DROP FUNCTION IF EXISTS public.get_feedback_with_user_details() CASCADE;

-- 7. assign_feedback_to_admin(uuid) — Only GRANT statement, never called
DROP FUNCTION IF EXISTS public.assign_feedback_to_admin(uuid) CASCADE;

-- 8. create_password_reset_token(text) — Supabase handles auth natively, only referenced in types.ts
DROP FUNCTION IF EXISTS public.create_password_reset_token(text) CASCADE;

-- 9. validate_reset_token(text) — Supabase handles auth natively, only referenced in types.ts
DROP FUNCTION IF EXISTS public.validate_reset_token(text) CASCADE;

-- 10. get_engagement_analytics(text) — Only in types.ts, superseded by newer analytics
DROP FUNCTION IF EXISTS public.get_engagement_analytics(text) CASCADE;

-- 11. soft_delete_profile(uuid) — Superseded by delete_user_completely()
DROP FUNCTION IF EXISTS public.soft_delete_profile(uuid) CASCADE;

-- 12. get_marketplace_analytics(integer) — Superseded by get_simple_marketplace_analytics()
DROP FUNCTION IF EXISTS public.get_marketplace_analytics(integer) CASCADE;

-- 13. update_listing_notes_updated_at() — Orphaned trigger function after listing_personal_notes table drop
DROP FUNCTION IF EXISTS public.update_listing_notes_updated_at() CASCADE;

-- 14. log_chat_analytics(uuid, text, text, integer, integer, integer, text, uuid, uuid, jsonb)
--     Defined 6+ times across chatbot migrations, 0 trigger/rpc/app calls
DROP FUNCTION IF EXISTS public.log_chat_analytics(uuid, text, text, integer, integer, integer, text, uuid, uuid, jsonb) CASCADE;

-- 15. update_engagement_scores() — Only called in one-time migration seed SQL, never at runtime
DROP FUNCTION IF EXISTS public.update_engagement_scores() CASCADE;

-- ============================================================================
-- SECTION B: Drop Dead Tables (2)
-- ============================================================================

-- lead_sources — 0 .from() calls, no active FK references, only in types.ts
DROP TABLE IF EXISTS public.lead_sources CASCADE;

-- scoring_weights_history — Created in 20260218100000, never populated or read
DROP TABLE IF EXISTS public.scoring_weights_history CASCADE;

-- ============================================================================
-- SECTION C: Drop Dead Column (1)
-- ============================================================================

-- deal_stages.automation_rules — Added+seeded in 20250903*, 0 .select() in src/, 0 edge fn refs
ALTER TABLE public.deal_stages DROP COLUMN IF EXISTS automation_rules;

-- ============================================================================
-- SECTION D: Drop Dead Regular Views (11)
-- ============================================================================

DROP VIEW IF EXISTS public.feedback_analytics CASCADE;
DROP VIEW IF EXISTS public.security_summary CASCADE;
DROP VIEW IF EXISTS public.active_listings CASCADE;
DROP VIEW IF EXISTS public.active_buyers CASCADE;
DROP VIEW IF EXISTS public.active_scores CASCADE;
DROP VIEW IF EXISTS public.active_universes CASCADE;
DROP VIEW IF EXISTS public.enrichment_queue_status CASCADE;
DROP VIEW IF EXISTS public.cron_job_status CASCADE;
DROP VIEW IF EXISTS public.recent_audit_activity CASCADE;
DROP VIEW IF EXISTS public.score_override_history CASCADE;
DROP VIEW IF EXISTS public.extraction_source_audit CASCADE;

-- ============================================================================
-- SECTION E: Drop Dead Materialized Views (9)
-- ALL confirmed dead: 0 frontend/.from() references, 0 edge function refs
-- NOTE: listing_analytics is a TABLE (actively used) — NOT dropped here
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_deal_pipeline_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_score_tier_distribution CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_buyer_activity_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_universe_performance CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_geography_distribution CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_enrichment_provider_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_data_freshness CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_score_distribution CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.user_engagement_analytics CASCADE;

-- ============================================================================
-- SECTION F: Fix trigger function referencing dropped deals.metadata column
-- The deals.metadata column was dropped in 20260302100000. The trigger
-- auto_create_deal_from_connection_request() (latest version 20251014154732)
-- still writes to it. Redefine without the metadata column.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_create_deal_from_connection_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_inquiry_stage_id uuid;
  deal_source_value text;
  contact_name_value text;
  contact_email_value text;
  contact_company_value text;
  contact_phone_value text;
  contact_role_value text;
  buyer_priority_value integer;
BEGIN
  -- Get New Inquiry stage ID
  SELECT id INTO new_inquiry_stage_id
  FROM public.deal_stages
  WHERE name = 'New Inquiry'
  LIMIT 1;

  -- Preserve source correctly
  deal_source_value := CASE
    WHEN NEW.source IN ('website', 'marketplace', 'webflow', 'manual') THEN NEW.source
    ELSE 'marketplace'
  END;

  -- Get contact data from profiles if user_id exists, otherwise use lead_* fields
  IF NEW.user_id IS NOT NULL THEN
    SELECT
      COALESCE(p.first_name || ' ' || p.last_name, p.email),
      p.email,
      p.company,
      p.phone_number,
      p.buyer_type,
      COALESCE(calculate_buyer_priority_score(p.buyer_type), 0)
    INTO
      contact_name_value,
      contact_email_value,
      contact_company_value,
      contact_phone_value,
      contact_role_value,
      buyer_priority_value
    FROM public.profiles p
    WHERE p.id = NEW.user_id;
  ELSE
    contact_name_value := NEW.lead_name;
    contact_email_value := NEW.lead_email;
    contact_company_value := NEW.lead_company;
    contact_phone_value := NEW.lead_phone;
    contact_role_value := NEW.lead_role;
    buyer_priority_value := COALESCE(NEW.buyer_priority_score, 0);
  END IF;

  -- Create deal automatically (metadata column removed — was dropped in 20260302100000)
  INSERT INTO public.deals (
    listing_id,
    stage_id,
    connection_request_id,
    value,
    probability,
    source,
    title,
    contact_name,
    contact_email,
    contact_company,
    contact_phone,
    contact_role,
    buyer_priority_score,
    nda_status,
    fee_agreement_status,
    created_at,
    stage_entered_at
  ) VALUES (
    NEW.listing_id,
    new_inquiry_stage_id,
    NEW.id,
    0,
    5,
    deal_source_value,
    COALESCE(
      contact_name_value || ' - ' || (SELECT title FROM public.listings WHERE id = NEW.listing_id),
      'New Deal'
    ),
    COALESCE(contact_name_value, 'Unknown Contact'),
    contact_email_value,
    contact_company_value,
    contact_phone_value,
    contact_role_value,
    buyer_priority_value,
    CASE
      WHEN NEW.lead_nda_signed THEN 'signed'
      WHEN NEW.lead_nda_email_sent THEN 'sent'
      ELSE 'not_sent'
    END,
    CASE
      WHEN NEW.lead_fee_agreement_signed THEN 'signed'
      WHEN NEW.lead_fee_agreement_email_sent THEN 'sent'
      ELSE 'not_sent'
    END,
    NEW.created_at,
    NEW.created_at
  );

  RETURN NEW;
END;
$function$;

COMMIT;

-- Merged from: 20260303000000_reset_stuck_scoring_queue.sql
-- One-time cleanup: mark stuck scoring queue items as failed.
-- These were queued before process-scoring-queue edge function existed,
-- so they were never processed. Marking as 'failed' preserves audit trail
-- and allows users to re-click "Score Buyers" to queue fresh items.

UPDATE public.remarketing_scoring_queue
SET status     = 'failed',
    last_error = 'cleared: process-scoring-queue worker did not exist when queued',
    updated_at = now()
WHERE status IN ('pending', 'processing');
