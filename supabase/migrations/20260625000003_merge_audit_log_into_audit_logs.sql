-- ============================================================================
-- MIGRATION: Merge audit_log (singular) into audit_logs (plural)
-- ============================================================================
-- Part of the database-duplicates remediation plan tracked in
-- DATABASE_DUPLICATES_AUDIT_2026-04-09.md §1.5.
--
-- Two parallel audit tables coexist today:
--
--   * public.audit_logs   (plural)  — created 20260203000000_audit_logging.sql
--     Business-entity audit: action, entity_type, entity_id, user_id,
--     old_values, new_values, changed_fields, ip_address, user_agent,
--     reason, request_id, created_at. Written by log_audit_event() RPC
--     and audit_score_changes() trigger on the scores table.
--
--   * public.audit_log    (singular) — created 20260223100000_database_hardening.sql
--     Generic table audit: table_name, record_id, action, old_data,
--     new_data, performed_by, ip_address, user_agent, created_at.
--     Written by generic_audit_trigger() on deals, listings,
--     connection_requests, and (per 20260506000000) buyer_introductions.
--
-- Both are live. The singular/plural split is a foot-gun and the two
-- schemas cover the same ground with different column names. This
-- migration consolidates everything onto audit_logs by:
--
--   1. Back-filling every row from audit_log into audit_logs with a
--      column-name translation (table_name → entity_type, record_id →
--      entity_id, old_data → old_values, new_data → new_values,
--      performed_by → user_id). Action values are lower-cased and the
--      SELECT/LOGIN/LOGOUT/EXPORT values are mapped to view/login/logout/
--      export to fit the audit_logs convention. Primary key is preserved
--      with ON CONFLICT DO NOTHING so the migration is idempotent.
--
--   2. Rewriting public.generic_audit_trigger() to target audit_logs
--      using the canonical column names. All triggers that reference
--      this function (audit_deals_trigger, audit_listings_trigger,
--      audit_connection_requests_trigger, audit_buyer_introductions_trigger)
--      automatically pick up the new body via CREATE OR REPLACE.
--
--   3. Dropping public.audit_log and its policies/indexes.
--
-- After this migration:
--   * audit_logs is the single generic audit destination.
--   * permission_audit_log, data_room_audit_log, agreement_audit_log
--     remain untouched (domain-specific, out of scope).
-- ============================================================================


-- ─── 1. Back-fill audit_log → audit_logs ──────────────────────────────────
-- Guarded by table existence so replay on a post-merge schema is a no-op.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'audit_log') THEN

    INSERT INTO public.audit_logs (
      id,
      user_id,
      action,
      entity_type,
      entity_id,
      old_values,
      new_values,
      ip_address,
      user_agent,
      created_at
    )
    SELECT
      al.id,
      al.performed_by,
      CASE al.action
        WHEN 'INSERT' THEN 'create'
        WHEN 'UPDATE' THEN 'update'
        WHEN 'DELETE' THEN 'delete'
        WHEN 'SELECT' THEN 'view'
        WHEN 'LOGIN'  THEN 'login'
        WHEN 'LOGOUT' THEN 'logout'
        WHEN 'EXPORT' THEN 'export'
        ELSE lower(al.action)
      END,
      al.table_name,
      al.record_id,
      al.old_data,
      al.new_data,
      al.ip_address,
      al.user_agent,
      al.created_at
    FROM public.audit_log al
    ON CONFLICT (id) DO NOTHING;

  END IF;
END $$;


-- ─── 2. Repoint generic_audit_trigger at audit_logs ───────────────────────
-- The function body below writes to audit_logs using the canonical column
-- names. All existing triggers that reference generic_audit_trigger
-- (audit_deals_trigger, audit_listings_trigger,
-- audit_connection_requests_trigger, audit_buyer_introductions_trigger)
-- pick up the new body through CREATE OR REPLACE — no trigger recreation
-- needed.

CREATE OR REPLACE FUNCTION public.generic_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      entity_type, entity_id, action, new_values, user_id
    )
    VALUES (
      TG_TABLE_NAME::text, NEW.id, 'create', to_jsonb(NEW), auth.uid()
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO public.audit_logs (
        entity_type, entity_id, action, old_values, new_values, user_id
      )
      VALUES (
        TG_TABLE_NAME::text, NEW.id, 'update',
        to_jsonb(OLD), to_jsonb(NEW), auth.uid()
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      entity_type, entity_id, action, old_values, user_id
    )
    VALUES (
      TG_TABLE_NAME::text, OLD.id, 'delete', to_jsonb(OLD), auth.uid()
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.generic_audit_trigger() IS
  'Generic audit trigger. Writes INSERT/UPDATE/DELETE events to audit_logs '
  '(merged from the deprecated audit_log singular table in 20260625). '
  'Action values are lowercased: INSERT→create, UPDATE→update, DELETE→delete. '
  'Table name is stored in entity_type; primary key in entity_id.';


-- ─── 3. Drop the legacy audit_log table ───────────────────────────────────
-- Drop policies explicitly so the table can be removed cleanly. CASCADE is
-- not used: if anything unexpectedly still depends on audit_log the drop
-- should fail loudly.

DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;
DROP POLICY IF EXISTS "Service role can insert audit log" ON public.audit_log;
DROP POLICY IF EXISTS "Admins can insert audit log" ON public.audit_log;

DROP TABLE IF EXISTS public.audit_log;


-- ─── 4. Document the canonical table ──────────────────────────────────────

COMMENT ON TABLE public.audit_logs IS
  'Canonical audit event store for the platform. Written by log_audit_event() '
  'RPC (application-layer events) and generic_audit_trigger() (row-level '
  'INSERT/UPDATE/DELETE on deals, listings, connection_requests, '
  'buyer_introductions). Replaces the deprecated audit_log singular table '
  'which was merged here on 20260625. Domain-specific audit tables '
  '(permission_audit_log, data_room_audit_log, agreement_audit_log) remain '
  'separate. See DATABASE_DUPLICATES_AUDIT_2026-04-09.md §1.5.';
