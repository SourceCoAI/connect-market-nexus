# CTO Codebase Audit: Dead Code & Duplicates

**Date:** 2026-03-11
**Repository:** SourceCoDeals/connect-market-nexus
**Focus:** Dead code identification and duplicate detection

---

## EXECUTIVE SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| **P0 Critical** | 3 | Dead tables with zero code references, `listings` table at 193 columns |
| **P1 High** | 21 | Dead edge functions, dead columns in core tables, duplicate type systems |
| **P2 Medium** | 63 | Low-reference tables, duplicate type definitions, near-dead columns, orphaned routes |
| **P3 Low** | 114 | Unused TypeScript types, minor duplicate patterns |

**Total issues found: ~200**

---

## 1. DEAD DATABASE TABLES

### 1A. Completely Dead Tables (0 code references outside types.ts)

| Table | Columns | Recommendation |
|-------|---------|---------------|
| `enrichment_test_results` | — | **DROP** — never referenced in src/ or edge functions |
| `enrichment_test_runs` | — | **DROP** — never referenced in src/ or edge functions |
| `introduction_activity` | — | **DROP** — never referenced in src/ or edge functions |

### 1B. Dead v2 Admin View Tables (0 references anywhere)

| Table | Recommendation |
|-------|---------------|
| `admin_connection_requests_views_v2` | **DROP** — v2 was never adopted |
| `admin_deal_sourcing_views_v2` | **DROP** — v2 was never adopted |
| `admin_owner_leads_views_v2` | **DROP** — v2 was never adopted |
| `admin_users_views_v2` | **DROP** — v2 was never adopted |

### 1C. Near-Dead Tables (only referenced in migrations.ts for metadata)

These tables exist in the schema and are tracked in `migrations.ts` but have no actual business logic referencing them:

| Table | References | Notes |
|-------|-----------|-------|
| `admin_connection_requests_views` (v1) | 1 (migrations.ts only) | v1 view tracker, replaced by v2 which is also dead |
| `admin_deal_sourcing_views` (v1) | 1 (migrations.ts only) | Same pattern |
| `admin_owner_leads_views` (v1) | 1 (migrations.ts only) | Same pattern |
| `admin_users_views` (v1) | 1 (migrations.ts only) | Same pattern |
| `cron_job_logs` | 1 (migrations.ts only) | Never read/written by app code |
| `deal_task_reviewers` | 1 (migrations.ts only) | Never used in task system |
| `trigger_logs` | 1 (migrations.ts only) | Never read by app code |

### 1D. Very Low Reference Tables (1-2 refs, review needed)

| Table | Refs | Files | Risk |
|-------|------|-------|------|
| `incoming_leads` | 1 | receive-valuation-lead/index.ts | **LIKELY DEAD** — possible legacy predecessor to `inbound_leads` or `valuation_leads` |
| `ai_command_center_usage` | 1 | ai-command-center/index.ts | Analytics table, fine |
| `deal_ranking_history` | 1 | useDealsActions.ts | Low-use feature |
| `heyreach_campaign_stats` | 1 | heyreach-campaigns/index.ts | Integration-specific |
| `introduction_status_log` | 1 | use-buyer-introductions.ts | Low-use |
| `remarketing_guide_generation_state` | 1 | useGuideGenerationState.ts | State tracking |
| `test_run_results` | 1 | useTestRunTracking.ts | Test infrastructure |
| `test_run_tracking` | 1 | useTestRunTracking.ts | Test infrastructure |
| `user_notes` | 1 | use-connection-notes.ts | Low-use |

---

## 2. DEAD DATABASE COLUMNS

### 2A. Dead Columns in `buyers` (90 columns total)

| Column | Status | Recommendation |
|--------|--------|---------------|
| `industry_tracker_id` | 0 references | **DROP** |
| `is_marketplace_member` | 0 references | **DROP** |
| `marketplace_joined_at` | 0 references | **DROP** |
| `verified_at` | 0 references | **DROP** |
| `verified_by` | 0 references | **DROP** |

### 2B. Dead Columns in `contacts` (41 columns total)

**13 dead columns** — all PhoneBurner-related call tracking columns that appear to have been abandoned:

