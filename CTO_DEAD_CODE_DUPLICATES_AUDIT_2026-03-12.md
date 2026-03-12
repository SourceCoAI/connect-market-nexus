# CTO Codebase Audit: Dead Code & Duplicates

**Date:** 2026-03-12
**Repo:** SourceCoDeals/connect-market-nexus
**Focus:** Dead code identification, duplicate detection, deprecated table references

---

## EXECUTIVE SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| **Critical (P0)** | 4 | Dropped tables still actively queried; will cause runtime errors |
| **High (P1)** | 8 | 47 dead edge functions, duplicate type systems, unused npm packages |
| **Medium (P2)** | 6 | Duplicate constants, dead components, confusing naming |
| **Low (P3)** | 5 | Minor consolidation opportunities, documentation |

**Total issues found: 23**

---

## 1. DEAD CODE INVENTORY

### 1A. Dead Frontend Components (2 files)

| File | Reason | Recommendation |
|------|--------|----------------|
| `src/components/remarketing/ScoreBreakdown.tsx` | Exported but never imported anywhere | DELETE |
| `src/components/pandadoc/AgreementStatusBadge.tsx` | Duplicate of canonical `admin/firm-agreements/AgreementStatusBadge.tsx`; never imported | DELETE |

### 1B. Dead TypeScript Types (4 types in 1 file)

| Type | File | Reason |
|------|------|--------|
| `UserActionHandlers` | `src/types/admin-users.ts:73` | Never imported |
| `UserActionsState` | `src/types/admin-users.ts:89` | Never imported |
| `QueryCacheUpdate` | `src/types/admin-users.ts:96` | Never imported |
| `AdminConnectionRequest` | `src/types/admin-users.ts:58` | Dead duplicate — superseded by 62-field version in `admin.ts:182` |

### 1C. Dead Edge Functions (47 functions — never invoked)

These functions exist in `supabase/functions/` but have **zero invocations** from frontend code, other edge functions, or database triggers:

| # | Function | Category |
|---|----------|----------|
| 1 | `admin-digest` | Notification |
| 2 | `aggregate-daily-metrics` | Analytics |
| 3 | `approve-referral-submission` | Referral |
| 4 | `bulk-import-remarketing` | Import |
| 5 | `classify-buyer-types` | Classification |
| 6 | `clay-webhook-linkedin` | Webhook |
| 7 | `clay-webhook-name-domain` | Webhook |
| 8 | `clay-webhook-phone` | Webhook |
| 9 | `cleanup-orphaned-pandadoc-documents` | Cleanup |
| 10 | `create-lead-user` | User mgmt |
| 11 | `data-room-download` | Data room |
| 12 | `enrich-geo-data` | Enrichment |
| 13 | `enrich-list-contacts` | Enrichment |
| 14 | `enrich-session-metadata` | Analytics |
| 15 | `error-logger` | Logging |
| 16 | `extract-buyer-criteria-background` | Extraction |
| 17 | `extract-buyer-transcript` | Extraction (duplicate of `extract-transcript`) |
| 18 | `generate-buyer-universe` | Buyer discovery |
| 19 | `generate-guide-pdf` | PDF generation |
| 20 | `generate-ma-guide-background` | Guide generation |
| 21 | `get-document-download` | Documents |
| 22 | `get-feedback-analytics` | Analytics |
| 23 | `heyreach-webhook` | Webhook |
| 24 | `import-reference-data` | Import |
| 25 | `ingest-outreach-webhook` | Webhook |
| 26 | `notify-remarketing-match` | Notification |
| 27 | `otp-rate-limiter` | Security |
| 28 | `parse-tracker-documents` | Parsing |
| 29 | `phoneburner-oauth-callback` | Integration |
| 30 | `process-standup-webhook` | Webhook |
| 31 | `push-buyer-to-phoneburner` | Integration |
| 32 | `rate-limiter` | Security |
| 33 | `receive-valuation-lead` | Leads |
| 34 | `record-data-room-view` | Data room |
| 35 | `reset-agreement-data` | Agreements |
| 36 | `resolve-buyer-agreement` | Agreements |
| 37 | `salesforce-remarketing-webhook` | Webhook |
| 38 | `security-validation` | Security |
| 39 | `send-deal-referral` | Notification |
| 40 | `send-marketplace-invitation` | Notification |
| 41 | `send-simple-verification-email` | Notification |
| 42 | `session-security` | Security |
| 43 | `smartlead-webhook` | Webhook |
| 44 | `suggest-universe` | Buyer discovery |
| 45 | `track-engagement-signal` | Analytics |
| 46 | `validate-criteria` | Validation |
| 47 | `verify-platform-website` | Verification |

