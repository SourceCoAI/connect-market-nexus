# SourceCo Platform — CTO-Level Deep Audit Report

**Date:** 2026-03-04
**Auditor:** Claude Code (Automated CTO-Level Audit)
**Codebase:** React 18 + TypeScript + Vite + Supabase (PostgreSQL + Edge Functions/Deno)
**Scope:** 1,288 TypeScript source files (src/) + 154 Supabase edge functions + migrations

---

## TABLE OF CONTENTS

1. [Dead Code Scan](#1-dead-code-scan)
2. [Database & Data Schema Audit](#2-database--data-schema-audit)
3. [API Route Audit](#3-api-route-audit)
4. [Frontend-Backend Contract Check](#4-frontend-backend-contract-check)
5. [Integration Health Check](#5-integration-health-check)
6. [Error Handling & Edge Cases](#6-error-handling--edge-cases)
7. [Configuration & Environment](#7-configuration--environment)
8. [Executive Summary Table](#8-executive-summary-table)

---

## 1. DEAD CODE SCAN

### Estimated Dead Code: ~14,400+ lines

| Category | Findings | Est. Lines |
|----------|----------|------------|
| Dead component files | 19 components | ~4,343 |
| Orphaned files (never imported) | 12 files | ~1,300 |
| Unused exports (functions/hooks/types) | 120+ exports | ~3,000+ |
| Commented-out code blocks (>5 lines) | 131 blocks | ~1,400+ |
| Unused npm dependencies | 10 true dead | N/A |
| Dead edge functions (no frontend caller) | 35 functions | Unknown |
| Orphaned scripts | 17 scripts (all) | 3,915 |

### 1.0 Dead Component Directories — Entire Subsystems Abandoned

**Severity: CRITICAL**

**`src/components/deals/` — 10 components, ~1,844 lines, ZERO imports anywhere:**

| File | Lines |
|------|-------|
| `src/components/deals/DealDetailsCard.tsx` | 74 |
| `src/components/deals/DealDocumentPreview.tsx` | 170 |
| `src/components/deals/DealDocumentsTab.tsx` | 454 |
| `src/components/deals/DealMessagePreview.tsx` | 116 |
| `src/components/deals/DealMetricsCard.tsx` | 159 |
| `src/components/deals/DealProcessStepper.tsx` | 69 |
| `src/components/deals/DealProcessSteps.tsx` | 359 |
| `src/components/deals/DealProcessTimeline.tsx` | 99 |
| `src/components/deals/ActionHub.tsx` | 212 |
| `src/components/deals/DealNextSteps.tsx` | 132 |

**Fix:** Delete `src/components/deals/` entirely.

**6 Dead pipeline detail tabs, ~2,100 lines, ZERO imports:**

| File | Lines |
|------|-------|
| `src/components/admin/pipeline/tabs/AIGeneratedNoteRenderer.tsx` | 161 |
| `src/components/admin/pipeline/tabs/PipelineDetailActivity.tsx` | 304 |
| `src/components/admin/pipeline/tabs/PipelineDetailBuyer.tsx` | 673 |
| `src/components/admin/pipeline/tabs/PipelineDetailCommunication.tsx` | 487 |
| `src/components/admin/pipeline/tabs/PipelineDetailDocuments.tsx` | 329 |
| `src/components/admin/pipeline/tabs/PipelineDetailMessages.tsx` | 146 |

**Fix:** Delete these 6 files.

### 1.0b Orphaned Files — Never Imported (12 files)

**Severity: HIGH**

| File | Lines | Description |
|------|-------|-------------|
| `src/routes/admin-routes.tsx` | 378 | Abandoned route definitions (App.tsx doesn't use) |
| `src/routes/buyer-routes.tsx` | 35 | Abandoned route definitions |
| `src/routes/public-routes.tsx` | 41 | Abandoned route definitions |
| `src/types/new-tables.ts` | 116 | Unused type definitions |
| `src/types/stale-tables.ts` | 62 | Documentation-only file |
| `src/lib/data-validation.ts` | 180 | Validation utilities never imported |
| `src/lib/rls-security-audit.ts` | 96 | 93/96 lines are comments |
| `src/config/routes.ts` | 172 | Duplicate of constants/index.ts ROUTES |
| `src/config/security.ts` | 288 | 10 exports, zero imports |
| `src/hooks/admin/use-buyer-all-contacts.ts` | 114 | Never imported |
| `src/hooks/admin/use-buyer-engagement-history.ts` | 198 | Never imported |
| `src/hooks/admin/use-member-requests-deals.ts` | 55 | Never imported |

**Fix:** Delete all 12 files. Delete `src/routes/` directory entirely.

### 1.0c Orphaned Scripts (17 scripts, 3,915 lines)

**Severity: MEDIUM**

All 17 scripts in `scripts/` are unreferenced by `package.json`, CI/CD, or any config. 10 are one-time cleanup scripts that have served their purpose. SQL audit scripts have archival value only.

**Fix:** Delete all cleanup scripts. Move SQL audits to `docs/` if needed. Wire `setup.sh` and `generate-component.sh` into `package.json` or delete them.

### 1.1 Unused Hook Exports (24 hooks)

**Severity: MEDIUM**

The following 24 hooks are exported but never imported anywhere else in the codebase:

| Hook | File |
|------|------|
| `useAutoCreateFirmOnApproval` | `src/hooks/admin/use-pandadoc.ts` |
| `useBuyerAllContacts` | `src/hooks/admin/use-buyer-all-contacts.ts` |
| `useBuyerEngagementHistory` | `src/hooks/admin/use-buyer-engagement-history.ts` |
| `useCheckDuplicates` | `src/hooks/admin/use-inbound-leads.ts` |
| `useConfirmAITask` | `src/hooks/useTaskActions.ts` |
| `useContactCallStatsByIds` | `src/hooks/use-contact-call-stats.ts` |
| `useCreatePipelineView` | `src/hooks/admin/use-pipeline-views.ts` |
| `useDeletePipelineView` | `src/hooks/admin/use-pipeline-views.ts` |
| `useDismissAITask` | `src/hooks/useTaskActions.ts` |
| `useGrantDataRoomAccess` | `src/hooks/admin/use-document-distribution.ts` |
| `useListingTypeCounts` | `src/hooks/admin/listings/use-listings-by-type.ts` |
| `useMemberRequestsDeals` | `src/hooks/admin/use-member-requests-deals.ts` |
| `usePushToDialer` | `src/hooks/use-push-to-dialer.ts` |
| `useRevokeDataRoomAccess` | `src/hooks/admin/use-document-distribution.ts` |
| `useSecondaryEntityTasks` | `src/hooks/useEntityTasks.ts` |
| `useStandupMeetings` | `src/hooks/useTaskAnalytics.ts` |
| `useUnsnoozeTask` | `src/hooks/useTaskActions.ts` |
| `useUpdateDecisionNotes` | `src/hooks/admin/use-connection-notes.ts` |
| `useUpdateFeeAgreement` | `src/hooks/admin/use-fee-agreement.ts` |
| `useUpdateFeeAgreementEmailSent` | `src/hooks/admin/use-fee-agreement.ts` |
| `useUpdateFilterPreset` | `src/hooks/admin/use-filter-presets.ts` |
| `useUpdateNDA` | `src/hooks/admin/use-nda.ts` |
| `useUpdateNDAEmailSent` | `src/hooks/admin/use-nda.ts` |
| `useUpdatePipelineView` | `src/hooks/admin/use-pipeline-views.ts` |

**Fix:** Audit each hook to determine if it's intended for future use or truly dead. Remove confirmed dead hooks. If intended for Phase 6 migration, add `// TODO: Phase 6` comments.

---

### 1.2 Edge Functions with Zero Frontend Callers (35 functions)

**Severity: MEDIUM** (many are legitimately backend-only)

These edge functions have no `supabase.functions.invoke()` calls from the frontend:

| Function | Likely Purpose | Verdict |
|----------|---------------|---------|
| `admin-digest` | Cron job | Legitimate |
| `aggregate-daily-metrics` | Cron job | Legitimate |
| `bulk-import-remarketing` | Server-triggered | Legitimate |
| `classify-buyer-types` | Background processor | Legitimate |
| `clay-test-send` | **Test endpoint** | **REMOVE** |
| `clay-webhook-linkedin` | Webhook receiver | Legitimate |
| `clay-webhook-name-domain` | Webhook receiver | Legitimate |
| `create-lead-user` | Server-triggered | Legitimate |
| `enrich-geo-data` | Server-triggered | Review |
| `enrich-session-metadata` | Server-triggered | Legitimate |
| `extract-buyer-criteria-background` | Background processor | Legitimate |
| `extract-buyer-transcript` | Background processor | Review |
| `generate-buyer-universe` | Server-triggered | Legitimate |
| `get-feedback-analytics` | **No callers** | **Review** |
| `heyreach-webhook` | Webhook receiver | Legitimate |
| `import-reference-data` | **No callers, no auth** | **REMOVE or lock** |
| `notify-remarketing-match` | DB trigger | Legitimate |
| `otp-rate-limiter` | Server-called | Legitimate |
| `parse-tracker-documents` | Background processor | Legitimate |
| `phoneburner-oauth-callback` | OAuth callback | Legitimate |
| `process-ma-guide-queue` | Queue processor | Legitimate |
| `process-standup-webhook` | Webhook receiver | Legitimate |
| `reset-agreement-data` | **Dangerous utility** | **Review** |
| `salesforce-remarketing-webhook` | Webhook receiver | Legitimate |
| `security-validation` | Server-called | Legitimate |
| `send-deal-referral` | Server-triggered | Legitimate |
| `send-marketplace-invitation` | Server-triggered | Legitimate |
| `send-password-reset-email` | Called by password-reset | Legitimate |
| `send-simple-verification-email` | Server-triggered | Legitimate |
| `send-templated-approval-email` | Server-triggered | Legitimate |
| `send-transactional-email` | Server-triggered | Legitimate |
| `sync-missing-profiles` | Maintenance utility | Legitimate |
| `test-contact-enrichment` | **Test endpoint** | **REMOVE** |
| `track-engagement-signal` | Server-triggered | Legitimate |
| `validate-criteria` | Server-called | Legitimate |
| `verify-platform-website` | Server-called | Legitimate |

**Fix:** Remove `clay-test-send` and `test-contact-enrichment` from production. Lock down `import-reference-data` with admin auth. Review `reset-agreement-data` for production necessity.

---

### 1.3 Unused NPM Dependencies (10 genuine)

**Severity: LOW**

| Package | Status |
|---------|--------|
| `@radix-ui/react-context-menu` | No imports found |
| `@radix-ui/react-menubar` | No imports found |
| `@radix-ui/react-navigation-menu` | No imports found |
| `@radix-ui/react-toggle` | No imports found |
| `@radix-ui/react-toggle-group` | No imports found |
| `@tiptap/core` | No direct imports (may be peer dep) |
| `@tiptap/extension-bubble-menu` | No imports found |
| `@tiptap/pm` | No direct imports (may be peer dep) |
| `react-resizable-panels` | No imports found |
| `vaul` | No imports found |

**Fix:** Remove unused Radix UI components, `react-resizable-panels`, and `vaul`. Verify TipTap peer dependencies before removing.

---

### 1.4 Orphaned Component Files

**Severity: LOW**

| File | Status |
|------|--------|
| `src/components/icons/AcquisitionTypeIcons.tsx` | Never imported |
| `src/components/settings/WebhookDeliveryLog.tsx` | Never imported |

---

### 1.5 Unused Environment Variable

**Severity: LOW**

`OPENROUTER_API_KEY` in `.env.example` — not referenced in any source file.

---

### 1.6 Orphaned Test/Dev Scripts

**Severity: LOW**

| File | Issue |
|------|-------|
| `test-email.js` | Contains hardcoded Supabase anon key + personal email |
| `send-test-email.html` | Contains hardcoded Supabase anon key + personal email |
| `src/seed.ts` | Sample data, import disabled but still compiled |

**Fix:** Delete `test-email.js` and `send-test-email.html`. Move `seed.ts` out of `src/`.

---

### Dead Code Section Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 2 |
| LOW | 4 |

---

## 2. DATABASE & DATA SCHEMA AUDIT

### 2.1 Pervasive `as any` / `as never` Casts on Supabase Table Access (87+ occurrences)

**Severity: HIGH**

At least 12 database tables are NOT in the generated Supabase types file, forcing `as any` or `as never` casts:

| Missing Table | Files Using It |
|---------------|---------------|
| `rm_task_activity_log` | `src/hooks/useTaskActions.ts` (7 casts) |
| `rm_deal_team` | `src/hooks/useDealTeam.ts` (4 casts) |
| `rm_deal_signals` | Multiple hooks |
| `rm_task_comments` | Task components |
| `webhook_configs` | `src/components/settings/WebhookSettings.tsx` (5 casts) |
| `webhook_deliveries` | Settings components |
| `listing_notes` | Listing components |
| `buyer_deal_scores` | Buyer scoring |
| `task_pin_log` | Task management |
| `audit_log` | Activity tracking |
| `team_member_aliases` | Team management |
| `app_settings` | Settings |

**Impact:** Column name typos and schema changes produce zero compile-time errors — only runtime failures.

**Fix:** Run `supabase gen types typescript` against the current database. This is the single highest-leverage fix in this audit.

---

### 2.2 Stale Types — Dropped Objects Still in Generated Types

**Severity: HIGH**

Migration `supabase/migrations/20260503000000_drop_unused_tables.sql` drops objects that still appear in `types.ts`:

| Object | Type | Status |
|--------|------|--------|
| `buyer_introduction_summary` | View | Dropped but in types |
| `introduced_and_passed_buyers` | View | Dropped but in types |
| `not_yet_introduced_buyers` | View | Dropped but in types |
| `marketplace_listings` | View | Dropped but in types |
| `introduction_activity` | Table | Dropped but in types |

55+ FK references still point to these dropped views.

**Fix:** Regenerate types after all migrations applied.

---

### 2.3 N+1 Query Patterns

**Severity: HIGH**

**Critical: 10-query waterfall in `src/hooks/use-contact-combined-history.ts:82-340`**

This hook performs 10 sequential queries per buyer view: contacts → contact_activities (2x) → smartlead_campaign_leads → smartlead_webhook_events → smartlead_campaigns → heyreach_campaign_leads → heyreach_webhook_events (2x) → heyreach_campaigns. With network latency, 2-5 seconds per load.

**Fix:** Create `get_buyer_activity_timeline(buyer_id uuid)` PostgreSQL function using JOINs and UNION ALL.

**Other N+1 patterns:**

| File | Pattern |
|------|---------|
| `supabase/functions/enrich-geo-data/index.ts:58-72` | Individual UPDATEs in loop (45 per batch) |
| `supabase/functions/confirm-agreement-signed/index.ts:277-278` | Profile updates per firm member |
| `supabase/functions/grant-data-room-access/index.ts:250-251` | Individual inserts in loop |

**Fix:** Batch all into single queries using `.in()` or bulk insert.

---

### 2.4 Missing Indexes on High-Frequency Filter Columns

**Severity: HIGH**

| Table | Column(s) | Query Count | Index Status |
|-------|-----------|-------------|--------------|
| `listings` | `is_internal_deal` | 13 `.eq()` calls | **Missing** |
| `user_sessions` | `is_bot, is_production` | 9 `.eq()` calls | **Missing composite** |
| `connection_requests` | `firm_id` | 27 `.eq()` calls | **Missing** |
| `connection_requests` | `source` | 12 `.eq()` calls | **Missing** |

**Fix:**
```sql
CREATE INDEX CONCURRENTLY idx_listings_is_internal_deal ON listings(is_internal_deal) WHERE status = 'active';
CREATE INDEX CONCURRENTLY idx_user_sessions_bot_prod ON user_sessions(is_bot, is_production);
CREATE INDEX CONCURRENTLY idx_connection_requests_firm_id ON connection_requests(firm_id);
CREATE INDEX CONCURRENTLY idx_connection_requests_source ON connection_requests(source);
```

---

### 2.5 NULL Hygiene Issues

**Severity: MEDIUM**

| Table.Column | Issue |
|--------------|-------|
| `deal_pipeline.created_at` | Nullable — should be `NOT NULL DEFAULT now()` |
| `deal_pipeline.updated_at` | Nullable — should be `NOT NULL DEFAULT now()` |
| `deal_pipeline.listing_id` | Nullable — orphan deals without listings |
| `contacts.archived` | `boolean | null` — should be `NOT NULL DEFAULT false` |
| `contacts.created_at` | Nullable — illogical |
| `profiles.is_admin` | Nullable — should be `NOT NULL DEFAULT false` |
| `listings` | 180 of 188 columns nullable |

---

### 2.6 Missing Foreign Key Constraints

**Severity: MEDIUM**

| Table | Column | Missing FK To |
|-------|--------|---------------|
| `call_intelligence` | `buyer_id`, `deal_id` | `buyers.id`, `deal_pipeline.id` |
| `buyer_recommendation_cache` | `listing_id` | `listings.id` |
| `audit_logs` | `admin_id`, `user_id` | `profiles.id` |
| `admin_*_views` tables | `admin_id` | `profiles.id` |

---

### 2.7 Table Name Mismatch in Code

**Severity: MEDIUM**

`src/lib/database.ts:414` references `audit_log` (singular) but schema defines `audit_logs` (plural). Silent runtime failure on audit writes.

---

### 2.8 Naming Consistency

**Status: CLEAN** — Database consistently uses `snake_case`. No mismatches found.

---

### Database Section Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 3 (untyped tables, N+1 waterfall, missing indexes) |
| MEDIUM | 3 (NULL hygiene, missing FKs, table name mismatch) |
| LOW | 0 |

---

## 3. API ROUTE AUDIT

### 3.1 `send-password-reset-email` — Unauthenticated Phishing Vector

**Severity: CRITICAL**

**File:** `supabase/functions/send-password-reset-email/index.ts`

Accepts email, token, and **full `resetUrl` from request body** with zero auth. Attacker can send phishing emails through your Brevo account to arbitrary addresses with arbitrary URLs. In-memory rate limiter resets on cold start — no protection.

**Fix:** Make internal-only (server-to-server secret). Never accept `resetUrl` from client.

---

### 3.2 `password-security` — Plaintext Passwords to Open Endpoint

**Severity: CRITICAL**

**File:** `supabase/functions/password-security/index.ts`, lines 33-36

Accepts raw plaintext passwords for strength checking with NO auth.

**Fix:** Move validation client-side or require authentication.

---

### 3.3 `import-reference-data` — Unauthenticated Bulk Data Import

**Severity: CRITICAL**

**File:** `supabase/functions/import-reference-data/index.ts`, lines 18-73

Accepts bulk imports for universes, buyers, contacts, scores with ZERO auth. Uses SERVICE_ROLE_KEY.

**Fix:** Add `requireAdmin` immediately.

---

### 3.4 `security-validation` — Unauthenticated Validation Oracle

**Severity: HIGH**

**File:** `supabase/functions/security-validation/index.ts`, lines 24-74

No auth. Accepts `user_id` from body. Attackers can reverse-engineer content moderation rules.

**Fix:** Require auth. Derive `user_id` from JWT.

---

### 3.5 `session-security` — Unauthenticated Session Manipulation

**Severity: HIGH**

**File:** `supabase/functions/session-security/index.ts`, lines 20-64

No auth. Can invalidate sessions for any user.

**Fix:** Require auth. Derive `user_id` from JWT.

---

### 3.6 `clay-test-send` — Test Endpoint in Production

**Severity: HIGH**

**File:** `supabase/functions/clay-test-send/index.ts`

No auth, exposes Clay webhook URLs.

**Fix:** Remove entirely.

---

### 3.7 `aggregate-daily-metrics` — Unauthenticated Metrics Write

**Severity: HIGH**

**File:** `supabase/functions/aggregate-daily-metrics/index.ts`

No auth. Can trigger expensive DB scans or inject manipulated metrics.

**Fix:** Add admin auth or cron secret verification.

---

### 3.8 Five Webhook Endpoints Without Secret Verification

**Severity: MEDIUM**

`clay-webhook-linkedin`, `clay-webhook-name-domain`, `heyreach-webhook`, `salesforce-remarketing-webhook`, `phoneburner-webhook` — all accept POST data without verifying caller identity.

**Fix:** Add webhook secret verification matching `smartlead-webhook` and `pandadoc-webhook-handler` patterns.

---

### 3.9 Password Policy Inconsistencies

**Severity: MEDIUM**

| Endpoint | Min Length | Complexity |
|----------|-----------|------------|
| `admin-reset-password` | 6 chars | None |
| `password-reset` | **None** | None |
| `password-security` | 8 chars | 3 of 4 types |

**Fix:** Enforce consistent policy (8+ chars, complexity) across all endpoints.

---

### 3.10 Multiple Endpoints Accept `user_id` From Request Body

**Severity: HIGH**

`security-validation`, `session-security`, `password-security`, `track-initial-session`, `track-session` all accept `user_id` from body without JWT verification — enables impersonation.

**Fix:** Derive `user_id` from JWT.

---

### 3.11 Widespread `select('*')` Over-Fetching

**Severity: MEDIUM**

44 instances of `.select('*')`. Most concerning on unauthenticated endpoints: `record-data-room-view`, `record-link-open`.

**Fix:** Replace with explicit column lists on public endpoints.

---

### 3.12 41 Edge Functions With Zero Auth

**Severity: HIGH**

41 edge functions have no authentication AND no webhook verification. Notable: `extract-deal-document`, `suggest-universe`, `submit-referral-deal`, `dedupe-buyers`.

**Fix:** Audit each. Add admin auth or server-to-server secrets.

---

### API Route Section Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 6 |
| MEDIUM | 3 |
| LOW | 0 |

---

## 4. FRONTEND-BACKEND CONTRACT CHECK

### 4.1 DataRoomPortal HTTP Method Mismatch — PAGE IS BROKEN

**Severity: CRITICAL**

**Files:** `src/pages/DataRoomPortal.tsx:70-74` / `supabase/functions/record-data-room-view/index.ts:36-41`

Backend only accepts `GET` with query params. Frontend sends `POST` with JSON body via `supabase.functions.invoke()`. Result: **405 Method Not Allowed**. The entire buyer-facing data room portal is non-functional.

**Fix:** Change backend to accept POST, or change frontend to use `fetch()` GET with query params.

---

### 4.2 DataRoomPortal Missing `mime_type`

**Severity: HIGH**

**Files:** `src/pages/DataRoomPortal.tsx:200` / `supabase/functions/record-data-room-view/index.ts:221`

Frontend uses `doc.mime_type` for icons. Backend never selects it — all docs show generic icon.

**Fix:** Add `mime_type` to backend select.

---

### 4.3 ReferralTrackerPage Reads Missing Fields

**Severity: HIGH**

**Files:** `src/pages/ReferralTrackerPage.tsx:182,192` / `supabase/functions/validate-referral-access/index.ts:163`

Frontend reads `internal_company_name` and `deal_total_score` — neither in backend select. Score badge renders nothing.

**Fix:** Add both fields to backend select.

---

### 4.4 Hardcoded Supabase URL in `fetch()` Calls

**Severity: HIGH**

3 locations bypass `supabase.functions.invoke()` and hardcode the Supabase project URL in raw `fetch()` calls.

**Fix:** Use `SUPABASE_URL` constant or `supabase.functions.invoke()`.

---

### 4.5 Password Policy Mismatch

**Severity: HIGH**

`require_special` is `false` in backend but `true` in frontend fallback. Users get stricter validation offline.

**Fix:** Align all sources.

---

### 4.6 Pervasive `as any` Type Erasure (87+ occurrences)

**Severity: MEDIUM**

See Section 2.1.

---

### 4.7 Hardcoded Domain URLs in Email Payloads

**Severity: MEDIUM**

`https://marketplace.sourcecodeals.com` hardcoded in email payloads.

**Fix:** Use `window.location.origin` or env var.

---

### Frontend-Backend Contract Section Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 4 |
| MEDIUM | 2 |
| LOW | 0 |

---

## 5. INTEGRATION HEALTH CHECK

### 5.1 CapTarget Sync — Exclusion Filters

**Status: PASS with minor issue**

All 6 exclusion categories and 5 inclusion categories correctly implemented.

| Category | Should | Status |
|----------|--------|--------|
| PE firms | EXCLUDE | PASS |
| VC firms | EXCLUDE | PASS |
| M&A advisors | EXCLUDE | PASS |
| Investment banks/brokers | EXCLUDE | PASS |
| Family offices | EXCLUDE | PASS |
| Search funds/fundless sponsors | EXCLUDE | PASS |
| RIAs | KEEP | PASS |
| Wealth management | KEEP | PASS |
| CPAs | KEEP | PASS |
| Law firms | KEEP | PASS |
| Consultants | KEEP | PASS |

**Finding:** NAME_SUFFIX_PATTERN includes bare `capital` and `partners` — potential false positives on non-financial companies.
**Severity: MEDIUM** | **File:** `supabase/functions/_shared/captarget-exclusion-filter.ts:184-185`
**Fix:** Remove bare terms, keep compound patterns only.

---

### 5.2 PandaDoc — Webhook Accepts All When Secret Missing

**Severity: HIGH**

**File:** `supabase/functions/pandadoc-webhook-handler/index.ts:86-96`

If `PANDADOC_WEBHOOK_SECRET` is unset, all webhook requests accepted. Attacker could forge signatures.

NDA and fee agreement flows are otherwise **end-to-end correct** — idempotency, backward state protection, self-healing all working.

**Fix:** Fail closed when secret not configured.

---

### 5.3 Enrichment Pipeline — Notes Analysis Timeout Too High

**Severity: MEDIUM**

**File:** `supabase/functions/enrich-deal/index.ts:404`

120s timeout on notes analysis exceeds parent function's 38s budget. Unreachable.

Pipeline is otherwise **HEALTHY** — proper timeout handling, retry with exponential backoff, circuit breaker, stale job recovery.

**Fix:** Reduce to 20 seconds.

---

### 5.4 Buyer Scoring Algorithm

**Status: HEALTHY**

No NaN, null, division-by-zero, or impossible score edge cases. Scoring calculations are mathematically sound. Only finding: comment says "max 40" for buyer type but actual max is 35 (LOW severity).

---

### 5.5 AI Memo Generation

**Status: HEALTHY**

Prompt templates exist and are correct. Data passing verified. Anonymization comprehensive.

---

### 5.6 Recommendation Engine — Universe Dependencies

**Status: PASS — COMPLETELY CLEAN**

Zero references to `universe_id`, `from_universe`, `universeId`, `buyer_universe`, or `universe_deals` in any recommendation code. The universe dependency has been **completely eliminated**.

---

### Integration Section Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 2 |
| LOW | 1 |

---

## 6. ERROR HANDLING & EDGE CASES

### 6.1 Auth State Race Condition + 3-Second Timeout

**Severity: CRITICAL**

**File:** `src/hooks/auth/use-auth-state.ts:30-246`

`onAuthStateChange` and `checkSession()` concurrently update auth state. A 3-second timeout force-completes auth, causing flash of "logged out" state, double profile fetches, and users on slow connections being redirected to login.

**Fix:** Single auth path. Increase timeout to 10s. Show "still loading" instead of forcing completion.

---

### 6.2 Fire-and-Forget Promises Without `.catch()`

**Severity: HIGH**

| File | Pattern |
|------|---------|
| `src/hooks/useAIConversation.ts:236-248` | `.then(() => {})` no catch |
| `src/components/remarketing/BulkApproveForDealsDialog.tsx:188` | `.catch(() => {})` empty |
| `src/components/remarketing/ApproveBuyerMultiDealDialog.tsx:176` | `.catch(() => {})` empty |
| `src/hooks/useBuyerEnrichmentQueue.ts:152-157` | Silent catch on processor trigger |

**Fix:** Replace empty catches with logging. Add `@typescript-eslint/no-floating-promises` lint rule.

---

### 6.3 Polling Race Condition

**Severity: HIGH**

**File:** `src/hooks/useBuyerEnrichmentQueue.ts:259-281`

`setInterval` with async function has no guard against overlapping invocations.

**Fix:** Add `isFetchingRef` guard.

---

### 6.4 Agreement Status Sync — 48 Query Invalidations Per Event

**Severity: MEDIUM**

**File:** `src/hooks/use-agreement-status-sync.ts:64-74`

16 query keys invalidated 3 times per event = 48 invalidations. Compounds with rapid events.

**Fix:** Debounce with single resettable timeout.

---

### 6.5 Division by Zero in Guide Progress

**Severity: MEDIUM**

**File:** `src/hooks/useBackgroundGuideGeneration.ts:66-68`

`phases_completed / total_phases` produces NaN when `total_phases` is 0.

**Fix:** Guard: `total_phases > 0 ? Math.round(...) : 0`

---

### 6.6 30-Second Heartbeat Too Aggressive

**Severity: MEDIUM**

**File:** `src/hooks/use-session-heartbeat.ts:5`

Every tab sends heartbeat every 30s.

**Fix:** Increase to 60s. Only heartbeat from active tab.

---

### Error Handling Section Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 2 |
| MEDIUM | 3 |
| LOW | 0 |

---

## 7. CONFIGURATION & ENVIRONMENT

### 7.1 Supabase Anon Key Hardcoded

**Severity: MEDIUM**

**File:** `src/integrations/supabase/client.ts:7`

Hardcoded instead of `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`. Undermines Dockerfile build-arg pipeline.

**Fix:** Use env vars.

---

### 7.2 Supabase URL Hardcoded in 4 Frontend Files

**Severity: MEDIUM**

`useUniversesData.ts:58`, `AddDealToUniverseDialog.tsx:372`, `DealTranscriptSection/helpers.ts:28`, `index.html:41-42`

**Fix:** Standardize on env vars.

---

### 7.3 PhoneBurner Webhook Accepts All When Secret Missing

**Severity: HIGH**

**File:** `supabase/functions/phoneburner-webhook/index.ts:90`

**Fix:** Fail closed.

---

### 7.4 EnrichmentTest Dashboard Ships in Production

**Severity: HIGH**

**File:** `src/pages/admin/EnrichmentTest.tsx:74`

Labeled "TEMP / DEV ONLY" but in production bundle. Calls real AI APIs.

**Fix:** Gate behind `import.meta.env.DEV` or remove.

---

### 7.5 Non-Null Assertions on Env Vars (30+ functions)

**Severity: MEDIUM**

`Deno.env.get('SUPABASE_URL')!` used everywhere. Cryptic errors if not set.

**Fix:** Create shared `requireEnv()` helper.

---

### 7.6 Hardcoded Fallback Emails in 20+ Edge Functions

**Severity: LOW**

`adam.haile@sourcecodeals.com` as fallback.

**Fix:** Use role-based addresses.

---

### 7.7 Personal Email in Admin Profiles

**Severity: LOW**

`src/lib/admin-profiles.ts:17-18` — `ahaile14@gmail.com`

**Fix:** Use corporate domain only.

---

### 7.8 TODO Comments (17 total)

**Severity: LOW**

16 are `TODO: Phase 6 — migrate to data access layer`. 1 is `TEMP / DEV ONLY`. No FIXME or HACK found.

---

### 7.9 Hardcoded URLs in SQL Migrations

**Severity: LOW**

6 migration files hardcode production Supabase URL in `pg_cron`/`pg_net` calls.

**Fix:** Use Postgres GUC.

---

### 7.10 No Hardcoded Service-Role Keys or Third-Party API Keys

**Status: PASS — CLEAN**

---

### Configuration Section Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 3 |
| LOW | 4 |

---

## 8. EXECUTIVE SUMMARY TABLE

### Issue Counts by Section and Severity

| Section | CRITICAL | HIGH | MEDIUM | LOW | Total |
|---------|----------|------|--------|-----|-------|
| 1. Dead Code | 1 | 1 | 3 | 4 | 9 |
| 2. Database/Schema | 0 | 3 | 3 | 0 | 6 |
| 3. API Routes | 3 | 6 | 3 | 0 | 12 |
| 4. Frontend-Backend | 1 | 4 | 2 | 0 | 7 |
| 5. Integrations | 0 | 1 | 2 | 1 | 4 |
| 6. Error Handling | 1 | 2 | 3 | 0 | 6 |
| 7. Config/Environment | 0 | 2 | 3 | 4 | 9 |
| **TOTAL** | **6** | **19** | **19** | **9** | **53** |

### Top 12 Priority Fixes

| # | Finding | Section | Severity |
|---|---------|---------|----------|
| 1 | `import-reference-data` unauthenticated bulk DB write | 3.3 | CRITICAL |
| 2 | `send-password-reset-email` phishing vector | 3.1 | CRITICAL |
| 3 | `password-security` plaintext passwords to open endpoint | 3.2 | CRITICAL |
| 4 | DataRoomPortal completely broken (POST vs GET mismatch) | 4.1 | CRITICAL |
| 5 | Auth race condition + 3-second forced timeout | 6.1 | CRITICAL |
| 6 | ~3,944 lines of dead components (deals/ + pipeline tabs) | 1.0 | CRITICAL |
| 7 | PandaDoc webhook accepts forged requests when secret missing | 5.2 | HIGH |
| 8 | PhoneBurner webhook accepts all when secret missing | 7.3 | HIGH |
| 9 | 41 edge functions with zero auth | 3.12 | HIGH |
| 10 | Regenerate Supabase types for 12+ untyped tables | 2.1 | HIGH |
| 11 | 10-query N+1 waterfall in buyer combined history | 2.3 | HIGH |
| 12 | Missing indexes on 4 high-frequency filter columns | 2.4 | HIGH |

### What's Working Well

- **Recommendation engine:** Universe dependencies completely eliminated. PASS.
- **CapTarget exclusion filters:** All 11 categories correctly implemented.
- **Buyer scoring algorithm:** No NaN, null, or division-by-zero risks. Sound.
- **AI memo generation:** Templates correct, anonymization comprehensive.
- **Enrichment pipeline:** Proper timeouts, retries, circuit breaker, stale job recovery.
- **PandaDoc NDA/fee flows:** End-to-end correct with idempotency and self-healing.
- **Secret management:** No service-role keys or API keys in source code.
- **Database naming:** Consistently snake_case. No mismatches.

---

*End of audit. 53 total findings: 6 critical, 19 high, 19 medium, 9 low. ~14,400+ lines of dead code identified.*
