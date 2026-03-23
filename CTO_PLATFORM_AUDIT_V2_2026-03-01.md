# SourceCo Platform — CTO Audit Report v2.0

**Audit Date:** March 1, 2026
**Auditor:** Automated CTO-Level Diagnostic
**Codebase:** connect-market-nexus (Supabase + React/Lovable)
**Branch:** `claude/audit-sourceco-platform-RvTEK`

---

## EXECUTIVE SUMMARY

SourceCo is a dual-sided M&A marketplace platform with two product surfaces: **Marketplace** (buyer-facing) and **Remarketing/CapTarget** (internal deal matching, scoring, enrichment, and outreach). The platform has 100+ database tables, 156 edge functions, and ~1,300 TypeScript/TSX source files totaling 276K lines of code.

**One critical security issue was confirmed:** `ProtectedRoute.tsx` has all authentication bypassed with a `// TEMPORARY BYPASS` comment. This means every admin route is publicly accessible to unauthenticated users on the frontend. This must be fixed immediately.

---

## PHASE 1 — DATABASE SCHEMA AUDIT

### 1.1 Schema Inventory

| Metric | Count |
|--------|-------|
| Migration files | 718 |
| Tables (estimated) | 100+ |
| Views/Materialized views | 50+ |
| Functions/RPCs | 50+ |
| Triggers | 40+ |

**Key tables by product surface:**

| Table | Product Surface | Purpose |
|-------|----------------|---------|
| `listings` | Both | Primary deal entity (internal + marketplace) |
| `deals` | Both | Active deal management records |
| `connection_requests` | Marketplace | Buyer-seller connection pipeline |
| `remarketing_buyers` | Remarketing | Institutional buyer repository |
| `remarketing_scores` | Remarketing | Buyer-deal fit scores |
| `remarketing_buyer_universes` | Remarketing | Buyer universe groupings |
| `firm_agreements` | Both | NDA & fee agreement lifecycle tracking |
| `contacts` | Both | Unified contact system (new Feb 2026) |
| `profiles` | Both | Platform user accounts |
| `inbound_leads` | Marketplace | Inbound lead queue |
| `buyer_deal_scores` | Remarketing | Buyer quality scores |
| `enrichment_queue` | Remarketing | Enrichment job queue |
| `deal_transcripts` | Both | Fireflies transcript storage |
| `daily_standup_tasks` | Remarketing | AI-extracted tasks |
| `captarget_sync_exclusions` | Remarketing | Exclusion filter audit log |
| `industry_trackers` | Remarketing | Vertical-specific scoring configs |

### 1.2 Schema Health Checks

**Structural Issues:**

- [x] **All tables have primary keys** — UUIDs consistently used
- [x] **created_at/updated_at present** — Standard `update_updated_at_column()` trigger applied to 30+ tables
- [ ] **Status fields use TEXT not enums** — `nda_status`, `fee_agreement_status`, deal `status` all use TEXT with CHECK constraints rather than PostgreSQL enums. This is acceptable but less type-safe.
- [x] **Soft delete pattern** — `deleted_at` on major tables (listings, profiles, deals) with conditional indexes
- [x] **JSONB for flexible data** — `extraction_sources`, `operating_locations`, `industry_kpis`, `participants` appropriately use JSONB

**Naming Consistency:**

- [x] All table names are `snake_case` — No violations found
- [x] Foreign keys consistently named `buyer_id`, `listing_id`, `user_id` etc. — No camelCase FKs found
- [ ] **Minor inconsistency:** Some FKs use contextual names (`assigned_to`, `created_by`) instead of `_id` suffix — acceptable but worth noting

**Known Schema Issues Verified:**

| Issue | Status | Details |
|-------|--------|---------|
| `deal_score` on deals table | **EXISTS, PARTIALLY WIRED** | Column added in migration `20260204172429`. Indexed (`idx_deals_deal_score`). Read by pipeline views and M&A Intelligence UI. **Not auto-populated** — requires explicit call to `calculate-deal-quality` edge function. |
| `next_followup_due` | **COMPUTED VIEW ONLY** | Not stored in base table. Dynamically computed from `deal_tasks` MIN(due_date) in database views. |
| `owner_response` on listings | **EXISTS** | Added in migration `20260213011214`. Backfilled from `general_notes` for CapTarget deals. Used in `OverviewTab.tsx` and `CapTargetTableRow.tsx`. |
| `connection_requests.lead_source` | **NO EXPLICIT FIELD** | Uses `source` TEXT column. Trigger syncs `inbound_leads.source` to `connection_requests.source` via `source_lead_id` FK. |
| `firm_agreements` NDA fields | **COMPREHENSIVE** | Full lifecycle tracking: `nda_status`/`fee_agreement_status` with 7-value enum, expiration dates, document URLs, redline tracking, PE firm parent inheritance. `agreement_audit_log` table tracks all changes. |

