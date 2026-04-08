-- Add deal-specific task types: call, email, find_buyers, contact_buyers

-- Drop existing constraint
DO $$
BEGIN
  ALTER TABLE public.daily_standup_tasks
    DROP CONSTRAINT IF EXISTS dst_task_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Re-create with new values included
ALTER TABLE public.daily_standup_tasks
  ADD CONSTRAINT dst_task_type_check
    CHECK (task_type IN (
      'contact_owner','build_buyer_universe','follow_up_with_buyer',
      'send_materials','update_pipeline','schedule_call',
      'nda_execution','ioi_loi_process','due_diligence',
      'buyer_qualification','seller_relationship','buyer_ic_followup',
      'other',
      'call','email','find_buyers','contact_buyers'
    ))
    NOT VALID;

ALTER TABLE public.daily_standup_tasks VALIDATE CONSTRAINT dst_task_type_check;

-- Merged from: 20260508000000_add_structured_contact_fields_to_listings.sql
-- Add structured contact fields to listings table
-- Replaces the freeform internal_contact_info textarea with
-- separate first name, last name, email, phone, and LinkedIn fields
-- that map directly to the deal's main contact data.

ALTER TABLE listings
ADD COLUMN IF NOT EXISTS main_contact_first_name TEXT,
ADD COLUMN IF NOT EXISTS main_contact_last_name TEXT,
ADD COLUMN IF NOT EXISTS main_contact_linkedin TEXT;

-- Backfill: split existing main_contact_name into first/last
UPDATE listings
SET
  main_contact_first_name = split_part(main_contact_name, ' ', 1),
  main_contact_last_name = CASE
    WHEN position(' ' in coalesce(main_contact_name, '')) > 0
    THEN substring(main_contact_name from position(' ' in main_contact_name) + 1)
    ELSE NULL
  END
WHERE main_contact_name IS NOT NULL
  AND main_contact_first_name IS NULL;

COMMENT ON COLUMN listings.main_contact_first_name IS
'Primary seller contact first name — synced from deal contact';

COMMENT ON COLUMN listings.main_contact_last_name IS
'Primary seller contact last name — synced from deal contact';

COMMENT ON COLUMN listings.main_contact_linkedin IS
'Primary seller contact LinkedIn profile URL — synced from deal contact';
