-- ============================================================================
-- MIGRATION: Migrate deal_pipeline contact fields to their canonical locations
--
-- The contact_* columns on deal_pipeline duplicate data that belongs on
-- connection_requests (for marketplace deals) or contacts (for manual deals).
--
-- This migration:
--   1. Verifies marketplace deal contact data matches connection_requests
--   2. Migrates orphaned manual-deal contact data to the contacts table
--   3. Does NOT drop columns yet — that happens in a separate migration
--      so production data can be verified between steps.
-- ============================================================================

BEGIN;

-- ─── Step 1: Log mismatches between deal_pipeline.contact_* and connection_requests.lead_* ───
-- This is informational only. If there are mismatches, they'll be logged
-- but won't block the migration.
DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM public.deal_pipeline dp
  JOIN public.connection_requests cr ON cr.id = dp.connection_request_id
  WHERE dp.connection_request_id IS NOT NULL
    AND dp.contact_email IS NOT NULL
    AND (
      dp.contact_email IS DISTINCT FROM cr.lead_email
      OR dp.contact_name IS DISTINCT FROM cr.lead_name
    );

  RAISE NOTICE 'Contact field mismatches between deal_pipeline and connection_requests: %', mismatch_count;
END;
$$;


-- ─── Step 2: For manual deals (no connection_request_id) that have contact data ───
-- but no buyer_contact_id, migrate to the contacts table.
INSERT INTO public.contacts (
  first_name, last_name, email, phone, title,
  contact_type, source, created_at, updated_at
)
SELECT
  COALESCE(NULLIF(TRIM(split_part(dp.contact_name, ' ', 1)), ''), dp.contact_name),
  CASE WHEN position(' ' IN COALESCE(dp.contact_name, '')) > 0
       THEN TRIM(substring(dp.contact_name FROM position(' ' IN dp.contact_name) + 1))
       ELSE '' END,
  LOWER(TRIM(dp.contact_email)),
  dp.contact_phone,
  dp.contact_role,
  'buyer',
  'deal_migration',
  NOW(), NOW()
FROM public.deal_pipeline dp
WHERE dp.connection_request_id IS NULL
  AND dp.buyer_contact_id IS NULL
  AND dp.contact_email IS NOT NULL
  AND TRIM(dp.contact_email) != ''
ON CONFLICT DO NOTHING;


-- ─── Step 3: Link newly created contacts back to deal_pipeline via buyer_contact_id ───
UPDATE public.deal_pipeline dp
SET buyer_contact_id = c.id
FROM public.contacts c
WHERE dp.connection_request_id IS NULL
  AND dp.buyer_contact_id IS NULL
  AND dp.contact_email IS NOT NULL
  AND TRIM(dp.contact_email) != ''
  AND LOWER(TRIM(dp.contact_email)) = c.email
  AND c.source = 'deal_migration';


-- ─── Step 4: Log migration results ───
DO $$
DECLARE
  migrated_count integer;
  still_unlinked integer;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM public.deal_pipeline
  WHERE connection_request_id IS NULL
    AND buyer_contact_id IS NOT NULL
    AND buyer_contact_id IN (SELECT id FROM public.contacts WHERE source = 'deal_migration');

  SELECT COUNT(*) INTO still_unlinked
  FROM public.deal_pipeline
  WHERE connection_request_id IS NULL
    AND buyer_contact_id IS NULL
    AND contact_email IS NOT NULL
    AND TRIM(contact_email) != '';

  RAISE NOTICE 'Manual deals linked to new contacts: %', migrated_count;
  RAISE NOTICE 'Manual deals still unlinked (empty email?): %', still_unlinked;
END;
$$;

COMMIT;