**Note:** Some of these (webhooks, cron-triggered) may be invoked externally. Verify before deletion:
- Webhook functions (`*-webhook`) may be called by external services
- `aggregate-daily-metrics` may be triggered by a Supabase cron job
- `otp-rate-limiter` and `rate-limiter` may be called by Supabase hooks

### 1D. Dead npm Packages (13 packages)

**Unused dependencies (5):**
| Package | Action |
|---------|--------|
| `@tiptap/core` | REMOVE |
| `@tiptap/extension-bullet-list` | REMOVE |
| `@tiptap/extension-list-item` | REMOVE |
| `@tiptap/extension-ordered-list` | REMOVE |
| `@tiptap/pm` | REMOVE |

**Unused devDependencies (8):**
| Package | Action |
|---------|--------|
| `@testing-library/dom` | REVIEW (may be peer dep) |
| `@testing-library/user-event` | REVIEW |
| `autoprefixer` | REVIEW (PostCSS config) |
| `eslint` | REVIEW (used via config) |
| `husky` | REVIEW (git hooks) |
| `jsdom` | REVIEW (vitest env) |
| `postcss` | REVIEW (build tool) |
| `typescript` | KEEP (build tool) |

**Safe to remove immediately:** The 5 `@tiptap/*` packages — no rich text editor exists in the codebase.

---

## 2. CRITICAL: DROPPED TABLES STILL REFERENCED IN CODE

**Severity: P0 — These queries will fail at runtime if the tables no longer exist in the database.**

### 2A. `connection_messages` — 10+ active references

| File | Lines | Operations |
|------|-------|------------|
| `src/hooks/use-connection-messages.ts` | 82, 119, 193, 218, 243, 284, 326 | SELECT, INSERT, UPDATE |
| `src/pages/BuyerMessages/GeneralChatView.tsx` | 113 | INSERT |
| `src/pages/BuyerMessages/useMessagesActions.ts` | 38 | INSERT |
| `src/pages/BuyerMessages/useMessagesData.ts` | 77 | SELECT |
| `src/pages/admin/MessageCenter.tsx` | 57 | SELECT |
| `src/pages/admin/message-center/ThreadContextPanel.tsx` | 200 | SELECT |
| `supabase/functions/ai-command-center/tools/connection-tools.ts` | 198 | SELECT |
| `supabase/functions/ai-command-center/tools/followup-tools.ts` | 163 | SELECT |
| `supabase/functions/ai-command-center/tools/deal-extra-tools.ts` | 231 | SELECT |
| `supabase/functions/confirm-agreement-signed/index.ts` | 480, 490 | SELECT, INSERT |
| `supabase/functions/create-pandadoc-document/index.ts` | 373 | INSERT |
| `supabase/functions/pandadoc-webhook-handler/index.ts` | 558, 568 | SELECT, INSERT |
| `supabase/functions/reset-agreement-data/index.ts` | 185 | SELECT |

### 2B. `buyer_introductions` — 6+ active references

