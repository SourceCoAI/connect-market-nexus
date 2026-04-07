-- Create the message-attachments storage bucket for file uploads in deal messaging.
-- Referenced by BuyerMessages/MessageThread.tsx (both buyer and admin threads).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  true,
  10485760, -- 10 MB (matches MAX_ATTACHMENT_SIZE in MessageThread.tsx)
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload attachments.
CREATE POLICY "Authenticated users can upload message attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'message-attachments');

-- Attachments are publicly readable (bucket is public) so both parties can download.
CREATE POLICY "Anyone can read message attachments"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'message-attachments');

-- Merged from: 20260405000000_unify_task_system.sql
-- =============================================================================
-- Migration: Unify Task System
-- Purpose: Migrate deal_tasks data into daily_standup_tasks, making
--          daily_standup_tasks the single source of truth for all tasks.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Migrate existing deal_tasks rows into daily_standup_tasks
-- ---------------------------------------------------------------------------
-- Uses WHERE NOT EXISTS to avoid duplicating tasks already mirrored by the
-- AI Command Center's createDealTask (which writes to both tables).

INSERT INTO daily_standup_tasks (
  title,
  description,
  assignee_id,
  task_type,
  status,
  priority,
  due_date,
  completed_at,
  completed_by,
  created_by,
  entity_type,
  entity_id,
  deal_id,
  deal_reference,
  source,
  is_manual,
  priority_score,
  extraction_confidence,
  needs_review,
  created_at
)
SELECT
  dt.title,
  dt.description,
  dt.assigned_to,
  'other',
  CASE dt.status
    WHEN 'open'       THEN 'pending'
    WHEN 'in_progress' THEN 'in_progress'
    WHEN 'reopened'   THEN 'pending'
    WHEN 'resolved'   THEN 'completed'
    WHEN 'completed'  THEN 'completed'
    WHEN 'na'         THEN 'cancelled'
    WHEN 'pending'    THEN 'pending'
    ELSE 'pending'
  END,
  dt.priority,
  dt.due_date,
  dt.completed_at,
  dt.completed_by,
  dt.assigned_by,
  'deal',
  dt.deal_id,
  dt.deal_id,
  (SELECT d.title FROM deals d WHERE d.id = dt.deal_id LIMIT 1),
  'manual',
  TRUE,
  50,
  'high',
  FALSE,
  dt.created_at
FROM deal_tasks dt
WHERE NOT EXISTS (
  SELECT 1
  FROM daily_standup_tasks dst
  WHERE dst.entity_type = 'deal'
    AND dst.entity_id = dt.deal_id
    AND dst.title = dt.title
    AND dst.source = 'chatbot'
);

-- ---------------------------------------------------------------------------
-- 2. Create a backward-compatible view for any remaining consumers
-- ---------------------------------------------------------------------------
-- This view maps daily_standup_tasks (entity_type='deal') back to the
-- deal_tasks column interface, providing a transitional compatibility layer.

CREATE OR REPLACE VIEW deal_tasks_v AS
SELECT
  dst.id,
  dst.entity_id        AS deal_id,
  dst.title,
  dst.description,
  CASE dst.status
    WHEN 'pending'          THEN 'pending'
    WHEN 'pending_approval' THEN 'pending'
    WHEN 'in_progress'      THEN 'in_progress'
    WHEN 'completed'        THEN 'completed'
    WHEN 'cancelled'        THEN 'na'
    WHEN 'snoozed'          THEN 'pending'
    WHEN 'overdue'          THEN 'pending'
    WHEN 'listing_closed'   THEN 'na'
    ELSE dst.status
  END                  AS status,
  dst.priority,
  dst.assignee_id      AS assigned_to,
  dst.created_by       AS assigned_by,
  dst.due_date,
  dst.completed_at,
  dst.completed_by,
  dst.created_at,
  dst.created_at       AS updated_at
FROM daily_standup_tasks dst
WHERE dst.entity_type = 'deal';

-- ---------------------------------------------------------------------------
-- 3. Update get_deals_with_details RPC to use daily_standup_tasks
-- ---------------------------------------------------------------------------
-- The RPC function previously joined deal_tasks for task counts. Now it uses
-- daily_standup_tasks with entity_type='deal' filter.

