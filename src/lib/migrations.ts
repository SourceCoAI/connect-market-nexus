/**
 * Migration History Documentation
 *
 * This file documents all database migrations in the project, providing a
 * single-source-of-truth for understanding the evolution of the database schema.
 *
 * Each entry contains:
 *  - id:      The migration timestamp prefix (matches the SQL file name)
 *  - date:    Human-readable date the migration was created
 *  - purpose: Short description of what the migration does
 *  - tables:  Tables created or significantly altered
 */

export interface MigrationRecord {
  id: string;
  date: string;
  purpose: string;
  tables: string[];
}

export const MIGRATION_HISTORY: MigrationRecord[] = [
  // =========================================================================
  // July 2025 -- Foundation
  // =========================================================================
  {
    id: '20250708210349',
    date: '2025-07-08',
    purpose: 'Add user_message column to connection_requests table',
    tables: ['connection_requests'],
  },
  {
    id: '20250708214321',
    date: '2025-07-08',
    purpose: 'Add foreign key relationship between saved_listings and profiles',
    tables: ['saved_listings'],
  },
  {
    id: '20250708215555',
    date: '2025-07-08',
    purpose: 'Fix saved_listings foreign key constraint (idempotent re-add)',
    tables: ['saved_listings'],
  },
  {
    id: '20250716182234',
    date: '2025-07-16',
    purpose:
      'Create categories table, migrate listings to multi-category support, add update_updated_at_column trigger function',
    tables: ['categories', 'listings'],
  },
  {
    id: '20250716190234',
    date: '2025-07-16',
    purpose:
      'Security & reliability: fix admin RLS policies, create password_reset_tokens, audit_logs table, audit triggers on profiles',
    tables: ['password_reset_tokens', 'audit_logs', 'profiles'],
  },
  {
    id: '20250717110712',
    date: '2025-07-17',
    purpose: 'Create email_delivery_logs table for tracking email delivery status',
    tables: ['email_delivery_logs'],
  },
  {
    id: '20250717112819',
    date: '2025-07-17',
    purpose:
      'Add performance indexes on listings, connection_requests, saved_listings, and profiles',
    tables: ['listings', 'connection_requests', 'saved_listings', 'profiles'],
  },
  {
    id: '20250717113836',
    date: '2025-07-17',
    purpose:
      'Add soft delete, data integrity constraints, validation triggers, materialized views for analytics, and RLS for soft-deleted listings',
    tables: ['listings', 'profiles', 'connection_requests'],
  },
  {
    id: '20250717120629',
    date: '2025-07-17',
    purpose:
      'Database function security enhancement (SET search_path), OTP rate limiting table, updated admin/utility functions',
    tables: ['otp_rate_limits'],
  },
  {
    id: '20250718131146',
    date: '2025-07-18',
    purpose: 'Create feedback_messages table with RLS and realtime',
    tables: ['feedback_messages'],
  },
  {
    id: '20250721114715',
    date: '2025-07-21',
    purpose:
      'Create comprehensive analytics infrastructure: user_sessions, page_views, user_events, registration_funnel, listing_analytics, search_analytics, daily_metrics',
    tables: [
      'user_sessions',
      'page_views',
      'user_events',
      'registration_funnel',
      'listing_analytics',
      'search_analytics',
      'daily_metrics',
    ],
  },
  {
    id: '20250721104047',
    date: '2025-07-21',
    purpose: 'Create admin_notifications table, feedback attachments storage policies',
    tables: ['admin_notifications'],
  },
  {
    id: '20250728173755',
    date: '2025-07-28',
    purpose: 'Create deal_alerts and alert_delivery_logs tables',
    tables: ['deal_alerts', 'alert_delivery_logs'],
  },
  {
    id: '20250729111125',
    date: '2025-07-29',
    purpose: 'Re-create registration_funnel table (idempotent) with updated schema',
    tables: ['registration_funnel'],
  },
  {
    id: '20250730183417',
    date: '2025-07-30',
    purpose: 'Create fee_agreement_logs table for tracking fee agreement interactions',
    tables: ['fee_agreement_logs'],
  },
  {
    id: '20250801144858',
    date: '2025-08-01',
    purpose: 'Create admin_signature_preferences table',
    tables: ['admin_signature_preferences'],
  },
  {
    id: '20250807104534',
    date: '2025-08-07',
    purpose: 'Create listing_personal_notes table',
    tables: ['listing_personal_notes'],
  },
  {
    id: '20250825152738',
    date: '2025-08-25',
    purpose: 'Create profile_data_snapshots table for profile history tracking',
    tables: ['profile_data_snapshots'],
  },
  {
    id: '20250828132035',
    date: '2025-08-28',
    purpose:
      'Create inbound_leads and connection_request_contacts tables for manual/webflow lead intake',
    tables: ['inbound_leads', 'connection_request_contacts'],
  },

  // =========================================================================
  // Late August -- September 2025 -- Deal Pipeline
  // =========================================================================
  {
    id: '20250829140751',
    date: '2025-08-29',
    purpose:
      'Create comprehensive deal pipeline: deal_stages, deals, deal_tasks, deal_activities with auto-creation triggers from connection_requests and inbound_leads',
    tables: ['deal_stages', 'deals', 'deal_tasks', 'deal_activities'],
  },
  {
    id: '20250902184008',
    date: '2025-09-02',
    purpose: 'Create connection_request_stages table for tracking stage progression',
    tables: ['connection_request_stages'],
  },
  {
    id: '20250903123123',
    date: '2025-09-03',
    purpose: 'Create deal_contacts table for tracking contacts associated with deals',
    tables: ['deal_contacts'],
  },

  // =========================================================================
  // October 2025 -- Pipeline Enhancements
  // =========================================================================
  {
    id: '20251001112602',
    date: '2025-10-01',
    purpose: 'Create filter_presets and pipeline_views tables for saved pipeline configurations',
    tables: ['filter_presets', 'pipeline_views'],
  },
  {
    id: '20251003215325',
    date: '2025-10-03',
    purpose: 'Create deal_notes table for admin collaboration on deals',
    tables: ['deal_notes'],
  },
  {
    id: '20251003220245',
    date: '2025-10-03',
    purpose: 'Create deal_comments table (supersedes deal_notes with mentions support)',
    tables: ['deal_comments'],
  },
  {
    id: '20251003212506',
    date: '2025-10-03',
    purpose: 'Create deal_task_reviewers table for multi-reviewer task assignments',
    tables: ['deal_task_reviewers'],
  },
  {
    id: '20251017163819',
    date: '2025-10-17',
    purpose: 'Create firm_agreements and firm_members tables for fee agreement tracking',
    tables: ['firm_agreements', 'firm_members'],
  },
  {
    id: '20251021153845',
    date: '2025-10-21',
    purpose: 'Create user_roles and permission_audit_log tables for RBAC',
    tables: ['user_roles', 'permission_audit_log'],
  },
  {
    id: '20251021170417',
    date: '2025-10-21',
    purpose: 'Create user_initial_session table for onboarding tracking',
    tables: ['user_initial_session'],
  },
  {
    id: '20251022184708',
    date: '2025-10-22',
    purpose: 'Create user_notifications table',
    tables: ['user_notifications'],
  },

  // =========================================================================
  // November 2025 -- Messaging & Discovery Features
  // =========================================================================
  {
    id: '20251113115204',
    date: '2025-11-13',
    purpose: 'Create owner_intro_notifications table',
    tables: ['owner_intro_notifications'],
  },
  {
    id: '20251114185632',
    date: '2025-11-14',
    purpose: 'Create collections, collection_items, and deal_referrals tables',
    tables: ['collections', 'collection_items', 'deal_referrals'],
  },
  {
    id: '20251114191135',
    date: '2025-11-14',
    purpose: 'Create similar_deal_alerts and interest_signals tables',
    tables: ['similar_deal_alerts', 'interest_signals'],
  },
  {
    id: '20251119161857',
    date: '2025-11-19',
    purpose: 'Create listing_conversations and listing_messages tables for buyer-seller messaging',
    tables: ['listing_conversations', 'listing_messages'],
  },
  {
    id: '20251120211917',
    date: '2025-11-20',
    purpose:
      'Create admin view tracking tables: admin_connection_requests_views, admin_users_views',
    tables: ['admin_connection_requests_views', 'admin_users_views'],
  },
  {
    id: '20251120204800',
    date: '2025-11-20',
    purpose: 'Create admin_deal_sourcing_views table',
    tables: ['admin_deal_sourcing_views'],
  },
  {
    id: '20251203224529',
    date: '2025-12-03',
    purpose: 'Create admin_owner_leads_views table',
    tables: ['admin_owner_leads_views'],
  },

  // =========================================================================
  // January 2026 -- Remarketing & Analytics
  // =========================================================================
  {
    id: '20260106122510',
    date: '2026-01-06',
    purpose: 'Create trigger_logs table for debugging trigger execution',
    tables: ['trigger_logs'],
  },
  {
    id: '20260122172855',
    date: '2026-01-22',
    purpose:
      'Create remarketing system: remarketing_buyer_universes, remarketing_buyers, remarketing_buyer_contacts, remarketing_scores',
    tables: ['buyer_universes', 'buyers', 'remarketing_buyer_contacts', 'remarketing_scores'],
  },
  {
    id: '20260122175318',
    date: '2026-01-22',
    purpose: 'Create outreach_records table for tracking remarketing outreach',
    tables: ['outreach_records'],
  },
  {
    id: '20260122194512',
    date: '2026-01-22',
    purpose: 'Create buyer_transcripts table for storing buyer call transcripts',
    tables: ['buyer_transcripts'],
  },
  {
    id: '20260122195000',
    date: '2026-01-22',
    purpose: 'Create buyer_learning_history table',
    tables: ['buyer_learning_history'],
  },
  {
    id: '20260122202458',
    date: '2026-01-22',
    purpose: 'Create deal_transcripts, industry_trackers, deal_scoring_adjustments tables',
    tables: ['deal_transcripts', 'industry_trackers', 'deal_scoring_adjustments'],
  },
  {
    id: '20260123144615',
    date: '2026-01-23',
    purpose: 'Create remarketing_universe_deals table',
    tables: ['remarketing_universe_deals'],
  },
  {
    id: '20260124153624',
    date: '2026-01-24',
    purpose: 'Create remarketing_outreach table',
    tables: ['remarketing_outreach'],
  },
  {
    id: '20260127030827',
    date: '2026-01-27',
    purpose: 'Create pe_firm_contacts and platform_contacts tables',
    tables: ['pe_firm_contacts', 'platform_contacts'],
  },

  // =========================================================================
  // February 2026 -- Enrichment, Chatbot, Data Room
  // =========================================================================
  {
    id: '20260201195159',
    date: '2026-02-01',
    purpose: 'Create visitor_companies table for tracking website visitors',
    tables: ['visitor_companies'],
  },
  {
    id: '20260201200358',
    date: '2026-02-01',
    purpose: 'Create user_journeys table for user behavior tracking',
    tables: ['user_journeys'],
  },
  {
    id: '20260203040049',
    date: '2026-02-03',
    purpose: 'Create enrichment_queue table for automated data enrichment',
    tables: ['enrichment_queue'],
  },
  {
    id: '20260203_geographic_adjacency',
    date: '2026-02-03',
    purpose: 'Create geographic_adjacency table for location-based matching',
    tables: ['geographic_adjacency'],
  },
  {
    id: '20260203_engagement_signals',
    date: '2026-02-03',
    purpose: 'Create engagement_signals table for tracking buyer engagement',
    tables: ['engagement_signals'],
  },
  {
    id: '20260203_call_transcripts',
    date: '2026-02-03',
    purpose: 'Create call_transcripts table',
    tables: ['call_transcripts'],
  },
  {
    id: '20260203_audit_logging',
    date: '2026-02-03',
    purpose: 'Comprehensive audit logging system with generic trigger function',
    tables: ['audit_logs'],
  },
  {
    id: '20260204033741',
    date: '2026-02-04',
    purpose: 'Create chat_conversations, buyer_pass_decisions, buyer_approve_decisions tables',
    tables: ['chat_conversations', 'buyer_pass_decisions', 'buyer_approve_decisions'],
  },
  {
    id: '20260204044137',
    date: '2026-02-04',
    purpose: 'Create buyer_enrichment_queue table',
    tables: ['buyer_enrichment_queue'],
  },
  {
    id: '20260204172041',
    date: '2026-02-04',
    purpose: 'Create ma_guide_generations table for M&A guide PDF generation tracking',
    tables: ['ma_guide_generations'],
  },
  {
    id: '20260204172601',
    date: '2026-02-04',
    purpose: 'Create tracker_activity_logs table',
    tables: ['tracker_activity_logs'],
  },
  {
    id: '20260204190031',
    date: '2026-02-04',
    purpose: 'Create buyer_criteria_extractions table',
    tables: ['buyer_criteria_extractions'],
  },
  {
    id: '20260204_buyer_fit_criteria_extraction',
    date: '2026-02-04',
    purpose:
      'Create criteria_extraction_sources, criteria_extraction_history tables (buyer_type_profiles dropped in 20260604)',
    tables: ['criteria_extraction_sources', 'criteria_extraction_history'],
  },
  {
    id: '20260207_chatbot_complete_v2',
    date: '2026-02-07',
    purpose:
      'Create chat system tables: chat_conversations, chat_analytics, chat_feedback, chat_smart_suggestions, chat_recommendations',
    tables: [
      'chat_conversations',
      'chat_analytics',
      'chat_feedback',
      'chat_smart_suggestions',
      'chat_recommendations',
    ],
  },
  {
    id: '20260210_referral_partner_tracker',
    date: '2026-02-10',
    purpose: 'Create referral_partners and referral_submissions tables',
    tables: ['referral_partners', 'referral_submissions'],
  },
  {
    id: '20260210_global_activity_queue',
    date: '2026-02-10',
    purpose: 'Create global_activity_queue table for cross-system activity feed',
    tables: ['global_activity_queue'],
  },
  {
    id: '20260210_enrichment_rate_limits_and_cost_log',
    date: '2026-02-10',
    purpose: 'Create enrichment_rate_limits and enrichment_cost_log tables',
    tables: ['enrichment_rate_limits', 'enrichment_cost_log'],
  },
  {
    id: '20260211000000',
    date: '2026-02-11',
    purpose: 'Domain deduplication enforcement for listings',
    tables: ['_archived_dedup_listings', 'listings'],
  },
  {
    id: '20260212000000',
    date: '2026-02-12',
    purpose: 'Add CapTarget CRM sync support: captarget_sync_log table',
    tables: ['captarget_sync_log'],
  },
  {
    id: '20260216200000',
    date: '2026-02-16',
    purpose: 'Create captarget_sync_exclusions table',
    tables: ['captarget_sync_exclusions'],
  },
  {
    id: '20260217181626',
    date: '2026-02-17',
    purpose: 'Create remarketing_scoring_queue table',
    tables: ['remarketing_scoring_queue'],
  },
  {
    id: '20260218100000',
    date: '2026-02-18',
    purpose:
      'Create enrichment_jobs, enrichment_events, score_snapshots, scoring_weights_history tables for audit/enrichment/scoring infrastructure',
    tables: ['enrichment_jobs', 'enrichment_events', 'score_snapshots', 'scoring_weights_history'],
  },
  {
    id: '20260218200000',
    date: '2026-02-18',
    purpose: 'Create valuation_leads table',
    tables: ['valuation_leads'],
  },
  {
    id: '20260222100000',
    date: '2026-02-22',
    purpose: 'Create connection_messages table for deal messaging',
    tables: ['connection_messages'],
  },
  {
    id: '20260222300000',
    date: '2026-02-22',
    purpose:
      'Database hardening: add RLS to tables missing it, fix FK ON DELETE, add performance indexes',
    tables: [
      'geographic_adjacency',
      'enrichment_queue',
      'connection_messages',
      'deal_activities',
      'deal_comments',
      'deal_contacts',
      'deal_notes',
      'deal_tasks',
      'deal_documents',
      'deal_transcripts',
      'deal_referrals',
      'deal_scoring_adjustments',
    ],
  },
  {
    id: '20260223000000',
    date: '2026-02-23',
    purpose:
      'Create data room system: data_room_documents, data_room_access, data_room_audit_log, lead_memos, memo_distribution_log, lead_memo_versions',
    tables: [
      'data_room_documents',
      'data_room_access',
      'data_room_audit_log',
      'lead_memos',
      'memo_distribution_log',
      'lead_memo_versions',
    ],
  },
  {
    id: '20260223100000',
    date: '2026-02-23',
    purpose:
      'Database hardening phase 3: comprehensive performance indexes, check constraints, updated_at triggers, enhanced audit_log table, generic audit trigger function, database health check',
    tables: [
      'deals',
      'deal_tasks',
      'deal_comments',
      'inbound_leads',
      'email_delivery_logs',
      'audit_log',
      'listings',
      'connection_requests',
    ],
  },
  {
    id: '20260224000000',
    date: '2026-02-24',
    purpose: 'PandaDoc integration: create pandadoc_webhook_log table',
    tables: ['pandadoc_webhook_log'],
  },
  {
    id: '20260225000000',
    date: '2026-02-25',
    purpose:
      'Firm agreement tracking system: firm_domain_aliases, generic_email_domains, agreement_audit_log',
    tables: ['firm_domain_aliases', 'generic_email_domains', 'agreement_audit_log'],
  },
  {
    id: '20260226000000',
    date: '2026-02-26',
    purpose: 'Expand buyer_type and sponsor_types with additional enum values',
    tables: ['profiles'],
  },
  {
    id: '20260227000000',
    date: '2026-02-27',
    purpose:
      'Document distribution system: deal_documents, document_tracked_links, document_release_log, deal_data_room_access, marketplace_approval_queue',
    tables: [
      'deal_documents',
      'document_tracked_links',
      'document_release_log',
      'deal_data_room_access',
      'marketplace_approval_queue',
    ],
  },
  {
    id: '20260228000000',
    date: '2026-02-28',
    purpose: 'Unified contacts system: create consolidated contacts table',
    tables: ['contacts'],
  },
  {
    id: '20260303100000',
    date: '2026-03-03',
    purpose:
      'Security hardening phase 2: add missing RLS to saved_listings and connection_requests, fix overly permissive policies, standardize admin checks, add auth guards to SECURITY DEFINER RPCs',
    tables: [
      'saved_listings',
      'connection_requests',
      'buyers',
      'admin_notifications',
      'user_notifications',
      'user_journeys',
    ],
  },
];

