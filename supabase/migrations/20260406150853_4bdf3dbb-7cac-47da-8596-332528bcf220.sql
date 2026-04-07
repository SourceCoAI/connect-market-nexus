
-- 1. Replace check_data_room_access RPC with dual-ID awareness
CREATE OR REPLACE FUNCTION public.check_data_room_access(
  p_deal_id uuid,
  p_user_id uuid,
  p_category text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM data_room_access a
    WHERE a.marketplace_user_id = p_user_id
      AND a.revoked_at IS NULL
      AND (a.expires_at IS NULL OR a.expires_at > now())
      AND (
        a.deal_id = p_deal_id
        OR
        a.deal_id IN (SELECT l.id FROM listings l WHERE l.source_deal_id = p_deal_id)
      )
      AND (
        (p_category = 'anonymous_teaser' AND a.can_view_teaser = true)
        OR (p_category = 'full_memo' AND a.can_view_full_memo = true)
        OR (p_category = 'data_room' AND a.can_view_data_room = true)
      )
  );
$$;

-- 2. Drop and recreate RLS policy on data_room_documents for buyers
DROP POLICY IF EXISTS "Buyers can view granted documents" ON data_room_documents;

CREATE POLICY "Buyers can view granted documents"
ON data_room_documents
FOR SELECT
TO authenticated
USING (
  status = 'active'
  AND EXISTS (
    SELECT 1
    FROM data_room_access a
    WHERE a.marketplace_user_id = auth.uid()
      AND a.revoked_at IS NULL
      AND (a.expires_at IS NULL OR a.expires_at > now())
      AND (
        a.deal_id = data_room_documents.deal_id
        OR
        a.deal_id IN (SELECT l.id FROM listings l WHERE l.source_deal_id = data_room_documents.deal_id)
      )
      AND (
        (data_room_documents.document_category = 'anonymous_teaser' AND a.can_view_teaser = true)
        OR (data_room_documents.document_category = 'full_memo' AND a.can_view_full_memo = true)
        OR (data_room_documents.document_category = 'data_room' AND a.can_view_data_room = true)
      )
  )
);

-- 3. Create trigger function to auto-upgrade access on fee agreement signing
CREATE OR REPLACE FUNCTION public.auto_upgrade_access_on_fee_agreement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.fee_agreement_status = 'signed'
     AND (OLD.fee_agreement_status IS DISTINCT FROM 'signed') THEN

    UPDATE data_room_access
    SET can_view_full_memo = true,
        can_view_data_room = true
    WHERE marketplace_user_id IN (
      SELECT p.id
      FROM profiles p
      WHERE p.company = NEW.primary_company_name
    )
    AND revoked_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Create the trigger
DROP TRIGGER IF EXISTS trg_auto_upgrade_data_room_on_fee_sign ON firm_agreements;

CREATE TRIGGER trg_auto_upgrade_data_room_on_fee_sign
AFTER UPDATE ON firm_agreements
FOR EACH ROW
EXECUTE FUNCTION public.auto_upgrade_access_on_fee_agreement();
