-- ============================================================
-- Seller Follow-Up Cadence System
--
-- Creates infrastructure for automatic daily follow-up task
-- generation for previously contacted sellers. Mirrors the
-- rm_buyer_deal_cadence pattern but for the seller side.
-- ============================================================

-- ─── 1. Add seller_last_contact_at to listings ─────────────────────

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS seller_last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_last_contact_source text
    CHECK (seller_last_contact_source IS NULL OR seller_last_contact_source IN
      ('task','fireflies','email','meeting','manual'));

CREATE INDEX IF NOT EXISTS idx_listings_seller_last_contact
  ON public.listings (seller_last_contact_at)
  WHERE seller_last_contact_at IS NOT NULL;


-- ─── 2. Seller follow-up cadence table ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.rm_seller_follow_up_cadence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  expected_contact_days integer NOT NULL DEFAULT 14,
  last_contacted_at timestamptz,
  last_contact_source text
    CHECK (last_contact_source IS NULL OR last_contact_source IN
      ('task','fireflies','email','meeting','manual')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id)
);

ALTER TABLE public.rm_seller_follow_up_cadence ENABLE ROW LEVEL SECURITY;

-- Admins manage cadence
CREATE POLICY "admin_all_seller_cadence"
  ON public.rm_seller_follow_up_cadence FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin','owner','moderator')
    )
  );

-- Service role bypass
CREATE POLICY "service_role_seller_cadence"
  ON public.rm_seller_follow_up_cadence FOR ALL
  USING (auth.role() = 'service_role');

-- Assignees can read their own cadence rows
CREATE POLICY "assignee_read_own_seller_cadence"
  ON public.rm_seller_follow_up_cadence FOR SELECT
  USING (assigned_to = auth.uid());

CREATE INDEX IF NOT EXISTS idx_seller_cadence_listing ON public.rm_seller_follow_up_cadence (listing_id);
CREATE INDEX IF NOT EXISTS idx_seller_cadence_active ON public.rm_seller_follow_up_cadence (is_active, last_contacted_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_seller_cadence_assignee ON public.rm_seller_follow_up_cadence (assigned_to) WHERE is_active = true;

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER trg_seller_cadence_updated_at
  BEFORE UPDATE ON public.rm_seller_follow_up_cadence
  FOR EACH ROW EXECUTE FUNCTION public.moddatetime('updated_at');


-- ─── 3. Daily follow-up task generation function ────────────────────
--
-- Checks all active seller cadence rows and creates a contact_owner
-- task for any listing that is overdue for contact (or never contacted).
-- Skips listings that already have an open contact_owner task.

CREATE OR REPLACE FUNCTION public.generate_seller_follow_up_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT
      c.listing_id,
      c.assigned_to,
      c.expected_contact_days,
      c.last_contacted_at,
      l.title,
      l.internal_company_name
    FROM public.rm_seller_follow_up_cadence c
    JOIN public.listings l ON l.id = c.listing_id
    WHERE c.is_active = true
      AND l.status = 'active'
      -- Overdue: never contacted OR last contact + cadence days < today
      AND (
        c.last_contacted_at IS NULL
        OR (c.last_contacted_at + (c.expected_contact_days || ' days')::interval) < now()
      )
      -- No existing open contact_owner task for this listing
      AND NOT EXISTS (
        SELECT 1 FROM public.daily_standup_tasks t
        WHERE t.entity_type = 'deal'
          AND t.entity_id = c.listing_id
          AND t.task_type = 'contact_owner'
          AND t.status IN ('pending','pending_approval','in_progress','overdue')
      )
  LOOP
    INSERT INTO public.daily_standup_tasks (
      title,
      task_type,
      status,
      priority,
      entity_type,
      entity_id,
      deal_reference,
      assignee_id,
      due_date,
      source,
      is_manual,
      priority_score,
      extraction_confidence,
      needs_review,
      task_category
    ) VALUES (
      'Follow Up with Seller — ' || COALESCE(r.internal_company_name, r.title, 'Unknown'),
      'contact_owner',
      'pending',
      'high',
      'deal',
      r.listing_id,
      COALESCE(r.internal_company_name, r.title),
      r.assigned_to,
      CURRENT_DATE,
      'system',
      false,
      90, -- contact_owner is highest priority task type
      'high',
      false,
      'deal_task'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ─── 4. Update cadence when contact_owner task is completed ─────────
--
-- When a contact_owner task linked to a listing is marked completed,
-- reset the seller cadence last_contacted_at so the clock restarts.

CREATE OR REPLACE FUNCTION public.trg_seller_contact_on_task_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only fire when status transitions to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed')
     AND NEW.task_type = 'contact_owner'
     AND NEW.entity_type = 'deal'
     AND NEW.entity_id IS NOT NULL
  THEN
    -- Update cadence table
    UPDATE public.rm_seller_follow_up_cadence
    SET last_contacted_at = now(),
        last_contact_source = 'task',
        updated_at = now()
    WHERE listing_id = NEW.entity_id
      AND is_active = true;

    -- Denormalize onto listings for easy access
    UPDATE public.listings
    SET seller_last_contact_at = now(),
        seller_last_contact_source = 'task'
    WHERE id = NEW.entity_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seller_contact_on_task_complete
  AFTER UPDATE OF status ON public.daily_standup_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_seller_contact_on_task_complete();


-- ─── 5. Schedule daily generation via pg_cron ───────────────────────
-- Runs at 6:10 AM UTC daily (after snoozed-wake at 6:00 and overdue at 5:55)

DO $$
BEGIN
  PERFORM cron.schedule(
    'generate-seller-follow-up-tasks',
    '10 6 * * *',
    $cron$ SELECT public.generate_seller_follow_up_tasks(); $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — seller follow-up generation will rely on client-side RPC fallback';
END;
$$;


-- ─── 6. Seed cadence rows for existing active listings ──────────────
-- Assigns to the deal team lead if one exists, otherwise NULL.
-- Default cadence: 14 days.

INSERT INTO public.rm_seller_follow_up_cadence (listing_id, assigned_to, expected_contact_days)
SELECT
  l.id,
  dt.user_id,
  14
FROM public.listings l
LEFT JOIN public.rm_deal_team dt
  ON dt.listing_id = l.id AND dt.role = 'lead'
WHERE l.status = 'active'
  AND l.remarketing_status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.rm_seller_follow_up_cadence c WHERE c.listing_id = l.id
  )
ON CONFLICT (listing_id) DO NOTHING;


-- ─── 7. Deactivate cadence when listing leaves active status ────────

CREATE OR REPLACE FUNCTION public.trg_seller_cadence_on_listing_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status != 'active' AND OLD.status = 'active' THEN
    UPDATE public.rm_seller_follow_up_cadence
    SET is_active = false, updated_at = now()
    WHERE listing_id = NEW.id AND is_active = true;
  ELSIF NEW.status = 'active' AND OLD.status != 'active' THEN
    -- Reactivate if listing becomes active again
    UPDATE public.rm_seller_follow_up_cadence
    SET is_active = true, updated_at = now()
    WHERE listing_id = NEW.id AND NOT is_active;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seller_cadence_on_listing_status
  AFTER UPDATE OF status ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_seller_cadence_on_listing_status();