/**
 * Key tables in the database, grouped by domain.
 */
export const KEY_TABLES = {
  core: ['profiles', 'listings', 'connection_requests', 'saved_listings', 'categories'],
  deals: [
    'deals',
    'deal_stages',
    'deal_tasks',
    'deal_activities',
    'deal_comments',
    'deal_contacts',
    'deal_documents',
    'deal_notes',
    'deal_referrals',
    'deal_transcripts',
    'deal_scoring_adjustments',
    'deal_alerts',
  ],
  users: [
    'user_sessions',
    'user_events',
    'user_notifications',
    'user_roles',
    'user_initial_session',
    'user_journeys',
  ],
  remarketing: [
    'buyer_universes',
    'buyers',
    'remarketing_buyer_contacts',
    'remarketing_scores',
    'remarketing_universe_deals',
    'remarketing_outreach',
    'remarketing_scoring_queue',
  ],
  analytics: [
    'page_views',
    'search_analytics',
    'listing_analytics',
    'daily_metrics',
    'registration_funnel',
    'engagement_signals',
  ],
  messaging: [
    'connection_messages',
    'listing_conversations',
    'listing_messages', // DROPPED Feb 2026 — messages now in connection_messages
    'feedback_messages',
  ],
  security: [
    'audit_logs',
    'audit_log',
    'password_reset_tokens',
    'otp_rate_limits',
    'permission_audit_log',
  ],
  integrations: [
    'email_delivery_logs',
    'alert_delivery_logs',
    'fee_agreement_logs',
    'firm_agreements',
    'firm_members',
    'pandadoc_webhook_log',
    'captarget_sync_log',
    'captarget_sync_exclusions',
  ],
  dataRoom: [
    'data_room_documents',
    'data_room_access',
    'data_room_audit_log',
    'lead_memos',
    'memo_distribution_log',
    'lead_memo_versions',
    'contacts',
  ],
  enrichment: [
    'enrichment_queue',
    'enrichment_jobs',
    'enrichment_events',
    'enrichment_rate_limits',
    'enrichment_cost_log',
    'buyer_enrichment_queue',
  ],
  chatbot: [
    'chat_conversations',
    'chat_analytics',
    'chat_feedback',
    'chat_smart_suggestions',
    'chat_recommendations',
  ],
} as const;