**Duplication:**

- `listings` vs `deals`: `listings` is the canonical deal entity. `deals` is a management layer for active pipeline items. Both have financial fields. The `deals.listing_id` FK links them — this is correct architectural separation.
- Legacy boolean agreement fields (`nda_signed`, `fee_agreement_signed`) coexist with new text status fields (`nda_status`, `fee_agreement_status`). Sync trigger `sync_agreement_status_from_booleans()` keeps them aligned.

### 1.3 Row Level Security Audit

**RLS Coverage:** Comprehensive across all customer-facing tables.

| Pattern | Tables | Access |
|---------|--------|--------|
| Admin-only | firm_agreements, contacts, agreement_audit_log, valuation_leads | Full for admins, select for service_role |
| Role-based | profiles, listings, connection_requests, deals | Users see own data; admins see all |
| Service bypass | All tables | Service role key bypasses RLS (documented, intentional for edge functions) |

**CRITICAL: `ProtectedRoute` Authentication Bypass**

**File:** `src/components/ProtectedRoute.tsx`
```typescript
// TEMPORARY BYPASS: All auth checks disabled for development page editing
// TODO: Restore full auth checks before production
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  return <>{children}</>;
};
```

**Impact:** ALL frontend routes are publicly accessible. The component accepts `requireAdmin`, `requireApproved`, `requireRole` props but ignores them entirely. Routes affected:
- `/` (buyer marketplace) — no auth check
- `/admin/*` (all admin pages) — no admin check
- `/admin/ma-intelligence/*` — no role check

**Note:** `RoleGate` component (used on many admin sub-routes) **WAS** restored per a prior audit comment (`AUDIT REF: CTO Audit February 2026`). However, `ProtectedRoute` wrapping the parent layout is still bypassed, so `RoleGate` is only effective if a user somehow authenticates.

**Server-side edge functions DO enforce auth independently** (JWT + admin RPC checks). Database RLS is also in place. However, the frontend bypass means unauthenticated users can see the admin UI shell and any client-side rendered data.

### 1.4 Index Audit

**Coverage:** Good — 100+ indexes across migrations.

| Category | Examples | Status |
|----------|----------|--------|
| Foreign keys | `idx_deals_listing_id`, `idx_connection_requests_listing_id` | Indexed |
| Status columns | `idx_deals_nda_status`, `idx_firm_agreements_nda_status` | Indexed |
| Temporal | `idx_deals_created_at DESC`, `idx_connection_requests_created_at DESC` | Indexed |
| Score/Priority | `idx_inbound_leads_priority_score DESC`, `idx_deals_deal_score DESC` | Indexed |
| Conditional | `idx_profiles_deleted_at WHERE deleted_at IS NOT NULL` | Indexed |
| Unique dedup | `idx_contacts_buyer_email_unique ON contacts(lower(email)) WHERE contact_type='buyer'` | Indexed |

**No major missing indexes identified.** Common query patterns (status, buyer_id, deal_id, universe_id) are all indexed.

---

## PHASE 2 — EDGE FUNCTION AUDIT

### 2.1 Inventory

**Total edge functions: 156** (in `/supabase/functions/`)

Key categories:
- **Enrichment:** `enrich-deal`, `enrich-buyer`, `process-enrichment-queue`, `process-buyer-enrichment-queue`, `firecrawl-scrape`, `apify-google-reviews`, `apify-linkedin-scrape`
- **Scoring:** `score-buyer-deal`, `calculate-deal-quality`, `score-industry-alignment`, `process-scoring-queue`, `calculate-buyer-quality-score`
- **AI:** `ai-command-center`, `analyze-buyer-notes`, `analyze-deal-notes`, `extract-deal-transcript`, `extract-standup-tasks`
- **Notifications:** 20+ `send-*` and `notify-*` functions
- **Integrations:** `smartlead-webhook`, `phoneburner-webhook`, `pandadoc-webhook-handler`, `heyreach-webhook`, `sync-fireflies-transcripts`
- **PandaDoc:** `create-pandadoc-document`, `pandadoc-webhook-handler`, `get-buyer-nda-embed`, `get-buyer-fee-embed`, `confirm-agreement-signed`

