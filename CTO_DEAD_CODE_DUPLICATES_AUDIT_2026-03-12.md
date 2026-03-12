# CTO Codebase Audit: Dead Code & Duplicates

**Date:** 2026-03-12
**Scope:** Dead code identification + duplicate detection across database, edge functions, frontend components, types, and npm packages
**Repository:** SourceCoDeals/connect-market-nexus

---

## EXECUTIVE SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| **P0 Critical** | 2 | Ghost types in types.ts for dropped tables; duplicate `BuyerType` definitions with incompatible values |
| **P1 High** | 14 | 40 dead edge functions; 5 droppable DB tables; 11-file dead feature module; duplicate type definitions causing silent mismatches |
| **P2 Medium** | 18 | Dead components; orphaned routes; unused npm packages; duplicate UI components; stale type exports |
| **P3 Low** | 12 | Duplicate constants; unnecessary re-exports; consolidation candidates (transcript tables, email functions) |

**Total issues found: 46**

---

## 1. DEAD DATABASE TABLES

### 1A. Confirmed Dead Tables (0 code references outside types.ts)

| Table | Migration Refs | Recommendation |
|-------|---------------|----------------|
| `enrichment_test_results` | 2 | DROP — testing artifact, 0 code refs |
| `enrichment_test_runs` | 2 | DROP — testing artifact, 0 code refs |
| `introduction_activity` | 4 | DROP — already dropped in migration `20260503000000`, ghost entry in types.ts |

### 1B. Likely Dead Tables (only referenced from dead code like `src/lib/migrations.ts`)

| Table | Single Ref Location | Recommendation |
|-------|-------------------|----------------|
| `cron_job_logs` | `src/lib/migrations.ts` (dead file) | Flag for review — may be written to by DB triggers |
| `deal_task_reviewers` | `src/lib/migrations.ts` (dead file) | Flag for review |
| `trigger_logs` | `src/lib/migrations.ts` (dead file) | Flag for review — may be written to by DB triggers |
| `user_notes` | `src/hooks/admin/use-connection-notes.ts` (1 ref) | Flag for review |

### 1C. Dead File: `src/lib/migrations.ts`

This file is **never imported** by any other file in the codebase. It exists as a standalone reference document listing migration history but is not runtime code. All table references through this file are effectively dead.

---

## 2. DUPLICATE DATABASE TABLES

### 2A. Contact Tables (P1 — Stale references to dropped tables)

| Table | Status | Code Refs | Action |
|-------|--------|-----------|--------|
| **`contacts`** | ACTIVE (unified) | 148+ | KEEP |
| `pe_firm_contacts` | DROPPED | 8 stale refs | Clean stale code refs |
| `platform_contacts` | DROPPED | 7 stale refs | Clean stale code refs |
| `remarketing_buyer_contacts` | FROZEN (read-only) | 18 refs | DROP — data backfilled to `contacts` |
| `deal_contacts` | DROPPED | 5 stale refs | Clean stale code refs |
| `enriched_contacts` | ACTIVE (enrichment cache) | 42 refs | KEEP — distinct purpose |

**Stale references found in:**
- `src/pages/admin/ChatbotTestRunner/RulesTab.tsx` (pe_firm_contacts, platform_contacts)
- `supabase/functions/_shared/ai-command-center-tools.test.ts` (pe_firm_contacts)
- `src/lib/migrations.ts` (all three dropped tables)

### 2B. Lead Tables

| Table | Code Refs | Action |
|-------|-----------|--------|
| **`valuation_leads`** | 48 | KEEP |
| `incoming_leads` | 5 | DROP — redundant backup of valuation_leads |

### 2C. Audit Log Tables

| Table | Code Refs | Action |
|-------|-----------|--------|
| **`audit_logs`** (plural) | 5 | KEEP |
| `audit_log` (singular) | 0 | DROP — duplicate with richer schema but 0 usage |

### 2D. Deal Notes

| Table | Code Refs | Action |
|-------|-----------|--------|
| **`deal_comments`** | 17 | KEEP — has mentions support |
| `deal_notes` | 0 | DROP — explicitly superseded |

### 2E. Transcript Tables (Tech Debt — do not drop yet)