| Column | Status | Recommendation |
|--------|--------|---------------|
| `do_not_call_reason` | 0 references | **DROP** |
| `last_call_attempt_at` | 0 references | **DROP** |
| `last_call_connected_at` | 0 references | **DROP** |
| `last_disposition_code` | 0 references | **DROP** |
| `last_disposition_date` | 0 references | **DROP** |
| `last_disposition_label` | 0 references | **DROP** |
| `next_action_notes` | 0 references | **DROP** |
| `next_action_type` | 0 references | **DROP** |
| `phone_number_invalid` | 0 references | **DROP** |
| `phoneburner_last_sync_at` | 0 references | **DROP** |
| `total_call_attempts` | 0 references | **DROP** |
| `total_call_duration_seconds` | 0 references | **DROP** |
| `total_calls_connected` | 0 references | **DROP** |

### 2C. Dead Column in `deal_pipeline` (40 columns total)

| Column | Status | Recommendation |
|--------|--------|---------------|
| `last_enriched_at` | 0 references | **DROP** |

### 2D. Dead Column in `listings` (193 columns total)

| Column | Status | Recommendation |
|--------|--------|---------------|
| `external_source` | 0 references | **DROP** |

### 2E. Low-Reference Columns in `listings` (30 columns with only 1-2 refs)

The `listings` table has **193 columns** which is extreme. Many column groups could be normalized into related tables:

| Column Group | Count | Notes |
|-------------|-------|-------|
| `sf_*` (Salesforce) | 19 columns | Only used by salesforce webhook + admin detail page. Could be a separate `listing_salesforce_data` JSONB column or table |
| `captarget_*` | 9 columns | Only used by captarget sync functions. Could be a separate table |
| `main_contact_*` | 7 columns | Contact info embedded in listing — violates normalization, should reference `contacts` table |
| `linkedin_*` | 7 columns | Enrichment data, could be JSONB |
| `internal_*` | 6 columns | Internal metadata, could be JSONB |
| `metric_3_*`, `metric_4_*` | 8 columns | Custom metrics, should be JSONB array |
| `google_*` | 4 columns | Google Places data, could be JSONB |

**Recommendation:** Denormalize the 193-column `listings` table by moving low-use column groups into JSONB columns or related tables. This would reduce the table to ~80-90 core columns.

---

## 3. DEAD EDGE FUNCTIONS

### 3A. Confirmed Dead (0 references from any code)

| Function | Recommendation |
|----------|---------------|
| `bulk-import-remarketing` | **DELETE** — never invoked |
| `classify-buyer-types` | **DELETE** — never invoked |
| `create-lead-user` | **DELETE** — never invoked |
| `enrich-geo-data` | **DELETE** — never invoked |
| `enrich-session-metadata` | **DELETE** — never invoked |
| `extract-buyer-criteria-background` | **DELETE** — never invoked (async wrapper with no caller) |
| `extract-buyer-transcript` | **DELETE** — never invoked |
| `get-feedback-analytics` | **DELETE** — never invoked |
| `import-reference-data` | **DELETE** — never invoked |
| `notify-remarketing-match` | **DELETE** — never invoked |
| `otp-rate-limiter` | **DELETE** — never invoked |
| `parse-tracker-documents` | **DELETE** — never invoked |
| `push-buyer-to-phoneburner` | **DELETE** — never invoked |
| `reset-agreement-data` | **DELETE** — never invoked |
| `resolve-buyer-agreement` | **DELETE** — never invoked |
| `security-validation` | **DELETE** — never invoked |
| `send-deal-referral` | **DELETE** — never invoked |
| `send-marketplace-invitation` | **DELETE** — never invoked |
| `send-simple-verification-email` | **DELETE** — never invoked |
| `sync-missing-profiles` | **DELETE** — never invoked |
| `track-engagement-signal` | **DELETE** — never invoked |
| `validate-criteria` | **DELETE** — never invoked |
| `verify-platform-website` | **DELETE** — never invoked |

**Total: 23 dead edge functions**

### 3B. Only Referenced from Test/Email Test Pages (no production use)

| Function | Only Referenced From |
|----------|---------------------|
| `discover-companies` | system-test-runner only |
| `firecrawl-scrape` | system-test-runner only |
| `send-fee-agreement-reminder` | EmailTestCentre + test runner |
| `send-first-request-followup` | EmailTestCentre only |
| `send-nda-reminder` | EmailTestCentre + test runner |
| `send-onboarding-day2` | EmailTestCentre only |
| `send-onboarding-day7` | EmailTestCentre only |
| `send-templated-approval-email` | EmailTestCentre only |
| `sync-phoneburner-transcripts` | test runner only |

