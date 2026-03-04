-- ============================================================================
-- PHASE 4 MIGRATION: Replace trigger chains with explicit RPCs
-- ============================================================================
--
-- This migration creates two RPC functions that consolidate multi-trigger
-- chains into single, explicit, transactional operations:
--
--   1. create_pipeline_deal(p_connection_request_id)
--      Replaces the 4-trigger chain on connection_requests INSERT:
--        - trg_ensure_source_from_lead
--        - auto_create_deal_from_connection_request
--        - create_deal_from_connection_request
--        - create_deal_on_request_approval
--
--   2. update_agreement_status(p_firm_agreement_id, p_field, p_new_status)
--      Replaces the agreement trigger chain on firm_agreements UPDATE:
--        - trg_log_agreement_status_change
--        - trg_sync_fee_agreement_to_remarketing
--
-- IMPORTANT: The old triggers are NOT dropped in this migration.
-- They remain as a safety net during the transition period. Once the
-- RPCs have been verified in production and all callers have been
-- migrated, the triggers should be dropped in a follow-up migration.
--
-- SAFETY:
--   - IDEMPOTENT: Uses CREATE OR REPLACE throughout.
--   - NO DATA LOSS: Read-only + new inserts only; does not alter tables.
--   - ZERO DOWNTIME: Atomic function replacement.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. create_pipeline_deal(p_connection_request_id uuid) RETURNS uuid
-- ═══════════════════════════════════════════════════════════════════════════
-- Consolidates the entire "connection request → deal_pipeline row" flow
-- into a single, explicit RPC call. The caller is responsible for invoking
-- this after inserting a connection_request, rather than relying on hidden
-- trigger side-effects.
--
-- Steps performed:
--   1. Fetch the connection_request record
--   2. Ensure source is set (replaces trg_ensure_source_from_lead)
--   3. Compute buyer priority score via calculate_buyer_priority_score()
--   4. Look up the 'New Inquiry' deal stage
--   5. Resolve buyer_contact_id from contacts
--   6. Resolve seller_contact_id from contacts
--   7. Build deal title from contact name + listing title
--   8. Derive NDA/fee statuses from connection_request lead fields
--   9. INSERT into deal_pipeline and RETURN the new id
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_pipeline_deal(
  p_connection_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cr              RECORD;
  v_source          text;
  v_lead_source     text;
  v_buyer_type      text;
  v_buyer_priority  integer;
  v_stage_id        uuid;
  v_buyer_contact_id uuid;
  v_remarketing_buyer_id uuid;
  v_seller_contact_id uuid;
  v_contact_name    text;
  v_listing_title   text;
  v_deal_title      text;
  v_nda_status      text;
  v_fee_status      text;
  v_new_deal_id     uuid;
  v_existing_deal_id uuid;
BEGIN
  -- ── Step 1: Fetch the connection request ──────────────────────────────
  SELECT *
    INTO v_cr
    FROM public.connection_requests
   WHERE id = p_connection_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_pipeline_deal: connection_request not found: %', p_connection_request_id;
  END IF;

  -- ── Step 1b: Guard against duplicate deals ──────────────────────────────
  -- During the transition period, triggers may also create deals. Skip if one exists.
  SELECT dp.id INTO v_existing_deal_id
    FROM public.deal_pipeline dp
   WHERE dp.connection_request_id = p_connection_request_id
   LIMIT 1;

  IF v_existing_deal_id IS NOT NULL THEN
    -- Deal already exists for this connection request (likely created by trigger)
    RETURN v_existing_deal_id;
  END IF;

  -- ── Step 2: Ensure source (replaces trg_ensure_source_from_lead) ──────
  v_source := v_cr.source;

  IF v_cr.source_lead_id IS NOT NULL
     AND (v_source IS NULL OR v_source = 'marketplace')
  THEN
    SELECT il.source
      INTO v_lead_source
      FROM public.inbound_leads il
     WHERE il.id = v_cr.source_lead_id;

    IF v_lead_source IS NOT NULL THEN
      v_source := v_lead_source;
    END IF;
  END IF;

  -- Normalise: fall back to 'marketplace' if still null
  v_source := COALESCE(v_source, 'marketplace');

  -- ── Step 3: Compute buyer priority score ──────────────────────────────
  v_buyer_priority := 0;

  IF v_cr.user_id IS NOT NULL THEN
    SELECT p.buyer_type
      INTO v_buyer_type
      FROM public.profiles p
     WHERE p.id = v_cr.user_id;

    v_buyer_priority := COALESCE(
      public.calculate_buyer_priority_score(v_buyer_type),
      0
    );
  ELSE
    v_buyer_priority := COALESCE(v_cr.buyer_priority_score, 0);
  END IF;

  -- ── Step 4: Find the default stage (was 'New Inquiry', renamed to 'Approved') ─
  SELECT ds.id
    INTO v_stage_id
    FROM public.deal_stages ds
   WHERE ds.name IN ('Approved', 'New Inquiry')
   ORDER BY ds.position ASC
   LIMIT 1;

  IF v_stage_id IS NULL THEN
    -- Fallback: use the first stage by position
    SELECT ds.id INTO v_stage_id
      FROM public.deal_stages ds
     ORDER BY ds.position ASC
     LIMIT 1;
  END IF;

  IF v_stage_id IS NULL THEN
    RAISE EXCEPTION 'create_pipeline_deal: no deal_stages found';
  END IF;

  -- ── Step 5: Resolve buyer_contact_id and remarketing_buyer_id ─────────
  IF v_cr.user_id IS NOT NULL THEN
    SELECT c.id, c.remarketing_buyer_id
      INTO v_buyer_contact_id, v_remarketing_buyer_id
      FROM public.contacts c
     WHERE c.profile_id = v_cr.user_id
       AND c.contact_type = 'buyer'
       AND c.archived = false
     LIMIT 1;
  END IF;

  -- ── Step 6: Resolve seller_contact_id ─────────────────────────────────
  IF v_cr.listing_id IS NOT NULL THEN
    SELECT c.id
      INTO v_seller_contact_id
      FROM public.contacts c
     WHERE c.listing_id = v_cr.listing_id
       AND c.contact_type = 'seller'
       AND c.is_primary_seller_contact = true
       AND c.archived = false
     LIMIT 1;
  END IF;

  -- ── Step 7: Build deal title ──────────────────────────────────────────
  -- Resolve the contact name from the profile (preferred) or lead fields
  IF v_cr.user_id IS NOT NULL THEN
    SELECT COALESCE(p.first_name || ' ' || p.last_name, p.email)
      INTO v_contact_name
      FROM public.profiles p
     WHERE p.id = v_cr.user_id;
  END IF;
  v_contact_name := COALESCE(v_contact_name, v_cr.lead_name, 'Unknown');

  SELECT l.title
    INTO v_listing_title
    FROM public.listings l
   WHERE l.id = v_cr.listing_id;

  v_deal_title := v_contact_name || ' - ' || COALESCE(v_listing_title, 'Unknown Listing');

  -- ── Step 8: Derive NDA / fee agreement statuses from lead fields ──────
  v_nda_status := CASE
    WHEN COALESCE(v_cr.lead_nda_signed, false)     THEN 'signed'
    WHEN COALESCE(v_cr.lead_nda_email_sent, false)  THEN 'sent'
    ELSE 'not_sent'
  END;

  v_fee_status := CASE
    WHEN COALESCE(v_cr.lead_fee_agreement_signed, false)     THEN 'signed'
    WHEN COALESCE(v_cr.lead_fee_agreement_email_sent, false)  THEN 'sent'
    ELSE 'not_sent'
  END;

  -- ── Step 9: INSERT into deal_pipeline ─────────────────────────────────
  INSERT INTO public.deal_pipeline (
    listing_id,
    stage_id,
    connection_request_id,
    remarketing_buyer_id,
    value,
    probability,
    source,
    title,
    buyer_priority_score,
    nda_status,
    fee_agreement_status,
    created_at,
    stage_entered_at,
    buyer_contact_id,
    seller_contact_id
  ) VALUES (
    v_cr.listing_id,
    v_stage_id,
    v_cr.id,
    v_remarketing_buyer_id,
    0,                    -- value
    5,                    -- probability
    v_source,
    v_deal_title,
    v_buyer_priority,
    v_nda_status,
    v_fee_status,
    v_cr.created_at,
    v_cr.created_at,
    v_buyer_contact_id,
    v_seller_contact_id
  )
  RETURNING id INTO v_new_deal_id;

  RETURN v_new_deal_id;
END;
$$;

COMMENT ON FUNCTION public.create_pipeline_deal(uuid) IS
  'Phase 4 RPC: Replaces the 4-trigger chain that fired on connection_requests INSERT. '
  'Creates a deal_pipeline row from a connection_request in a single explicit call.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. update_agreement_status(p_firm_agreement_id, p_field, p_new_status)
-- ═══════════════════════════════════════════════════════════════════════════
-- Consolidates the agreement trigger chain into a single RPC:
--   - UPDATE firm_agreements with the new status
--   - INSERT into agreement_audit_log (replaces trg_log_agreement_status_change)
--   - Sync fee_agreement_status → remarketing_buyers (replaces
--     trg_sync_fee_agreement_to_remarketing)
--
-- The caller passes the specific field name ('nda_status' or
-- 'fee_agreement_status') to update. This makes the intent explicit
-- and removes hidden trigger ordering dependencies.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_agreement_status(
  p_firm_agreement_id uuid,
  p_field             text,
  p_new_status        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status      text;
  v_old_fee_signed  boolean;
  v_new_fee_signed  boolean;
  v_website_domain  text;
  v_agreement_type  text;
BEGIN
  -- ── Validate field name ───────────────────────────────────────────────
  IF p_field NOT IN ('nda_status', 'fee_agreement_status') THEN
    RAISE EXCEPTION 'update_agreement_status: invalid field "%". Must be nda_status or fee_agreement_status.', p_field;
  END IF;

  -- ── Determine agreement_type for the audit log ────────────────────────
  v_agreement_type := CASE
    WHEN p_field = 'nda_status' THEN 'nda'
    WHEN p_field = 'fee_agreement_status' THEN 'fee_agreement'
  END;

  -- ── Fetch current state ───────────────────────────────────────────────
  IF p_field = 'nda_status' THEN
    SELECT fa.nda_status
      INTO v_old_status
      FROM public.firm_agreements fa
     WHERE fa.id = p_firm_agreement_id;
  ELSE
    SELECT fa.fee_agreement_status, fa.fee_agreement_signed, fa.website_domain
      INTO v_old_status, v_old_fee_signed, v_website_domain
      FROM public.firm_agreements fa
     WHERE fa.id = p_firm_agreement_id;
  END IF;

  IF v_old_status IS NULL AND NOT FOUND THEN
    RAISE EXCEPTION 'update_agreement_status: firm_agreement not found: %', p_firm_agreement_id;
  END IF;

  -- ── Step 1: UPDATE firm_agreements ────────────────────────────────────
  IF p_field = 'nda_status' THEN
    UPDATE public.firm_agreements
       SET nda_status = p_new_status,
           nda_signed = (p_new_status = 'signed'),
           nda_signed_at = CASE
             WHEN p_new_status = 'signed' AND nda_signed_at IS NULL THEN now()
             ELSE nda_signed_at
           END,
           updated_at = now()
     WHERE id = p_firm_agreement_id;
  ELSE
    UPDATE public.firm_agreements
       SET fee_agreement_status = p_new_status,
           fee_agreement_signed = (p_new_status = 'signed'),
           fee_agreement_signed_at = CASE
             WHEN p_new_status = 'signed' AND fee_agreement_signed_at IS NULL THEN now()
             ELSE fee_agreement_signed_at
           END,
           updated_at = now()
     WHERE id = p_firm_agreement_id;
  END IF;

  -- ── Step 2: INSERT audit log (replaces trg_log_agreement_status_change)
  IF v_old_status IS DISTINCT FROM p_new_status THEN
    INSERT INTO public.agreement_audit_log (
      firm_id,
      agreement_type,
      old_status,
      new_status,
      changed_by,
      metadata
    ) VALUES (
      p_firm_agreement_id,
      v_agreement_type,
      v_old_status,
      p_new_status,
      auth.uid(),
      jsonb_build_object('via_rpc', true)
    );
  END IF;

  -- ── Step 3: Sync fee_agreement_status to remarketing_buyers ───────────
  --    (replaces trg_sync_fee_agreement_to_remarketing)
  --    Only applies when the fee_agreement_status field is changed.
  IF p_field = 'fee_agreement_status' THEN

    -- Re-fetch website_domain if we didn't already (shouldn't happen, but safe)
    IF v_website_domain IS NULL THEN
      SELECT fa.website_domain
        INTO v_website_domain
        FROM public.firm_agreements fa
       WHERE fa.id = p_firm_agreement_id;
    END IF;

    -- Determine the effective signed boolean values
    v_new_fee_signed := (p_new_status = 'signed');
    v_old_fee_signed := COALESCE(v_old_fee_signed, false);

    -- ── 3a: fee_agreement_status changed TO 'signed' ─────────────────
    IF p_new_status = 'signed' AND v_old_status IS DISTINCT FROM 'signed' THEN

      -- Direct link: remarketing_buyers with marketplace_firm_id match
      UPDATE public.remarketing_buyers
         SET has_fee_agreement   = true,
             fee_agreement_source = 'marketplace_synced'
       WHERE marketplace_firm_id = p_firm_agreement_id
         AND (has_fee_agreement IS NULL OR has_fee_agreement = false);

      -- Domain inheritance: PE firm website domain matches firm website_domain
      IF v_website_domain IS NOT NULL THEN
        UPDATE public.remarketing_buyers
           SET has_fee_agreement   = true,
               fee_agreement_source = 'pe_firm_inherited'
         WHERE pe_firm_website IS NOT NULL
           AND extract_domain(pe_firm_website) = v_website_domain
           AND (has_fee_agreement IS NULL OR has_fee_agreement = false);
      END IF;

    -- ── 3b: fee_agreement_status changed FROM 'signed' to something else
    ELSIF v_old_status = 'signed' AND p_new_status IS DISTINCT FROM 'signed' THEN

      -- Reverse direct sync — only for marketplace_synced, NOT manual_override
      UPDATE public.remarketing_buyers
         SET has_fee_agreement   = false,
             fee_agreement_source = NULL
       WHERE marketplace_firm_id = p_firm_agreement_id
         AND fee_agreement_source IN ('marketplace_synced', 'pe_firm_inherited');

      -- Reverse domain inheritance — only pe_firm_inherited, NOT manual_override
      IF v_website_domain IS NOT NULL THEN
        UPDATE public.remarketing_buyers
           SET has_fee_agreement   = false,
               fee_agreement_source = NULL
         WHERE pe_firm_website IS NOT NULL
           AND extract_domain(pe_firm_website) = v_website_domain
           AND fee_agreement_source = 'pe_firm_inherited';
      END IF;

    END IF;

  END IF;  -- end fee_agreement_status sync block

END;
$$;

COMMENT ON FUNCTION public.update_agreement_status(uuid, text, text) IS
  'Phase 4 RPC: Replaces the agreement trigger chain on firm_agreements. '
  'Updates the status, writes to agreement_audit_log, and syncs '
  'fee_agreement changes to remarketing_buyers in one explicit call.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. TRANSITION SAFETY NOTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The following triggers are NOT dropped by this migration. They remain
-- active as a safety net during the transition period:
--
--   ON connection_requests:
--     - trg_ensure_source_from_lead
--     - trigger on create_deal_from_connection_request()
--     - trigger on auto_create_deal_from_connection_request()
--     - trigger on create_deal_on_request_approval()
--
--   ON firm_agreements:
--     - trg_log_agreement_status_change
--     - trg_sync_fee_agreement_to_remarketing
--     - trg_sync_agreement_status_from_booleans
--
-- Once the RPC-based code paths have been verified in production and all
-- callers have been migrated:
--
--   1. Monitor for duplicate deal_pipeline rows (trigger + RPC both firing)
--   2. Confirm audit_log entries are created exclusively via the RPC
--   3. Verify remarketing_buyers sync is correct
--   4. Create a follow-up migration to DROP the triggers:
--
--      DROP TRIGGER IF EXISTS trg_ensure_source_from_lead ON public.connection_requests;
--      DROP TRIGGER IF EXISTS <deal_creation_trigger> ON public.connection_requests;
--      DROP TRIGGER IF EXISTS trg_log_agreement_status_change ON public.firm_agreements;
--      DROP TRIGGER IF EXISTS trg_sync_fee_agreement_to_remarketing ON public.firm_agreements;
--
-- ═══════════════════════════════════════════════════════════════════════════