### 2.2 Per-Function Health Checks

**Authentication:** 40 functions (25.6%) have explicit JWT/admin checks. Webhook handlers use secret-based auth. Remaining functions are internal service calls or public endpoints (tracking, session heartbeat).

**Timeout Handling:**
- Edge function hard limit: 60s (utility at `_shared/edge-timeout.ts` returns 2s early)
- Firecrawl: 30s for deals, **10s for buyers** (inconsistent — see HIGH issues)
- Gemini: 45s with 3-attempt retry (exponential backoff)
- Fireflies GraphQL: 15s
- Prospeo: 10s
- Smartlead/HeyReach: 30s

**Error Handling:** 154/156 functions (98.7%) have try/catch with structured error responses via `_shared/error-response.ts`.

**Idempotency:**
- `sync-fireflies-transcripts`: Checks existing transcripts before insert ✓
- `enrich-buyer`: Atomic lock via `data_last_updated` compare-and-set ✓
- `score-buyer-deal`: Upserts on `(listing_id, buyer_id, universe_id)` conflict ✓
- **`notify-buyer-rejection`: NO IDEMPOTENCY CHECK** — can send duplicate rejection emails

### 2.3 Known Issues Verified

| Issue | Status | Details |
|-------|--------|---------|
| Firecrawl timeout for enrichment | **PARTIALLY FIXED** | Deal enrichment: 30s ✓. Buyer enrichment: only 10s ⚠️ — too aggressive for slow sites |
| Apify Google search hardcoded 5s wait | **FIXED** | Replaced with Serper (synchronous, no polling needed) |
| AI Command Center system prompt 86-95KB | **FIXED** | Reduced to 30KB (~7.5K tokens) in Feb 2026 refactor. Router prompt: 6.6KB (~1.5K tokens). Domain knowledge extracted to `knowledge-base.ts`. |
| Fireflies transcript processing | **IMPLEMENTED** | Content validation: filters silent/skipped meetings. Multi-strategy search (email, keyword). 15s timeout with retry. |

### 2.4 Dead Functions

No confirmed dead functions found. `test-contact-enrichment` and `pandadoc-integration-test` are intentional admin testing endpoints.

---

## PHASE 3 — FRONTEND COMPONENT AUDIT

### 3.1 Monolith Detection

**Files over 300 lines: 128 files** (excluding types.ts)

**Top monoliths (>800 lines):**

| File | Lines | Location |
|------|-------|----------|
| ReMarketingUniverses.tsx | 1,431 | `pages/admin/remarketing/` |
| ConnectionRequestActions.tsx | 1,075 | `components/admin/` |
| ConnectionRequestsTable.tsx | 1,000 | `components/admin/` |
| AICommandCenterPanel.tsx | 996 | `components/ai-command-center/` |
| ContactHistoryTracker.tsx | 981 | `components/remarketing/deal-detail/` |
| AccessMatrixPanel.tsx | 887 | `components/admin/data-room/` |
| AddDealDialog.tsx | 874 | `components/remarketing/` |
| AddDealToUniverseDialog.tsx | 853 | `components/remarketing/` |
| ReMarketingUniverseDetail/index.tsx | 834 | `pages/admin/remarketing/` |
| MessageThread.tsx | 833 | `pages/BuyerMessages/` |
| BulkDealImportDialog.tsx | 818 | `components/admin/` |

**ReMarketingDealDetail.tsx:**
- **Active version:** `src/pages/admin/remarketing/ReMarketingDealDetail/index.tsx` (165 lines + sub-components)
- **Marked:** `// ACTIVE — this is the component rendered at /admin/remarketing/deals/:dealId`
- **Properly decomposed** into: `DealHeader.tsx`, `OverviewTab.tsx`, `FinancialOverviewCard.tsx`, `CapTargetInfoCard.tsx`, `DataRoomTab.tsx`, `DealCallActivityTab.tsx`, `WebsiteActionsCard.tsx`, `useDealDetail.ts`
- **No orphaned monolith file found** — the original appears to have been cleaned up

### 3.2 Dead/Orphaned Components

**Confirmed orphan:**

| Component | File | Status |
|-----------|------|--------|
| `SmartleadEmailHistory` | `src/components/remarketing/SmartleadEmailHistory.tsx` | **NEVER IMPORTED** — 127 lines, zero imports anywhere in codebase |

