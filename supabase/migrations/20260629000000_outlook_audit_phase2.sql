-- =============================================================================
-- Outlook Email Integration — Audit Phase 2
-- Addresses performance and data integrity issues from comprehensive audit.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add partial index for platform_sent placeholder dedup query
--    The sync engine queries email_messages with
--    LIKE 'platform_sent_%' to match outbound emails sent via the platform
--    against the real Graph message IDs that arrive later.
--    Without this index, the LIKE query does a sequential scan.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_email_messages_platform_sent
  ON public.email_messages(sourceco_user_id, from_address, sent_at)
  WHERE microsoft_message_id LIKE 'platform_sent_%';

-- ---------------------------------------------------------------------------
-- 2. Trigger to keep email_messages.deal_id in sync when deals change
--    contacts. When a deal's buyer_contact_id or seller_contact_id changes,
--    update the deal_id on existing email_messages for those contacts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_email_messages_deal_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- When buyer contact changes on a deal
  IF NEW.buyer_contact_id IS DISTINCT FROM OLD.buyer_contact_id THEN
    -- Clear old buyer's email deal_id for this deal
    IF OLD.buyer_contact_id IS NOT NULL THEN
      UPDATE public.email_messages
      SET deal_id = NULL
      WHERE contact_id = OLD.buyer_contact_id AND deal_id = OLD.id;
    END IF;
    -- Set new buyer's emails to this deal
    IF NEW.buyer_contact_id IS NOT NULL THEN
      UPDATE public.email_messages
      SET deal_id = NEW.id
      WHERE contact_id = NEW.buyer_contact_id AND deal_id IS NULL;
    END IF;
  END IF;

  -- Same logic for seller_contact_id
  IF NEW.seller_contact_id IS DISTINCT FROM OLD.seller_contact_id THEN
    IF OLD.seller_contact_id IS NOT NULL THEN
      UPDATE public.email_messages
      SET deal_id = NULL
      WHERE contact_id = OLD.seller_contact_id AND deal_id = OLD.id;
    END IF;
    IF NEW.seller_contact_id IS NOT NULL THEN
      UPDATE public.email_messages
      SET deal_id = NEW.id
      WHERE contact_id = NEW.seller_contact_id AND deal_id IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deals_update_email_deal_id
  AFTER UPDATE OF buyer_contact_id, seller_contact_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.update_email_messages_deal_id();

-- ---------------------------------------------------------------------------
-- 3. Backfill deal_id for existing email_messages where it is NULL
--    Links emails to deals via buyer_contact_id or seller_contact_id.
-- ---------------------------------------------------------------------------
UPDATE public.email_messages em
SET deal_id = d.id
FROM public.deals d
WHERE em.deal_id IS NULL
  AND (d.buyer_contact_id = em.contact_id OR d.seller_contact_id = em.contact_id)
  AND d.stage NOT IN ('lost', 'archived');