| Table | Code Refs | Scope |
|-------|-----------|-------|
| `deal_transcripts` | 136 | Seller/deal calls |
| `buyer_transcripts` | 63 | Buyer criteria calls |
| `call_transcripts` | 28 | Structural superset of both |

All three store transcript_text + extracted insights. `call_transcripts` is the most complete schema. **Recommend long-term consolidation** into `call_transcripts` but this is a high-risk refactor given 199 combined references.

### 2F. Ghost Types in `src/integrations/supabase/types.ts` (P0)

These tables/views have been dropped but still appear in the Supabase generated types file:

| Ghost Entry | Type in types.ts | Actual Status |
|-------------|-----------------|---------------|
| `introduction_activity` | Table | DROPPED in `20260503000000` |
| `listing_notes` | Table | DROPPED in `20260503000000` |
| `permission_audit_log` | Table | DROPPED in `20260503000000` |
| `marketplace_listings` | View | Recreated as a VIEW (OK but types.ts lists it as Table) |
| `buyer_introduction_summary` | View | May have been dropped/recreated |
| `introduced_and_passed_buyers` | View | May have been dropped/recreated |
| `not_yet_introduced_buyers` | View | May have been dropped/recreated |

**Fix:** Regenerate types with `supabase gen types typescript` to sync types.ts with live schema.

---

## 3. DEAD EDGE FUNCTIONS

**40 out of 171 edge functions have zero invocations** from frontend, other edge functions, cron jobs, or database triggers.

### 3A. Confirmed Dead (safe to delete)

| # | Function | Reason |
|---|----------|--------|
| 1 | `analyze-buyer-notes` | Never invoked from anywhere |
| 2 | `bulk-import-remarketing` | Never invoked |
| 3 | `classify-buyer-types` | Batch classifier never wired up |
| 4 | `cleanup-orphaned-pandadoc-documents` | Never scheduled or called |
| 5 | `create-lead-user` | Never invoked |
| 6 | `enrich-geo-data` | Never invoked |
| 7 | `enrich-session-metadata` | Never invoked |
| 8 | `error-logger` | Frontend uses local `@/lib/error-logger`, not this edge function |
| 9 | `extract-buyer-criteria-background` | Wrapper never connected |
| 10 | `extract-buyer-transcript` | Superseded by `extract-transcript` with `entity_type='buyer'` |
| 11 | `extract-transcript` | Generic version, never invoked |
| 12 | `firecrawl-scrape` | Never invoked |
| 13 | `generate-buyer-universe` | Logic inlined into `process-buyer-universe-queue` |
| 14 | `generate-guide-pdf` | Never invoked |
| 15 | `generate-ma-guide-background` | Never invoked |
| 16 | `get-feedback-analytics` | Never invoked |
| 17 | `heyreach-campaigns` | Never invoked |
| 18 | `heyreach-leads` | Never invoked |
| 19 | `import-reference-data` | Never invoked |
| 20 | `notify-remarketing-match` | Never invoked |
| 21 | `otp-rate-limiter` | Dead endpoint; shared module handles rate limiting |
| 22 | `parse-tracker-documents` | Never invoked |
| 23 | `push-buyer-to-heyreach` | Never invoked |
| 24 | `push-buyer-to-phoneburner` | Never invoked |
| 25 | `rate-limiter` | Dead endpoint; `_shared/rate-limiter.ts` module is used instead |
| 26 | `receive-valuation-lead` | Never invoked |
| 27 | `reset-agreement-data` | Never invoked |
| 28 | `resolve-buyer-agreement` | Never invoked |
| 29 | `security-validation` | Frontend uses local `@/lib/session-security` |
| 30 | `send-deal-referral` | Never invoked |
| 31 | `send-marketplace-invitation` | Never invoked |
| 32 | `send-simple-verification-email` | Never invoked |
| 33 | `send-transactional-email` | Planned consolidation of 32 email functions, never wired up |
| 34 | `session-security` | Frontend uses local module |
| 35 | `smartlead-campaigns` | Never invoked |
| 36 | `suggest-universe` | Never invoked |
| 37 | `sync-phoneburner-transcripts` | Never invoked |
| 38 | `track-engagement-signal` | Never invoked |
| 39 | `validate-criteria` | Never invoked |
| 40 | `verify-platform-website` | Never invoked |