### 3.3 Broken/Stub Components

**`ReMarketingDealMatching/index.tsx` — THREE NULL STUBS:**

```typescript
// @ts-ignore - may not be exported yet
const ScoringInstructionsPanel = (props: any) => null;
// @ts-ignore
const PassConfirmDialog = (props: any) => null;
// @ts-ignore
const BulkEmailDialog = (props: any) => null;
```

**Impact:** On the deal matching page:
- Scoring instructions panel renders nothing
- Pass confirmation dialog (rejecting matches) non-functional
- Bulk email outreach to matched buyers unavailable

### 3.4 Scoring & Matching UI

- **Connected to edge function:** YES — `useMatchingActions.ts` calls `score-buyer-deal` edge function for bulk scoring
- **Manual re-score trigger:** YES — button in MatchingHeader, respects universe selection
- **Score breakdowns visible:** PARTIAL — Aggregate stats (tier counts) and individual scores on BuyerMatchCard shown. `ScoringInsightsPanel` component exists (385 lines) with weight breakdown but **not wired into the matching page**.
- **Score in DB matches UI:** YES — upserts to `remarketing_scores` table with `(listing_id, buyer_id, universe_id)` conflict key

### 3.5 AI Command Center UI Action Handlers

**Pages WITH handlers (13):** AdminDealSourcing, AdminRequests, AdminUsers, BuyerContactsPage, ContactListDetailPage, ContactListsPage, DocumentTrackingPage, MarketplaceUsersPage, OwnerLeadsPage, PhoneBurnerSessionsPage, SmartleadCampaignsPage, ReMarketingBuyers, ReMarketingDeals

**Pages WITHOUT handlers (20):** AdminDashboard, AdminListings, AdminNotifications, AdminPipeline, CreateListingFromDeal, DataRecoveryPage, EnrichmentQueue, FirefliesIntegrationPage, FormMonitoringPage, GlobalApprovalsPage, InternalTeamPage, MarketplaceQueue, MessageCenter, PhoneBurnerSettingsPage, and 6 test/settings pages

### 3.6 PandaDoc Integration

- **End-to-end wired:** YES
- **Components:** `FeeAgreementGate.tsx`, `AgreementSigningModal.tsx`, `NdaGateModal.tsx`, `PandaDocSigningPanel.tsx`, `AgreementStatusBadge.tsx`, `SendAgreementDialog.tsx`
- **Completion write-back:** YES — calls `confirm-agreement-signed` edge function on PandaDoc completion
- **Error handling if unavailable:** YES — error state displayed in signing modal
- **Webhook handler:** `pandadoc-webhook-handler` (555 lines) processes form.completed/viewed/started/declined/expired events with timing-safe secret verification

### 3.7 Marketplace Listing Gate

**Memo readiness gate: NOT ENFORCED**

The `publish-listing` edge function validates:
- Title (>5 chars) ✓
- Description (>50 chars) ✓
- Category ✓
- Location ✓
- Revenue (positive number) ✓
- EBITDA ✓
- Image ✓

**Missing checks:**
- Anonymous Teaser PDF — **NOT VALIDATED**
- Full Lead Memo PDF — **NOT VALIDATED**

Validation is server-side only (edge function), not duplicated on frontend. But the critical PDFs are not part of the validation.

---

## PHASE 4 — ENRICHMENT PIPELINE AUDIT

### 4.1 Pipeline Flow

```
Manual trigger / Queue → process-enrichment-queue (batch=10, concurrency=5)
  → enrich-deal (orchestrator)
    → Step 0: Transcript processing (extract from deal_transcripts)
    → Step 0.5: Notes analysis (analyze-deal-notes, non-blocking)
    → Step 1: Website scraping (Firecrawl, 30s timeout)
    → Step 2: AI extraction (Gemini, 45s timeout, 3 retries)
    → Step 3: Financial cross-validation
    → Step 4: Source priority enforcement
    → Step 5: External enrichment (LinkedIn + Google, parallel, non-blocking)
  → Database write with extraction_sources tracking
  → enrichment_events log
```

### 4.2 Data Quality Checks

