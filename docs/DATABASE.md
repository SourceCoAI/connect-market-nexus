# Database Schema Reference

## Overview

The database is PostgreSQL 15 running on Supabase. All tables use Row Level Security (RLS). The schema is managed through 590+ SQL migrations in `supabase/migrations/`.

---

## Table of Contents

- [Core Tables](#core-tables)
- [Deal Pipeline Tables](#deal-pipeline-tables)
- [ReMarketing Tables](#remarketing-tables)
- [Data Room and Document Tables](#data-room-and-document-tables)
- [Analytics and Tracking Tables](#analytics-and-tracking-tables)
- [Security and Audit Tables](#security-and-audit-tables)
- [Agreement Tracking Tables](#agreement-tracking-tables)
- [AI and Enrichment Tables](#ai-and-enrichment-tables)
- [Chat and Communication Tables](#chat-and-communication-tables)
- [Other Tables](#other-tables)
- [Key RPC Functions](#key-rpc-functions)
- [RLS Policy Patterns](#rls-policy-patterns)
- [Migration Workflow](#migration-workflow)
- [Entity Relationship Diagram](#entity-relationship-diagram)

---

## Core Tables

### profiles

Extended user profiles linked to `auth.users`. Auto-created via the `handle_new_user()` trigger on signup.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | References `auth.users(id)` |
| `email` | TEXT | User email |
| `first_name` | TEXT | |
| `last_name` | TEXT | |
| `company` | TEXT | Company name (legacy) |
| `company_name` | TEXT | Company name (canonical) |
| `buyer_type` | TEXT | `individual`, `privateEquity`, `familyOffice`, `searchFund`, `corporate`, `independentSponsor`, `advisor`, `businessOwner` |
| `approval_status` | TEXT | `pending`, `approved`, `rejected` |
| `is_admin` | BOOLEAN | Admin role flag |
| `email_verified` | BOOLEAN | Email verification status |
| `business_categories` | TEXT[] | Target industries |
| `target_locations` | TEXT[] | Target geographic locations |
| `revenue_range_min` | TEXT | Min target revenue |
| `revenue_range_max` | TEXT | Max target revenue |
| `ebitda_min` | TEXT | Min target EBITDA |
| `ebitda_max` | TEXT | Max target EBITDA |
| `onboarding_completed` | BOOLEAN | Whether buyer completed onboarding |
| `fee_agreement_signed` | BOOLEAN | Fee agreement status |
| `nda_signed` | BOOLEAN | NDA status |
| `referral_source` | TEXT | How user heard about the platform |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS**: Users see own profile; admins see all. Trigger `audit_profiles_trigger` logs changes to `audit_logs`.

### listings

Deal/transaction listings. Contains both marketplace-visible deals and internal-only deals.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `title` | TEXT | Public-facing title |
| `internal_company_name` | TEXT | Admin-only company name |
| `category` | TEXT | Primary category (legacy) |
| `categories` | TEXT[] | Multiple categories (GIN-indexed) |
| `revenue` | NUMERIC | Revenue figure |
| `ebitda` | NUMERIC | EBITDA figure |
| `location` | TEXT | Location description |
| `address_state` | TEXT | Normalized US state |
| `description` | TEXT | Plain text description |
| `description_html` | TEXT | Rich text (TipTap HTML) |
| `status` | TEXT | `active`, `inactive` |
| `is_internal_deal` | BOOLEAN | Internal-only flag (hidden from marketplace) |
| `deal_identifier` | TEXT | Auto-generated identifier (e.g., `D-0042`) |
| `primary_owner_id` | UUID FK | Admin owner of the deal |
| `visible_to_buyer_types` | TEXT[] | Buyer type visibility filter |
| `acquisition_type` | TEXT | `add_on`, `platform` |
| `hero_description` | TEXT | Short hero description |
| `tags` | TEXT[] | Searchable tags |
| `rank_order` | INTEGER | Display order for active listings |
| `deleted_at` | TIMESTAMPTZ | Soft delete timestamp |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS**: Admins see all (including soft-deleted); approved buyers see only active, non-internal, non-deleted deals.

### connection_requests

Buyer requests to connect with deals. Represents the primary buyer-deal relationship for marketplace-sourced deals.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `listing_id` | UUID FK | References `listings(id)` |
| `user_id` | UUID FK | References `profiles(id)`, nullable for leads |
| `status` | TEXT | `pending`, `approved`, `rejected` |
| `source` | TEXT | `marketplace`, `webflow`, `manual`, `import`, `API`, `website`, `referral` |
| `lead_email` | TEXT | Email for non-registered buyers |
| `lead_first_name` | TEXT | |
| `lead_last_name` | TEXT | |
| `lead_company_name` | TEXT | |
| `user_message` | TEXT | Buyer's message to admin |
| `admin_comment` | TEXT | Admin's internal comment |
| `nda_signed` | BOOLEAN | NDA status for this connection |
| `fee_agreement_signed` | BOOLEAN | Fee agreement status |
| `firm_id` | UUID FK | References `firm_agreements(id)` |
| `buyer_priority_score` | NUMERIC | Calculated priority |
| `decider_admin_id` | UUID FK | Admin who approved/rejected |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS**: Users see own requests; admins see all.

### categories

Dynamic category management for deal classification.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT UNIQUE | Category name |
| `description` | TEXT | |
| `is_active` | BOOLEAN | Visibility flag |

**RLS**: Anyone can view active categories; admins can manage all.

---

## Deal Pipeline Tables

### deals

Pipeline tracking entities linking listings to buyers with stage progression.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `listing_id` | UUID FK | |
| `buyer_id` | UUID FK | References `profiles(id)` |
| `remarketing_buyer_id` | UUID FK | References `remarketing_buyers(id)` |
| `connection_request_id` | UUID FK | |
| `stage_id` | UUID FK | References `deal_stages(id)` |
| `status` | TEXT | `active`, `won`, `lost`, `stalled` |
| `priority` | TEXT | `high`, `medium`, `low` |
| `owner_id` | UUID FK | Admin owner |
| `source` | TEXT | `marketplace`, `remarketing`, `manual`, etc. |
| `deleted_at` | TIMESTAMPTZ | Soft delete |
| `created_at` | TIMESTAMPTZ | |

### deal_stages

Customizable pipeline stages.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | Stage name |
| `sort_order` | INTEGER | Display order |
| `color` | TEXT | UI color code |

### deal_tasks

Tasks associated with deals.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `deal_id` | UUID FK | |
| `title` | TEXT | |
| `status` | TEXT | `pending`, `in_progress`, `completed` |
| `assigned_to` | UUID FK | |
| `due_date` | TIMESTAMPTZ | |

### deal_activities

Activity log for deals.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `deal_id` | UUID FK | |
| `activity_type` | TEXT | |
| `description` | TEXT | |
| `performed_by` | UUID FK | |

### deal_notes

Internal notes on deals.

### deal_comments

Comments on deals with `@mention` support. Triggers `notify_mentioned_admins()`.

### deal_contacts

Contact persons associated with deals.

---

## ReMarketing Tables

### remarketing_buyers

External buyer profiles for outbound remarketing (separate from marketplace `profiles`).

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `company_name` | TEXT | |
| `pe_firm_name` | TEXT | |
| `company_website` | TEXT | |
| `email_domain` | TEXT | |
| `hq_city` | TEXT | |
| `hq_state` | TEXT | |
| `target_revenue_min` | NUMERIC | |
| `target_revenue_max` | NUMERIC | |
| `target_ebitda_min` | NUMERIC | |
| `target_ebitda_max` | NUMERIC | |
| `target_geographies` | TEXT[] | |
| `target_services` | TEXT[] | |
| `buyer_type` | TEXT | |
| `enrichment_status` | TEXT | Enrichment pipeline status |
| `enrichment_source` | TEXT | Source of enrichment data |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

### remarketing_buyer_universes

Named buyer universe groupings for targeted outreach.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | Universe name |
| `description` | TEXT | |
| `criteria` | JSONB | Filter criteria definition |

### remarketing_scores

Composite buyer-deal match scores computed by the scoring engine.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `buyer_id` | UUID FK | References `remarketing_buyers(id)` |
| `listing_id` | UUID FK | References `listings(id)` |
| `composite_score` | NUMERIC | Overall score (0-100) |
| `geography_score` | NUMERIC | Geographic alignment |
| `size_score` | NUMERIC | Revenue/EBITDA range overlap |
| `service_score` | NUMERIC | Industry/service alignment |
| `tier` | TEXT | `A`, `B`, `C`, `D`, `F` |
| `status` | TEXT | `pending`, `approved`, `passed`, `hidden` |
| `admin_notes` | TEXT | |

### remarketing_buyer_contacts

Contact persons for remarketing buyers.

### remarketing_universe_deals

Many-to-many link between universes and deals.

### remarketing_outreach

Outreach records tracking contact attempts.

### remarketing_scoring_queue

Queue for background scoring jobs.

### outreach_records

Detailed outreach tracking with timestamps and statuses.

---

## Data Room and Document Tables

### data_room_documents

Per-deal document storage metadata.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `deal_id` | UUID FK | References `listings(id)` |
| `folder_name` | TEXT | Organizational folder |
| `file_name` | TEXT | Original file name |
| `storage_path` | TEXT | Path in Supabase Storage |
| `document_category` | TEXT | `anonymous_teaser`, `full_memo`, `data_room` |
| `allow_download` | BOOLEAN | Whether download is permitted |
| `uploaded_by` | UUID FK | Admin who uploaded |

### data_room_access

Buyer access control matrix with three-level toggles.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `deal_id` | UUID FK | |
| `remarketing_buyer_id` | UUID FK | Exactly one of these |
| `marketplace_user_id` | UUID FK | must be non-NULL |
| `can_view_teaser` | BOOLEAN | Teaser document access |
| `can_view_full_memo` | BOOLEAN | Full memo access |
| `can_view_data_room` | BOOLEAN | Full data room access |
| `fee_agreement_override` | BOOLEAN | Override fee agreement requirement |
| `revoked_at` | TIMESTAMPTZ | Soft revoke |
| `expires_at` | TIMESTAMPTZ | Optional expiration |

### data_room_audit_log

Complete audit trail for all data room operations.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `deal_id` | UUID | |
| `document_id` | UUID | |
| `user_id` | UUID | |
| `action` | TEXT | `view_document`, `download_document`, `grant_access`, `revoke_access`, etc. |
| `metadata` | JSONB | Additional context |
| `ip_address` | INET | Client IP |

### deal_documents

Document distribution system (tracked links).

### document_tracked_links

Tracked links for document distribution with open counting.

### document_release_log

Log of document releases to buyers.

### lead_memos

AI-generated deal memos (anonymous teasers and full memos).

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `deal_id` | UUID FK | |
| `memo_type` | TEXT | `anonymous_teaser`, `full_memo` |
| `content` | JSONB | Structured memo sections |
| `html_content` | TEXT | Rich text content |
| `status` | TEXT | `draft`, `published`, `archived` |
| `version` | INTEGER | Auto-incremented |

### lead_memo_versions

Version history for memo edits.

### memo_distribution_log

Tracks memo email sends with channel and recipient info.

---

## Analytics and Tracking Tables

### user_sessions

Browser session tracking.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `session_start` | TIMESTAMPTZ | |
| `session_end` | TIMESTAMPTZ | |
| `pages_viewed` | INTEGER | |
| `device_info` | JSONB | |

### page_views

Individual page view tracking.

### user_events

Custom event tracking (clicks, interactions).

### listing_analytics

Per-listing view and engagement metrics.

### search_analytics

Search query and result tracking.

### daily_metrics

Aggregated daily platform metrics (materialized for performance).

### registration_funnel

Signup funnel step tracking.

### user_activity

Detailed user action tracking for analytics.

### user_journeys

Cross-domain attribution and first-touch tracking.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `visitor_id` | TEXT | Anonymous visitor identifier |
| `user_id` | UUID FK | Linked after signup |
| `first_external_referrer` | TEXT | First external referrer URL |
| `first_blog_landing` | TEXT | First blog page URL |
| `first_utm_source` | TEXT | First UTM source parameter |
| `first_seen_at` | TIMESTAMPTZ | |

### user_initial_session

Initial session metadata captured on first visit.

### user_notifications

In-app notification system.

### engagement_signals

Real-time engagement signal tracking.

---

## Security and Audit Tables

### audit_logs

General-purpose audit trail for data changes. Profile changes are automatically logged via the `audit_profiles_trigger`.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `table_name` | TEXT | |
| `operation` | TEXT | `INSERT`, `UPDATE`, `DELETE` |
| `old_data` | JSONB | Previous state |
| `new_data` | JSONB | New state |
| `user_id` | UUID FK | Affected user |
| `admin_id` | UUID FK | Acting admin |
| `metadata` | JSONB | Changed fields detail |
| `timestamp` | TIMESTAMPTZ | |

**RLS**: Only admins can view and insert.

### password_reset_tokens

Secure, time-limited password reset tokens.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `token` | TEXT UNIQUE | Random hex token |
| `expires_at` | TIMESTAMPTZ | 1-hour expiry |
| `used` | BOOLEAN | Single-use flag |

### otp_rate_limits

OTP/MFA attempt rate limiting.

### permission_audit_log

Tracks role changes and permission modifications.

### user_roles

RBAC role assignments (app_role enum: `admin`, `moderator`, `buyer`, `owner`).

### trigger_logs

Database trigger execution logging for debugging.

---

## Agreement Tracking Tables

### firm_agreements

Fee agreement and NDA tracking at the firm level.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `firm_name` | TEXT | |
| `firm_domain` | TEXT | |
| `fee_agreement_status` | TEXT | `none`, `sent`, `signed` |
| `nda_status` | TEXT | `none`, `sent`, `signed` |
| `member_count` | INTEGER | |

### firm_members

Links individual profiles to firms.

### firm_domain_aliases

Alternative domain names for firms.

### generic_email_domains

List of generic email domains (gmail.com, etc.) to exclude from firm matching.

### agreement_audit_log

Audit trail for agreement status changes.

### fee_agreement_logs

Detailed fee agreement action logs.

---

## AI and Enrichment Tables

### enrichment_queue

Queue for deal enrichment jobs.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `listing_id` | UUID FK | |
| `status` | TEXT | `pending`, `processing`, `completed`, `failed` |
| `priority` | INTEGER | |
| `claimed_at` | TIMESTAMPTZ | |

### buyer_enrichment_queue

Queue for buyer enrichment jobs.

### enrichment_jobs

Detailed enrichment job tracking with progress.

### enrichment_events

Event log for enrichment pipeline operations.

### enrichment_rate_limits

Provider-level rate limit tracking.

### enrichment_cost_log

AI operation cost tracking.

### score_snapshots

Historical score snapshots for trend analysis.

### scoring_weights_history

Scoring weight configuration history.

### buyer_criteria_extractions

AI-extracted buyer investment criteria.

### ma_guide_generations

M&A guide generation job tracking.

### buyer_transcripts / deal_transcripts / call_transcripts

Transcription data from various sources.

---

## Chat and Communication Tables

### chat_conversations

Buyer-facing chat conversation threads.

### chat_analytics

Chat interaction analytics.

### chat_feedback

User feedback on chat responses.

### chat_smart_suggestions

AI-generated follow-up suggestions.

### chat_recommendations

Deal recommendations generated during chat.

### connection_messages

Messages between buyers and admins on connection requests.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | |
| `connection_request_id` | UUID FK | |
| `sender_id` | UUID FK | |
| `body` | TEXT | Message content |
| `is_admin` | BOOLEAN | Whether sender is admin |
| `read_at` | TIMESTAMPTZ | |

Protected by immutability trigger `fn_protect_message_immutability()`.

### listing_conversations / listing_messages

Conversations attached to specific listings.

---

## Other Tables

| Table | Description |
|---|---|
| `admin_notifications` | Internal admin notification queue |
| `admin_signature_preferences` | Admin email signature settings |
| `collections` | Named deal collections |
| `collection_items` | Items within collections |
| `deal_referrals` | Referral tracking between deals |
| `deal_alerts` | Buyer alert subscriptions |
| `alert_delivery_logs` | Alert delivery tracking |
| `similar_deal_alerts` | Similar deal notification tracking |
| `interest_signals` | Buyer interest signal tracking |
| `email_delivery_logs` | Email send tracking |
| `feedback_messages` | User feedback/support messages |
| `inbound_leads` | Leads from external sources (webflow, website) |
| `connection_request_contacts` | Contact info for connection requests |
| `connection_request_stages` | Stage tracking for connection requests |
| `profile_data_snapshots` | Signup data snapshots for data recovery |
| `listing_personal_notes` | Admin personal notes on listings |
| `referral_partners` | Referral partner profiles |
| `referral_submissions` | Referral deal submissions |
| `captarget_sync_log` | CapTarget data sync tracking |
| `captarget_sync_exclusions` | Exclusions for CapTarget sync |
| `valuation_leads` | Valuation inquiry leads |
| `visitor_companies` | Identified visitor companies |
| `global_activity_queue` | Background job queue |
| `cron_job_logs` | Scheduled job execution logs |
| `industry_trackers` | M&A Intelligence industry trackers |
| `deal_scoring_adjustments` | Manual scoring overrides |
| `contacts` | Unified contact records |
| `pe_firm_contacts` | PE firm contact records |
| `platform_contacts` | Platform (marketplace) contact records |
| `buyer_learning_history` | Buyer learning/interaction history |
| `pandadoc_webhook_log` | PandaDoc webhook event log |
| `owner_intro_notifications` | Owner introduction notifications |
| `geographic_adjacency` | State/region adjacency data for proximity scoring |
| `marketplace_approval_queue` | Marketplace approval workflow queue |
| `filter_presets` | Saved filter configurations |
| `pipeline_views` | Saved pipeline view configurations |
| `admin_connection_requests_views` | Admin view state for connection requests |
| `admin_users_views` | Admin view state for user management |
| `admin_deal_sourcing_views` | Admin view state for deal sourcing |
| `admin_owner_leads_views` | Admin view state for owner leads |
| `deal_data_room_access` | Additional data room access tracking |
| `deal_task_reviewers` | Task reviewer assignments |
| `tracker_activity_logs` | M&A tracker activity logs |

---

## Key RPC Functions

### Authentication and Authorization

| Function | Description |
|---|---|
| `is_admin(user_id UUID)` | Returns boolean; canonical admin role check used in RLS policies |
| `handle_new_user()` | Trigger function: creates `profiles` row when `auth.users` row is inserted |
| `promote_user_to_admin(target_user_id)` | Promotes a user to admin role |
| `demote_admin_user(target_user_id)` | Removes admin role |
| `get_all_user_roles()` | Returns all user role assignments |
| `change_user_role(target_user_id, new_role, reason)` | Changes user role with audit logging |

### Deal Management

| Function | Description |
|---|---|
| `get_deals_with_details()` | Returns deals with joined listing, buyer, stage, and owner data |
| `move_deal_stage_with_ownership(deal_id, stage_id)` | Moves deal to new stage with ownership tracking |
| `auto_create_deal_from_connection_request()` | Trigger: creates deal when connection request is approved |
| `create_deal_from_connection_request()` | Manual deal creation from connection request |
| `soft_delete_deal(deal_id, reason)` | Soft delete with reason logging |
| `restore_deal(deal_id)` | Restore soft-deleted deal |
| `delete_listing_cascade(listing_id)` | Cascade delete listing and related records |
| `generate_deal_identifier()` | Auto-generate deal identifiers (D-0001 format) |

### Scoring and Matching

| Function | Description |
|---|---|
| `match_deal_alerts_with_listing(listing_data)` | Match new listings against buyer alert criteria |
| `calculate_engagement_score(views, saves, requests, time)` | Calculate buyer engagement score |
| `calculate_buyer_priority_score(buyer_type)` | Calculate priority based on buyer type |
| `upsert_deal_scoring_queue(...)` | Queue deals for scoring |
| `upsert_alignment_scoring_queue(...)` | Queue alignment scoring |

### Data Room

| Function | Description |
|---|---|
| `check_data_room_access(deal_id, user_id, category)` | Verify buyer access to document category |
| `log_data_room_event(...)` | Insert audit trail entry |
| `get_deal_access_matrix(deal_id)` | Admin: get all buyer access levels for a deal |
| `get_deal_distribution_log(deal_id)` | Get document distribution history |
| `get_buyer_deal_history(buyer_id)` | Get all deals a buyer has been involved with |
| `increment_link_open_count(link_id)` | Track document link opens |

### Agreement Management

| Function | Description |
|---|---|
| `update_fee_agreement_status(user_id, is_signed)` | Update fee agreement status |
| `update_nda_status(user_id, is_signed)` | Update NDA status |
| `update_fee_agreement_firm_status(...)` | Update firm-level fee agreement |
| `update_nda_firm_status(...)` | Update firm-level NDA |
| `get_or_create_firm(...)` | Find or create firm agreement record |
| `check_agreement_coverage(...)` | Check if all required agreements are in place |
| `sync_agreement_status_from_booleans()` | Sync boolean flags to firm agreement records |

### Analytics

| Function | Description |
|---|---|
| `get_marketplace_analytics(days_back)` | Aggregate marketplace metrics |
| `get_feedback_analytics(days_back)` | Feedback statistics |
| `update_daily_metrics(target_date)` | Refresh daily aggregate metrics |
| `get_engagement_analytics(time_range)` | User engagement statistics |
| `get_connection_request_analytics(time_range)` | Connection request statistics |

### User Management

| Function | Description |
|---|---|
| `delete_user_completely(user_id)` | Full cascade deletion of user and all related data |
| `restore_profile_data_automated()` | Restore profile data from snapshots |
| `capture_signup_snapshot()` | Trigger: capture profile data at signup |
| `sync_missing_profiles()` | Create missing profile rows for orphaned auth users |

---

## RLS Policy Patterns

All tables have Row Level Security enabled. The common patterns are:

### Users see own data
```sql
CREATE POLICY "Users see own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);
```

### Admins see everything
```sql
CREATE POLICY "Admins can view all"
  ON some_table FOR SELECT
  USING (public.is_admin(auth.uid()));
```

### Admins can manage everything
```sql
CREATE POLICY "Admins can manage all"
  ON some_table FOR ALL
  USING (public.is_admin(auth.uid()));
```

### Buyers see active, non-internal data
```sql
CREATE POLICY "Approved buyers see active listings"
  ON listings FOR SELECT
  USING (
    status = 'active'
    AND (is_internal_deal IS NULL OR is_internal_deal = false)
    AND deleted_at IS NULL
  );
```

### Service role bypass
Edge functions using the service role key bypass all RLS policies. This is used for operations that require cross-user data access (scoring, enrichment, notifications).

---

## Migration Workflow

### Creating a new migration

```bash
# Generate a new migration file
supabase migration new descriptive_name

# Edit the generated file in supabase/migrations/
```

### Migration best practices

1. **Idempotent**: Use `IF NOT EXISTS` for `CREATE TABLE` and `CREATE INDEX`.
2. **Drop before create**: For functions, use `CREATE OR REPLACE FUNCTION` or `DROP FUNCTION IF EXISTS` then `CREATE FUNCTION`.
3. **RLS**: Always enable RLS and create policies for new tables.
4. **Indexes**: Create indexes on foreign keys and frequently filtered columns.
5. **Defaults**: Include `created_at TIMESTAMPTZ DEFAULT now()` and `updated_at` columns.
6. **Soft deletes**: Add `deleted_at TIMESTAMPTZ` for tables that support soft deletion.
7. **Testing locally**: Apply migrations locally first:
   ```bash
   supabase db reset   # Re-apply all migrations from scratch
   ```

### Applying migrations to production

```bash
# Push migrations to remote Supabase project
supabase db push --project-ref <project-id>
```

---

## Entity Relationship Diagram

```
auth.users
    |
    | 1:1
    v
profiles ----< connection_requests >---- listings
    |                  |                     |
    |                  | 1:1                 |
    |                  v                     |
    |               deals                   |
    |                  |                     |
    |                  +-- deal_stages       |
    |                  +-- deal_tasks        |
    |                  +-- deal_activities   |
    |                  +-- deal_notes        |
    |                  +-- deal_comments     |
    |                                        |
    +--< firm_members >-- firm_agreements    |
    |                                        |
    +--< user_sessions                      |
    +--< user_activity                      |
    +--< user_notifications                 |
    +--< deal_alerts                        +--< data_room_documents
                                            +--< data_room_access
                                            +--< data_room_audit_log
                                            +--< lead_memos
                                            +--< remarketing_scores >-- remarketing_buyers
                                            +--< listing_analytics
                                            +--< enrichment_queue

remarketing_buyers ----< remarketing_buyer_contacts
    |
    +--< remarketing_scores
    +--< remarketing_universe_deals >-- remarketing_buyer_universes
    +--< outreach_records
```

Key relationships:
- `profiles` 1:1 `auth.users` (same UUID as PK)
- `connection_requests` links `profiles` to `listings` (many-to-many through requests)
- `deals` links `profiles` or `remarketing_buyers` to `listings` with stage progression
- `remarketing_scores` links `remarketing_buyers` to `listings` with match scores
- `data_room_access` links buyers (marketplace or remarketing) to deals with access toggles
- `firm_agreements` groups users by company domain