### 3B. Duplicate Edge Function Clusters

#### Cluster 1: Deal Ownership Notifications (3 functions -> should be 1)
- `notify-deal-owner-change` — notifies about ownership changes
- `notify-deal-reassignment` — notifies about deal reassignment
- `notify-new-deal-owner` — notifies the new owner

All three handle the same event (deal ownership transfer) with different recipients. **Merge into one function.**

#### Cluster 2: Approval Emails (2 functions -> should be 1)
- `send-approval-email` — original
- `send-templated-approval-email` — newer NDA-aware variant

The templated version was meant to replace the original. **Keep `send-templated-approval-email`, retire `send-approval-email`.**

#### Cluster 3: Feedback Emails (2 functions -> should be 1)
- `send-feedback-email`
- `send-feedback-notification`

Overlapping email delivery for feedback. **Merge.**

#### Cluster 4: Unfinished Email Consolidation
`send-transactional-email` (DEAD) was designed to replace 32+ individual email functions via a template registry in `_shared/email-templates.ts`. The migration was never executed. **Either complete it or delete the dead function + template registry.**

---

## 4. DEAD FRONTEND CODE

### 4A. Dead Components

| File | Lines | Reason |
|------|-------|--------|
| `src/components/remarketing/ScoreBreakdown.tsx` | -- | Replaced by `ScoreBreakdownPanel` in `BuyerMatchScoreSection.tsx` |
| `src/components/common/Skeleton.tsx` | -- | Exports 7 skeleton components; none imported anywhere. Pages use inline skeletons instead |

### 4B. Dead Feature Module: `src/features/auth/` (11 files)

Nothing outside this directory imports from it. The active signup flow is in `src/pages/Signup/`. This was an abandoned feature-based refactoring attempt.

Dead files:
- `src/features/auth/components/AuthErrorBoundary.tsx`
- `src/features/auth/components/EnhancedSignupForm/` (5 files)
- `src/features/auth/components/ProtectedSignupForm.tsx`
- `src/features/auth/guards/AuthGuards.ts`
- `src/features/auth/hooks/useProtectedAuth.ts`
- `src/features/auth/index.ts`
- `src/features/auth/types/auth.types.ts`

### 4C. Dead Pages

| Page | Lines | Reason |
|------|-------|--------|
| `src/pages/admin/remarketing/StandupTracker.tsx` | 366 | Not in router, not lazy-loaded, not imported |

### 4D. Orphaned Routes

| Route | File | Reason |
|-------|------|--------|
| `/admin-login` | `App.tsx:279` | No `<Link>`, `navigate()`, or `href` points here |

### 4E. Dead File: `src/lib/criteriaSchema.ts`

Entire file is dead. All exported types (`SizeCriteriaSchema`, `ServiceCriteriaSchema`, etc.) have zero imports. The active equivalents live in `src/types/remarketing.ts`.

### 4F. Dead File: `src/types/contacts.ts`

Entire file is dead. All exported types (`ProspeoResult`, `EnrichedContact`, `ContactSearchResult`) have zero imports.

---

## 5. DUPLICATE FRONTEND CODE

### 5A. Duplicate Components

| Component | File A | File B | Recommendation |
|-----------|--------|--------|----------------|
| DuplicateWarningDialog | `src/components/admin/DuplicateWarningDialog.tsx` | `src/components/admin/CreateDealModal/DuplicateWarningDialog.tsx` | Merge -- same purpose, different UI wrappers |
| AddDealDialog | `src/components/remarketing/AddDealDialog.tsx` | `src/pages/admin/remarketing/GPPartnerDeals/AddDealDialog.tsx` + `SourceCoDeals/AddDealDialog.tsx` | 3 copies -- extract shared dialog with partner-specific config |
| AddContactDialog | `src/pages/admin/remarketing/PEFirmDetail/AddContactDialog.tsx` | `src/pages/admin/remarketing/ReMarketingBuyerDetail/AddContactDialog.tsx` | Merge |
| ErrorBoundary | 5 implementations with a confusing delegation chain | -- | Consolidate to 2 max: app-level + admin-level |