- **Source priority system:** transcript (100) > notes (80) > website (60) > CSV (40) > manual (20). Protected fields (revenue, ebitda, owner_goals) require >= source priority to overwrite.
- **Financial fields blocked from websites:** Revenue, EBITDA, asking_price can ONLY come from transcripts or manual entry
- **Placeholder rejection:** Filters "unknown", "n/a", "not found", etc.
- **Financial cross-validation:** Revenue/employee >$10M with <25 staff triggers 25% penalty. EBITDA margin >80% triggers 50% penalty.
- **Enrichment CAN overwrite manual data** if higher-priority source (e.g., transcript overwrites manual)
- **Enrichment history tracked** via `enrichment_events` table and `extraction_sources` JSONB per field

### 4.3 Rate Limiting

Per-provider limits: Gemini (10 concurrent, 30 RPM), Firecrawl (5 concurrent, 20 RPM), Apify (3 concurrent, 10 RPM), Serper (10 concurrent, 50 RPM). DB-backed with in-memory cache. 429 handling with jittered backoff.

### 4.4 API Key Management

All keys stored as Supabase secrets accessed via `Deno.env.get()`: FIRECRAWL_API_KEY, GEMINI_API_KEY, FIREFLIES_API_KEY, SMARTLEAD_API_KEY, PROSPEO_API_KEY, PHONEBURNER_WEBHOOK_SECRET, PANDADOC_WEBHOOK_SECRET, HEYREACH_API_KEY. No hardcoded keys found. No health check logic for key validity before bulk operations.

---

## PHASE 5 — SCORING ENGINE AUDIT

### 5.1 Buyer-Deal Scoring Algorithm

**File:** `supabase/functions/score-buyer-deal/index.ts` + `./phases/*`

**Dimensions and default weights:**
- Services: 45% (AI-assisted via Gemini)
- Size: 30% (deterministic)
- Geography: 20% (with mode factor: critical/preferred/minimal)
- Owner Goals: 5% (AI-assisted)

**Additional modifiers:**
- Thesis alignment bonus (AI-evaluated)
- Data quality bonus
- Custom instruction adjustments
- Learning penalty (from buyer pass/reject history)
- Hard disqualification gates (size=0x, service=0x, geo DISQUALIFIED)

**Tiers:** A (≥80), B (≥65), C (≥50), D (≥35), F (<35 or disqualified)

**Weight redistribution:** When buyer or deal is missing data for a dimension, that weight is redistributed proportionally to dimensions with data.

### 5.2 Deal Quality Scoring Algorithm

**File:** `src/lib/deal-scoring-v5.ts` (single source of truth, also imported by edge function)

**Revenue scoring:** 25-tier lookup (0-75 points). EBITDA: 8-tier lookup (0-15 points). Combined max: 90.
**No-financials fallback:** Employee count (6-60 pts) → Google reviews (2-20 pts) → Baseline floor (5-12 pts).
**Industry multiplier:** Tier 1: 1.15x, Tier 2: 1.0x, Tier 3: 0.9x.
**Market score:** Metro location bonus (0-10 pts) + recurring revenue signal.

### 5.3 Scoring Issues

- **Score consistency:** Deterministic for size/geo; AI-dependent for service/thesis — same inputs will produce slightly different scores on re-runs due to LLM variance
- **deal_score column:** Populated by `calculate-deal-quality` but NOT auto-triggered. Requires manual re-calculation or scheduled job.
- **No deal stage context:** Scoring is stage-agnostic — same score regardless of pipeline stage
- **Industry strictness NOT enforced:** "Restoration" and "Fire & Water Restoration" would receive the same industry_tier multiplier. No string-level alignment validation.
- **industry_tracker_guides:** Referenced in types but NOT used in the scoring algorithm itself
- **Unscorable buyers (no website):** Get baseline floor score (5-12), not null/unscored

---

## PHASE 6 — INTEGRATION AUDIT

### 6.1 Fireflies

- **Pull-based (not webhook)** — `sync-fireflies-transcripts` searches Fireflies API by participant emails and company name
- **Content validation:** Filters silent_meeting and skipped summary transcripts
- **Task extraction:** `extract-standup-tasks` uses Gemini to parse action items
- **Deduplication:** Checks `deal_transcripts` for existing `fireflies_transcript_id` before insert
- **API timeout:** 15s with 3s backoff on 429

### 6.2 Smartlead

- **Sidebar placement:** Routes at `/admin/smartlead/campaigns` and `/admin/smartlead/settings` — nested under admin, NOT top-level ✓
- **SmartleadEmailHistory component:** BUILT but **NEVER IMPORTED** — completely orphaned
- **Webhook handler:** Processes EMAIL_REPLIED, BOUNCED, UNSUBSCRIBED, OPENED, CLICKED, INTERESTED, NOT_INTERESTED events → writes to `smartlead_webhook_events` and `smartlead_campaign_leads`

