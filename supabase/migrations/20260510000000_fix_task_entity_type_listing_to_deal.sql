-- Fix task entity linking: extraction pipeline was writing entity_type='listing'
-- but the UI queries entity_type='deal'. Migrate all 'listing' references to 'deal'.

-- 1. Fix primary entity_type from 'listing' to 'deal'
UPDATE daily_standup_tasks
SET entity_type = 'deal',
    updated_at = now()
WHERE entity_type = 'listing';

-- 2. Fix secondary entity_type from 'listing' to 'deal'
UPDATE daily_standup_tasks
SET secondary_entity_type = 'deal',
    updated_at = now()
WHERE secondary_entity_type = 'listing';

-- 3. Backfill entity_type/entity_id from deal_id for tasks that have
--    a deal_id but no entity linkage (created before entity columns existed)
UPDATE daily_standup_tasks
SET entity_type = 'deal',
    entity_id = deal_id,
    updated_at = now()
WHERE deal_id IS NOT NULL
  AND entity_id IS NULL;