### 5B. ConnectionRequestDialog -- Intentional Split

- `src/components/admin/ConnectionRequestDialog.tsx` (admin-facing)
- `src/components/connection/ConnectionRequestDialog.tsx` (buyer-facing)

These serve different audiences and are **not duplicates**.

---

## 6. DUPLICATE TYPE DEFINITIONS

### 6A. Critical: `BuyerType` -- Two Incompatible Definitions (P0)

| Location | Values |
|----------|--------|
| `src/types/index.ts:26` | camelCase: `'corporate' \| 'privateEquity' \| 'familyOffice' \| ...` |
| `src/types/remarketing.ts` | snake_case: `'private_equity' \| 'corporate' \| 'family_office' \| ...` |

Consumers import whichever they find first, creating **silent type mismatches** that TypeScript cannot catch.

**Fix:** Pick one canonical definition (snake_case matches the database). Remove the other.

### 6B. `ConnectionRequestStatus` -- Two Definitions with Different Values

| Location | Values |
|----------|--------|
| `src/types/index.ts:38` | 3 values: `'pending' \| 'approved' \| 'rejected'` |
| `src/types/status-enums.ts:27` | 6 values: adds `'notified' \| 'reviewed' \| 'converted'` |

**Fix:** Use the 6-value version as canonical. Remove the 3-value version.

### 6C. `AdminConnectionRequest` -- Two Definitions with Different Fields

| Location | Fields |
|----------|--------|
| `src/types/admin.ts:182` | Full 60+ field interface |
| `src/types/admin-users.ts:58` | Minimal 11-field interface |

**Fix:** Keep the full version. Remove or alias the minimal one.

### 6D. `User` -- Two Definitions

| Location | Shape |
|----------|-------|
| `src/types/index.ts` | 100+ field profile interface |
| `src/types/admin-users.ts:7` | `export type User = AdminUser` (deprecated alias, ~50 fields) |

**Fix:** Remove the alias. Update the 3 consumers to import the canonical type.

### 6E. Dead Type Exports (P2)

**`src/types/supabase-helpers.ts`** -- Nearly all dead:
- 13 generic utility types (`Nullable`, `DeepPartial`, `RequireKeys`, etc.) -- zero imports
- 4 branded ID types (`UserId`, `ListingId`, `DealId`, `ConnectionRequestId`) -- zero imports
- 15+ table-row aliases (`ProfileInsert`, `ListingRow`, `CompanyRow`, etc.) -- zero imports
- Only 5 types survive: `ProfileRow`, `DealRow`, `ConnectionRequestRow`, `DealStageRow`, `BuyerRow`, `TableRow`

**`src/types/analytics.ts`** -- All exports dead:
- `AnalyticsEvent`, `FeedbackAnalytics`, `DailyTrend`, `TopUser`, `MarketplaceAnalytics` -- zero imports

**`src/types/buyer-introductions.ts`** -- Partially dead:
- `IntroductionStatusLog`, `IntroductionActivity`, `CreateBuyerIntroductionInput` -- zero imports

**`src/types/index.ts`** -- Dead re-exports:
- 7 status constant arrays (`LISTING_PIPELINE_STATUSES`, etc.) -- zero imports
- `FullConnectionRequestStatus`, `FullIntroductionStatus` -- zero imports
- `ListingPipelineStatus`, `MemoStatus`, `MarketplaceListingStatus`, `EnrichmentJobStatus` -- zero imports
- `CreateListingData` -- zero imports

### 6F. HeyReach / Smartlead -- Structurally Identical Types

6 interface pairs are defined identically in both `src/types/heyreach.ts` and `src/types/smartlead.ts`:
- `PushLeadsRequest`, `PushLeadsResponse`, `CreateCampaignRequest`, `ListCampaignsResponse`, `CampaignStatsResponse`, `SyncCampaignsResponse`

**Fix:** Extract shared interfaces to a common `outreach-platform.ts` type file.

---

## 7. DUPLICATE CONSTANTS