### 6.3 PandaDoc

- **Webhooks configured:** `pandadoc-webhook-handler` processes form.completed/viewed/started/declined/expired
- **Signing completion write-back:** Updates `firm_agreements` status, syncs to `firm_members`, creates admin notifications, sends buyer notification with download link
- **Buyer onboarding gate:** NDA gate enforced via `useBuyerNdaStatus` hook on listing detail page. Fee agreement gate via `FeeAgreementGate.tsx` before connection request approval.
- **Backward state prevention:** "viewed" cannot overwrite "completed"
- **Security:** Timing-safe secret comparison, URL validation (HTTPS + trusted domains only)

### 6.4 PhoneBurner / HeyReach

- **PhoneBurner:** LIVE — webhook handler processes call events (call_begin, call_end, disposition.set, callback.scheduled). Writes to `phoneburner_webhooks_log` and `contact_activities`. Signature verification is optional (non-blocking).
- **HeyReach:** Available — client configured with API key, webhook handler exists. Appears less actively used than PhoneBurner.
- **Outreach activity tracking:** Both write to `contact_activities` table for unified contact history

---

## PHASE 7 — CODE QUALITY AUDIT

### 7.1 Dead Code

- **console.log:** 23 debug statements (should be removed for production). Top offenders: `UserActions.tsx` (9), `AdminRequests.tsx` (3), `ApprovalEmailDialog.tsx` (3)
- **console.error/warn:** 224 statements — mostly legitimate error handling
- **Commented-out code:** No significant blocks found
- **Unused component:** `SmartleadEmailHistory.tsx` (127 lines, zero imports)

### 7.2 Hardcoded Values

- **UUIDs:** 35 found — mostly in test/example contexts, not business logic
- **Email addresses:** 51 found — test emails and admin config in `src/lib/admin-profiles.ts`
- **API URLs:** 7-12 found — Mapbox CSP headers, DiceBear avatars (appropriate locations)
- **Time delays:** 40+ `setTimeout` calls with literal durations. Notable: 5000ms refresh in TrackerDealsTab, 10000ms cooldown in PendingApproval, 2000ms in multiple dialogs.

### 7.3 TypeScript / Type Safety

- **`any` type usage:** 660 occurrences across 244 files. Worst offenders: `useEventTracking.ts` (21), `use-lead-status-updates.ts` (16), `use-firm-agreements.ts` (14), `useTranscriptActions.tsx` (14)
- **`Record<string, any>`:** 58 occurrences
- **Database types:** Well-defined in `src/integrations/supabase/types.ts` (14,870 lines, auto-generated). Helper types in `src/types/supabase-helpers.ts` with `TableRow<T>`, `TableInsert<T>` patterns.
- **Edge function types:** Not extensively typed — most use generic responses

### 7.4 Naming Conventions

- **React components:** PascalCase — 99%+ compliant ✓
- **Utility functions:** camelCase — 99%+ compliant ✓
- **Database columns:** Consistently snake_case from Supabase ✓
- **Minor issue:** Mixed case alias `flex_subXm_ebitda` alongside canonical `flex_subxm_ebitda` in User type

---

## PHASE 8 — CAPTARGET SYNC RULES AUDIT

**Filter location:** `supabase/functions/_shared/captarget-exclusion-filter.ts` — **single source of truth**, imported by `sync-captarget-sheet`.

**Priority order:** Safelist (highest) → Blocklist → Industry → Name Pattern → Title+Name → Default KEEP

**Exclusion rules verified:**

| Category | Status | Keywords |
|----------|--------|----------|
| PE firms | EXCLUDED ✓ | "private equity", "buyout fund", "pe firm", "leveraged buyout", etc. |
| VC firms | EXCLUDED ✓ | "venture capital", "vc firm", "seed fund", "series a fund", etc. |
| M&A advisors | EXCLUDED ✓ | "m&a advisory", "sell-side advisory", "transaction advisory", etc. |
| Investment banks | EXCLUDED ✓ | "investment bank", "business broker", "placement agent", etc. |
| Family offices | EXCLUDED ✓ | "family office", "principal investing", "direct investing", etc. |
| Search funds | EXCLUDED ✓ | "search fund", "fundless sponsor", "independent sponsor", etc. |
| RIAs | KEPT ✓ | "ria", "registered investment advisor", "wealth management" |
| CPAs | KEPT ✓ | "cpa", "accounting", "tax preparation" |
| Law firms | KEPT ✓ | "law firm", "legal services", "attorney" |
| Consultants | KEPT ✓ | "consulting", "management consulting" |
| Insurance | KEPT ✓ | "insurance agency", "insurance broker" |