/**
 * Tables that currently have RLS enabled (based on migration analysis).
 * This list is maintained as a documentation reference for auditing.
 */
export const TABLES_WITH_RLS: string[] = [
  // Core
  'profiles',
  'listings',
  'connection_requests',
  'saved_listings',
  'categories',
  // Deals
  'deals',
  'deal_stages',
  'deal_tasks',
  'deal_activities',
  'deal_comments',
  'deal_contacts',
  'deal_notes',
  'deal_documents',
  'deal_transcripts',
  'deal_scoring_adjustments',
  'deal_alerts',
  'deal_task_reviewers',
  'deal_data_room_access',
  // Users
  'user_sessions',
  'user_events',
  'user_notifications',
  'user_roles',
  'user_initial_session',
  'user_journeys',
  // Analytics
  'page_views',
  'search_analytics',
  'listing_analytics',
  'daily_metrics',
  'registration_funnel',
  'engagement_signals',
  // Security
  'audit_logs',
  'audit_log',
  'password_reset_tokens',
  'otp_rate_limits',
  'permission_audit_log',
  // Messaging
  'connection_messages',
  'listing_conversations',
  'listing_messages',
  'feedback_messages',
  // Integrations
  'email_delivery_logs',
  'alert_delivery_logs',
  'fee_agreement_logs',
  'firm_agreements',
  'firm_members',
  'admin_signature_preferences',
  'admin_notifications',
  'pandadoc_webhook_log',
  'captarget_sync_log',
  'captarget_sync_exclusions',
  // Remarketing
  'buyer_universes',
  'buyers',
  'remarketing_buyer_contacts',
  'remarketing_scores',
  'remarketing_universe_deals',
  'remarketing_outreach',
  'remarketing_scoring_queue',
  // Data room
  'data_room_documents',
  'data_room_access',
  'data_room_audit_log',
  'lead_memos',
  'memo_distribution_log',
  'lead_memo_versions',
  'contacts',
  'document_release_log',
  'document_tracked_links',
  'marketplace_approval_queue',
  // Enrichment
  'enrichment_queue',
  'enrichment_jobs',
  'enrichment_events',
  'score_snapshots',
  'scoring_weights_history',
  'buyer_enrichment_queue',
  'cron_job_logs',
  // Chat
  'chat_conversations',
  'chat_analytics',
  'chat_feedback',
  'chat_smart_suggestions',
  'chat_recommendations',
  // Other
  'inbound_leads',
  'connection_request_contacts',
  'connection_request_stages',
  'profile_data_snapshots',
  'listing_personal_notes',
  'collections',
  'collection_items',
  'deal_referrals',
  'similar_deal_alerts',
  'interest_signals',
  'admin_connection_requests_views',
  'admin_users_views',
  'admin_deal_sourcing_views',
  'admin_owner_leads_views',
  'owner_intro_notifications',
  'filter_presets',
  'pipeline_views',
  'outreach_records',
  'buyer_transcripts',
  'buyer_learning_history',
  'visitor_companies',
  'geographic_adjacency',
  'pe_firm_contacts',
  'platform_contacts',
  'global_activity_queue',
  'enrichment_rate_limits',
  'enrichment_cost_log',
  'trigger_logs',
  'ma_guide_generations',
  'tracker_activity_logs',
  'buyer_criteria_extractions',
  'criteria_extraction_sources',
  'criteria_extraction_history',
  'referral_partners',
  'referral_submissions',
  'valuation_leads',
  'call_transcripts',
  'firm_domain_aliases',
  'generic_email_domains',
  'agreement_audit_log',
  'buyers',
  'call_intelligence',
];

