-- ============================================================
-- Smartlead GP Response Automation
-- Adds columns for auto-creating GP partner deals from
-- Smartlead replies, phone enrichment tracking, and seeds
-- the "Smartlead GP Responses" calling list.
-- ============================================================

-- 1. Listings: link back to smartlead reply that created the deal
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS smartlead_reply_inbox_id uuid,
  ADD COLUMN IF NOT EXISTS smartlead_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS smartlead_ai_category text,
  ADD COLUMN IF NOT EXISTS auto_created_from_smartlead boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_listings_smartlead_reply
  ON public.listings(smartlead_reply_inbox_id)
  WHERE smartlead_reply_inbox_id IS NOT NULL;

-- 2. Reply inbox: phone enrichment tracking
ALTER TABLE public.smartlead_reply_inbox
  ADD COLUMN IF NOT EXISTS phone_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_enrichment_source text,
  ADD COLUMN IF NOT EXISTS phone_enrichment_linkedin_url text;

-- 3. Index for GP campaign filtering
CREATE INDEX IF NOT EXISTS idx_smartlead_reply_inbox_campaign_name
  ON public.smartlead_reply_inbox(campaign_name);

-- 4. Seed the permanent "Smartlead GP Responses" calling list
DO $$
DECLARE
  v_list_id uuid;
BEGIN
  SELECT id INTO v_list_id
    FROM public.contact_lists
   WHERE name = 'Smartlead GP Responses'
     AND is_archived = false
   LIMIT 1;

  IF v_list_id IS NULL THEN
    INSERT INTO public.contact_lists (name, description, list_type, tags, contact_count)
    VALUES (
      'Smartlead GP Responses',
      'Auto-populated from Smartlead GP campaign replies where contact has a phone number. Loadable daily for dialing.',
      'mixed',
      ARRAY['smartlead', 'gp', 'auto-populated', 'calling'],
      0
    );
  END IF;
END $$;
