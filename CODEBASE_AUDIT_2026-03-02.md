## SOURCECO CODEBASE AUDIT REPORT
Generated: 2026-03-02

---

### SUMMARY
- **Total issues found:** 131
- **Critical (delete immediately):** 34
- **Medium (consolidate / refactor):** 62
- **Low (clean up when possible):** 35

---

### SECTION 1 — Dead & Unused Code

#### 1A. Unused Hooks (12 hooks — DELETE)

| # | File | Export(s) | Why Flagged | Action |
|---|------|-----------|-------------|--------|
| 1 | `src/hooks/use-role-access.ts` | `useRoleAccess()` | 0 imports anywhere. Superseded by newer auth system | Delete |
| 2 | `src/hooks/use-search-param-state.ts` | `useSearchParamState<T>()` | 0 imports anywhere | Delete |
| 3 | `src/hooks/useDebouncedValue.ts` | `useDebouncedValue<T>()`, `useDebouncedCallback<T>()` | 0 imports anywhere | Delete |
| 4 | `src/hooks/useOptimisticUpdate.ts` | `useOptimisticUpdate<T,V>()` | 0 imports anywhere | Delete |
| 5 | `src/hooks/useRetryQuery.ts` | `useRetryQuery<T>()`, `useResilientQuery<T>()`, `getQueryErrorMessage()` | 0 imports anywhere | Delete |
| 6 | `src/hooks/useSecureForm.ts` | `useSecureForm<T>()` | 0 imports anywhere | Delete |
| 7 | `src/hooks/useVirtualList.ts` | `useVirtualList()` | 0 imports anywhere | Delete |
| 8 | `src/hooks/admin/use-approval-status.ts` | `useUpdateApprovalStatus()`, `useUpdateRejectionStatus()` | 0 imports anywhere | Delete |
| 9 | `src/hooks/admin/use-bulk-followup.ts` | `useBulkFollowup()` | 0 imports anywhere | Delete |
| 10 | `src/hooks/admin/use-update-deal.ts` | `useUpdateDeal()` | 0 imports anywhere | Delete |
| 11 | `src/hooks/admin/use-deal-tasks.ts` | Multiple task hooks | DEPRECATED — file has deprecation notice directing to `useEntityTasks` system | Delete |
| 12 | `src/hooks/admin/listings/utils/storage-helpers.ts` | 3 deprecated aliases | DEPRECATED — re-exports pointing to `@/lib/storage-utils` | Delete |

#### 1B. Unreachable Components (20+ components — INVESTIGATE)

These component files exist but are never imported or rendered anywhere:

**Admin Components (6 files):**

| # | File | What It Is | Action |
|---|------|-----------|--------|
| 13 | `src/components/admin/BulkFollowupConfirmation.tsx` | Bulk follow-up confirmation dialog | Investigate |
| 14 | `src/components/admin/BuyerDealsOverview.tsx` | Buyer deals overview panel | Investigate |
| 15 | `src/components/admin/DecisionNotesInline.tsx` | Inline decision notes | Investigate |
| 16 | `src/components/admin/QuickActionsBar.tsx` | Quick actions toolbar | Investigate |
| 17 | `src/components/admin/ResearchDealCard.tsx` | Research deal card | Investigate |
| 18 | `src/components/admin/StatusIndicatorRow.tsx` | Status indicator row | Investigate |

**Dashboard/Analytics (2 files):**

| # | File | What It Is | Action |
|---|------|-----------|--------|
| 19 | `src/components/admin/dashboard/QuickNoteInput.tsx` | Quick note input | Investigate |
| 20 | `src/components/admin/analytics/datafast/ClickableRow.tsx` | Clickable data row | Investigate |

**Editor Section Components (8 files — entire directory appears dead):**

| # | File | Action |
|---|------|--------|
| 21 | `src/components/admin/editor-sections/EditorAdvancedSection.tsx` | Investigate |
| 22 | `src/components/admin/editor-sections/EditorBasicInfoSection.tsx` | Investigate |
| 23 | `src/components/admin/editor-sections/EditorCoreDetailsSection.tsx` | Investigate |
| 24 | `src/components/admin/editor-sections/EditorFinancialAndMetricsSection.tsx` | Investigate |
| 25 | `src/components/admin/editor-sections/EditorFinancialSection.tsx` | Investigate |
| 26 | `src/components/admin/editor-sections/EditorInternalDataSection.tsx` | Investigate |
| 27 | `src/components/admin/editor-sections/EditorInternalSection.tsx` | Investigate |
| 28 | `src/components/admin/editor-sections/EditorMetricsSection.tsx` | Investigate |