| Constant | Location A | Location B | Issue |
|----------|-----------|-----------|-------|
| `APPROVAL_STATUSES` | `src/constants/index.ts:73` (object) | `src/types/status-enums.ts:95` (array) | Both unused. Delete both or pick one |
| `CONNECTION_STATUSES` / `CONNECTION_REQUEST_STATUSES` | `src/constants/index.ts:79` (4 values) | `src/types/status-enums.ts:35` (6 values) | Incompatible. Neither imported. Delete both or pick one |
| Supabase URL | `@/integrations/supabase/client` (centralized) | `import.meta.env.VITE_SUPABASE_URL` (7 files bypass) | Standardize to centralized import |
| Buyer type labels | `src/constants/index.ts` (`BUYER_TYPE_LABELS`) | `src/types/remarketing.ts` (`REMARKETING_BUYER_TYPE_OPTIONS`) | Two encodings of the same mapping |

---

## 8. DEAD NPM PACKAGES

### 8A. Unused Dependencies (add bundle weight with zero benefit)

| Package | Size Impact |
|---------|-------------|
| `@tiptap/core` | Rich text editor -- unused |
| `@tiptap/extension-bullet-list` | -- |
| `@tiptap/extension-list-item` | -- |
| `@tiptap/extension-ordered-list` | -- |
| `@tiptap/pm` | ProseMirror -- unused |

### 8B. Unused Dev Dependencies

| Package | Note |
|---------|------|
| `@testing-library/dom` | Testing utilities not used |
| `@testing-library/user-event` | Testing utilities not used |
| `autoprefixer` | PostCSS plugin -- may be config-referenced (false positive) |
| `eslint` | Used via `eslint.config.js` (false positive) |
| `husky` | Git hooks (false positive) |
| `jsdom` | Test environment (false positive) |
| `postcss` | Config-referenced (false positive) |
| `typescript` | Used by tsc (false positive) |

**Safely removable:** The 5 `@tiptap/*` packages and `@testing-library/dom` + `@testing-library/user-event`.

---

## 9. RECOMMENDED DELETION LIST

### 9A. Database Tables to DROP

```sql
-- Dead tables (0 code refs)
DROP TABLE IF EXISTS enrichment_test_results CASCADE;
DROP TABLE IF EXISTS enrichment_test_runs CASCADE;

-- Duplicate/superseded tables
DROP TABLE IF EXISTS incoming_leads CASCADE;          -- redundant copy of valuation_leads
DROP TABLE IF EXISTS audit_log CASCADE;               -- duplicate of audit_logs (singular vs plural)
-- deal_notes already dropped or should be confirmed dropped (superseded by deal_comments)

-- Frozen tables with data migrated
-- DROP TABLE IF EXISTS remarketing_buyer_contacts CASCADE;  -- REVIEW: confirm all data migrated to contacts first
```

### 9B. Edge Functions to Delete (40 directories)

```
supabase/functions/analyze-buyer-notes/
supabase/functions/bulk-import-remarketing/
supabase/functions/classify-buyer-types/
supabase/functions/cleanup-orphaned-pandadoc-documents/
supabase/functions/create-lead-user/
supabase/functions/enrich-geo-data/
supabase/functions/enrich-session-metadata/
supabase/functions/error-logger/
supabase/functions/extract-buyer-criteria-background/
supabase/functions/extract-buyer-transcript/
supabase/functions/extract-transcript/
supabase/functions/firecrawl-scrape/
supabase/functions/generate-buyer-universe/
supabase/functions/generate-guide-pdf/
supabase/functions/generate-ma-guide-background/
supabase/functions/get-feedback-analytics/
supabase/functions/heyreach-campaigns/
supabase/functions/heyreach-leads/
supabase/functions/import-reference-data/
supabase/functions/notify-remarketing-match/
supabase/functions/otp-rate-limiter/
supabase/functions/parse-tracker-documents/
supabase/functions/push-buyer-to-heyreach/
supabase/functions/push-buyer-to-phoneburner/
supabase/functions/rate-limiter/
supabase/functions/receive-valuation-lead/
supabase/functions/reset-agreement-data/
supabase/functions/resolve-buyer-agreement/
supabase/functions/security-validation/
supabase/functions/send-deal-referral/
supabase/functions/send-marketplace-invitation/
supabase/functions/send-simple-verification-email/
supabase/functions/send-transactional-email/
supabase/functions/session-security/
supabase/functions/smartlead-campaigns/
supabase/functions/suggest-universe/
supabase/functions/sync-phoneburner-transcripts/
supabase/functions/track-engagement-signal/
supabase/functions/validate-criteria/
supabase/functions/verify-platform-website/
```

