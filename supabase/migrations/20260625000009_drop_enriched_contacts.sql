-- ============================================================================
-- MIGRATION: Drop enriched_contacts table
-- ============================================================================
-- Part of the contact consolidation strategy (phase 4 — final cutover).
--
-- enriched_contacts was a workspace-scoped enrichment cache written by
-- Clay webhooks, find-contacts, enrich-list-contacts, and the AI command
-- center enrichment tools. All of these writers have been migrated to
-- contacts_upsert() which writes to the canonical contacts table and
-- appends history to contact_events.
--
-- The single remaining reader (searchEnrichedContacts in
-- ai-command-center/tools/contact-tools.ts) has been removed — the
-- canonical contacts table now contains all enrichment data.
--
-- The historical data was backfilled into contact_events in migration
-- 20260625000005_create_contact_events.sql.
--
-- contact_search_cache and contact_search_log (created in the same
-- original migration 20260310000000) are retained — they serve a
-- different purpose (7-day API dedup cache and search audit trail).
-- ============================================================================

-- Drop RLS policies
DROP POLICY IF EXISTS enriched_contacts_select ON public.enriched_contacts;
DROP POLICY IF EXISTS enriched_contacts_service_insert ON public.enriched_contacts;
DROP POLICY IF EXISTS enriched_contacts_service_update ON public.enriched_contacts;

-- Drop the trigger if one exists
DROP TRIGGER IF EXISTS trg_enriched_contacts_updated_at ON public.enriched_contacts;

-- Drop the table
DROP TABLE IF EXISTS public.enriched_contacts;