### 3C. Likely Active via Webhooks/Cron (not dead despite no invoke() calls)

These have 0 `invoke()` calls but are expected to be triggered externally:

- `clay-webhook-*` (3 functions) — Clay enrichment webhooks
- `confirm-agreement-signed` — PandaDoc webhook
- `heyreach-webhook` — HeyReach webhook
- `pandadoc-webhook-handler` — PandaDoc webhook
- `phoneburner-oauth-callback` / `phoneburner-webhook`
- `receive-valuation-lead` — external lead webhook
- `salesforce-remarketing-webhook`
- `smartlead-webhook`
- `admin-digest` / `aggregate-daily-metrics` — cron jobs

---

## 4. DUPLICATE DETECTION

### 4A. Duplicate/Overlapping Tables

#### Lead Tables: `inbound_leads` vs `incoming_leads` vs `valuation_leads`

| Table | Columns | References | Purpose |
|-------|---------|-----------|---------|
| `inbound_leads` | 29 | 34 | **ACTIVE** — marketplace buyer leads |
| `incoming_leads` | 15 | 1 | **LIKELY DEAD** — appears to be old version, only ref in `receive-valuation-lead` |
| `valuation_leads` | 54 | 25 | **ACTIVE** — valuation calculator leads |

**Recommendation:** `incoming_leads` is almost certainly a legacy table that should be migrated/dropped. Its single reference in `receive-valuation-lead` should write to `valuation_leads` instead.

#### Contact Tables: 4 Separate Contact Stores

| Table | Columns | Purpose |
|-------|---------|---------|
| `contacts` | 41 | **Unified contacts table** — the canonical store |
| `enriched_contacts` | 17 | Enrichment results — separate from contacts |
| `connection_request_contacts` | 6 | Junction table for related requests (not a contact store) |
| `remarketing_buyer_contacts` | 20 | **DUPLICATE** — remarketing-specific contacts |

**Recommendation:** `remarketing_buyer_contacts` (20 columns) significantly overlaps with `contacts` (41 columns). Both store name, email, phone, linkedin_url, company info. These should be consolidated into the unified `contacts` table with a `source` or `context` tag.

#### Listings Tables: `listings` vs `marketplace_listings`

| Table | Columns | Purpose |
|-------|---------|---------|
| `listings` | 193 | Master listing/deal table (internal) |
| `marketplace_listings` | 39 | Public marketplace view |

`marketplace_listings` appears to be a materialized subset of `listings`. The 39 `marketplace_listings` columns are all present in `listings`. This is likely a DB view or projection — **verify if it's a view or a duplicate data copy**. If it's a real table with copied data, there's a sync risk.

#### Enrichment Queues: 3 Separate Queues

| Table | Columns | Purpose |
|-------|---------|---------|
| `buyer_enrichment_queue` | 13 | Queue for buyer enrichment jobs |
| `enrichment_queue` | 11 | Queue for listing/deal enrichment |
| `enrichment_jobs` | 20 | Job tracking for enrichment batches |

These serve different entity types but share 80% structural overlap. **Consider a unified `enrichment_queue` with an `entity_type` discriminator column.**

#### User Session/Activity Tables: 4 Overlapping Tables

| Table | Columns | Purpose |
|-------|---------|---------|
| `user_activity` | 5 | Simple activity log |
| `user_events` | 18 | Detailed event tracking |
| `user_sessions` | 41 | Full session data |
| `user_initial_session` | 24 | First session capture |

`user_activity` (5 columns) is a subset of `user_events` (18 columns). **Recommend merging `user_activity` into `user_events`.**

### 4B. Duplicate Type Definitions (19 duplicates across files)