### 9C. Frontend Files to Delete

```
src/features/auth/                              (entire directory -- 11 files)
src/components/remarketing/ScoreBreakdown.tsx    (replaced by ScoreBreakdownPanel)
src/components/common/Skeleton.tsx              (7 exports, 0 consumers)
src/pages/admin/remarketing/StandupTracker.tsx  (366 lines, not in router)
src/lib/criteriaSchema.ts                       (entire file dead)
src/types/contacts.ts                           (entire file dead)
src/types/analytics.ts                          (entire file dead -- all exports unused)
src/lib/migrations.ts                           (never imported)
```

### 9D. NPM Packages to Remove

```bash
npm uninstall @tiptap/core @tiptap/extension-bullet-list @tiptap/extension-list-item @tiptap/extension-ordered-list @tiptap/pm
npm uninstall -D @testing-library/dom @testing-library/user-event
```

---

## 10. RECOMMENDED CONSOLIDATION LIST

| Item A (Source) | Item B (Target/Keep) | Action |
|----------------|---------------------|--------|
| `BuyerType` in `types/index.ts` (camelCase) | `BuyerType` in `types/remarketing.ts` (snake_case) | Keep snake_case (matches DB). Update all consumers |
| `ConnectionRequestStatus` 3-value | `ConnectionRequestStatus` 6-value | Keep 6-value version |
| `AdminConnectionRequest` minimal | `AdminConnectionRequest` full | Keep full. Update 3 consumers |
| `User` alias in `admin-users.ts` | `User` in `types/index.ts` | Remove alias. Update 3 consumers |
| `notify-deal-owner-change` + `notify-deal-reassignment` + `notify-new-deal-owner` | Single `notify-deal-ownership` function | Merge 3 -> 1 |
| `send-approval-email` | `send-templated-approval-email` | Keep templated. Retire original |
| `send-feedback-email` + `send-feedback-notification` | Single feedback email function | Merge 2 -> 1 |
| `DuplicateWarningDialog` (2 copies) | Extract shared component | Merge 2 -> 1 |
| `AddDealDialog` (3 copies) | Extract shared dialog with config | Merge 3 -> 1 |
| `AddContactDialog` (2 copies) | Extract shared component | Merge 2 -> 1 |
| ErrorBoundary (5 implementations) | 2 max: app-level + admin-level | Consolidate 5 -> 2 |
| HeyReach/Smartlead types (6 identical pairs) | Common `outreach-platform.ts` | Extract shared types |
| Supabase URL (7 files bypass centralized import) | `@/integrations/supabase/client` | Standardize all to centralized import |
| `BUYER_TYPE_LABELS` + `REMARKETING_BUYER_TYPE_OPTIONS` | Single canonical mapping | Merge |

---

## 11. TYPES.TS REGENERATION REQUIRED (P0)

The Supabase types file (`src/integrations/supabase/types.ts`) is **out of sync** with the live database schema. At minimum 3 dropped tables still appear as Table entries, and 4 dropped/recreated views may have stale definitions.

**Immediate action:** Run `supabase gen types typescript --project-id vhzipqarkmmfuqadefep` to regenerate.

---

## 12. DEAD CODE BY THE NUMBERS

| Category | Dead Items | % of Total |
|----------|-----------|------------|
| Database tables (droppable) | 2-5 | 1-3% of 150 tables |
| Edge functions | 40 | 23% of 171 functions |
| Frontend files | 17+ files | -- |
| npm packages | 7 | -- |
| Type definitions | 50+ exports | -- |
| Ghost types (dropped tables in types.ts) | 7 | -- |

**Estimated cleanup impact:**
- ~40 fewer edge functions to deploy, test, and maintain
- ~17 fewer frontend files
- ~7 fewer npm packages (reduced bundle size from tiptap removal)
- Elimination of silent type mismatches from duplicate BuyerType definitions
- Schema sync between types.ts and live database
