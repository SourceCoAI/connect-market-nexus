-- ============================================================================
-- FIX: audit_buyer_changes trigger references dropped deal_breakers column
--
-- The deal_breakers column was dropped in migration 20260221000000 but the
-- audit trigger (created in 20260203_audit_logging.sql) still references it
-- at line 181: OLD.deal_breakers IS DISTINCT FROM NEW.deal_breakers
--
-- This causes EVERY UPDATE on the buyers table to fail, including the
-- buyer CSV import's "link to universe" operation.
--
-- Fix: Recreate the function without the deal_breakers reference.
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_buyer_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_sensitive_fields TEXT[] := ARRAY['thesis_summary', 'target_geographies', 'target_revenue_min', 'target_revenue_max'];
  v_changed_sensitive BOOLEAN := false;
BEGIN
  -- Check if any sensitive fields changed
  IF TG_OP = 'UPDATE' THEN
    v_changed_sensitive := (
      OLD.thesis_summary IS DISTINCT FROM NEW.thesis_summary OR
      OLD.target_geographies IS DISTINCT FROM NEW.target_geographies OR
      OLD.target_revenue_min IS DISTINCT FROM NEW.target_revenue_min OR
      OLD.target_revenue_max IS DISTINCT FROM NEW.target_revenue_max
    );
  END IF;

  -- Only log if sensitive fields changed or it's a create/delete
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' OR v_changed_sensitive THEN
    PERFORM log_audit_event(
      auth.uid(),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true),
      LOWER(TG_OP),
      'buyer',
      COALESCE(NEW.id, OLD.id),
      CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) END,
      CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) END,
      NULL
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