| Type Name | Defined In | Recommendation |
|-----------|-----------|---------------|
| `AdminConnectionRequest` | `admin.ts`, `admin-users.ts` | Consolidate to one definition |
| `BuyerType` | `index.ts`, `remarketing.ts` | Consolidate — same enum used differently |
| `ConnectionRequestStatus` | `index.ts`, `status-enums.ts` | Remove from one location |
| `ErrorSeverity` | `index.ts`, `lib/error-handler.ts` | Import from one source |
| `FilterOptions` | `index.ts`, `lib/database.ts` | Import from one source |
| `GlobalActivityStatus` | `status-enums.ts`, `remarketing.ts` | Consolidate |
| `PaginationState` | `index.ts`, `hooks/use-simple-pagination.ts` | Import from one source |
| `ProfileRow` | `supabase-helpers.ts`, `hooks/useRealTimeSessions.ts` | Use the helpers version |
| `TeamRole` | `index.ts`, `config/role-permissions.ts` | Import from one source |
| `TestResult` | `analytics.ts`, `pages/admin/system-test-runner/types.ts` | Differentiate names |
| `Transcript` | `transcript.ts`, `ReMarketingBuyerDetail/types.ts` | Import from one source |
| `User` | `index.ts`, `admin-users.ts` | Consolidate |
| `UserRole` | `index.ts`, `hooks/permissions/usePermissions.ts` | Import from one source |

#### SmartLead vs HeyReach: Identical Type Shapes

6 type names are duplicated across `smartlead.ts` and `heyreach.ts`:
- `CampaignStatsResponse`
- `CreateCampaignRequest`
- `ListCampaignsResponse`
- `PushLeadsRequest`
- `PushLeadsResponse`
- `SyncCampaignsResponse`

**Recommendation:** Create a shared `outreach-platform.ts` type with generic outreach types, parameterized by platform.

### 4C. Dead TypeScript Types (114 total)

**114 exported types are defined but never imported/used anywhere else in the codebase.** The worst offenders:

| File | Dead Types Count | Notable Dead Types |
|------|-----------------|-------------------|
| `supabase-helpers.ts` | 40+ | Most Row/Insert/Update helpers, all utility types (Nullable, DeepPartial, RequireKeys, etc.) |
| `remarketing.ts` | 13 | ReMarketingBuyerUniverse, all ScoringBehavior types, PortfolioCompany, etc. |
| `daily-tasks.ts` | 9 | ExtractionConfidence, TaskSource, AIConfidence, TeamMemberAlias, etc. |
| `smartlead.ts` | 7 | Most SmartLead-specific types unused |
| `heyreach.ts` | 7 | Most HeyReach-specific types unused |
| `contacts.ts` | 4 | All 4 exported types (ApifyEmployee, ProspeoResult, etc.) |
| `index.ts` | 3 | SignupBuyerType, JsonValue, AsyncResult |

### 4D. Duplicate UI Components

| Category | Components | Issue |
|----------|-----------|-------|
| Rich Text Editors | `rich-text-editor.tsx`, `premium-rich-text-editor.tsx` | Both are imported by the same 2 files — `EditorDescriptionSection.tsx` and `EditableDescription.tsx`. Likely one supersedes the other. |

---

## 5. SCHEMA BLOAT: THE `listings` TABLE

The `listings` table at **193 columns** is a critical P0 issue. This is an anti-pattern that:
- Degrades query performance (wide row scans)
- Makes migrations fragile (any ALTER TABLE is slow)
- Creates confusion about which columns are current vs legacy
- Increases the Supabase types file size (451KB!)

### Recommended Normalization

| New Table/Column | Columns to Move | Current Count |
|---------|----------------|---------------|
| `listing_salesforce_data` (JSONB or table) | `sf_*` columns | 19 |
| `listing_captarget_data` (JSONB or table) | `captarget_*` columns | 9 |
| `listing_linkedin_data` (JSONB) | `linkedin_*` columns | 7 |
| Reference `contacts` table instead | `main_contact_*` columns | 7 |
| `listing_internal_metadata` (JSONB) | `internal_*` columns | 6 |
| `listing_custom_metrics` (JSONB array) | `metric_3_*`, `metric_4_*`, `custom_metric_*` columns | 12 |
| `listing_google_data` (JSONB) | `google_*` columns | 4 |

This would reduce the `listings` table from 193 to ~129 columns, with the moved data available via simple joins or JSONB access.

---

## 6. MIGRATION FILE AUDIT

**852 migration files** in `/supabase/migrations/`. This is extremely high and suggests:
- Frequent schema churn
- Possible net-zero migrations (create then drop)
- Manual schema changes that required corrective migrations

**Recommendation:** Consider squashing old migrations into a single baseline migration to reduce complexity.

