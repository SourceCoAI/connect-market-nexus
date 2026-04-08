-- Add featured_deal_ids column to listings table.
-- When set, these two deals are shown in the "Related Deals" section of the
-- landing page instead of the default (most-recent) picks.
alter table public.listings
  add column if not exists featured_deal_ids uuid[] default null;

comment on column public.listings.featured_deal_ids is
  'Optional hand-picked deal IDs to feature on this listing''s landing page. Falls back to most-recent deals when null.';

-- Merged from: 20260607000000_delete_old_unassigned_tasks.sql
-- ============================================================
-- Delete all old unassigned standup tasks.
-- These are AI-extracted tasks that were never assigned to anyone
-- and are no longer useful. Clean slate for the new deal-only
-- extraction system.
-- ============================================================

-- Step 1: Remove deal_activities referencing unassigned tasks
DELETE FROM deal_activities
WHERE (metadata->>'task_id') IN (
  SELECT id::text FROM daily_standup_tasks
  WHERE assignee_id IS NULL
);

-- Step 2: Remove activity log entries for unassigned tasks
DELETE FROM rm_task_activity_log
WHERE task_id IN (
  SELECT id FROM daily_standup_tasks
  WHERE assignee_id IS NULL
);

-- Step 3: Remove comments on unassigned tasks
DELETE FROM rm_task_comments
WHERE task_id IN (
  SELECT id FROM daily_standup_tasks
  WHERE assignee_id IS NULL
);

-- Step 4: Delete all unassigned tasks
DELETE FROM daily_standup_tasks
WHERE assignee_id IS NULL;

-- Step 5: Also delete any tasks that are old (> 30 days) and still pending_approval
-- These were never reviewed and are stale
DELETE FROM deal_activities
WHERE (metadata->>'task_id') IN (
  SELECT id::text FROM daily_standup_tasks
  WHERE status = 'pending_approval'
    AND created_at < now() - INTERVAL '30 days'
);

DELETE FROM rm_task_activity_log
WHERE task_id IN (
  SELECT id FROM daily_standup_tasks
  WHERE status = 'pending_approval'
    AND created_at < now() - INTERVAL '30 days'
);

DELETE FROM rm_task_comments
WHERE task_id IN (
  SELECT id FROM daily_standup_tasks
  WHERE status = 'pending_approval'
    AND created_at < now() - INTERVAL '30 days'
);

DELETE FROM daily_standup_tasks
WHERE status = 'pending_approval'
  AND created_at < now() - INTERVAL '30 days';

-- Merged from: 20260607000000_update_firm_agreement_rpc_pandadoc_fields.sql
-- Extend get_user_firm_agreement_status to include PandaDoc-specific fields
-- so the frontend can use nda_status as canonical and nda_pandadoc_status as fallback.

DROP FUNCTION IF EXISTS public.get_user_firm_agreement_status(uuid);

CREATE OR REPLACE FUNCTION public.get_user_firm_agreement_status(p_user_id uuid)
 RETURNS TABLE(
   firm_id uuid, firm_name text,
   nda_signed boolean, nda_status text,
   nda_pandadoc_status text, nda_pandadoc_document_id text,
   nda_signed_at timestamptz, nda_signed_by_name text,
   nda_pandadoc_signed_url text, nda_signed_document_url text, nda_document_url text,
   fee_agreement_signed boolean, fee_agreement_status text,
   fee_pandadoc_status text, fee_pandadoc_document_id text,
   fee_agreement_signed_at timestamptz, fee_agreement_signed_by_name text,
   fee_pandadoc_signed_url text, fee_signed_document_url text, fee_agreement_document_url text
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_firm_id uuid;
BEGIN
  v_firm_id := resolve_user_firm_id(p_user_id);

  IF v_firm_id IS NULL THEN
    RETURN QUERY SELECT
      NULL::uuid, NULL::text,
      false, 'not_started'::text,
      NULL::text, NULL::text,
      NULL::timestamptz, NULL::text,
      NULL::text, NULL::text, NULL::text,
      false, 'not_started'::text,
      NULL::text, NULL::text,
      NULL::timestamptz, NULL::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    fa.id,
    fa.primary_company_name,
    fa.nda_signed,
    fa.nda_status::text,
    fa.nda_pandadoc_status,
    fa.nda_pandadoc_document_id,
    fa.nda_signed_at,
    fa.nda_signed_by_name,
    fa.nda_pandadoc_signed_url,
    fa.nda_signed_document_url,
    fa.nda_document_url,
    fa.fee_agreement_signed,
    fa.fee_agreement_status::text,
    fa.fee_pandadoc_status,
    fa.fee_pandadoc_document_id,
    fa.fee_agreement_signed_at,
    fa.fee_agreement_signed_by_name,
    fa.fee_pandadoc_signed_url,
    fa.fee_signed_document_url,
    fa.fee_agreement_document_url
  FROM firm_agreements fa
  WHERE fa.id = v_firm_id;
END;
$function$;