**Firm Agreements (4 files):**

| # | File | Action |
|---|------|--------|
| 29 | `src/components/admin/firm-agreements/FirmAgreementToggles.tsx` | Investigate |
| 30 | `src/components/admin/firm-agreements/FirmAgreementsTable.tsx` | Investigate |
| 31 | `src/components/admin/firm-agreements/FirmBulkActions.tsx` | Investigate |
| 32 | `src/components/admin/firm-agreements/FirmSyncTestingPanel.tsx` | Investigate |

**Pipeline and Other (3 files):**

| # | File | Action |
|---|------|--------|
| 33 | `src/components/admin/pipeline/ConnectionRequestNotes.tsx` | Investigate |
| 34 | `src/components/admin/pipeline/PipelineViewSwitcher.tsx` | Investigate |
| 35 | `src/components/admin/non-marketplace/SendInvitationDialog.tsx` | Investigate |

#### 1C. Unused Exports / Constants (4 items)

| # | File | Export | Action |
|---|------|--------|--------|
| 36 | `src/lib/field-helpers.ts` | `INDUSTRY_DESCRIPTIONS` | Investigate |
| 37 | `src/lib/field-helpers.ts` | `LOCATION_DESCRIPTIONS` | Investigate |
| 38 | `src/lib/field-helpers.ts` | `FIELD_HELPERS` | Investigate |
| 39 | `src/lib/criteriaSchema.ts` | `EXTRACTION_TOOL_SCHEMA` | Delete |

**Estimated removable dead code: ~2,000+ lines**

---

### SECTION 2 — Duplicate Code

#### 2A. Duplicate Utility Functions

| # | Duplication | Files | Action |
|---|-------------|-------|--------|
| 40 | `formatCurrency()` implemented twice with nearly identical logic | `src/lib/currency-utils.ts` and `src/lib/financial-parser.ts` | Merge — keep `currency-utils.ts`, remove duplicate from `financial-parser.ts` |
| 41 | `generateAnonymousName()` / `generateAnimalName()` — same hash-based color+animal logic | `src/lib/anonymousNames.ts` and `src/hooks/useUserDetail.ts` (lines 81-137) | Merge — use single export from `anonymousNames.ts` |

#### 2B. Duplicate Hooks

| # | Duplication | Files | Action |
|---|-------------|-------|--------|
| 42 | Deal follow-up hooks — two near-identical implementations with different naming | `src/hooks/admin/use-deal-followup.ts` and `src/hooks/admin/use-deal-follow-up.ts` | Merge — keep the more feature-rich version |
| 43 | User details hooks — confusingly similar names, overlapping purpose | `src/hooks/use-user-details.ts` (profile) and `src/hooks/useUserDetail.ts` (analytics) | Refactor — rename to `useUserProfile()` and `useUserActivityAnalytics()` |

#### 2C. Duplicate/Near-Identical Components

| # | Duplication | Files | Action |
|---|-------------|-------|--------|
| 44 | Score badge components — 3 separate implementations of score display with color coding | `src/components/remarketing/ScoreBadge.tsx`, `ScoreTierBadge.tsx`, `src/components/admin/DealScoreBadge.tsx` | Merge — unified `ScoreBadge` with `variant` prop |
| 45 | Buyer quality badges — overlapping tier systems (numeric 1-4 vs letter A-F) | `src/components/admin/BuyerQualityBadges.tsx` and `src/components/remarketing/ScoreTierBadge.tsx` | Merge — single configurable badge |
| 46 | Listing card components — significant layout overlap between buyer and admin | `src/components/ListingCard.tsx` and `src/components/admin/AdminListingCard.tsx` | Refactor — extract shared `BaseListingCard` |

#### 2D. Duplicate Supabase Query Patterns