---

## 7. RECOMMENDED DELETION LIST

### Tables to DROP

```sql
DROP TABLE IF EXISTS enrichment_test_results;
DROP TABLE IF EXISTS enrichment_test_runs;
DROP TABLE IF EXISTS introduction_activity;
DROP TABLE IF EXISTS admin_connection_requests_views_v2;
DROP TABLE IF EXISTS admin_deal_sourcing_views_v2;
DROP TABLE IF EXISTS admin_owner_leads_views_v2;
DROP TABLE IF EXISTS admin_users_views_v2;
-- Review before dropping:
-- DROP TABLE IF EXISTS incoming_leads;  -- verify receive-valuation-lead migration first
```

### Columns to DROP

```sql
-- buyers: 5 dead columns
ALTER TABLE buyers DROP COLUMN IF EXISTS industry_tracker_id;
ALTER TABLE buyers DROP COLUMN IF EXISTS is_marketplace_member;
ALTER TABLE buyers DROP COLUMN IF EXISTS marketplace_joined_at;
ALTER TABLE buyers DROP COLUMN IF EXISTS verified_at;
ALTER TABLE buyers DROP COLUMN IF EXISTS verified_by;

-- contacts: 13 dead columns (PhoneBurner call tracking)
ALTER TABLE contacts DROP COLUMN IF EXISTS do_not_call_reason;
ALTER TABLE contacts DROP COLUMN IF EXISTS last_call_attempt_at;
ALTER TABLE contacts DROP COLUMN IF EXISTS last_call_connected_at;
ALTER TABLE contacts DROP COLUMN IF EXISTS last_disposition_code;
ALTER TABLE contacts DROP COLUMN IF EXISTS last_disposition_date;
ALTER TABLE contacts DROP COLUMN IF EXISTS last_disposition_label;
ALTER TABLE contacts DROP COLUMN IF EXISTS next_action_notes;
ALTER TABLE contacts DROP COLUMN IF EXISTS next_action_type;
ALTER TABLE contacts DROP COLUMN IF EXISTS phone_number_invalid;
ALTER TABLE contacts DROP COLUMN IF EXISTS phoneburner_last_sync_at;
ALTER TABLE contacts DROP COLUMN IF EXISTS total_call_attempts;
ALTER TABLE contacts DROP COLUMN IF EXISTS total_call_duration_seconds;
ALTER TABLE contacts DROP COLUMN IF EXISTS total_calls_connected;

-- deal_pipeline: 1 dead column
ALTER TABLE deal_pipeline DROP COLUMN IF EXISTS last_enriched_at;

-- listings: 1 dead column
ALTER TABLE listings DROP COLUMN IF EXISTS external_source;
```

### Edge Functions to DELETE

```
supabase/functions/bulk-import-remarketing/
supabase/functions/classify-buyer-types/
supabase/functions/create-lead-user/
supabase/functions/enrich-geo-data/
supabase/functions/enrich-session-metadata/
supabase/functions/extract-buyer-criteria-background/
supabase/functions/extract-buyer-transcript/
supabase/functions/get-feedback-analytics/
supabase/functions/import-reference-data/
supabase/functions/notify-remarketing-match/
supabase/functions/otp-rate-limiter/
supabase/functions/parse-tracker-documents/
supabase/functions/push-buyer-to-phoneburner/
supabase/functions/reset-agreement-data/
supabase/functions/resolve-buyer-agreement/
supabase/functions/security-validation/
supabase/functions/send-deal-referral/
supabase/functions/send-marketplace-invitation/
supabase/functions/send-simple-verification-email/
supabase/functions/sync-missing-profiles/
supabase/functions/track-engagement-signal/
supabase/functions/validate-criteria/
supabase/functions/verify-platform-website/
```

---

## 8. ORPHANED ROUTES

**113+ routes defined, ~45 actively linked, ~39 orphaned.**

### Genuinely Orphaned Admin Routes (never linked from UI navigation)

