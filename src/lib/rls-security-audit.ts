/**
 * rls-security-audit.ts — RLS Policy Gap Documentation
 *
 * This file documents the state of Row Level Security (RLS) policies
 * across the Supabase database, including gaps identified during the
 * security hardening audit.
 *
 * LAST AUDIT DATE: 2026-02-23
 *
 * KEY MIGRATIONS THAT ADDRESSED RLS:
 * - 20260222300000_database_hardening.sql        — Initial RLS + FK hardening
 * - 20260301000000_rls_security_hardening.sql     — Phase 1: Fixed USING(true) policies
 * - 20260303100000_security_hardening_phase2.sql  — Phase 2: Added missing RLS, auth guards
 *
 * SUMMARY OF CURRENT STATE:
 * ========================
 *
 * FULLY SECURED (RLS enabled + proper policies):
 * -----------------------------------------------
 * - profiles              — Users can read/update own; admins have full access
 * - listings              — Public SELECT for active; admin full CRUD
 * - connection_requests   — Users see own + admin full access (Phase 2: A2)
 * - saved_listings        — Users manage own + admin full access (Phase 2: A1)
 * - deals                 — Admin-only via is_admin() check
 * - deal_stages           — Admin-only
 * - deal_activities       — Admin-only
 * - deal_tasks            — Admin-only
 * - deal_contacts         — Admin-only
 * - data_room_access      — Admin + service_role
 * - data_room_documents   — Admin + service_role + buyer access via RLS
 * - data_room_audit_log   — Admin + service_role
 * - lead_memos            — Admin + service_role
 * - memo_distribution_log — Admin + service_role
 * - user_sessions         — Users update own + anonymous tracking (Phase 1: #1)
 * - page_views            — Own data + anonymous tracking (Phase 1: #7)
 * - user_events           — Own data + anonymous tracking (Phase 1: #8)
 * - listing_analytics     — Own data + anonymous tracking (Phase 1: #9)
 * - search_analytics      — Own data + anonymous tracking (Phase 1: #10)
 * - otp_rate_limits       — Admin-only SELECT (Phase 1: #2)
 * - registration_funnel   — Public INSERT + admin SELECT (Phase 1: #3)
 * - daily_metrics         — Admin-only (Phase 1: #4)
 * - alert_delivery_logs   — Admin-only (Phase 1: #5)
 * - cron_job_logs         — Admin-only SELECT (Phase 1: #6)
 * - admin_notifications   — Admin + service_role INSERT/SELECT (Phase 2: B2)
 * - user_notifications    — Admin + service_role INSERT; user own SELECT (Phase 2: B3)
 * - buyers                — Admin-only (Phase 2: B1 removed USING(true))
 * - connection_messages   — User own + admin full access
 * - user_journeys         — Service role only (Phase 2: B4)
 * - contacts              — Admin-only
 * - firm_agreements       — Admin-only
 *
 * SECURITY DEFINER RPCs WITH AUTH GUARDS:
 * ----------------------------------------
 * - get_deals_with_details()       — admin-only (Phase 2: D1)
 * - reset_all_admin_notifications() — admin-only (Phase 2: D2)
 * - restore_soft_deleted()         — admin-only (Phase 2: D3)
 * - get_deal_access_matrix()       — admin-only (Phase 2: D4)
 * - get_deal_distribution_log()    — admin-only (Phase 2: D5)
 * - get_buyer_deal_history()       — admin-only (Phase 2: D6)
 *
 * REMAINING GAPS / LOW PRIORITY:
 * --------------------------------
 * 1. geographic_adjacency — Uses `profiles.role = 'admin'` for write policy
 *    instead of `public.is_admin(auth.uid())`. Low risk because this is
 *    reference data that admins rarely modify. The SELECT is USING(true)
 *    which is correct (public read for reference data).
 *    RECOMMENDATION: Update write policy to use is_admin() in next migration.
 *
 * 2. enrichment_queue — Uses `profiles.role = 'admin'` instead of is_admin().
 *    Same pattern as geographic_adjacency.
 *    RECOMMENDATION: Update to use is_admin() in next migration.
 *
 * 3. Some older chatbot tables (chat_conversations, chat_messages, etc.)
 *    may have overly permissive policies from their initial creation.
 *    RECOMMENDATION: Audit chatbot table policies in a dedicated migration.
 *
 * 4. Legacy `profiles.role = 'admin'` checks in some migration functions.
 *    The Phase 2 migration standardized the main tables, but some edge
 *    functions and trigger functions may still use the old pattern.
 *    RECOMMENDATION: Grep for `role = 'admin'` in edge functions.
 *
 * CLIENT-SIDE SECURITY MEASURES:
 * --------------------------------
 * - All Supabase queries use parameterized inputs via .eq(), .filter(), etc.
 *   No raw SQL is constructed client-side.
 * - PRIVILEGED_FIELDS array in useNuclearAuth strips is_admin, approval_status,
 *   email_verified, role, id, email from client-side profile updates.
 * - is_admin flag is synced from user_roles table via database trigger
 *   (not settable by client).
 * - dangerouslySetInnerHTML usages are protected by DOMPurify sanitization.
 * - innerHTML usages for plain text extraction have been replaced with
 *   sanitize.ts stripHtml() utility.
 */

export const RLS_AUDIT_VERSION = '2026-02-23';
export const RLS_AUDIT_STATUS = 'PASS' as const;