| # | Duplication | Where | Action |
|---|-------------|-------|--------|
| 47 | Repeated `.from('deals')` queries across 3+ hooks with similar joins | `use-deals.ts`, `use-deal-followup.ts`, `use-deal-follow-up.ts` | Refactor — centralize into `src/lib/supabase-queries/dealQueries.ts` |
| 48 | Repeated `.from('contacts')` queries in multiple hooks | Various contact hooks | Refactor — centralize into `contactQueries.ts` |

#### 2E. Duplicate Validation Logic

| # | Duplication | Files | Action |
|---|-------------|-------|--------|
| 49 | Two validation systems — manual vs Zod for similar domains | `src/lib/criteriaValidation.ts` and `src/lib/data-validation.ts` | Refactor — use Zod consistently |

---

### SECTION 3 — Monolithic Files

#### 3A. Critical (1000+ lines — should be split)

| # | File | Lines | Issue | Action |
|---|------|-------|-------|--------|
| 50 | `src/pages/admin/chatbot-test-runner/chatbotTestScenarios.ts` | 3,326 | Massive test data file | Refactor — split by test category |
| 51 | `src/pages/admin/system-test-runner/testDefinitions.ts` | 1,539 | Mixed test categories | Refactor |
| 52 | `src/pages/admin/remarketing/ReMarketingUniverses.tsx` | 1,431 | Data fetching + logic + rendering | Refactor — extract hooks + sub-components |
| 53 | `src/components/admin/ConnectionRequestActions.tsx` | 1,277 | 5+ workflows with inline dialogs | Refactor — split into 7-8 focused files |
| 54 | `src/pages/BuyerMessages/MessageThread.tsx` | 1,224 | Data + uploads + agreements mixed | Refactor — extract hooks + sub-components |
| 55 | `src/hooks/admin/use-deals.ts` | 1,073 | Queries + mutations + 100-field interface | Refactor — separate queries from mutations |
| 56 | `src/components/admin/data-room/AccessMatrixPanel.tsx` | 1,064 | 4+ inline dialogs, mixed concerns | Refactor — extract dialogs + hooks |
| 57 | `src/components/remarketing/UniverseDealsTable.tsx` | 1,031 | Monolithic table with inline filtering | Refactor |
| 58 | `src/components/ai-command-center/AICommandCenterPanel.tsx` | 996 | Streaming chat + tools + suggestions | Refactor |

#### 3B. High Priority (750-1000 lines)

| # | File | Lines | Action |
|---|------|-------|--------|
| 59 | `src/components/admin/ConnectionRequestsTable.tsx` | 988 | Refactor |
| 60 | `src/hooks/admin/useValuationLeadsData.ts` | 983 | Refactor |
| 61 | `src/components/admin/ContactHistoryTracker.tsx` | 981 | Refactor |
| 62 | `src/components/buyer/BuyerMatchCard.tsx` | 886 | Refactor |
| 63 | `src/components/admin/AddDealDialog.tsx` | 874 | Refactor |
| 64 | `src/pages/admin/remarketing/ReMarketingDashboard.tsx` | 859 | Refactor |
| 65 | `src/components/admin/BulkDealImportDialog.tsx` | 846 | Refactor |
| 66 | `src/pages/admin/remarketing/ReMarketingDeals/index.tsx` | 834 | Refactor |
| 67 | `src/components/admin/DealImportDialog.tsx` | 815 | Refactor |

#### 3C. Monolithic Edge Functions

| # | File | Lines | Issue | Action |
|---|------|-------|-------|--------|
| 68 | `supabase/functions/ai-command-center/integration-action-tools.ts` | 2,899 | 15+ unrelated tool implementations | Refactor — split by domain |
| 69 | `supabase/functions/generate-ma-guide/index.ts` | 1,509 | 13-phase generation inline | Refactor |
| 70 | `supabase/functions/ai-command-center/router.ts` | 1,215 | 50+ bypass rules + intent routing | Refactor |

#### 3D. Monolithic Hooks (500-750 lines)

| # | File | Lines | Action |
|---|------|-------|--------|
| 71 | `src/hooks/useEnhancedRealTimeAnalytics.ts` | 739 | Refactor |
| 72 | `src/hooks/useAICommandCenter.ts` | 634 | Refactor |
| 73 | `src/hooks/admin/use-data-room.ts` | 629 | Refactor |
| 74 | `src/hooks/admin/use-firm-agreements.ts` | 609 | Refactor |
| 75 | `src/hooks/useDailyTasks.ts` | 566 | Refactor |