/**
 * RLS Audit Results (2026-02-23)
 *
 * Cross-referencing all CREATE TABLE statements against ENABLE ROW LEVEL
 * SECURITY statements in the migration files. The results show excellent
 * coverage -- only one internal table is missing RLS by design.
 *
 * Tables with RLS confirmed via migration analysis:
 *  - All core tables (profiles, listings, connection_requests, saved_listings)
 *  - All deal pipeline tables (deals, deal_stages, deal_tasks, etc.)
 *  - All analytics tables (user_sessions, page_views, daily_metrics, etc.)
 *  - All remarketing tables
 *  - All messaging/chat tables
 *  - All enrichment/integration tables
 *
 * Note: profiles and listings have RLS enabled in the original schema
 * (before the migration files in this repo), confirmed by the existence of
 * CREATE POLICY statements referencing them throughout the migrations.
 */
export const TABLES_MISSING_RLS: string[] = [
  // _archived_dedup_listings: Internal archive table created by the domain
  // dedup enforcement migration (20260211000000). This is intentionally
  // without RLS because it is only accessed by SECURITY DEFINER functions
  // during the dedup process and should never be queried directly.
  '_archived_dedup_listings',
];

/**
 * Tables where RLS was added in later hardening migrations rather than
 * at creation time. Documented here for audit trail purposes.
 */
export const TABLES_WITH_RETROACTIVE_RLS: Array<{ table: string; addedIn: string }> = [
  { table: 'saved_listings', addedIn: '20260222032709 / 20260303100000' },
  { table: 'connection_requests', addedIn: '20260222032709 / 20260303100000' },
  { table: 'geographic_adjacency', addedIn: '20260222300000' },
  { table: 'enrichment_queue', addedIn: '20260222300000 / 20260203040049' },
  { table: 'deal_sourcing_requests', addedIn: '20251120160931' },
];