| Route | Page | Status |
|-------|------|--------|
| `/admin/smartlead/campaigns` | SmartLead campaigns | **ORPHANED** — no sidebar link |
| `/admin/smartlead/settings` | SmartLead settings | **ORPHANED** — no sidebar link |
| `/admin/phoneburner/sessions` | PhoneBurner sessions | **ORPHANED** — no sidebar link |
| `/admin/phoneburner/settings` | PhoneBurner settings | **ORPHANED** — no sidebar link |
| `/admin/fireflies` | Fireflies integration | **ORPHANED** — no sidebar link |
| `/admin/approvals` | Global approvals | **ORPHANED** — no sidebar link |
| `/admin/documents` | Document tracking | **ORPHANED** — no sidebar link |
| `/admin/marketplace/create-listing` | Create listing | **ORPHANED** — no link |
| `/admin/marketplace/messages` | Admin messages | **ORPHANED** — no link |
| `/admin/buyers/contacts` | Buyer contacts | **ORPHANED** — no link |
| `/admin/feature-ideas` | Feature ideas | **ORPHANED** — no link |
| `/admin/remarketing/leads/sourceco` | SourceCo deals | **ORPHANED** — sub-route not linked |
| `/admin/remarketing/leads/sourceco/:dealId` | SourceCo deal detail | **ORPHANED** |

### Orphaned Settings Sub-routes (not linked from settings navigation)

| Route | Purpose |
|-------|---------|
| `/admin/settings/owner-leads` | Owner leads settings |
| `/admin/settings/data-quality/pe-links` | PE firm link review |
| `/admin/settings/webhooks` | Webhooks settings |
| `/admin/settings/enrichment-queue` | Enrichment queue |
| `/admin/settings/outreach` | Outreach settings |
| `/admin/settings/data-recovery` | Data recovery |
| `/admin/settings/form-monitoring` | Form monitoring |
| `/admin/settings/security` | Security settings |

### Acceptable Orphans (externally accessed or post-action pages)

These routes are intentionally not linked in UI — accessed via external URLs, emails, or form redirects:
- `/referrals/:shareToken`, `/dataroom/:accessToken`, `/view/:linkToken`, `/deals/:id`
- `/auth/callback`, `/reset-password`, `/signup-success`, `/pending-approval`
- `/sell` (entry point for owner inquiry — may need an external landing page link)
- 15 legacy redirect routes (`/admin/remarketing/deals` → `/admin/deals`, etc.)

---

## 9. RECOMMENDED CONSOLIDATION LIST

| Source (merge from) | Target (keep) | Action |
|---------------------|---------------|--------|
| `incoming_leads` | `valuation_leads` | Migrate data, update `receive-valuation-lead` to write to `valuation_leads` |
| `remarketing_buyer_contacts` | `contacts` | Add `remarketing_buyer_id` to contacts (already exists), migrate data |
| `user_activity` | `user_events` | Merge — `user_activity` is a strict subset |
| `admin_*_views` (v1 and v2, 8 tables) | `admin_view_state` | Consolidate all admin view tracking into single table |
| `rich-text-editor.tsx` | `premium-rich-text-editor.tsx` | Keep premium, update imports |
| SmartLead + HeyReach types | Shared `outreach-platform.ts` | Create generic outreach types |
| 19 duplicate type definitions | Single canonical location | Pick one file per type, import everywhere |
| 114 dead types in `src/types/` | — | Delete unused exports |

---

## 9. SUMMARY BY PRIORITY

### P0 — Fix Immediately
1. `listings` table has 193 columns — normalize into related tables/JSONB
2. 7 completely dead tables in schema (clutter, confusion risk)
3. 23 dead edge functions consuming deployment/cold-start resources

### P1 — Fix Within 1 Sprint
4. 20 dead columns across core tables (`buyers`, `contacts`, `deal_pipeline`)
5. `incoming_leads` table is a near-dead duplicate of `valuation_leads`
6. `remarketing_buyer_contacts` duplicates `contacts` table
7. 19 duplicate TypeScript type definitions causing confusion

### P2 — Fix Within 1 Month
8. 114 dead TypeScript types adding to codebase noise
9. 852 migration files should be squashed
10. 4 overlapping user session/activity tables
11. SmartLead/HeyReach type systems should be unified

### P3 — Backlog
12. `supabase-helpers.ts` has 40+ unused type aliases — clean up
13. Admin view tables (v1+v2, 8 total) should be consolidated into `admin_view_state`
14. Edge functions only used in test pages should be flagged for review
15. 21+ orphaned routes (admin pages not linked from sidebar/navigation)
16. 8 orphaned settings sub-routes not accessible from settings UI