---

### SECTION 4 — Edge Functions

**Total Edge Functions: 106 | Called from Frontend: 67 | Not Called: 39**

#### 4A. Critical Issues

| # | Issue | Details | Action |
|---|-------|---------|--------|
| 76 | Missing function being called | `query-tracker-universe` invoked from `chatbotInfraTests.ts:462` but directory does not exist | Delete the call or create the function |
| 77 | Deprecated function (returns 410) | `send-verification-email` returns HTTP 410 Gone | Delete entirely |
| 78 | Deprecated proxy function | `admin-notification` proxies to `enhanced-admin-notification` | Delete after updating callers |

#### 4B. Old Scoring Functions (Dead Code)

| # | Function | Lines | Status | Action |
|---|----------|-------|--------|--------|
| 79 | `supabase/functions/score-buyer-deal/` | 733 | Never called — superseded by `score-deal-buyers` | Delete |
| 80 | `supabase/functions/score-industry-alignment/` | 357 | Never called — zero frontend references | Delete |

#### 4C. Overlapping Function Pairs

| # | Functions | Issue | Action |
|---|----------|-------|--------|
| 81 | `send-approval-email` vs `send-templated-approval-email` | Overlapping email approval responsibility | Investigate merging |
| 82 | `password-reset` vs `admin-reset-password` | Different access models but similar code | Investigate |

#### 4D. Functions Not Called from Frontend (39 functions)

**Webhooks (legitimate — keep):** `pandadoc-webhook-handler`, `phoneburner-webhook`, `heyreach-webhook`, `smartlead-webhook`, `salesforce-remarketing-webhook`, `process-standup-webhook`

**Background Queue Processors (legitimate — keep):** `process-buyer-universe-queue`, `process-ma-guide-queue`, `extract-buyer-criteria-background`, `generate-ma-guide-background`

**Cron Jobs (legitimate — keep):** `send-nda-reminder`, `send-fee-agreement-reminder`, `admin-digest`, `sync-missing-profiles`, `aggregate-daily-metrics`

**Potentially Dead (investigate):** `enrich-external-only`, `enrich-geo-data`, `enrich-list-contacts`, `enrich-session-metadata`, `find-buyer-contacts`, `find-contacts`, `error-logger`, `get-feedback-analytics`, `discover-companies`, `generate-guide-pdf`, `clarify-industry`, `create-lead-user`, `publish-listing`, `validate-criteria`, `verify-platform-website`, `otp-rate-limiter`, `rate-limiter`, `session-security`, `security-validation`, `test-contact-enrichment`

---

### SECTION 5 — Database Tables & Columns

**Total Tables: 155 | Actively Used: 124 (80%) | Never Used: 31 (20%)**

#### 5A. Exact Duplicate Table

| # | Table | Issue | Action |
|---|-------|-------|--------|
| 83 | `marketplace_listings` | Exact duplicate of `listings` (140+ refs). 0 references to `marketplace_listings`. | Delete |

#### 5B. Abandoned Subsystems (8 tables)

**Old Buyer Introduction System (replaced by `buyer_contacts`):**

| # | Table | References | Action |
|---|-------|-----------|--------|
| 84 | `buyer_introductions` | 0 | Delete |
| 85 | `buyer_introduction_summary` | 0 | Delete |
| 86 | `introduced_and_passed_buyers` | 0 | Delete |
| 87 | `not_yet_introduced_buyers` | 0 | Delete |

**Old Contact History System (replaced by `contact_activities`):**

| # | Table | References | Action |
|---|-------|-----------|--------|
| 88 | `contact_call_history` | 0 | Delete |
| 89 | `contact_email_history` | 0 | Delete |
| 90 | `contact_linkedin_history` | 0 | Delete |
| 91 | `contact_history_summary` | 0 | Delete |

#### 5C. Other Unused Tables (14 tables)

