// ── Stale table definitions in the auto-generated types ──────────────
// The tables listed below have been DROPPED from the database but their
// type definitions still exist in the Supabase-generated file:
//
//   src/integrations/supabase/types.ts
//
// On the next `supabase gen types typescript` run these entries will
// disappear automatically.  Until then, this file serves as
// documentation so that developers know NOT to rely on these types.
//
// Last audited: 2026-03-04
// Source file size at audit: ~12,899 lines

// ─────────────────────────────────────────────────────────────────────
// STALE (still present in types.ts -- remove on next regeneration)
// ─────────────────────────────────────────────────────────────────────

/**
 * Tables whose definitions are STILL present in types.ts despite the
 * underlying database table having been dropped.
 *
 * Each entry notes the approximate line number in types.ts where the
 * stale definition begins, so reviewers can verify.
 */
export const STALE_TABLE_DEFINITIONS = [
  { table: 'buyer_contacts', approxLine: 534, status: 'dropped' },
  { table: 'buyer_deal_scores', approxLine: 670, status: 'dropped' },
  { table: 'engagement_scores', approxLine: 5199, status: 'being dropped in new migration' },
] as const;

// ─────────────────────────────────────────────────────────────────────
// ALREADY CLEANED (not found in types.ts -- no action needed)
// ─────────────────────────────────────────────────────────────────────

/**
 * Tables that were dropped AND whose definitions have already been
 * removed from types.ts (or were never present).  Listed here for
 * completeness so the audit trail is clear.
 */
export const ALREADY_REMOVED_TABLE_DEFINITIONS = [
  'deal_notes',
  'listing_messages',
  'chat_recommendations',
  'chat_smart_suggestions',
  'pe_firm_contacts',
  'platform_contacts',
  'tracker_activity_logs',
  'lead_sources',
  'scoring_weights_history',
  'listing_personal_notes',
  'profile_data_snapshots',
] as const;

// ─────────────────────────────────────────────────────────────────────
// Helper types (optional -- use if you want compile-time awareness)
// ─────────────────────────────────────────────────────────────────────

/** Union of table names that are stale in the generated types file. */
export type StaleTableName = (typeof STALE_TABLE_DEFINITIONS)[number]['table'];

/** Union of table names already cleaned from the generated types file. */
export type AlreadyRemovedTableName = (typeof ALREADY_REMOVED_TABLE_DEFINITIONS)[number];