DROP FUNCTION IF EXISTS public.get_deals_with_details();
CREATE OR REPLACE FUNCTION public.get_deals_with_details()
RETURNS TABLE (
  deal_id UUID,
  deal_title TEXT,
  deal_description TEXT,
  deal_value NUMERIC,
  deal_priority TEXT,
  deal_probability NUMERIC,
  deal_expected_close_date DATE,
  deal_source TEXT,
  deal_created_at TIMESTAMP WITH TIME ZONE,
  deal_updated_at TIMESTAMP WITH TIME ZONE,
  deal_stage_entered_at TIMESTAMP WITH TIME ZONE,
  stage_id UUID,
  stage_name TEXT,
  stage_color TEXT,
  stage_position INTEGER,
  listing_id UUID,
  listing_title TEXT,
  listing_revenue NUMERIC,
  listing_ebitda NUMERIC,
  listing_location TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_company TEXT,
  contact_phone TEXT,
  contact_role TEXT,
  buyer_contact_id UUID,
  buyer_contact_name TEXT,
  buyer_contact_email TEXT,
  seller_contact_id UUID,
  seller_contact_name TEXT,
  remarketing_buyer_id UUID,
  remarketing_buyer_company TEXT,
  nda_status TEXT,
  fee_agreement_status TEXT,
  followed_up BOOLEAN,
  followed_up_at TIMESTAMP WITH TIME ZONE,
  assigned_to UUID,
  assigned_admin_name TEXT,
  assigned_admin_email TEXT,
  total_tasks INTEGER,
  pending_tasks INTEGER,
  completed_tasks INTEGER,
  activity_count INTEGER
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id as deal_id,
    d.title as deal_title,
    d.description as deal_description,
    d.value as deal_value,
    d.priority as deal_priority,
    d.probability as deal_probability,
    d.expected_close_date as deal_expected_close_date,
    d.source as deal_source,
    d.created_at as deal_created_at,
    d.updated_at as deal_updated_at,
    d.stage_entered_at as deal_stage_entered_at,
    ds.id as stage_id,
    ds.name as stage_name,
    ds.color as stage_color,
    ds.position as stage_position,
    l.id as listing_id,
    l.title as listing_title,
    l.revenue as listing_revenue,
    l.ebitda as listing_ebitda,
    l.location as listing_location,
    d.contact_name,
    d.contact_email,
    d.contact_company,
    d.contact_phone,
    d.contact_role,
    d.buyer_contact_id,
    CASE WHEN bc.id IS NOT NULL
      THEN TRIM(bc.first_name || ' ' || bc.last_name)
      ELSE NULL
    END as buyer_contact_name,
    bc.email as buyer_contact_email,
    d.seller_contact_id,
    CASE WHEN sc.id IS NOT NULL
      THEN TRIM(sc.first_name || ' ' || sc.last_name)
      ELSE NULL
    END as seller_contact_name,
    d.remarketing_buyer_id,
    rb.company_name as remarketing_buyer_company,
    d.nda_status,
    d.fee_agreement_status,
    d.followed_up,
    d.followed_up_at,
    d.assigned_to,
    COALESCE(p.first_name || ' ' || p.last_name, p.email) as assigned_admin_name,
    p.email as assigned_admin_email,
    COALESCE(task_stats.total_tasks, 0) as total_tasks,
    COALESCE(task_stats.pending_tasks, 0) as pending_tasks,
    COALESCE(task_stats.completed_tasks, 0) as completed_tasks,
    COALESCE(activity_stats.activity_count, 0) as activity_count
  FROM public.deals d
  LEFT JOIN public.deal_stages ds ON d.stage_id = ds.id
  LEFT JOIN public.listings l ON d.listing_id = l.id
  LEFT JOIN public.profiles p ON d.assigned_to = p.id
  LEFT JOIN public.contacts bc ON d.buyer_contact_id = bc.id
  LEFT JOIN public.contacts sc ON d.seller_contact_id = sc.id
  LEFT JOIN public.remarketing_buyers rb ON d.remarketing_buyer_id = rb.id
  LEFT JOIN (
    SELECT
      entity_id AS deal_id,
      COUNT(*)::integer as total_tasks,
      SUM(CASE WHEN status IN ('pending', 'pending_approval', 'in_progress', 'overdue') THEN 1 ELSE 0 END)::integer as pending_tasks,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::integer as completed_tasks
    FROM public.daily_standup_tasks
    WHERE entity_type = 'deal'
    GROUP BY entity_id
  ) task_stats ON d.id = task_stats.deal_id
  LEFT JOIN (
    SELECT
      deal_id,
      COUNT(*)::integer as activity_count
    FROM public.deal_activities
    GROUP BY deal_id
  ) activity_stats ON d.id = activity_stats.deal_id
  WHERE d.deleted_at IS NULL
  ORDER BY d.updated_at DESC;
$$;