| # | Table | What It Was | Action |
|---|-------|-----------|--------|
| 92 | `ai_command_center_actions` | AI action log | Delete |
| 93 | `collections` | Replaced by `contact_lists` | Delete |
| 94 | `connection_request_stages` | Replaced by status field | Delete |
| 95 | `data_room_access_status` | Computed view | Delete |
| 96 | `deal_contacts` | Replaced by `deal_contact_id` field | Delete |
| 97 | `enrichment_success_rate` | Computed metric | Delete |
| 98 | `generic_email_domains` | Logic moved to code | Delete |
| 99 | `industry_classifications` | Static reference data | Delete |
| 100 | `linkedin_manual_review_queue` | Unused queue | Delete |
| 101 | `listing_notes` | Replaced by `listing_conversations` | Delete |
| 102 | `permission_audit_log` | Replaced by `audit_logs` | Delete |
| 103 | `task_pin_log` | Unused infrastructure | Delete |
| 104 | `unmapped_primary_owners` | Unused view | Delete |
| 105 | `listing_contact_history_summary` | Orphaned summary | Delete |

#### 5D. Scoring Remnant Tables

| # | Table | Action |
|---|-------|--------|
| 106 | `ranked_deals` | Delete |
| 107 | `scoring_runs` | Delete |
| 108 | `listings_needing_enrichment` | Delete |
| 109 | `introduction_activity` | Delete |
| 110 | `introduction_status_log` | Delete |

#### 5E. Tables Requiring Investigation

| # | Table | Issue | Action |
|---|-------|-------|--------|
| 111 | `buyers` | Appears core but never queried — likely absorbed into `profiles` | Investigate |
| 112 | `cron_job_logs` | Infrastructure logging — may be used outside Supabase | Investigate |
| 113 | `trigger_logs` | Database logging — may be used outside Supabase | Investigate |

#### 5F. `profiles` Table Column Bloat (96 columns)

| # | Issue | Columns | Action |
|---|-------|---------|--------|
| 114 | 3 overlapping equity band columns | `acq_equity_band`, `committed_equity_band`, `max_equity_today_band` | Investigate consolidation |
| 115 | 4 different deal size representations | `deal_size_band`, `investment_size`, `target_deal_size_min`, `target_deal_size_max` | Investigate consolidation |
| 116 | Unclear field names | `flex_sub2m_ebitda`, `flex_subxm_ebitda` | Investigate if used |

**Foreign Key Integrity: ALL VALID — no orphaned references found.**

---

### SECTION 6 — Old Scoring Engine Remnants

#### 6A. Dead Edge Functions (DELETE)

| # | Function | Lines | Status | Action |
|---|----------|-------|--------|--------|
| 117 | `supabase/functions/score-buyer-deal/` | 733 | Never called — superseded by `score-deal-buyers` | Delete + remove from `config.toml` line 105-106 |
| 118 | `supabase/functions/score-industry-alignment/` | 357 | Zero frontend calls | Delete + remove from `config.toml` line 189-190 |

#### 6B. Queue System (INVESTIGATE)

| # | Item | Status | Action |
|---|------|--------|--------|
| 119 | `supabase/functions/process-scoring-queue/` | Still called from `src/lib/remarketing/queueScoring.ts` | Investigate — does `score-deal-buyers` replace this entirely? |
| 120 | `remarketing_scoring_queue` table | Still receives inserts from `queueScoring.ts` | Investigate — deprecate if queue removed |
| 121 | `src/lib/remarketing/queueScoring.ts` (314 lines) | Fire-and-forget invocations with only `console.warn` error handling | Refactor |

#### 6C. New System Verification

| # | Item | Status | Action |
|---|------|--------|--------|
| 122 | `supabase/functions/score-deal-buyers/` | ACTIVE — called from 3+ locations | Keep |
| 123 | `src/hooks/admin/use-new-recommended-buyers.ts` | Properly wired with 4-hour cache | Keep |
| 124 | Universe management UI components | All active and properly integrated | Keep |
| 125 | `remarketing_buyer_universes` + `remarketing_universe_deals` | Active, RLS in place | Keep |

**Note:** No tables named `buyer_universes`, `deal_universes`, or `universe_assignments` found — old naming already cleaned up.

---

### SECTION 7 — Unused npm Packages

| # | Package | Version | Status | Action |
|---|---------|---------|--------|--------|
| 126 | `input-otp` | 1.2.4 | Never imported — MFA uses standard Input component | Delete (`npm uninstall input-otp`) |
| 127 | `jsdom` | 28.1.0 (dev) | Never directly imported — may be implicit vitest dep | Investigate |