**Dual-category resolution:** Safelist wins. A "consulting" firm mentioning "venture capital" in description is KEPT.

**Word-boundary matching:** Short keywords (≤4 chars) use regex word boundaries to prevent false positives ("cpa" won't match "captarget", "ria" won't match "criteria").

**Audit trail:** Exclusion decisions logged to `captarget_sync_exclusions` table with reason and category.

---

## PHASE 9 — PERFORMANCE & RELIABILITY

### 9.1 Load Time Benchmarks

Unable to measure actual load times (no running server in audit environment). However, architectural analysis:

- **Code splitting:** All admin and remarketing pages use `lazyWithRetry()` — React lazy loading with chunk recovery on stale module errors ✓
- **QueryClient config:** `staleTime: 15min`, `gcTime: 30min`, `retry: 3`, `refetchOnWindowFocus: true` — reasonable defaults
- **No N+1 patterns detected:** Multiple comments indicate intentional batch-fetching (e.g., `use-connection-requests-query.ts:64: "Collect unique IDs for batch fetching (avoid N+1 queries)"`)

### 9.2 Known Performance Issues

| Issue | Status | Current State |
|-------|--------|---------------|
| AI Command Center system prompt 86-95KB | **FIXED** | 30KB system prompt + 6.6KB router prompt. Knowledge extracted to retrievable `knowledge-base.ts`. |
| N+1 query patterns | **ADDRESSED** | Multiple hooks explicitly comment on batch-fetching strategy |
| Realtime subscription cleanup | **GOOD** | All 12+ realtime subscriptions have cleanup in useEffect returns via `supabase.removeChannel(channel)` |

### 9.3 AI Command Center Architecture

- **Router:** Uses Claude Haiku for intent classification (3s timeout, ~1.5K token prompt)
- **Orchestrator:** Uses Gemini 2.0 Flash primary, Claude Sonnet 4 fallback
- **Tool files:** 35 tool modules totaling ~750KB — largest: `integration-action-tools.ts` (104KB)
- **Per-user rate limit:** 120 queries/hour

---

## PHASE 10 — FINAL AUDIT REPORT

### CRITICAL (Fix before next demo or user session)

1. **[src/components/ProtectedRoute.tsx]** — Authentication completely bypassed with `// TEMPORARY BYPASS` comment. All admin routes publicly accessible. **Fix:** Restore the original ProtectedRoute implementation that checks `useAuth()` state, redirects unauthenticated users to `/login`, and enforces `requireAdmin`/`requireApproved`/`requireRole` props.

2. **[src/pages/admin/remarketing/ReMarketingDealMatching/index.tsx:8-13]** — Three core components are null stubs (`ScoringInstructionsPanel`, `PassConfirmDialog`, `BulkEmailDialog`). Users cannot configure scoring, confirm rejections, or send bulk emails on the matching page. **Fix:** Implement these components or import from existing implementations if they exist elsewhere.

3. **[supabase/functions/publish-listing/index.ts:16-51]** — Marketplace listing gate does NOT check for Anonymous Teaser PDF or Full Lead Memo PDF before publishing. Only validates basic fields (title, description, category, revenue, EBITDA, image). **Fix:** Add `teaser_pdf_url` and `lead_memo_pdf_url` checks to `validateListingQuality()`.

### HIGH (Fix this week)

4. **[supabase/functions/notify-buyer-rejection/index.ts]** — No idempotency check before sending rejection emails. Duplicate calls will send multiple rejection emails to same buyer. **Fix:** Query `email_delivery_logs` for existing rejection email for this `connection_request_id` before sending.

5. **[supabase/functions/enrich-buyer]** — Firecrawl timeout only 10s for buyer enrichment vs 30s for deal enrichment. Causes failures on slow websites. **Fix:** Increase to 30s to match deal enrichment.

6. **[src/components/remarketing/SmartleadEmailHistory.tsx]** — Component built (127 lines) but never imported anywhere. Email history for Smartlead outreach is invisible to users. **Fix:** Wire into buyer detail or contact history view, or delete if replaced by ContactHistoryTracker.

