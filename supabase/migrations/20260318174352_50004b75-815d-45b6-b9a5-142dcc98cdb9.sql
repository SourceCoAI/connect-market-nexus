-- Fix cascade trigger: only cascade to tables that have deleted_at
CREATE OR REPLACE FUNCTION public.cascade_soft_delete_listing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.deal_pipeline SET deleted_at = NEW.deleted_at WHERE listing_id = NEW.id AND deleted_at IS NULL;
  END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE public.deal_pipeline SET deleted_at = NULL WHERE listing_id = NEW.id AND deleted_at = OLD.deleted_at;
  END IF;
  RETURN NEW;
END;
$function$;

-- Soft-delete the test Pennfire listing
UPDATE listings SET deleted_at = now() WHERE id = '92989d26-6f72-4861-b547-b052564c4511';

-- Clear stale Smartlead inbox link
UPDATE smartlead_reply_inbox SET linked_deal_id = NULL WHERE id = '7fd3fcdc-6a71-4e19-a17d-fb9aa8efb5d0';