| File | Lines | Operations |
|------|-------|------------|
| `src/hooks/use-buyer-introductions.ts` | 24, 54, 99, 260, 278, 345 | SELECT, INSERT, UPDATE |
| `src/lib/remarketing/createBuyerIntroduction.ts` | 36, 64 | INSERT, SELECT |
| `src/components/buyer-outreach/BuyerOutreachTab.tsx` | 149 | SELECT |
| `supabase/functions/convert-to-pipeline-deal/index.ts` | 271 | SELECT |

### 2C. `listing_notes` — 3 active references

| File | Lines | Operations |
|------|-------|------------|
| `src/components/remarketing/deal-detail/ListingNotesLog.tsx` | 90, 154, 174 | SELECT, INSERT |

### 2D. Other dropped tables with active references

| Dropped Table | Files Referencing |
|---------------|-------------------|
| `introduction_status_log` | `src/hooks/use-buyer-introductions.ts:112` (INSERT) |
| `connection_request_stages` | `src/hooks/use-realtime-admin.ts` (realtime subscription) |
| `engagement_scores` | `src/hooks/useBuyerIntentAnalytics.ts`, `src/hooks/useEnhancedRealTimeAnalytics.ts` |
| `interest_signals` | `supabase/functions/ai-command-center/tools/signal-tools.ts` |
| `deal_contacts` | `supabase/functions/ai-command-center/tools/deal-extra-tools.ts`, `supabase/functions/convert-to-pipeline-deal/index.ts` |
| `buyer_contacts` | `src/types/supabase-helpers.ts`, `src/types/smartlead.ts`, `src/types/heyreach.ts`, `src/components/remarketing/PushToDialerModal.tsx`, `src/pages/admin/BuyerContactsPage.tsx`, `supabase/functions/smartlead-leads/`, `supabase/functions/heyreach-leads/`, `supabase/functions/phoneburner-push-contacts/` |
| `lead_sources` | `supabase/functions/ai-command-center/tools/buyer-tools.ts`, `deal-tools.ts`, `router.ts` |
| `marketplace_listings` | `src/hooks/admin/listings/listingsSourceOfTruth.test.ts` (test) |

**Resolution options:**
1. These tables may still exist in production despite DROP migrations existing — verify live schema
2. If dropped: all references above are **broken code** that will throw runtime errors
3. If not dropped yet: the DROP migrations are pending and these references must be migrated first

---

## 3. DUPLICATE INVENTORY

### 3A. Duplicate Type Definitions

| Item A | Item B | Overlap | Recommendation |
|--------|--------|---------|----------------|
| `BuyerTypeEnum` (`status-enums.ts:96`) | `BuyerType` (`remarketing.ts:175`) | **Identical** — same 6 values, different order | Keep `BuyerTypeEnum` as canonical; alias in remarketing.ts |
| `AdminConnectionRequest` (`admin-users.ts:58`, 10 fields) | `AdminConnectionRequest` (`admin.ts:182`, 62 fields) | Same name, different shape | Delete admin-users.ts version (dead code) |
| `PaginationState` (`types/index.ts:338`, server shape) | `PaginationState` (`hooks/use-simple-pagination.ts:4`, client shape) | Same name, different shape | Rename to `ServerPaginationState` / `ClientFilterState` |
| `BuyerType` (`types/index.ts:26`, deprecated alias) | `BuyerType` (`remarketing.ts:175`, canonical) | Already marked `@deprecated` | Complete migration, remove deprecated version |

### 3B. Duplicate Filter Types (Defined 2-3x each)

| Type | Locations | Action |
|------|-----------|--------|
| `BuyerTypeFilter` | `PipelineFilters.tsx:29`, `use-pipeline-filters.ts:6`, `use-deal-filters.ts:6` | Consolidate to single file |
| `StatusFilter` | `PipelineFilters.tsx:28`, `use-pipeline-filters.ts:5` | Consolidate |
| `NdaFilter` | `PipelineFilters.tsx:30`, `use-pipeline-filters.ts:16` | Consolidate |
| `FeeAgreementFilter` | `PipelineFilters.tsx:31`, `use-pipeline-filters.ts:17` | Consolidate |

### 3C. CRITICAL: Three Conflicting Buyer Type Systems