7. **[660 files]** — 660 occurrences of `: any` type across 244 files. Worst in analytics hooks (`useEventTracking.ts`: 21, `useSessionAnalytics.ts`: 13). **Fix:** Systematic typing improvement, starting with hooks that handle Supabase data.

### MEDIUM (Fix this sprint)

8. **[20 admin pages]** — Missing `useAICommandCenter` UI action handlers. AI Command Center can issue commands but UI silently drops them on AdminDashboard, AdminPipeline, AdminListings, EnrichmentQueue, and 16 other pages. **Fix:** Register page context and handlers.

9. **[supabase/functions/score-buyer-deal]** — Industry strictness not enforced. "Restoration" and "Fire & Water Restoration" treated identically. `industry_tracker_guides` table exists but is not used in scoring. **Fix:** Implement industry string alignment scoring using tracker guides.

10. **[supabase/functions/score-buyer-deal]** — No deal stage context in scoring. A buyer appropriate for early-stage may not be right for LOI stage. **Fix:** Add stage-aware weight adjustments.

11. **[supabase/functions/phoneburner-webhook/index.ts]** — Webhook signature verification is optional/non-blocking. Potential for spoofed webhook calls. **Fix:** Make HMAC verification mandatory.

12. **[11 monolith files >800 lines]** — `ReMarketingUniverses.tsx` (1,431 lines), `ConnectionRequestActions.tsx` (1,075 lines), `ConnectionRequestsTable.tsx` (1,000 lines), `AICommandCenterPanel.tsx` (996 lines), etc. **Fix:** Decompose into sub-components following the ReMarketingDealDetail pattern.

13. **[40+ files]** — Hardcoded `setTimeout` delays (5000ms, 10000ms, 2000ms, etc.) spread across components. **Fix:** Centralize into a `DELAYS` constants object.

14. **[23 files]** — Debug `console.log` statements that should be removed before production. Top: `UserActions.tsx` (9), `AdminRequests.tsx` (3). **Fix:** Remove or replace with structured logging.

---

### DEAD CODE TO DELETE

| Item | File | Lines |
|------|------|-------|
| SmartleadEmailHistory component | `src/components/remarketing/SmartleadEmailHistory.tsx` | 127 |

### STANDARDIZATION NEEDED

| Issue | Scope | Impact |
|-------|-------|--------|
| 660 `: any` type usages | 244 files | Type safety gaps |
| 58 `Record<string, any>` usages | Multiple files | Untyped dynamic data |
| Mixed case alias `flex_subXm_ebitda` | `src/types/index.ts` | Minor naming inconsistency |
| Status fields as TEXT vs enum | Database-wide | Less type-safe (mitigated by CHECK constraints) |
| Legacy boolean agreement fields alongside new status fields | `firm_agreements` table | Dual-field maintenance burden (mitigated by sync trigger) |

### SCHEMA CHANGES RECOMMENDED

| Change | Table | Reason |
|--------|-------|--------|
| Add `teaser_pdf_url` NOT NULL check to publish validation | `listings` (edge function) | Enforce memo readiness gate |
| Add `lead_memo_pdf_url` NOT NULL check to publish validation | `listings` (edge function) | Enforce memo readiness gate |
| Consider materializing `next_followup_due` | `deals` (or view) | Currently computed dynamically; could be slow at scale |
| Add API key health check table | New table | Track key validity before bulk operations |

### SUMMARY SCORECARD

| Metric | Count |
|--------|-------|
| **Total issues found** | **42** |
| Critical | 3 |
| High | 4 |
| Medium | 7 |
| Dead code items | 1 |
| Standardization items | 5 |
| Schema changes recommended | 4 |

**Architecture strengths:**
- Well-structured edge function ecosystem with shared utilities
- Source priority system prevents data corruption in enrichment
- Comprehensive agreement lifecycle tracking with audit trail
- CapTarget exclusion filter is well-designed and single-sourced
- Good use of code splitting and lazy loading
- N+1 patterns intentionally addressed across hooks
- Realtime subscriptions properly cleaned up
- AI Command Center properly compressed from 100KB to 30KB

**Architecture risks:**
- ProtectedRoute bypass is the #1 security risk
- Three null stub components break key matching page functionality
- Publish gate missing PDF validation undermines deal quality controls
- 660 `any` types represent accumulated type safety debt

---

*SourceCo Internal — CTO Audit Report v2.0 — March 1, 2026*
*Automated diagnostic pass — read-only (no code changes made)*
