# SourceCo Platform — Deep-Dive Technical Diligence Audit

**Date:** March 14, 2026
**Codebase:** SourceCoDeals/connect-market-nexus
**Supabase Project:** vhzipqarkmmfuqadefep
**Scope:** 10 parallel deep-dive investigations across security, performance, reliability, and architecture
**Supplements:** TECHNICAL_DILIGENCE_AUDIT_2026-03-14.md (initial audit)

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [CRITICAL Findings (Immediate Action Required)](#critical-findings)
3. [HIGH Severity Findings](#high-severity-findings)
4. [MEDIUM Severity Findings](#medium-severity-findings)
5. [LOW Severity & Positive Findings](#low-severity--positive-findings)
6. [Updated Remediation Roadmap](#updated-remediation-roadmap)

---

## EXECUTIVE SUMMARY

This deep-dive audit extends the initial 7-domain audit with 10 focused investigations:
security, RLS/auth, frontend error handling, migration integrity, silent failures,
API key management, React hooks/performance, query performance, cron/background jobs,
and cross-cutting architecture concerns.

**Total new findings: 85+ across 10 domains.**

### Severity Breakdown

| Severity | Count | Key Themes |
|----------|-------|------------|
| **CRITICAL** | 6 | Unauthenticated webhooks writing to production DB, hardcoded service role key in git, undefined variable bug, zero transaction boundaries |
| **HIGH** | 14 | Missing DB indexes, unscoped realtime subscriptions, public routes without error boundaries, no external error monitoring, PII in logs, bulk import doing 50K+ sequential round-trips |
| **MEDIUM** | 30+ | Overly permissive RLS policies, missing idempotency, no AI cost cap, preview deploys hitting production DB, duplicate cron jobs, missing query invalidation |
| **LOW** | 20+ | Weak password policy, stale closures, naming inconsistencies |

### What's Done Well

- Auth infrastructure is solid: `requireAuth`/`requireAdmin` validate JWTs server-side via `getUser()`, admin role checked via DB RPC (not JWT claims)
- No SQL injection risks — all queries use parameterized Supabase client
- No `eval()` or dynamic code execution anywhere
- CORS properly implemented with origin allowlists, no wildcards
- No hardcoded API keys in edge function source (all use `Deno.env.get()`)
- TypeScript strict mode fully enabled with only 7 `as any` occurrences in 1,301 files
- Realtime subscription cleanup is perfect across all 9 subscription sites
- All setInterval/addEventListener properly cleaned up
- Document security (data rooms) is well-implemented with time-limited signed URLs
- Profile self-escalation prevented by RLS WITH CHECK constraints
- Marketplace listing queries use explicit safe column whitelist

---

## CRITICAL FINDINGS

### C1: Unauthenticated Webhooks Writing to Production Database

```
SEVERITY: CRITICAL
CATEGORY: Security
FILES AFFECTED:
  - supabase/functions/phoneburner-webhook/index.ts (lines 14-25)
  - supabase/functions/salesforce-remarketing-webhook/index.ts (entire file)
  - supabase/functions/clay-webhook-phone/index.ts (line 14)
EVIDENCE: All three functions have verify_jwt=false in config.toml and ZERO
  authentication — no webhook secret, no HMAC, no IP allowlist. They write
  directly to production tables using the service role key:
  - phoneburner-webhook: writes to phoneburner_webhooks_log, contact_activities
  - salesforce-remarketing-webhook: creates/modifies listings and contacts
  - clay-webhook-phone: injects phone numbers into contacts and enriched_contacts
  The phoneburner-webhook code explicitly documents: "AUTHENTICATION: NONE ...
  This endpoint accepts ALL incoming POST requests without any secret."
  Other webhooks (pandadoc, heyreach, smartlead) correctly implement HMAC/secret
  verification — these three were simply never secured.
IMPACT: An attacker who discovers these URLs can:
  - Create fake deal listings with arbitrary data (salesforce)
  - Inject fake phone numbers into real contacts (clay)
  - Pollute CRM activity records (phoneburner)
  PLAIN ENGLISH: Three backend endpoints accept data from anyone on the internet
  without checking who they are. An attacker could inject fake data into the system.
RECOMMENDED ACTION: Add webhook secret verification (matching the pattern in
  heyreach-webhook and smartlead-webhook) to all three functions immediately.
ESTIMATED EFFORT: 2-4 hours
```

### C2: Service Role Key Hardcoded in Migration Files (In Git History)

```
SEVERITY: CRITICAL
CATEGORY: Security
FILES AFFECTED:
  - supabase/migrations/20260311000000_onboarding_email_crons.sql (lines 10-11, 27-28, 44-45)
  - supabase/migrations/20260203151732_*.sql (lines 13-14)
  - supabase/migrations/20260106123137_*.sql (line 12)
  - supabase/migrations/20260106184548_*.sql (line 13)
  - supabase/migrations/20260205031933_*.sql (line 9)
EVIDENCE: The full Supabase service_role JWT is hardcoded in plain text:
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6
  InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIs...'
  This key bypasses ALL RLS policies and provides unrestricted database access.
  Some later migrations correctly use current_setting('app.settings.service_role_key')
  instead (e.g., 20260227000000_captarget_scheduled_sync.sql).
IMPACT: Anyone with read access to the git repository has full admin access to
  the production database. The key is permanently in git history even if files
  are modified. Additionally, if the key is rotated, all cron jobs using the
  hardcoded key will silently fail with 401 errors.
  PLAIN ENGLISH: The master password to the database is saved in plain text in
  files that are tracked by version control. Anyone who can see the code can
  access all data without restrictions.
RECOMMENDED ACTION: (1) IMMEDIATELY rotate the service role key in the Supabase
  dashboard. (2) Update all cron job migrations to use
  current_setting('app.settings.service_role_key'). (3) Consider using vault
  secrets for pg_cron jobs.
ESTIMATED EFFORT: 4-6 hours (including key rotation and cron migration updates)
```

### C3: signedDocUrl Undefined Variable Bug in confirm-agreement-signed

```
SEVERITY: CRITICAL (BUG)
CATEGORY: Code Bug
FILES AFFECTED:
  - supabase/functions/confirm-agreement-signed/index.ts (lines 266, 276, 284)
EVIDENCE: signedDocUrl is referenced on lines 266, 276, and 284 but is NEVER
  declared or assigned anywhere in the function. In Deno strict mode this
  evaluates to undefined. Comment at line 217 says "PDF URLs are fetched fresh
  on demand" suggesting this was intentionally removed but references were not
  cleaned up.
IMPACT: (1) The signed document URL in the API response is always undefined.
  (2) The buyer confirmation email always shows the fallback "view in your
  Profile" text instead of a direct link. (3) Admin notification may contain
  undefined URL.
  PLAIN ENGLISH: After a buyer signs their agreement, the system tries to include
  a link to the signed document in the confirmation email, but the link is always
  missing because of a coding error.
RECOMMENDED ACTION: Either remove all signedDocUrl references (if URLs should be
  fetched on demand) or properly declare and populate the variable.
ESTIMATED EFFORT: 30 minutes
```

### C4: Zero Transaction Boundaries Across All Edge Functions

```
SEVERITY: CRITICAL
CATEGORY: Data Integrity
FILES AFFECTED: All edge functions performing multi-step database operations
KEY EXAMPLES:
  - auto-create-firm-on-approval/index.ts: 5+ sequential writes with no transaction
    (firm_agreements INSERT → connection_requests UPDATE → firm_members INSERT →
    PandaDoc creation → 3 more unchecked DB writes)
  - convert-to-pipeline-deal/index.ts: firm creation → buyer update → firm_members
    insert → deal creation → buyer_introductions update
  - confirm-agreement-signed/index.ts: firm_agreements UPDATE (unchecked) →
    profile syncs → notification creation
EVIDENCE: Search for BEGIN, COMMIT, ROLLBACK, or transaction RPC calls across all
  edge functions returns zero results. Every multi-step operation can leave data
  in an inconsistent state if any intermediate step fails.
IMPACT: Partial failures create orphaned records, inconsistent status fields, and
  business logic violations. For example, a firm can be created but never linked
  to its connection request, or a deal can be created without its buyer
  introduction being updated.
  PLAIN ENGLISH: When the system needs to do multiple database operations in
  sequence (like creating a firm and linking it to a user), if one step fails
  partway through, the data ends up in a half-finished state with no automatic
  cleanup.
RECOMMENDED ACTION: Create a shared transaction helper using Supabase's
  supabase.rpc() with a PL/pgSQL function that wraps critical multi-step
  operations in BEGIN/COMMIT/ROLLBACK. Prioritize: firm creation flow,
  deal conversion flow, agreement signing flow.
ESTIMATED EFFORT: 3-5 days for critical paths
```

### C5: Migration Non-Idempotency Blocks Fresh Deployments

```
SEVERITY: CRITICAL
CATEGORY: Data Integrity / DevOps
FILES AFFECTED:
  - 2 tables created twice without IF NOT EXISTS (global_activity_queue,
    listing_personal_notes)
  - 10+ indexes created twice without IF NOT EXISTS (idx_page_views_session_id,
    idx_user_events_session_id, idx_buyer_transcripts_buyer_id, etc.)
  - 30+ triggers created multiple times (PostgreSQL does not support
    CREATE OR REPLACE TRIGGER)
  - 28 timestamp collision groups causing non-deterministic ordering
  - 8 chatbot migration files creating the same schema 8 times
EVIDENCE: See migration integrity audit. Example: idx_page_views_session_id
  appears 3 times without IF NOT EXISTS across migrations 20250721114715,
  20250721153954, 20250721155255. CREATE TRIGGER set_chat_conversations_updated_at
  appears 8 times across chatbot v1-v6 migrations.
IMPACT: Fresh environment provisioning (new developer setup, CI/CD, staging)
  will fail with "already exists" errors. The only way to set up a new
  environment is to manually intervene in the migration sequence.
  PLAIN ENGLISH: New team members or automated testing environments cannot be
  set up from scratch because the database setup scripts have conflicts that
  cause errors.
RECOMMENDED ACTION: Create a "migration consolidation" migration that:
  (1) Adds DROP IF EXISTS before duplicate triggers.
  (2) Adds IF NOT EXISTS to duplicate indexes.
  (3) Resolves timestamp collisions by renaming files.
  Long-term: squash all 853 migrations into a single baseline migration.
ESTIMATED EFFORT: 2-3 days for fixes, 1 week for full squash
```

### C6: buyer_type_confidence Column Type Mismatch (INTEGER vs real)

```
SEVERITY: CRITICAL
CATEGORY: Data Integrity
FILES AFFECTED:
  - supabase/migrations/20260511000000_buyer_classification_taxonomy.sql (line 22)
  - supabase/migrations/20260525000000_platform_audit_remediation.sql (line 37)
EVIDENCE: First migration adds buyer_type_confidence as INTEGER with CHECK
  constraint. Second migration adds it as real (float) with IF NOT EXISTS guard.
  Depending on migration execution order, the column could be either type.
IMPACT: Code expecting integer (0-100) will behave differently if the column is
  float. Comparisons like confidence >= 85 may produce unexpected results with
  floating point.
RECOMMENDED ACTION: Verify actual column type in production. Standardize to one
  type (INTEGER recommended for percentage scores).
ESTIMATED EFFORT: 1 hour
```

---

## HIGH SEVERITY FINDINGS

### H1: Missing Database Indexes on High-Traffic FK Columns

```
SEVERITY: HIGH
CATEGORY: Performance
MISSING INDEXES:
  - deal_pipeline.listing_id (used in 6-table JOIN RPC)
  - deal_pipeline.stage_id (used in 6-table JOIN RPC)
  - deal_pipeline.assigned_to (used in 6-table JOIN RPC)
  - deal_pipeline.connection_request_id (used in 6-table JOIN RPC)
  - deal_pipeline.deleted_at (filtered in every pipeline query)
  - connection_requests.user_id (buyer messaging, deals RPC)
  - connection_requests.listing_id (analytics, message threads)
  - connection_requests.status (filtered with .in() frequently)
  - buyer_introductions.buyer_id (no index despite listing_id being indexed)
EVIDENCE: The get_deals_with_buyer_profiles() RPC joins 6 tables — all FK
  columns in deal_pipeline are unindexed. Every pipeline page load is a full scan.
IMPACT: Pipeline page performance degrades linearly with data growth. At scale,
  the admin pipeline view will become unusably slow.
RECOMMENDED ACTION: CREATE INDEX CONCURRENTLY on all listed columns.
ESTIMATED EFFORT: 1-2 hours (one migration)
```

### H2: Unscoped Realtime Subscriptions Broadcasting to All Users

```
SEVERITY: HIGH
CATEGORY: Performance
FILES AFFECTED:
  - src/hooks/use-realtime-admin.ts (subscribes to 9 full tables)
  - src/pages/BuyerMessages/useMessagesData.ts:43 (all connection_messages)
  - src/hooks/remarketing/useGlobalActivityQueue.ts:39 (all activity queue)
  - src/hooks/useBuyerEnrichmentProgress.ts:101 (all enrichment queue)
EVIDENCE: use-realtime-admin subscribes to profiles, connection_requests,
  listings, deals, daily_standup_tasks, connection_request_stages,
  firm_agreements, valuation_leads, firm_members — ALL events on ALL rows,
  with no .eq() filter. Every admin tab receives change payloads for every
  row mutation. The buyer messages subscription listens to ALL inserts on
  connection_messages — every buyer gets notified of every message in the system.
IMPACT: Excessive PostgreSQL WAL traffic. With 5 admins and 100 buyers online,
  a single deal update generates 105 change event deliveries. During bulk
  enrichment, the buyer_enrichment_queue subscription floods all connected
  clients with hundreds of events per second.
RECOMMENDED ACTION: Add .eq() filters to scope subscriptions. For admin, filter
  by assigned_to. For messages, filter by connection_request_id. For queues,
  only subscribe when actively viewing the queue page.
ESTIMATED EFFORT: 1-2 days
```

### H3: bulk-import-remarketing — 50,000+ Sequential HTTP Round-Trips

```
SEVERITY: HIGH
CATEGORY: Performance
FILES AFFECTED:
  - supabase/functions/bulk-import-remarketing/index.ts (lines 415-777)
EVIDENCE: Every entity type (universes, buyers, contacts, transcripts, scores,
  learning history) is inserted one row at a time inside for loops. With
  MAX_BUYERS=10,000 and MAX_CONTACTS=50,000, this means 50,000+ sequential
  HTTP round-trips to Supabase. No batching. No transactions.
IMPACT: Import will likely exceed the 26-second edge function timeout well
  before completion. Even if it completes, it takes orders of magnitude longer
  than necessary. The single worst performance pattern in the codebase.
RECOMMENDED ACTION: Batch inserts (100-500 rows per .insert() call). Use
  continuation tokens for large imports.
ESTIMATED EFFORT: 1-2 days
```

### H4: Public Routes Without Error Boundaries

```
SEVERITY: HIGH
CATEGORY: Reliability
FILES AFFECTED:
  - src/App.tsx (lines 268-283 — public routes)
EVIDENCE: Routes /welcome, /login, /signup, /forgot-password, /reset-password,
  /deals/:id, /referrals/:shareToken, /dataroom/:accessToken, /view/:linkToken
  are rendered inside <Suspense> without any RouteErrorBoundary. A crash in any
  public page crashes the entire app (caught only by root boundary showing
  full-screen error). Admin routes and buyer routes DO have RouteErrorBoundary.
IMPACT: A JavaScript error on the login page, signup page, or data room view
  would show users a full-screen error instead of graceful degradation.
  PLAIN ENGLISH: If something goes wrong on the login or signup pages, users
  see a scary error screen instead of a helpful message.
RECOMMENDED ACTION: Wrap public routes in <RouteErrorBoundary> matching the
  pattern used for buyer and admin routes.
ESTIMATED EFFORT: 30 minutes
```

### H5: No External Error Monitoring (Sentry, etc.)

```
SEVERITY: HIGH
CATEGORY: Operations
FILES AFFECTED:
  - src/lib/error-handler.ts (line 131, 143)
EVIDENCE: The error reporting code is stubbed out with:
  "// In a real application, you would send this to Sentry, LogRocket, etc."
  console.warn('Would report to external service:', errorData);
  Errors go to console (stripped in production) and to the user_activity
  Supabase table (but only for authenticated users — anonymous errors dropped).
  No server-side health check endpoint exists.
IMPACT: Production errors are invisible. If the signup flow breaks, the team
  won't know until users complain. No alerting for edge function failures,
  no error aggregation, no crash rate tracking.
RECOMMENDED ACTION: Integrate Sentry (or similar) for both frontend and edge
  functions. Add a /health endpoint.
ESTIMATED EFFORT: 1-2 days
```

### H6: PII Logged to Console in 15+ Edge Functions

```
SEVERITY: HIGH
CATEGORY: Security / Compliance
FILES AFFECTED:
  - receive-valuation-lead/index.ts:52 (logs full name, email, financial data)
  - password-reset/index.ts:55 (logs email)
  - send-deal-alert/index.ts:94 (logs email)
  - notify-deal-owner-change/index.ts:94 (logs email)
  - record-data-room-view/index.ts:208-209 (logs buyer email)
  - grant-data-room-access/index.ts:293 (logs email)
  - heyreach-webhook/index.ts:191 (logs lead email and LinkedIn)
  - +8 more functions
EVIDENCE: console.log and console.error statements output email addresses,
  names, and financial data. In Supabase, edge function logs are visible in the
  dashboard and may be stored in log aggregation systems.
IMPACT: PII in logs creates compliance risk (GDPR, CCPA). If logs are shipped
  to a third-party aggregator, PII is exposed to that service.
RECOMMENDED ACTION: Create a shared log sanitizer that redacts email addresses
  and PII before logging. Replace all console.log(body) calls with sanitized
  versions.
ESTIMATED EFFORT: 1 day
```

### H7: No Auth on firecrawl-scrape — Any Authenticated User Can Scrape

```
SEVERITY: HIGH
CATEGORY: Security
FILES AFFECTED:
  - supabase/functions/firecrawl-scrape/index.ts (lines 13, 42)
EVIDENCE: No requireAuth() or requireAdmin() call. Relies on CORS origin
  checking only (bypassed by server-to-server requests). User-provided URL
  passed directly to Firecrawl API without SSRF validation. Any authenticated
  user (buyer or admin) can use the platform's Firecrawl API credits to scrape
  arbitrary URLs.
IMPACT: A buyer could abuse the endpoint to scrape arbitrary websites using the
  platform's paid Firecrawl credits, or use it as an SSRF proxy.
RECOMMENDED ACTION: Add requireAdmin() and validate URL scheme/domain.
ESTIMATED EFFORT: 1 hour
```

### H8: No Cron Job for buyer-enrichment-queue or scoring-queue

```
SEVERITY: HIGH
CATEGORY: Reliability
EVIDENCE: process-enrichment-queue has a pg_cron job (every 2 min).
  process-ma-guide-queue has one (every minute). But process-buyer-enrichment-queue
  and process-scoring-queue have NO cron job. They rely solely on HTTP triggers
  from the UI or global-activity-queue drain logic. If the initial trigger fails
  or self-continuation breaks (Finding C4 of initial audit), items sit
  indefinitely until manually triggered.
IMPACT: Buyer enrichment and scoring can silently stall with no automatic recovery.
RECOMMENDED ACTION: Add pg_cron jobs for both queue processors (every 2-5 minutes).
ESTIMATED EFFORT: 1 hour
```

### H9: Cascade Hard-Delete with Unchecked Intermediate Errors

```
SEVERITY: HIGH
CATEGORY: Data Integrity
FILES AFFECTED:
  - src/lib/remarketing/cascadeDelete.ts (lines 29-45)
  - src/pages/admin/remarketing/CapTargetDeals/useCapTargetActions.ts (lines 439-442)
  - src/pages/admin/remarketing/ReMarketingBuyers/useBuyersData.ts (line 294)
EVIDENCE: deleteUniverseWithRelated performs hard deletes on 5 tables in sequence
  (buyer_transcripts, remarketing_scores, call_intelligence, buyers,
  buyer_universes). Only the final delete checks for errors. Intermediate
  failures leave partially deleted data with no recovery. useBuyersData.ts
  deletes buyers with no cascade cleanup of related records.
IMPACT: Data loss and orphaned records on partial failures.
RECOMMENDED ACTION: Wrap in transaction RPC or check all intermediate errors
  with rollback capability.
ESTIMATED EFFORT: 4-6 hours
```

### H10: Emails Permanently Lost During Brevo Outage

```
SEVERITY: HIGH
CATEGORY: Reliability
FILES AFFECTED:
  - supabase/functions/_shared/brevo-sender.ts (line 130)
EVIDENCE: Brevo sender has 3-retry exponential backoff for 5xx errors, but
  if all retries fail, the email is permanently lost (logged as 'failed' in
  email_delivery_logs but never retried). No circuit breaker, no delayed
  queue, no retry-later mechanism.
IMPACT: Critical emails (NDA confirmations, approval notices, deal alerts)
  can be permanently lost during a multi-minute Brevo outage.
RECOMMENDED ACTION: Add a failed-email retry queue that periodically
  re-attempts failed sends, or integrate a backup email provider.
ESTIMATED EFFORT: 1-2 days
```

### H11: ALTER TABLE on a VIEW (remarketing_buyers Post-Rename)

```
SEVERITY: HIGH
CATEGORY: Data Integrity
FILES AFFECTED:
  - supabase/migrations/20260515000001_add_publicly_traded_flag.sql (line 5)
EVIDENCE: After remarketing_buyers was renamed to buyers with a backward-
  compatible view, this migration runs ALTER TABLE remarketing_buyers ADD COLUMN
  — operating on the VIEW, not the real table. This will fail in PostgreSQL
  unless the view is auto-updatable for DDL.
IMPACT: Migration failure blocks all subsequent migrations. If the migration
  was skipped/failed silently, the column may not exist.
RECOMMENDED ACTION: Change to ALTER TABLE buyers ADD COLUMN (the real table name).
ESTIMATED EFFORT: 15 minutes
```

### H12: No AI Output Schema Validation

```
SEVERITY: HIGH
CATEGORY: Data Integrity
FILES AFFECTED:
  - supabase/functions/_shared/ai-providers.ts (line 314)
  - All edge functions using callGeminiWithTool()
EVIDENCE: AI tool call responses are JSON.parsed but never schema-validated.
  If the AI returns structurally valid JSON with wrong field types, missing
  required fields, or hallucinated values, the data is written directly to the
  database without any validation.
IMPACT: AI hallucinations or format changes could corrupt database records.
  No defense against prompt injection via malicious deal data in AI inputs.
RECOMMENDED ACTION: Add Zod or similar schema validation for all AI responses
  before database writes.
ESTIMATED EFFORT: 2-3 days
```

### H13: Preview Deployments Use Production Supabase Credentials

```
SEVERITY: HIGH
CATEGORY: Security / DevOps
FILES AFFECTED:
  - .github/workflows/preview.yml (lines 38-42)
EVIDENCE: The preview build (for PR review) uses the same VITE_SUPABASE_URL
  and VITE_SUPABASE_ANON_KEY secrets as production. Preview deployments point
  to the PRODUCTION Supabase instance. QA testing on previews reads/writes
  production data.
IMPACT: A PR with a bug could modify production data during review. Preview
  testers interact with real user data.
RECOMMENDED ACTION: Create a separate Supabase project for staging/preview
  environments. Use different env vars for the preview workflow.
ESTIMATED EFFORT: 1-2 days
```

### H14: No General-Purpose Rate Limiting on Edge Functions

```
SEVERITY: HIGH
CATEGORY: Security
EVIDENCE: The provider-level rate limiter only tracks AI API usage (Gemini,
  Firecrawl, etc.). Most edge functions have NO per-user or per-IP rate
  limiting. An attacker could repeatedly invoke expensive functions like
  firecrawl-scrape, discover-companies, generate-ma-guide, or map-csv-columns
  without limit. Only ai-command-center (120/hour) and OTP (5/hour) have
  user-level rate limits.
RECOMMENDED ACTION: Add a shared rate limit middleware for all authenticated
  edge functions (e.g., 100 requests/minute per user). Add IP-based rate
  limiting for public endpoints.
ESTIMATED EFFORT: 1-2 days
```

---

## MEDIUM SEVERITY FINDINGS

### M1: enriched_contacts INSERT/UPDATE Policies Lack Role Restriction

```
FILES: supabase/migrations/20260310000000_contact_intelligence.sql (lines 69-73)
ISSUE: Policies use WITH CHECK (true) and USING (true) without TO service_role.
  Any authenticated user (including buyers) can insert/update enriched_contacts,
  which contain email addresses, phone numbers, and LinkedIn URLs.
ACTION: Add TO service_role to these policies.
```

### M2: PandaDoc /send Response Never Checked

```
FILE: supabase/functions/auto-create-firm-on-approval/index.ts (lines 266-276)
ISSUE: The fetch() call to PandaDoc's /send endpoint discards the response
  entirely. Three subsequent DB writes are also unchecked. If PandaDoc send
  fails, the NDA is created but never sent, and the function returns success.
ACTION: Check fetch response status. On failure, log and return error.
```

### M3: Smartlead/HeyReach Webhooks Lack Idempotency

```
FILES: supabase/functions/smartlead-webhook/index.ts (line 66)
       supabase/functions/heyreach-webhook/index.ts (line 70)
ISSUE: No duplicate check before INSERT into webhook events tables. If the
  same event is delivered twice (common), duplicate rows are created and
  duplicate status updates applied. Contrast: pandadoc-webhook-handler
  correctly checks for existing events.
ACTION: Add unique constraint on (event_type, campaign_id, lead_email) or
  check before insert.
```

### M4: Fee Agreement Email Never Syncs Back to Server

```
FILE: src/hooks/admin/use-fee-agreement.ts (lines 295-300)
ISSUE: useLogFeeAgreementEmail.onSuccess skips query invalidation entirely
  (comment: "let optimistic updates show, database will sync later"). If the
  edge function fails to update the database, the UI permanently shows
  incorrect state. Compare with NDA hook which at least has setTimeout-based
  invalidation.
ACTION: Add query invalidation on success, even with a delay.
```

### M5: Missing onError in PandaDoc Auto-Creation

```
FILE: src/hooks/admin/use-pandadoc.ts (lines 65-89)
ISSUE: useAutoCreateFirmOnApproval mutation has NO onError handler. If the
  edge function fails, the admin gets no feedback. Firm/NDA may not be created.
ACTION: Add onError with toast notification.
```

### M6: Race Condition in Introduction Status Logging

```
FILE: src/hooks/use-buyer-introductions.ts (line 96)
ISSUE: updateStatusMutation reads introductions from component closure.
  If two status updates fire quickly, the second reads stale state, logging
  incorrect old_status in introduction_status_log.
ACTION: Read current status from the server (optimistic response) instead of
  closure state.
```

### M7: No Double-Submit Guard on handleAccept

```
FILE: src/components/admin/connection-request-actions/useConnectionRequestActions.ts (line 88)
ISSUE: handleAccept has no isSubmitting guard. Rapid double-click creates
  duplicate decision messages and potentially duplicate approval emails.
ACTION: Add isPending check at top of handler.
```

### M8: Multi-Step Deal Creation Without Rollback

```
FILE: src/components/admin/CreateDealModal/useCreateDealForm.ts (lines 132-333)
ISSUE: 6 sequential database operations. Step 4-5 failures swallowed in
  empty catch blocks. Deal can exist without associations, activities, or
  correct notification state.
ACTION: Add error checking per step with meaningful user feedback.
```

### M9: AI Rate Limiter Fails Open in ai-command-center

```
FILE: supabase/functions/ai-command-center/index.ts (lines 87-89)
ISSUE: If rate limit DB query fails, request is allowed through:
  "Non-critical: if rate limit check fails, allow the request"
  This contradicts the fail-closed pattern in _shared/security.ts.
ACTION: Change to fail-closed (deny on rate limit check failure).
```

### M10: track-session Accepts Unvalidated Data Without Auth

```
FILE: supabase/functions/track-session/index.ts
ISSUE: verify_jwt=false, no authentication. Accepts POST body with session_id,
  user_agent, referrer, utm_source, visitor_id written directly to user_sessions
  and user_journeys without validation. Attackers can flood with fake data or
  inject fake UTM attribution to corrupt analytics. user_id field is accepted
  from the request body without verification.
ACTION: Add input sanitization and rate limiting.
```

### M11: 150+ select('*') Queries Including on 150+ Column Tables

```
FILES: ~150 occurrences across src/ and supabase/functions/
WORST: listings table (150+ columns) queried with select('*') in
  DealTranscriptSection, DealCSVImport, ai-command-center content-tools.
  useAdminUsers fetches all profiles with no pagination.
ACTION: Replace with explicit column selection, especially on listings and buyers.
```

### M12: use-universal-search Loads ~15,000 Rows Into Browser Memory

```
FILE: src/hooks/admin/use-universal-search.ts (lines 85-305)
ISSUE: Fires 11 parallel queries on mount, each loading 1000-2000 rows.
  All data loaded into memory and filtered client-side. Total: ~15,000+ rows.
ACTION: Implement server-side search with a single RPC or full-text search index.
```

### M13: Duplicate CapTarget Sync Cron Jobs

```
FILES: 20260212000001_captarget_sync_cron.sql (5 AM UTC)
       20260227000000_captarget_scheduled_sync.sql (11 AM UTC)
ISSUE: Both invoke sync-captarget-sheet. The later migration attempts to
  unschedule duplicates but the earlier job may still be running.
ACTION: Verify pg_cron schedule and remove duplicate.
```

### M14: Context Providers Missing useMemo on Value Props

```
FILES:
  - src/contexts/AnalyticsContext.tsx (lines 402-410)
  - src/contexts/SessionContext.tsx (lines 31-35)
  - src/contexts/AnalyticsFiltersContext.tsx (lines 87-100)
ISSUE: All three create new objects every render, causing all consumers
  to re-render unnecessarily. AuthProvider, TabVisibilityProvider, and
  NavigationStateProvider correctly use useMemo.
ACTION: Wrap value props in useMemo.
```

### M15: import * as LucideIcons Prevents Tree-Shaking

```
FILE: src/components/admin/SessionEventsDialog.tsx (line 13)
ISSUE: Imports the entire Lucide icon library (~200KB+). Should use named imports.
ACTION: Replace with import { SpecificIcon1, SpecificIcon2 } from 'lucide-react'.
```

### M16: Connection Approval/Rejection Emails Silently Fail

```
FILE: src/hooks/admin/use-admin-email.ts (lines 121-206)
ISSUE: sendConnectionApprovalEmail and sendConnectionRejectionEmail return false
  on failure rather than throwing. No user-facing error feedback, no delivery
  tracking (unlike sendUserApprovalEmail which throws and tracks).
ACTION: Align error handling with other email functions in the same hook.
```

### M17: No Dollar-Amount Cost Cap on AI API Usage

```
FILE: supabase/functions/_shared/security.ts (lines 24-41)
ISSUE: Per-user limit is 500 calls/hour. Global limit is 500 AI calls/hour.
  No dollar-amount cap. No monthly budget. No alerting when approaching limits.
  With Claude at ~$3/1K input tokens, runaway usage could be expensive.
ACTION: Add a monthly cost cap with alerting at 80% threshold.
```

### M18: No Reconnection or Missed-Event Recovery in Realtime

```
FILES: All 25 files using .subscribe()
ISSUE: Realtime subscriptions track SUBSCRIBED state but ignore CLOSED,
  CHANNEL_ERROR, TIMED_OUT. No reconnection logic. Events during disconnection
  permanently lost. Supabase has built-in reconnection but application can't
  recover missed events.
ACTION: Add fallback polling or event replay after reconnection.
```

---

## LOW SEVERITY & POSITIVE FINDINGS

### Low Severity

- **Password policy**: 8-character minimum, no complexity requirements (password-reset and admin-reset-password)
- **useAdminUsers/useAdminProfiles**: 1-second staleTime causing excessive refetches
- **Legacy cacheTime** usage in use-mobile-performance.tsx (v5 renamed to gcTime)
- **NDA email uses setTimeout for invalidation** (arbitrary 1-second delay)
- **SPA with no SSR/prerendering** means poor SEO for dynamic listing pages
- **ESLint --max-warnings=200** is very permissive
- **Hardcoded admin email fallback** (adam.haile@sourcecodeals.com) in ~15 edge functions
- **Non-null assertions on route params** — 10+ occurrences in useDealDetail.ts
- **cron_job_logs auto-purge after 7 days** removes forensic data

### Positive Findings (Architectural Strengths)

| Area | Assessment |
|------|------------|
| **Auth architecture** | Server-side JWT validation, admin role via DB RPC, profile self-escalation prevented by RLS |
| **TypeScript** | Strict mode fully enabled, only 7 `as any` in 1,301 files, zero `@ts-ignore` |
| **SQL safety** | All queries parameterized via Supabase client, zero SQL injection risk |
| **CORS** | Origin allowlist (no wildcards), Vary: Origin header, credentials not allowed |
| **API keys** | All external API keys in Deno.env.get(), zero hardcoded keys in edge function source |
| **Document security** | Private storage buckets, 60-second signed URLs, token-gated access |
| **Code splitting** | 60+ pages lazy-loaded, vendor chunks properly split |
| **Cleanup** | All setInterval, addEventListener, and Realtime subscriptions properly cleaned up |
| **Deal pipeline data** | Admin-only via RLS + RPC guards, buyers cannot access |
| **Listing safety** | Marketplace queries use MARKETPLACE_SAFE_COLUMNS whitelist |
| **Build pipeline** | TypeScript errors fail CI, source maps excluded from production |
| **React Query** | Consistent usage across 180 files, 562 queries, no queries in loops |

---

## UPDATED REMEDIATION ROADMAP

### Sprint 0 — Emergency (This Week)

| # | Finding | Severity | Effort | Description |
|---|---------|----------|--------|-------------|
| 1 | C2 | CRITICAL | 4-6 hrs | Rotate Supabase service role key. Update all cron job migrations to use current_setting() |
| 2 | C1 | CRITICAL | 2-4 hrs | Add webhook secret verification to phoneburner, salesforce, clay webhooks |
| 3 | C3 | CRITICAL | 30 min | Fix signedDocUrl undefined variable in confirm-agreement-signed |
| 4 | H7 | HIGH | 1 hr | Add requireAdmin() to firecrawl-scrape |
| 5 | H13 | HIGH | 1-2 days | Separate preview deployments from production Supabase |

### Sprint 1 — Do Now (This Sprint)

| # | Finding | Severity | Effort | Description |
|---|---------|----------|--------|-------------|
| 6 | H1 | HIGH | 1-2 hrs | Add missing indexes on deal_pipeline, connection_requests, buyer_introductions FK columns |
| 7 | H4 | HIGH | 30 min | Add RouteErrorBoundary to public routes |
| 8 | H5 | HIGH | 1-2 days | Integrate Sentry for frontend and edge function error monitoring |
| 9 | H6 | HIGH | 1 day | Create shared PII-redacting log helper, replace raw console.log calls |
| 10 | H8 | HIGH | 1 hr | Add pg_cron jobs for buyer-enrichment-queue and scoring-queue |
| 11 | M1 | MEDIUM | 30 min | Fix enriched_contacts RLS policies (add TO service_role) |
| 12 | M2 | MEDIUM | 1 hr | Check PandaDoc /send response in auto-create-firm-on-approval |
| 13 | M5 | MEDIUM | 30 min | Add onError to useAutoCreateFirmOnApproval mutation |
| 14 | M7 | MEDIUM | 30 min | Add double-submit guard to handleAccept |
| 15 | C6 | CRITICAL | 1 hr | Verify and fix buyer_type_confidence column type |
| 16 | H11 | HIGH | 15 min | Fix ALTER TABLE on VIEW (remarketing_buyers → buyers) |

### Sprint 2 — This Month

| # | Finding | Severity | Effort | Description |
|---|---------|----------|--------|-------------|
| 17 | H2 | HIGH | 1-2 days | Scope realtime subscriptions with .eq() filters |
| 18 | H3 | HIGH | 1-2 days | Batch bulk-import-remarketing inserts (100-500 rows per call) |
| 19 | C4 | CRITICAL | 3-5 days | Add transaction boundaries to critical multi-step flows |
| 20 | H9 | HIGH | 4-6 hrs | Fix cascade delete to check intermediate errors |
| 21 | H10 | HIGH | 1-2 days | Add failed-email retry queue for Brevo |
| 22 | H12 | HIGH | 2-3 days | Add Zod schema validation for AI responses |
| 23 | H14 | HIGH | 1-2 days | Add shared rate limit middleware for edge functions |
| 24 | M3 | MEDIUM | 4 hrs | Add idempotency to smartlead/heyreach webhooks |
| 25 | M4 | MEDIUM | 1 hr | Fix fee agreement email query invalidation |
| 26 | M9 | MEDIUM | 30 min | Change AI rate limiter to fail-closed |
| 27 | M14 | MEDIUM | 1 hr | Add useMemo to 3 context provider values |
| 28 | M11 | MEDIUM | 2-3 days | Replace select('*') with explicit columns on wide tables |

### Sprint 3 — Next Quarter

| # | Finding | Severity | Effort | Description |
|---|---------|----------|--------|-------------|
| 29 | C5 | CRITICAL | 1 week | Migration squash — consolidate 853 migrations into baseline |
| 30 | M12 | MEDIUM | 2-3 days | Implement server-side universal search |
| 31 | M17 | MEDIUM | 1 day | Add AI cost cap with alerting |
| 32 | M18 | MEDIUM | 2 days | Add missed-event recovery for realtime subscriptions |
| 33 | M10 | MEDIUM | 4 hrs | Add input validation and rate limiting to track-session |

---

## APPENDIX: Findings Cross-Reference

| ID | Domain | First Audit Finding | Deep Dive Finding |
|----|--------|--------------------|--------------------|
| Duplicate emails | Domain 1C | 1C-3 (CRITICAL) | Confirmed, expanded with N-times amplification |
| Service role key | — | Not found | C2 (CRITICAL) — NEW |
| Unauthenticated webhooks | — | Not found | C1 (CRITICAL) — NEW |
| signedDocUrl bug | — | Not found | C3 (CRITICAL) — NEW |
| Zero transactions | — | Not found | C4 (CRITICAL) — NEW |
| Migration conflicts | Domain 6E-6F | 2 tables found | C5 — expanded to 10+ indexes, 30+ triggers |
| Missing indexes | — | Not found | H1 (HIGH) — NEW |
| Unscoped realtime | — | Not found | H2 (HIGH) — NEW |
| bulk-import N+1 | — | Not found | H3 (HIGH) — NEW |
| No error monitoring | — | Not found | H5 (HIGH) — NEW |
| PII in logs | — | Not found | H6 (HIGH) — NEW |

---

*Deep-dive audit performed March 14, 2026.*
*Supplements initial audit: TECHNICAL_DILIGENCE_AUDIT_2026-03-14.md*
*85+ findings. 6 CRITICAL, 14 HIGH, 30+ MEDIUM, 20+ LOW.*