All other 85+ dependencies are actively imported and used.

---

### SECTION 8 — Console Logs & Debug Code

#### 8A. Console Statements

| Location | console.log | console.warn | console.error | Total |
|----------|-------------|--------------|---------------|-------|
| `src/` | 10 | ~100 | ~190 | ~300 |
| `supabase/functions/` | — | — | — | ~1,345 |

Production build strips `console.log` via vite config. The `console.warn`/`console.error` are intentionally preserved for monitoring. No action needed.

#### 8B. TODO/FIXME/HACK Comments

| # | Finding | Action |
|---|---------|--------|
| 128 | Zero actual TODO/FIXME/HACK comments found indicating unfinished work | None needed |

All "TODO"/"XXX" occurrences are regex patterns in validation code, not developer task markers.

#### 8C. Hardcoded Test Data

| # | File | What | Action |
|---|------|------|--------|
| 129 | `src/components/admin/BulkLeadImportDialog.tsx` | Sample CSV with "John Smith" | Keep — UI help text |
| 130 | `src/lib/ga4.ts` | `G-XXXXXXXXXX` placeholder check | Keep — config guard |
| 131 | `src/components/admin/AddAssociatedContactDialog.tsx` | "John Doe" form placeholders | Keep — form placeholders |

---

### RECOMMENDED CLEANUP ORDER

#### Phase 1 — Quick Wins (1-2 hours, zero risk)
1. Delete 12 unused hooks (~800 lines of dead code)
2. Delete `input-otp` package — `npm uninstall input-otp`
3. Delete 2 old scoring edge functions — `score-buyer-deal/` (733 lines) + `score-industry-alignment/` (357 lines) + remove from `config.toml`
4. Delete `send-verification-email` edge function (returns 410 Gone)
5. Delete `marketplace_listings` table (exact duplicate of `listings`)
6. Delete `EXTRACTION_TOOL_SCHEMA` from `src/lib/criteriaSchema.ts`
7. Fix broken reference — remove `query-tracker-universe` call from `chatbotInfraTests.ts:462`

#### Phase 2 — Database Cleanup (4-6 hours, low risk)
8. Delete 8 abandoned subsystem tables (buyer introductions + contact history)
9. Delete 14 other unused tables
10. Delete 5 scoring remnant tables
11. Investigate `buyers` table — confirm absorbed into `profiles`

#### Phase 3 — Code Consolidation (1-2 days, medium effort)
12. Merge duplicate hooks (deal follow-up, rename user detail hooks)
13. Merge `formatCurrency()` implementations
14. Merge `generateAnonymousName()` implementations
15. Consolidate score badge components into unified component
16. Centralize Supabase query patterns into shared modules
17. Investigate + delete 20+ unreachable components (check git history first)

#### Phase 4 — Monolithic File Refactoring (1-2 weeks, ongoing)
18. Split `ConnectionRequestActions.tsx` (1,277 lines) into 7-8 focused files
19. Split `integration-action-tools.ts` (2,899 lines) into domain-based tool files
20. Split `use-deals.ts` (1,073 lines) into separate query/mutation hooks
21. Split `MessageThread.tsx` (1,224 lines) — extract hooks + sub-components
22. Split `ReMarketingUniverses.tsx` (1,431 lines) — extract data layer
23. Refactor remaining 15+ files over 800 lines

#### Phase 5 — Old Scoring Engine Final Cleanup
24. Investigate `process-scoring-queue` — does `score-deal-buyers` replace it?
25. Refactor `queueScoring.ts` — replace fire-and-forget with proper error handling
26. Deprecate `remarketing_scoring_queue` table if queue system removed

---

### IMPACT SUMMARY

| Metric | Current | After Cleanup |
|--------|---------|---------------|
| Database tables | 155 | ~124 (20% reduction) |
| Dead hook files | 12 | 0 |
| Unreachable components | 20+ | 0 |
| Dead edge functions | 4+ | 0 |
| Unused npm packages | 1-2 | 0 |
| Files over 1,000 lines | 9 | 0 (after refactoring) |
| Duplicate implementations | 10+ | 0 (after merging) |
| Estimated dead code removed | — | ~5,000+ lines |