The codebase has **three incompatible buyer type enums** running in parallel:

**System A — Marketplace (camelCase):** `src/types/index.ts`
```
'corporate' | 'privateEquity' | 'familyOffice' | 'searchFund' | 'individual' | 'independentSponsor' | 'advisor' | 'businessOwner'
```

**System B — Remarketing (snake_case):** `src/types/remarketing.ts`
```
'private_equity' | 'corporate' | 'family_office' | 'independent_sponsor' | 'search_fund' | 'individual_buyer'
```

**System C — Canonical (snake_case):** `src/types/status-enums.ts`
```
'private_equity' | 'corporate' | 'independent_sponsor' | 'search_fund' | 'family_office' | 'individual_buyer'
```

**Impact:** The mapping in `src/constants/index.ts:93-109` conflates both systems in a single `BUYER_TYPE_LABELS` object, causing `corporate` to appear twice with different labels. 15+ files have hardcoded buyer type strings from different systems.

**Recommendation:** Standardize on System C (canonical snake_case). Create migration for marketplace profiles table. Remove Systems A and B.

### 3D. Duplicate Edge Functions

| Function A | Function B | Overlap | Recommendation |
|-----------|-----------|---------|----------------|
| `extract-transcript` (with `entity_type: 'buyer'`) | `extract-buyer-transcript` | 75%+ same Gemini pipeline | Deprecate `extract-buyer-transcript` |
| 26 `send-*` notification functions | Shared base handler pattern | 30-50% via wrappers | Consolidate to ~8-12 parameterized handlers |

### 3E. Duplicate Component Names (9 pairs)

| Component | Location 1 | Location 2 | Status |
|-----------|-----------|-----------|--------|
| `AgreementStatusBadge` | `admin/firm-agreements/` (USED) | `pandadoc/` (DEAD) | Delete pandadoc version |
| `ColumnMappingStep` | `remarketing/csv-import/` | `remarketing/BuyerCSVImport/` | Both used — review consolidation |
| `ConnectionRequestDialog` | `admin/` | `connection/` | Both used, different contexts |
| `DealActivityLog` | `deals/` | `remarketing/deal-detail/` | Both used, different contexts |
| `ErrorBoundary` | `components/` root | `components/common/` | Both used, different implementations |
| `ScoreBadge` | `shared/` | `admin/deals/buyer-introductions/shared/` | Consider consolidation |
| `SourceBadge` | `admin/` | `admin/deals/buyer-introductions/shared/` | Consider consolidation |

### 3F. Duplicate Constants & Hardcoded Strings

| Issue | Files Affected | Instances |
|-------|---------------|-----------|
| Supabase URL constructed instead of imported from `client.ts` | 8 files | 8+ |
| Hardcoded status strings (`'pending'`, `'approved'`, etc.) despite centralized enums | 10+ files | 30+ |
| Table name strings (no constants file) | 70+ files | 500+ `.from()` calls |
| Deal stage config duplicated | `constants/statusTags.ts` + `listing/ListingStatusTag.tsx` | 2 |

---

## 4. MIGRATION AUDIT HIGHLIGHTS

### 4A. Net-Zero Migrations (29 tables created then dropped)

These tables were created and later dropped — the migrations add complexity with zero current value:

`ai_command_center_actions`, `buyer_introductions`, `buyer_type_profiles`, `chat_recommendations`, `chat_smart_suggestions`, `collections`, `connection_messages`, `connection_request_stages`, `contact_call_history`, `contact_email_history`, `contact_linkedin_history`, `deal_contacts`, `deal_notes`, `docuseal_webhook_log`, `generic_email_domains`, `interest_signals`, `introduction_activity`, `introduction_status_log`, `listing_messages`, `listing_notes`, `listing_personal_notes`, `pe_firm_contacts`, `platform_contacts`, `profile_data_snapshots`, `scoring_weights_history`, `task_pin_log`, `tracker_activity_logs`, `visitor_companies`

