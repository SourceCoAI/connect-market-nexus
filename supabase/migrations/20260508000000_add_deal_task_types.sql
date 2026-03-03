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
