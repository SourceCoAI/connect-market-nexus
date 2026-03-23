-- ============================================================
-- Clean up non-deal tasks: hard delete platform/operations tasks,
-- reclassify generic call/email tasks that reference a deal,
-- delete orphan generic tasks with no deal link.
-- ============================================================

-- Step 1: Delete deal_activities referencing platform/operations tasks
DELETE FROM deal_activities
WHERE (metadata->>'task_id') IN (
  SELECT id::text FROM daily_standup_tasks
  WHERE task_category IN ('platform_task', 'operations_task')
);

-- Step 2: Hard delete all platform and operations tasks
DELETE FROM daily_standup_tasks
WHERE task_category IN ('platform_task', 'operations_task');

-- Step 3: Reclassify generic 'call' tasks that have a deal link → contact_owner
UPDATE daily_standup_tasks
SET task_type = 'contact_owner'
WHERE task_type = 'call'
  AND (deal_id IS NOT NULL OR entity_type = 'deal');

-- Step 4: Reclassify generic 'call' tasks that reference a buyer → follow_up_with_buyer
UPDATE daily_standup_tasks
SET task_type = 'follow_up_with_buyer'
WHERE task_type = 'call'
  AND entity_type = 'buyer';

-- Step 5: Reclassify generic 'email' tasks that have a deal link → send_materials
UPDATE daily_standup_tasks
SET task_type = 'send_materials'
WHERE task_type = 'email'
  AND (deal_id IS NOT NULL OR entity_type = 'deal');

-- Step 6: Reclassify generic 'email' tasks that reference a buyer → follow_up_with_buyer
UPDATE daily_standup_tasks
SET task_type = 'follow_up_with_buyer'
WHERE task_type = 'email'
  AND entity_type = 'buyer';

-- Step 7: Delete remaining generic call/email/other tasks with no deal or buyer link
DELETE FROM deal_activities
WHERE (metadata->>'task_id') IN (
  SELECT id::text FROM daily_standup_tasks
  WHERE task_type IN ('call', 'email', 'other')
    AND deal_id IS NULL
    AND entity_type IS NULL
);

DELETE FROM daily_standup_tasks
WHERE task_type IN ('call', 'email', 'other')
  AND deal_id IS NULL
  AND entity_type IS NULL;

-- Step 8: Reclassify any remaining 'other' tasks that DO have a deal link → follow_up_with_buyer
-- (they survived because they have a deal reference, so they're deal-related but miscategorized)
UPDATE daily_standup_tasks
SET task_type = 'follow_up_with_buyer',
    task_category = 'deal_task'
WHERE task_type = 'other'
  AND (deal_id IS NOT NULL OR entity_type IN ('deal', 'buyer'));

-- Step 9: Ensure all surviving tasks are marked as deal_task category
UPDATE daily_standup_tasks
SET task_category = 'deal_task'
WHERE task_category != 'deal_task';