### 4B. Tables Created Multiple Times (27 tables)

Tables with multiple `CREATE TABLE IF NOT EXISTS` statements, indicating schema churn:
`audit_logs` (3x), `cron_job_logs` (3x), `enrichment_queue` (3x), plus 24 others created 2x each.

### 4C. Suspicious Table Names

- `gets` — likely a migration parsing artifact, not a real table
- `with` — SQL keyword used as table name, will cause quoting issues

---

## 5. RECOMMENDED DELETION LIST

### Safe to Delete Immediately

**Dead Components:**
```
src/components/remarketing/ScoreBreakdown.tsx
src/components/pandadoc/AgreementStatusBadge.tsx
```

**Dead Types (remove from `src/types/admin-users.ts`):**
```
UserActionHandlers (lines 73-80)
UserActionsState (lines 89-94)
QueryCacheUpdate (lines 96-99)
AdminConnectionRequest (lines 58-71)
```

**Dead npm packages:**
```bash
npm uninstall @tiptap/core @tiptap/extension-bullet-list @tiptap/extension-list-item @tiptap/extension-ordered-list @tiptap/pm
```

### Requires Verification Before Deletion

**Edge functions (47 total)** — verify these are not called by:
- External webhook services (Salesforce, HeyReach, SmartLead, Clay, PhoneBurner)
- Supabase cron jobs (`aggregate-daily-metrics`, `admin-digest`)
- Database triggers

---

## 6. RECOMMENDED CONSOLIDATION LIST

| Target (Keep) | Source (Migrate From) | Action |
|---------------|----------------------|--------|
| `BuyerTypeEnum` in `status-enums.ts` | `BuyerType` in `remarketing.ts` | Make remarketing.ts re-export from status-enums.ts |
| `AdminConnectionRequest` in `admin.ts` | `AdminConnectionRequest` in `admin-users.ts` | Delete admin-users.ts version |
| Filter types → new `src/types/filter-types.ts` | Definitions in `PipelineFilters.tsx`, `use-pipeline-filters.ts`, `use-deal-filters.ts` | Create single source, update imports |
| `SUPABASE_URL` from `client.ts` | 8 files with hardcoded URL construction | Replace with import |
| `extract-transcript` with `entity_type` param | `extract-buyer-transcript` | Deprecate buyer-specific version |
| `send-transactional-email` (base handler) | Thin wrapper `send-*` functions | Audit and consolidate |

---

## 7. PRIORITY ACTION PLAN

### P0 — Immediate (blocks production correctness)
1. **Verify dropped table status** — Check if `connection_messages`, `buyer_introductions`, `listing_notes` actually exist in production. If dropped, 25+ files have broken queries.
2. **Fix or remove all references to dropped tables** listed in Section 2.
3. **Resolve buyer type enum conflict** — Three incompatible type systems cause data inconsistency.

### P1 — This Sprint
4. Delete 2 dead components, 4 dead types.
5. Remove 5 unused `@tiptap/*` packages.
6. Consolidate 4 duplicate filter type definitions into single file.
7. Audit 47 dead edge functions — verify external invocations, archive confirmed dead ones.
8. Fix 8 hardcoded Supabase URL constructions.

### P2 — This Month
9. Create `src/constants/table-names.ts` — centralize 500+ `.from()` string literals.
10. Consolidate 26 `send-*` notification functions to ~8-12 parameterized handlers.
11. Consolidate `extract-buyer-transcript` into `extract-transcript`.
12. Rename duplicate `PaginationState` types.
13. Audit 5 Fireflies integration functions for overlap.
14. Review `ColumnMappingStep`, `ScoreBadge`, `SourceBadge` component duplicates.

### P3 — Backlog
15. Squash net-zero migrations (29 create+drop pairs) when next doing migration cleanup.
16. Investigate suspicious table names (`gets`, `with`).
17. Centralize hardcoded status strings (30+ instances).
18. Centralize edge function names in constants file.
