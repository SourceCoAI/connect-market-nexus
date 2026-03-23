-- High Severity Fixes Migration
-- Addresses audit gaps H-5, H-6, H-7, H-10, H-11, H-12

-- ============================================================
-- H-5 FIX: Expand stage_type CHECK constraint to allow 'owner_intro' value
-- for type-based automation triggers instead of hardcoded stage name strings.
-- The column already exists with CHECK (stage_type IN ('active', 'closed_won', 'closed_lost')).
-- ============================================================
ALTER TABLE public.deal_stages DROP CONSTRAINT IF EXISTS deal_stages_stage_type_check;
ALTER TABLE public.deal_stages ADD CONSTRAINT deal_stages_stage_type_check
  CHECK (stage_type IN ('active', 'closed_won', 'closed_lost', 'owner_intro'));

-- Tag existing stages by their functional type
UPDATE public.deal_stages SET stage_type = 'owner_intro' WHERE name = 'Owner intro requested' AND is_active = true;
UPDATE public.deal_stages SET stage_type = 'closed_won' WHERE name = 'Closed Won' AND is_active = true;
UPDATE public.deal_stages SET stage_type = 'closed_lost' WHERE name = 'Closed Lost' AND is_active = true;

-- ============================================================
-- H-7 FIX: Reassign any deals stuck in deactivated stages.
-- Moves them to the first active stage ("Approved").
-- ============================================================
UPDATE public.deal_pipeline
SET stage_id = (
  SELECT id FROM public.deal_stages
  WHERE is_active = true
  ORDER BY position ASC
  LIMIT 1
)
WHERE stage_id IN (
  SELECT id FROM public.deal_stages WHERE is_active = false
)
AND deleted_at IS NULL;

-- ============================================================
-- H-12 FIX: When a deal moves to Closed Won or Closed Lost,
-- automatically update the associated listing and buyer introductions.
-- This trigger fires after stage changes on deal_pipeline.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_deal_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stage_record RECORD;
BEGIN
  -- Only fire when stage_id changes
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    SELECT name, stage_type INTO stage_record
    FROM public.deal_stages
    WHERE id = NEW.stage_id;

    -- Check if this is a terminal stage
    IF stage_record.stage_type IN ('closed_won', 'closed_lost') THEN
      -- Mark listing as inactive if deal is closed and listing exists
      IF NEW.listing_id IS NOT NULL THEN
        UPDATE public.listings
        SET status = 'inactive', updated_at = NOW()
        WHERE id = NEW.listing_id
        AND status = 'active'
        AND is_internal_deal = false;
      END IF;

      -- Update buyer introductions to reflect deal closure.
      -- buyer_introductions links via listing_id, not deal_id.
      UPDATE public.buyer_introductions
      SET introduction_status = CASE
        WHEN stage_record.stage_type = 'closed_won' THEN 'fit_and_interested'
        ELSE 'not_a_fit'
      END,
      updated_at = NOW()
      WHERE listing_id = NEW.listing_id
      AND introduction_status NOT IN ('not_a_fit', 'fit_and_interested');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_deal_close ON public.deal_pipeline;
CREATE TRIGGER trg_handle_deal_close
  AFTER UPDATE ON public.deal_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_deal_close();

-- ============================================================
-- H-11 FIX: Sync source deal financial changes TO marketplace listing.
-- When a listing with is_internal_deal=true (source deal) has financials updated,
-- propagate to any marketplace listings that reference it as source_deal_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_source_deal_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only sync when financial fields change on internal deals
  IF NEW.is_internal_deal = true AND (
    NEW.revenue IS DISTINCT FROM OLD.revenue OR
    NEW.ebitda IS DISTINCT FROM OLD.ebitda OR
    NEW.ebitda_margin IS DISTINCT FROM OLD.ebitda_margin
  ) THEN
    UPDATE public.listings
    SET
      revenue = COALESCE(NEW.revenue, revenue),
      ebitda = COALESCE(NEW.ebitda, ebitda),
      ebitda_margin = COALESCE(NEW.ebitda_margin, ebitda_margin),
      updated_at = NOW()
    WHERE source_deal_id = NEW.id
    AND is_internal_deal = false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_source_deal_financials ON public.listings;
CREATE TRIGGER trg_sync_source_deal_financials
  AFTER UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_source_deal_financials();

-- ============================================================
-- H-10 FIX: Auto-create pipeline deal when a connection request is approved.
-- This trigger fires when connection_requests.status changes to 'approved'.
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_create_deal_from_approved_connection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  first_stage_id UUID;
  existing_deal_id UUID;
BEGIN
  -- Only fire when status changes to approved
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Check if a pipeline deal already exists for this connection
    SELECT id INTO existing_deal_id
    FROM public.deal_pipeline
    WHERE listing_id = NEW.listing_id
    AND contact_email = NEW.lead_email
    AND deleted_at IS NULL
    LIMIT 1;

    IF existing_deal_id IS NULL THEN
      -- Get the first active stage
      SELECT id INTO first_stage_id
      FROM public.deal_stages
      WHERE is_active = true
      ORDER BY position ASC
      LIMIT 1;

      -- Create the pipeline deal
      INSERT INTO public.deal_pipeline (
        title,
        listing_id,
        stage_id,
        contact_name,
        contact_email,
        contact_company,
        contact_phone,
        contact_role,
        source,
        nda_status,
        fee_agreement_status
      ) VALUES (
        COALESCE(NEW.lead_company, NEW.lead_name, 'Unknown') || ' - Connection Request',
        NEW.listing_id,
        first_stage_id,
        NEW.lead_name,
        NEW.lead_email,
        NEW.lead_company,
        NEW.lead_phone,
        NEW.lead_role,
        'marketplace',
        'not_sent',
        'not_sent'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_deal_from_connection ON public.connection_requests;
CREATE TRIGGER trg_auto_create_deal_from_connection
  AFTER UPDATE ON public.connection_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_deal_from_approved_connection();
