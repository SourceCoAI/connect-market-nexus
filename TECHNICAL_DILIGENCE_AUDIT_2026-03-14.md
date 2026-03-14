# SourceCo Platform — CTO-Level Technical Diligence Audit

**Date:** March 14, 2026
**Codebase:** SourceCoDeals/connect-market-nexus
**Supabase Project:** vhzipqarkmmfuqadefep
**Scope:** 850 migrations, 176 edge functions, 1,298 frontend source files

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Domain 1: Duplicate Systems](#domain-1--duplicate-systems)
3. [Domain 2: Dead Database Tables](#domain-2--dead-database-tables)
4. [Domain 3: Dead/Redundant Columns](#domain-3--deadredundant-columns)
5. [Domain 4: Dead Edge Functions](#domain-4--dead-edge-functions)
6. [Domain 5: Dead Frontend Code](#domain-5--dead-frontend-code)
7. [Domain 6: Data Integrity & Schema Issues](#domain-6--data-integrity--schema-issues)
8. [Domain 7: Workflow Integrity](#domain-7--workflow-integrity)
9. [Prioritized Remediation Roadmap](#prioritized-remediation-roadmap)

---

## EXECUTIVE SUMMARY

This audit identified **47 discrete findings** across 7 domains. The most critical issues are:

- **CRITICAL (2):** Duplicate email notifications on deal reassignment (users receive 2 emails for 1 event), and N-times notification amplification when multiple admin tabs are open
- **HIGH (4):** Non-idempotent migration sequences that break fresh deployments, dead toast provider in production, generic email domain list inconsistency between firm creation functions, and dual audit log tables with orphaned trigger data
- **MEDIUM (11):** Including dead edge functions, dead database tables, copy-pasted code across outreach integrations, application-layer-only agreement gating (no RLS enforcement), and a localStorage-only admin feature tool

The codebase is generally well-structured with completed table renames (`deals` → `deal_pipeline`, `remarketing_buyers` → `buyers`), a clean contacts unification, and thorough buyer type normalization. The major risks are in notification duplication, migration idempotency, and accumulated dead code.

---

## DOMAIN 1 — DUPLICATE SYSTEMS

### FINDING 1A-1: SimpleToastProvider is Dead Code — Zero Consumers

```
SEVERITY: HIGH
CATEGORY: Dead Code / Duplicate System
FILES AFFECTED:
  - src/components/ui/simple-toast.tsx
  - src/App.tsx (line 48 — SimpleToastProvider wrapping children)
EVIDENCE: Zero files dispatch a 'show-toast' CustomEvent anywhere in src/.
  The provider listens on window.addEventListener('show-toast', ...) but nothing
  fires that event. Grep for 'show-toast', 'useSimpleToast', 'SimpleToast' returns
  zero consumer matches outside the provider itself.
IMPACT: Dead code mounted in production. Adds a DOM event listener on every page
  load for an event that never fires. Minimal runtime cost but confuses developers.
RECOMMENDED ACTION: Delete src/components/ui/simple-toast.tsx and remove its
  import + mount from src/App.tsx line 48.
ESTIMATED EFFORT: 15 minutes
```

### FINDING 1A-2: Dual Toast Systems (useToast + Sonner) Active in ~165 Files

```
SEVERITY: MEDIUM
CATEGORY: Duplicate System
FILES AFFECTED:
  - ~65 files use useToast (from src/hooks/use-toast.ts)
  - ~100 files use Sonner (import { toast } from 'sonner')
  - Several files import BOTH (e.g., useCapTargetActions.ts, SourceCoTable.tsx,
    GPPartnerTable.tsx)
EVIDENCE: Both <Toaster/> (line 257) and <SonnerToaster/> (line 258) render
  simultaneously in src/App.tsx. Files like useCapTargetActions.ts import useToast
  (line 4) AND toast as sonnerToast (line 5). Different operations in the same
  component fire different toast systems.
IMPACT: Users may see overlapping toasts at different screen positions if both
  fire in the same handler. The useToast system has TOAST_LIMIT=1 and
  TOAST_REMOVE_DELAY=1000000 (never auto-dismissed), while Sonner auto-dismisses.
  Inconsistent UX. Sonner imports 'next-themes' for theme detection, which may
  not be properly configured outside Next.js.
RECOMMENDED ACTION: Consolidate to Sonner (the newer, more widely used system).
  Migrate ~65 useToast consumers. This is a large but mechanical refactor.
ESTIMATED EFFORT: 2-3 days
```

### FINDING 1B-1: Context Architecture is Clean

```
SEVERITY: LOW (no issue found)
CATEGORY: Duplicate System (cleared)
EVIDENCE: src/context/ does NOT exist. All 7 context files are in src/contexts/.
  All imports consistently use @/contexts/. No barrel index.ts exists.
  AuthContext (user identity/auth) vs SessionContext (anonymous session UUID) are
  orthogonal. AnalyticsContext (write-side event tracking) vs AnalyticsFiltersContext
  (read-side UI filter state) are orthogonal.
IMPACT: None — this is clean.
RECOMMENDED ACTION: None required. Optionally add an index.ts barrel file.
```

### FINDING 1C-1: send-transactional-email — Built but Never Called

```
SEVERITY: MEDIUM
CATEGORY: Dead Code
FILES AFFECTED:
  - supabase/functions/send-transactional-email/index.ts
EVIDENCE: Zero callers in src/ or other edge functions. Its own comment says
  "replaces 32 separate email edge functions" but the migration was never completed.
  The template resolution system in _shared/email-templates.ts exists but is unused.
IMPACT: Dead code deployed to production. The intended email consolidation never
  happened — the 32+ individual email functions still run independently.
RECOMMENDED ACTION: Either complete the consolidation migration (large effort) or
  delete this function and the unused template system. The individual email functions
  work fine as-is.
ESTIMATED EFFORT: Delete = 30 minutes. Complete consolidation = 2-3 weeks.
```

### FINDING 1C-2: send-templated-approval-email — Dead in Production

```
SEVERITY: LOW
CATEGORY: Dead Code
FILES AFFECTED:
  - supabase/functions/send-templated-approval-email/index.ts
EVIDENCE: Only referenced in EmailTestCentre.tsx as test fixture data (lines
  119-160). Zero production invocations. The live approval flow uses
  send-approval-email (custom admin messages) and approve-marketplace-buyer
  (automated flow with internal sendViaBervo).
IMPACT: Dead code. Confuses developers trying to understand the approval email flow.
RECOMMENDED ACTION: Delete the function.
ESTIMATED EFFORT: 15 minutes
```

### FINDING 1C-3: Deal Owner Notification — CONFIRMED DUPLICATE EMAILS

```
SEVERITY: CRITICAL
CATEGORY: Duplicate System / Workflow Break
FILES AFFECTED:
  - supabase/functions/notify-deal-owner-change/index.ts
  - supabase/functions/notify-deal-reassignment/index.ts
  - src/hooks/admin/deals/useDealMutations.ts (lines 125, 413)
  - src/hooks/admin/deals/use-deal-owner-notifications.ts (lines 28, 63)
  - DB trigger: trigger_notify_deal_reassignment on deal_pipeline.assigned_to
EVIDENCE: On a deal reassignment (owner A → owner B):
  1. Frontend mutation (useDealMutations.ts) directly calls notify-deal-owner-change
     → Email #1 to previous owner A (React Email template, subject "Deal Modified")
  2. DB trigger fires → inserts admin_notifications row → Realtime listener fires
     notify-deal-reassignment → Email #2 to previous owner A (inline HTML template,
     subject "Your deal has been reassigned")
  3. Same DB trigger inserts another admin_notifications row → Realtime listener
     fires notify-new-deal-owner → Email to new owner B (correct, not duplicate)
IMPACT: Previous deal owner receives TWO emails for EVERY reassignment event.
  Different templates, different subjects, same message. This is user-facing and
  actively annoying.
  PLAIN ENGLISH: When a deal gets reassigned from one team member to another,
  the person losing the deal gets two separate email notifications about it.
RECOMMENDED ACTION: Remove the direct call to notify-deal-owner-change from
  useDealMutations.ts (lines 125, 413). Let the DB trigger handle all notifications
  via the admin_notifications → Realtime → edge function path. This eliminates
  the duplicate while preserving all three notification types.
ESTIMATED EFFORT: 2-4 hours (including testing)
```

### FINDING 1C-4: N-Times Notification Amplification via Realtime

```
SEVERITY: CRITICAL
CATEGORY: Workflow Break
FILES AFFECTED:
  - src/hooks/admin/deals/use-deal-owner-notifications.ts
  - src/components/admin/pipeline/PipelineShell.tsx (lines 29-32)
EVIDENCE: use-deal-owner-notifications.ts uses a client-side Realtime subscription
  to admin_notifications. When a notification arrives, each connected admin browser
  tab independently invokes the edge functions (notify-new-deal-owner and
  notify-deal-reassignment). If 5 admins have the pipeline page open, the new
  owner receives 5 identical emails. There is no server-side deduplication.
IMPACT: Email volume scales with the number of open admin browser tabs. In a team
  of 5 admins, a single deal reassignment could generate 10+ emails (2 per tab ×
  5 tabs for the duplicate issue, plus 5 for the new owner).
  PLAIN ENGLISH: Every admin who has the deals page open causes extra notification
  emails to be sent. More people on the team = more duplicate emails.
RECOMMENDED ACTION: Move notification sending to a server-side DB trigger or
  edge function cron, not client-side Realtime subscriptions. Alternatively, add
  a deduplication check (e.g., check email_delivery_logs for same recipient +
  deal_id + notification_type within 5 minutes before sending).
ESTIMATED EFFORT: 1-2 days
```

### FINDING 1C-5: send-nda-email / send-fee-agreement-email — ~300 Lines Copy-Pasted

```
SEVERITY: MEDIUM
CATEGORY: Duplicate System
FILES AFFECTED:
  - supabase/functions/send-nda-email/index.ts (517 lines)
  - supabase/functions/send-fee-agreement-email/index.ts (538 lines)
EVIDENCE: Both contain near-identical: admin signature lookup logic (~100 lines),
  ADMIN_PROFILES hardcoded maps (same 2 entries), firm member batch-send logic,
  attachment processing loops, Brevo API payload construction. The business logic
  differs (NDA vs fee agreement) but ~300 lines of infrastructure code are duplicated.
IMPACT: Bug fixes in one won't propagate to the other. Maintenance burden.
RECOMMENDED ACTION: Extract shared helpers to _shared/ (signature lookup, Brevo
  sender, batch-send logic). Keep business-specific logic in each function.
ESTIMATED EFFORT: 1 day
```

### FINDING 1D-1: HeyReach + Smartlead — Both Active, No Shared Abstraction

```
SEVERITY: MEDIUM
CATEGORY: Duplicate System
FILES AFFECTED:
  - supabase/functions/heyreach-campaigns/, heyreach-leads/, heyreach-webhook/
  - supabase/functions/smartlead-campaigns/, smartlead-leads/, smartlead-webhook/
  - supabase/functions/_shared/heyreach-client.ts, smartlead-client.ts
  - src/hooks/heyreach/, src/hooks/smartlead/
EVIDENCE: Both integrations are actively used (Smartlead: 37 frontend files,
  HeyReach: 22 files). Smartlead is primary (in sidebar, has settings page).
  HeyReach is secondary (not in sidebar, no settings page). The 4 contact resolver
  functions (resolveFromBuyerContacts, resolveFromBuyers, resolveFromListings,
  resolveFromLeads) are copy-pasted across both leads functions with ~90% identical
  logic.
IMPACT: A bug fix in one integration's resolver won't propagate to the other.
  No shared outreach abstraction means adding a third tool would require a third
  copy-paste.
RECOMMENDED ACTION: Extract a shared outreach resolver module. Long-term, evaluate
  whether HeyReach can be deprecated in favor of Smartlead-only.
ESTIMATED EFFORT: 2-3 days for shared abstraction. HeyReach deprecation requires
  business decision.
```

### FINDING 1E-1: DocuSeal is Fully Dead — PandaDoc is Canonical

```
SEVERITY: LOW (no issue found — just documentation)
CATEGORY: Duplicate System (cleared)
EVIDENCE: DocuSeal columns were added in migration 20260224000000 then explicitly
  dropped in 20260607000001_drop_docuseal_dead_code.sql with comment "DocuSeal
  integration was fully replaced by PandaDoc." Zero frontend references to DocuSeal.
  PandaDoc has 34 frontend file references, 6 active components in src/components/
  pandadoc/, and 4 edge functions.
IMPACT: None — cleanup was already completed.
RECOMMENDED ACTION: None.
```

### FINDING 1E-2: PandaDoc Double-Notification Risk

```
SEVERITY: MEDIUM
CATEGORY: Duplicate System
FILES AFFECTED:
  - supabase/functions/pandadoc-webhook-handler/index.ts
  - supabase/functions/confirm-agreement-signed/index.ts
EVIDENCE: Both functions independently update firm_agreements and create
  pandadoc_webhook_log entries for document.completed events. Both call
  sendBuyerSignedDocNotification (copy-pasted, not shared). Both create
  admin_notifications. Guards: 5-minute dedup window + 23505 unique constraint.
IMPACT: If webhook fires AND frontend polls simultaneously, the dedup guards may
  fail under race conditions, resulting in duplicate admin notifications.
RECOMMENDED ACTION: Extract sendBuyerSignedDocNotification to _shared/. Add
  advisory lock or atomic dedup in firm_agreements update.
ESTIMATED EFFORT: 4-6 hours
```

### FINDING 1F-1: Enrichment Queue Workers — Structurally Duplicated but Separate Concerns

```
SEVERITY: LOW
CATEGORY: Duplicate System (justified)
FILES AFFECTED:
  - supabase/functions/process-enrichment-queue/index.ts (769 lines, deals)
  - supabase/functions/process-buyer-enrichment-queue/index.ts (599 lines, buyers)
EVIDENCE: Both use shared _shared/ libraries (global-activity-queue, rate-limiter,
  enrichment-events). However, the worker pattern itself (stale recovery, atomic
  claiming, circuit breaker, self-continuation) is structurally duplicated. The
  implementation differs: enrichment-queue uses RPC-first claiming, buyer-enrichment-
  queue uses inline atomic updates.
IMPACT: Low — these ARE separate concerns (deals vs buyers) but the ~400 lines
  of shared worker infrastructure could be abstracted.
RECOMMENDED ACTION: Consider extracting a shared queue worker base, but this is
  low priority given the implementations work correctly.
ESTIMATED EFFORT: 2-3 days (if pursued)
```

### FINDING 1G-1: Firm Creation — Race Condition Risk for Duplicate Firms

```
SEVERITY: HIGH
CATEGORY: Data Integrity
FILES AFFECTED:
  - supabase/functions/auto-create-firm-on-signup/index.ts
  - supabase/functions/auto-create-firm-on-approval/index.ts
EVIDENCE: Both functions use the same firm-matching strategy (email domain then
  normalized company name) but: (1) The matching logic is copy-pasted, not shared.
  (2) auto-create-firm-on-signup imports generic domains from _shared/generic-email-
  domains.ts while auto-create-firm-on-approval has a HARDCODED inline list (lines
  106-127) — these lists may diverge. (3) No unique constraint on
  normalized_company_name or email_domain in firm_agreements prevents concurrent
  creation of duplicate firms.
IMPACT: If both functions fire concurrently (possible during a signup-then-
  immediate-approval race), both may find no existing firm and both create one.
  This creates a duplicate firm record for the same company.
  PLAIN ENGLISH: In rare timing scenarios, the system could create two separate
  firm records for the same company, splitting their agreement tracking.
RECOMMENDED ACTION: (1) Add a unique constraint on normalized_company_name in
  firm_agreements. (2) Extract firm-matching logic to _shared/. (3) Unify the
  generic email domain list.
ESTIMATED EFFORT: 1 day
```

### FINDING 1H-1: See FINDING 1C-3 and 1C-4 above (Deal Owner Notifications)

---

## DOMAIN 2 — DEAD DATABASE TABLES

### FINDING 2-1: 8 Confirmed Dead Tables

```
SEVERITY: MEDIUM
CATEGORY: Dead Data
TABLES:
  1. chat_recommendations — 0 queries (1 ref in migrations.ts only)
  2. chat_smart_suggestions — 0 queries (1 ref in migrations.ts only)
  3. scoring_weights_history — 0 queries (1 ref in migrations.ts only)
  4. collections — 0 queries, 0 edge function refs, not in types.ts
  5. profile_data_snapshots — 0 queries (1 ref in migrations.ts only)
  6. admin_owner_leads_views — 0 queries (table, not a view despite name)
  7. admin_users_views — 0 queries (table, not a view despite name)
  8. admin_connection_requests_views — 0 queries (table, not a view despite name)
EVIDENCE: Comprehensive search of src/ and supabase/functions/ for .from() calls,
  INSERT/SELECT/UPDATE statements. All 8 return zero active query results.
IMPACT: Schema bloat. Dead tables consume backup space and confuse schema review.
RECOMMENDED ACTION: Archive data (pg_dump) then DROP TABLE IF EXISTS CASCADE for
  each. Do in a single migration.
ESTIMATED EFFORT: 2-3 hours
```

### FINDING 2-2: 4 Likely Dead Tables (Need Runtime Verification)

```
SEVERITY: MEDIUM
CATEGORY: Dead Data
TABLES:
  1. incoming_leads — 1 edge function writer (receive-valuation-lead), 0 readers.
     valuation_leads is the canonical table. incoming_leads appears to be an
     unreferenced "audit trail" backup.
  2. collection_items — 1 frontend reference in usePartnerActions.ts, but parent
     collections table is confirmed dead. Feature appears abandoned.
  3. interest_signals — superseded by engagement_signals (which has 9 edge function
     refs). interest_signals has 0 frontend queries, 3 AI command center tool refs.
  4. similar_deal_alerts — 0 queries. deal_alerts (7 refs, full CRUD) is canonical.
EVIDENCE: See reference counts above.
IMPACT: Same as above — schema bloat and confusion.
RECOMMENDED ACTION: Verify with runtime row counts (SELECT count(*) FROM each).
  If empty or stale, drop. If incoming_leads has recent data, migrate the
  receive-valuation-lead function to stop writing to it.
ESTIMATED EFFORT: 1-2 hours verification + 1 hour migration
```

### FINDING 2-3: pe_backfill Tables — Need Runtime Check

```
SEVERITY: LOW
CATEGORY: Dead Data (possibly)
TABLES: pe_backfill_log, pe_backfill_review_queue
EVIDENCE: Each has 1 edge function reference (backfill-pe-platform-links) and
  pe_backfill_review_queue has 1 frontend reference (PEFirmLinkReview.tsx).
  These appear to be one-time backfill infrastructure.
IMPACT: If backfill is complete, these are dead. If periodic backfills still run,
  they're active.
RECOMMENDED ACTION: Check runtime: SELECT count(*), max(created_at) FROM each.
  If last write was months ago, archive and drop.
ESTIMATED EFFORT: 30 minutes
```

### FINDING 2-4: Both Outreach Platform Tables Are Active

```
SEVERITY: LOW (no issue)
CATEGORY: Dead Data (cleared)
EVIDENCE: All 4 tables (heyreach_campaign_leads, heyreach_campaign_stats,
  smartlead_campaign_leads, smartlead_campaign_stats) have active queries in
  both frontend and edge functions. Neither platform is deprecated.
RECOMMENDED ACTION: None — keep all. Revisit if HeyReach is deprecated.
```

---

## DOMAIN 3 — DEAD/REDUNDANT COLUMNS

### FINDING 3-1: deal_pipeline Rename — Complete and Clean

```
SEVERITY: LOW (no issue)
CATEGORY: Data Integrity (cleared)
EVIDENCE: Migration 20260506000000 renamed public.deals → deal_pipeline.
  Zero .from('deals') calls remain in src/. Comment in src/lib/data-access/deals.ts
  (line 5) documents the rename. All edge functions use deal_pipeline.
RECOMMENDED ACTION: None.
```

### FINDING 3-2: Contacts Unification — Complete and Clean

```
SEVERITY: LOW (no issue)
CATEGORY: Data Integrity (cleared)
EVIDENCE: pe_firm_contacts and platform_contacts were DROP TABLE'd in migrations
  20260222032323 and 20260302100000. Zero INSERT/UPDATE statements target either.
  Unified contacts table has 50+ active .from('contacts') calls.
RECOMMENDED ACTION: None.
```

### FINDING 3-3: deal_pipeline Contact Columns — Migration Ordering Conflict

```
SEVERITY: MEDIUM
CATEGORY: Data Integrity
FILES AFFECTED:
  - supabase/migrations/20260303070841_*.sql (re-adds contact_name etc.)
  - supabase/migrations/20260506200000_drop_deal_pipeline_duplicate_columns.sql
    (drops contact_name etc.)
EVIDENCE: contact_name, contact_email, contact_company, contact_phone were
  re-added in March 2026 migration then dropped in May 2026 migration. But
  types.ts still shows them, and dealPipelineIntegrity.test.ts asserts they exist.
  If the drop migration was applied, the test would fail and types.ts would not
  include them.
IMPACT: Ambiguous schema state. Need to verify against live database whether
  these columns currently exist.
RECOMMENDED ACTION: Check live database: SELECT column_name FROM
  information_schema.columns WHERE table_name = 'deal_pipeline' AND column_name
  IN ('contact_name','contact_email','contact_company','contact_phone').
  Then align migrations, types.ts, and test assertions.
ESTIMATED EFFORT: 1-2 hours
```

### FINDING 3-4: deals.meeting_scheduled — Actively Used (Not Dead)

```
SEVERITY: LOW (no issue)
EVIDENCE: Toggled via Kanban card UI in PipelineKanbanCard.tsx (line 73).
  Returned by get_deals_with_buyer_profiles RPC. Not dead.
```

### FINDING 3-5: Buyer Type Taxonomy — Clean with Thorough Normalization

```
SEVERITY: LOW
CATEGORY: Data Integrity (mostly clean)
EVIDENCE: 6 canonical types: private_equity, corporate, family_office,
  search_fund, independent_sponsor, individual_buyer. All deprecated values
  (pe_firm, strategic, platform, other, pe) are normalized via
  buyer-type-definitions.ts and migration 20260511000000. Auth signup Zod schema
  accepts advisor and businessOwner which collapse to corporate — minor analytics
  concern but no data loss.
RECOMMENDED ACTION: Consider adding dedicated buyer types for advisor and
  businessOwner if analytics distinction matters.
ESTIMATED EFFORT: 2-4 hours (if pursued)
```

### FINDING 3-6: listings Table — 150+ Columns

```
SEVERITY: MEDIUM
CATEGORY: Dead Data (potential)
EVIDENCE: The listings table in types.ts has 150+ columns including many
  sf_* (Salesforce), captarget_*, metric_*, linkedin_* prefixed columns.
  No explicitly deprecated columns found, but the sheer column count suggests
  accumulated tech debt from multiple integration eras.
IMPACT: Query performance, developer confusion, large row sizes.
RECOMMENDED ACTION: Audit column population rates via:
  SELECT column_name, count(*) FILTER (WHERE column_value IS NOT NULL)
  for each column. Drop any with <1% population and no active writer.
ESTIMATED EFFORT: 1 day for analysis, 1 day for cleanup
```

---

## DOMAIN 4 — DEAD EDGE FUNCTIONS

### FINDING 4-1: 4 Functions Safe to Delete

```
SEVERITY: MEDIUM
CATEGORY: Dead Code
FUNCTIONS:
  1. discover-companies — Only in reachability tests. AI command center has its
     own Google search tool. Never invoked for real.
  2. validate-criteria — Zero callers. parse-fit-criteria and extract-buyer-criteria
     are active (sequential pipeline steps), but validate-criteria was never wired.
  3. suggest-universe — Zero callers. generate-buyer-universe handles universe
     creation. suggest-universe was built but never integrated.
  4. ingest-outreach-webhook — Unified webhook endpoint that was never deployed.
     Dedicated per-tool webhooks (smartlead-webhook, heyreach-webhook,
     phoneburner-webhook) handle all traffic. Not in config.toml.
IMPACT: Dead code deployed to production. Each function consumes deployment
  resources and confuses the function inventory.
RECOMMENDED ACTION: Delete all 4 functions and remove from config.toml.
  For ingest-outreach-webhook, verify with ops that no external tool posts to it.
ESTIMATED EFFORT: 1-2 hours
```

### FINDING 4-2: 2 Functions Need Renaming (Misleading Names)

```
SEVERITY: LOW
CATEGORY: Dead Code (misnamed, not dead)
FUNCTIONS:
  1. apify-google-reviews — Now uses Serper (not Apify). Actively called by
     enrichment pipeline (enrich-external-only, enrichmentPipeline.ts, enrich-deal).
  2. apify-linkedin-scrape — Now uses Blitz API primary, Apify fallback. Actively
     called by enrichment pipeline.
IMPACT: Names mislead developers about the actual provider being used.
RECOMMENDED ACTION: Rename to google-reviews-scrape and linkedin-company-scrape
  (or similar). Update all callers.
ESTIMATED EFFORT: 2-3 hours each
```

### FINDING 4-3: Test/Diagnostic Functions — Keep but Document

```
SEVERITY: LOW
CATEGORY: Dead Code (justified retention)
FUNCTIONS:
  1. pandadoc-integration-test — Used by PandaDocHealthCheck.tsx and
     system-test-runner. Admin diagnostic tool.
  2. test-classify-buyer — Used by BuyerClassificationTest.tsx. Admin QA tool.
  3. sync-missing-profiles — One-time repair utility. No callers but useful for
     emergencies. verify_jwt=false.
RECOMMENDED ACTION: Keep all three. Document in a RUNBOOK that these are admin/
  diagnostic functions, not production workflow functions.
```

### FINDING 4-4: All Scoring and Active Functions Verified

```
SEVERITY: LOW (no issue)
FUNCTIONS VERIFIED ACTIVE:
  - calculate-deal-quality: 51 frontend refs to deal_total_score output
  - calculate-buyer-quality-score: Used in connection request and user management UI
  - send-data-recovery-email: Full admin UI flow (DataRecoveryPage, sidebar link)
  - salesforce-remarketing-webhook: Active n8n integration with dedicated UI
  - parse-fit-criteria: Active in universe management UI
  - extract-buyer-criteria: Active in guide generation workflow
```

---

## DOMAIN 5 — DEAD FRONTEND CODE

### FINDING 5A-1: AdminFeatureIdeas — localStorage-Only Toy Tool

```
SEVERITY: MEDIUM
CATEGORY: Dead Code (functional but inadequate)
FILES AFFECTED: src/pages/admin/AdminFeatureIdeas.tsx
EVIDENCE: Route exists at /admin/feature-ideas (App.tsx line 608). In sidebar
  (UnifiedAdminSidebar.tsx line 368). Uses localStorage key 'admin_feature_ideas'
  for ALL data storage. No database persistence, no multi-user sync. Ideas are
  lost on browser clear.
IMPACT: Features stored here are invisible to other team members and will be lost.
  PLAIN ENGLISH: The "Feature Ideas" page in the admin panel only saves ideas in
  your own browser. If you clear your browser data or use a different computer,
  all ideas disappear. Other team members can't see your ideas either.
RECOMMENDED ACTION: Either upgrade to use a Supabase table for persistence, or
  remove from sidebar to avoid confusion.
ESTIMATED EFFORT: 4-6 hours to add DB persistence, or 15 minutes to remove
```

### FINDING 5B-1: src/seed.ts — Dead Code in Production Source

```
SEVERITY: LOW
CATEGORY: Dead Code
FILES AFFECTED: src/seed.ts (96 lines), src/main.tsx (lines 5, 17 — commented out)
EVIDENCE: Contains seedDatabase() with sample listing data. Import is commented
  out in main.tsx. Not excluded from production build in Vite config, but will be
  tree-shaken since nothing imports it.
IMPACT: Minimal runtime impact (tree-shaken). But presence in src/ could confuse
  developers.
RECOMMENDED ACTION: Move to a dev-only script directory or delete.
ESTIMATED EFFORT: 15 minutes
```

### FINDING 5B-2: buyer/ vs buyers/ Directory Naming Inconsistency

```
SEVERITY: LOW
CATEGORY: Dead Code (naming issue only)
FILES AFFECTED:
  - src/components/buyer/ (AgreementAlertModal.tsx, BuyerNotificationBell.tsx)
  - src/components/buyers/ (FirefliesTranscriptSearch.tsx)
EVIDENCE: Both directories are actively imported. buyer/BuyerNotificationBell
  imported by Navbar.tsx. buyers/FirefliesTranscriptSearch imported by
  ReMarketingBuyerDetail and PEFirmDetail.
IMPACT: Naming confusion only. Both are live.
RECOMMENDED ACTION: Consolidate into single src/components/buyers/ directory.
ESTIMATED EFFORT: 30 minutes
```

### FINDING 5C-1: Hooks Directory is Clean — 1 Dead Hook Found

```
SEVERITY: LOW
CATEGORY: Dead Code
FILES AFFECTED: src/hooks/use-admin.ts
EVIDENCE: Dead barrel re-export. All consumers import directly from
  @/hooks/admin/. Zero files import from use-admin.ts.
RECOMMENDED ACTION: Delete use-admin.ts.
ESTIMATED EFFORT: 5 minutes
```

### FINDING 5D-1: Navigation is Clean — All Sidebar Links Valid

```
SEVERITY: LOW (no issue)
EVIDENCE: All 39 unique sidebar hrefs in UnifiedAdminSidebar.tsx have
  corresponding routes in App.tsx. The /remarketing/* redirects are valid legacy
  URL compatibility redirects pointing to correct targets.
```

### FINDING 5D-2: Orphan Route — /admin/approvals Not Linked from Anywhere

```
SEVERITY: LOW
CATEGORY: Dead Code (orphan route)
FILES AFFECTED: src/App.tsx (lines 506-513)
EVIDENCE: Route exists but no sidebar link, no navigation component links to it.
  Only self-referential link from GlobalApprovalsPage itself. Registered in
  role-permissions.ts constants but unreachable from normal navigation.
RECOMMENDED ACTION: Either add to sidebar or remove the route.
ESTIMATED EFFORT: 15 minutes
```

---

## DOMAIN 6 — DATA INTEGRITY & SCHEMA ISSUES

### FINDING 6A-1: deals → deal_pipeline Rename — Clean (see FINDING 3-1)

### FINDING 6B-1: Contacts Unification — Clean (see FINDING 3-2)

### FINDING 6C-1: audit_log vs audit_logs — Dual Tables, Orphaned Trigger Data

```
SEVERITY: HIGH
CATEGORY: Data Integrity
FILES AFFECTED:
  - supabase/migrations/20260223100000_database_hardening.sql (lines 396, 454-479)
  - src/lib/database.ts (lines 403-414 — writeAuditLog() function)
  - src/hooks/admin/use-undo-bulk-import.ts
  - src/components/admin/ManualUndoImportDialog.tsx
  - src/components/admin/bulk-import/useImportSubmit.ts
EVIDENCE: TWO audit tables exist:
  - audit_logs (plural): Application-level, written by writeAuditLog() in
    database.ts. Used for bulk imports and undo operations. 4+ frontend writers.
  - audit_log (singular): Trigger-based, written by generic_audit_trigger()
    PL/pgSQL function. Applied to deal_pipeline, listings, and connection_requests
    tables. ZERO frontend readers.
  The writeAuditLog() function comment says "Writes to audit_log table" but
  actually writes to audit_logs (plural) — documentation bug.
IMPACT: The trigger-based audit_log (singular) silently captures all mutations
  to core tables, but NO frontend code reads from it. If a security audit is
  conducted by querying audit_logs (plural), it will MISS all trigger-captured
  events. The similarly named tables are a naming collision trap.
  PLAIN ENGLISH: The system keeps two separate audit trails with almost the same
  name. Important security events captured by database triggers are going to a
  table that nobody reads. An auditor checking the obvious table would miss them.
RECOMMENDED ACTION: (1) Rename audit_log → audit_log_triggers (or merge into
  audit_logs). (2) Build an admin view for trigger audit data. (3) Fix the
  writeAuditLog() comment.
ESTIMATED EFFORT: 1 day
```

### FINDING 6D-1: incoming_leads — Near-Dead (see FINDING 2-2)

### FINDING 6E-1: global_activity_queue — Non-Idempotent Dual CREATE

```
SEVERITY: HIGH
CATEGORY: Data Integrity
FILES AFFECTED:
  - supabase/migrations/20260210_global_activity_queue.sql (line 4)
  - supabase/migrations/20260210215937_ade4993c-*.sql (line 3)
EVIDENCE: Two CREATE TABLE public.global_activity_queue statements on the same
  date with NO DROP between them and NO IF NOT EXISTS guard. The schemas DIVERGE:
  File 1 has started_by (refs profiles), queue_position, CHECK constraints.
  File 2 has created_by (refs auth.users), created_at, no CHECKs.
  Fresh environment provisioning from migration 0 WILL FAIL with "relation
  global_activity_queue already exists".
IMPACT: Cannot provision fresh environments (new developer setup, staging, CI/CD)
  without manual intervention. The divergent schemas mean the actual production
  table may have either schema depending on which migration ran first.
  PLAIN ENGLISH: Setting up the project from scratch will break because the same
  table is created twice. New developers or test environments can't get started
  without manually fixing the database.
RECOMMENDED ACTION: (1) Add IF NOT EXISTS to the second CREATE, or better:
  (2) Delete the duplicate migration and keep only the canonical one.
  (3) Add a migration to reconcile the schema to the intended final state.
ESTIMATED EFFORT: 2-4 hours
```

### FINDING 6F-1: listing_personal_notes — Non-Idempotent Dual CREATE (Ultimately Dropped)

```
SEVERITY: MEDIUM
CATEGORY: Data Integrity
FILES AFFECTED:
  - supabase/migrations/20250807104534_*.sql (line 2)
  - supabase/migrations/20250807151851_*.sql (line 2)
  - supabase/migrations/20260222032323 (line 23 — DROP)
  - supabase/migrations/20260302100000 (line 85 — second DROP)
EVIDENCE: Two CREATE TABLE statements ~4.5 hours apart, no IF NOT EXISTS, no
  DROP between them. Table was ultimately dropped in later migrations. Fresh
  deploys will fail at the second CREATE before reaching the DROP.
IMPACT: Same as 6E-1 — blocks fresh environment provisioning.
RECOMMENDED ACTION: Add IF NOT EXISTS to the second CREATE TABLE statement.
ESTIMATED EFFORT: 15 minutes
```

### FINDING 6G-1: Buyer Type Consistency — Clean (see FINDING 3-5)

---

## DOMAIN 7 — WORKFLOW INTEGRITY

### FINDING 7-1: Introduction Status Log is Client-Side Only

```
SEVERITY: MEDIUM
CATEGORY: Workflow Break (data loss risk)
FILES AFFECTED:
  - src/hooks/use-buyer-introductions.ts (lines 111-118)
EVIDENCE: introduction_status_log is written by a CLIENT-SIDE INSERT after a
  successful buyer_introductions UPDATE. If the UPDATE succeeds but the log
  INSERT fails (network issue, RLS denial, etc.), the state transition is
  silently lost. This is not a DB trigger.
IMPACT: Status transition history may have gaps. Cannot reliably audit the
  full lifecycle of a buyer introduction.
RECOMMENDED ACTION: Move status logging to a Postgres trigger on
  buyer_introductions that fires AFTER UPDATE and logs old/new status.
ESTIMATED EFFORT: 2-4 hours
```

### FINDING 7-2: deal_created Status Has No Kanban Column

```
SEVERITY: LOW
CATEGORY: Workflow Break (minor)
FILES AFFECTED:
  - src/components/admin/deals/buyer-introductions/hooks/use-introduction-pipeline.ts
  - src/components/admin/deals/buyer-introductions/kanban/KanbanBoard.tsx
EVIDENCE: The constants file defines a deal_created status but
  getColumnForStatus() has no case for it — it falls through to the to_introduce
  default. Cards with deal_created status would appear in the wrong column.
IMPACT: Minor UX confusion if a deal_created introduction appears in the
  "Buyers to Introduce" column instead of a dedicated column or the "Interested"
  column.
RECOMMENDED ACTION: Either add a case mapping deal_created to interested (since
  it follows fit_and_interested), or add a 5th Kanban column for completed deals.
ESTIMATED EFFORT: 30 minutes
```

### FINDING 7-3: Listing Publication Uses Non-Obvious Status Fields

```
SEVERITY: LOW (documentation issue)
CATEGORY: Workflow Integrity
FILES AFFECTED:
  - supabase/functions/publish-listing/index.ts (lines 200-203)
EVIDENCE: Publication sets is_internal_deal=false, status='active', and
  published_at=timestamp. There is NO status='published' or is_published=true
  field. The publish gate is a compound condition across 3 fields. This is not
  a bug but is non-obvious and should be documented.
RECOMMENDED ACTION: Add a code comment explaining the publish gate, or create
  a database view (published_listings) that encapsulates the condition.
ESTIMATED EFFORT: 30 minutes
```

### FINDING 7-4: Two Parallel NDA Paths (PandaDoc + Brevo Email)

```
SEVERITY: MEDIUM
CATEGORY: Duplicate System
FILES AFFECTED:
  - supabase/functions/auto-create-firm-on-approval/index.ts (PandaDoc e-signing)
  - supabase/functions/send-nda-email/index.ts (Brevo email attachment)
EVIDENCE: auto-create-firm-on-approval creates a PandaDoc NDA for e-signing
  (lines 211-316). send-nda-email sends NDA as a .docx email attachment via Brevo
  (downloads from nda-documents storage bucket). These are parallel paths to the
  same business goal (getting an NDA signed).
IMPACT: Tracking inconsistency — PandaDoc NDAs are tracked via pandadoc_document_id
  in firm_agreements, while email NDAs may not update agreement status at all
  (requires manual confirmation).
  PLAIN ENGLISH: There are two different ways to send NDAs — one tracks whether
  the buyer signed it automatically, the other requires someone to manually check.
RECOMMENDED ACTION: Clarify when each path is used. If email NDA is legacy,
  deprecate it. If both are needed (e.g., email for manual signing when PandaDoc
  is down), ensure both update firm_agreements.nda_signed consistently.
ESTIMATED EFFORT: 4-6 hours investigation + possible refactor
```

### FINDING 7-5: RLS Does Not Enforce NDA/Fee Agreement for Listing Access

```
SEVERITY: MEDIUM
CATEGORY: Data Integrity / Security
FILES AFFECTED:
  - supabase/migrations/20260304200000_rls_listings_is_internal_deal.sql
  - src/components/pandadoc/FeeAgreementGate.tsx
EVIDENCE: RLS policy on listings checks approval_status='approved',
  email_verified=true, status='active', is_internal_deal=false, and
  visible_to_buyer_types. It does NOT check NDA or fee agreement status.
  Agreement gating is purely application-layer (FeeAgreementGate component).
IMPACT: A technically savvy buyer who bypasses the React frontend (e.g., using
  the Supabase JS client directly or REST API) could access listing data without
  signing the NDA or fee agreement. The RLS policy permits it.
  PLAIN ENGLISH: The legal agreement requirements (NDA, fee agreement) are only
  enforced by the website's user interface, not by the database. Someone who knows
  how to talk directly to the database API could see listings without signing.
RECOMMENDED ACTION: Add NDA check to RLS policy: JOIN firm_agreements WHERE
  nda_signed=true. This enforces agreement at the database level.
ESTIMATED EFFORT: 4-6 hours (including testing with existing users)
```

### FINDING 7-6: CapTarget Sync — No Incremental Sync, Full Re-Read Every Time

```
SEVERITY: LOW
CATEGORY: Workflow Integrity
FILES AFFECTED:
  - supabase/functions/sync-captarget-sheet/index.ts
EVIDENCE: No last-sync timestamp mechanism. Uses SHA-256 hash-based dedup
  (captarget_row_hash) to detect new vs existing rows. Every sync re-reads
  the entire sheet (~7,500 rows). Pagination with 45-second timeout and
  continuation tokens handles large sheets.
IMPACT: Sync is O(n) on total sheet size rather than O(delta). For ~7,500 rows
  this is acceptable but wasteful.
RECOMMENDED ACTION: Consider adding a Google Sheets lastModified check to skip
  sync when sheet hasn't changed. Low priority.
ESTIMATED EFFORT: 2-4 hours
```

### FINDING 7-7: Buyer Discovery — External Pool Not Restricted to PE-Backed

```
SEVERITY: LOW
CATEGORY: Workflow Integrity (specification mismatch)
FILES AFFECTED:
  - supabase/functions/seed-buyers/index.ts (line 963)
  - supabase/functions/score-deal-buyers/index.ts (lines 493-495)
EVIDENCE: The spec states "External pool: PE-backed platforms only" but the code
  defines external as source='ai_seeded' regardless of is_pe_backed status.
  is_pe_backed is set to !!suggested.pe_firm_name (truthy if PE firm name exists)
  but is used only for scoring priority, not as a hard filter.
IMPACT: Non-PE-backed companies may appear in the external pool. PE-backed
  companies do get scoring priority but non-PE-backed ones are not excluded.
RECOMMENDED ACTION: Verify with product team whether the PE-backed restriction
  is intentional or aspirational. If intentional, add filter:
  .filter((b) => b.source === 'ai_seeded' && b.is_pe_backed).
ESTIMATED EFFORT: 30 minutes code change + product decision
```

### FINDING 7-8: Buyer Discovery — Service Gate, Caps, Caching All Working Correctly

```
SEVERITY: LOW (no issue)
EVIDENCE VERIFIED:
  - Service gate: 0 = hard kill (0.0x), scales up to 81-100 = 1.0x. Defined in
    _shared/scoring/types.ts (lines 74-81).
  - Caps: MAX_INTERNAL=50, MAX_EXTERNAL=25 (score-deal-buyers lines 21-22).
    Applied via .slice(0, MAX_*) after sorting by score.
  - buyer_seed_cache: 90-day TTL, keyed by deal+category.
  - buyer_recommendation_cache: 4-hour TTL for scored results.
  - buyer_discovery_feedback: Rejected buyers excluded from results (lines 223-225).
```

### FINDING 7-9: generate-teaser Correctly Receives Lead Memo

```
SEVERITY: LOW (no issue)
EVIDENCE: generate-teaser fetches completed lead_memos record with
  memo_type='full_memo' and status='completed' (lines 301-308). Comment at line 7:
  "Lead Memo Text -> generate-teaser -> Anonymous Teaser Text". Anonymization
  validation checks company name, owner name, city, state, employee names.
  Section headers verified: BUSINESS OVERVIEW, DEAL SNAPSHOT, KEY FACTS,
  GROWTH CONTEXT, OWNER OBJECTIVES.
```

---

## PRIORITIZED REMEDIATION ROADMAP

### Sprint 1 — Do Now (Data Integrity Issues That Could Cause Live Bugs)

| # | Finding | Severity | Effort | Description |
|---|---------|----------|--------|-------------|
| 1 | 1C-3 | CRITICAL | 2-4 hrs | Fix duplicate deal reassignment emails — remove direct call to notify-deal-owner-change from useDealMutations.ts |
| 2 | 1C-4 | CRITICAL | 1-2 days | Fix N-times email amplification — move notification sending server-side or add dedup check |
| 3 | 6E-1 | HIGH | 2-4 hrs | Fix global_activity_queue dual CREATE — add IF NOT EXISTS or delete duplicate migration |
| 4 | 6C-1 | HIGH | 1 day | Resolve audit_log vs audit_logs naming collision — rename or merge, fix writeAuditLog comment |
| 5 | 1G-1 | HIGH | 1 day | Fix firm creation race condition — add unique constraint, unify generic domain list, extract shared matching |
| 6 | 7-5 | MEDIUM | 4-6 hrs | Add NDA check to RLS policy on listings table |
| 7 | 6F-1 | MEDIUM | 15 min | Fix listing_personal_notes dual CREATE — add IF NOT EXISTS |

### Sprint 2 — This Month (Duplicate Systems to Consolidate)

| # | Finding | Severity | Effort | Description |
|---|---------|----------|--------|-------------|
| 8 | 1A-1 | HIGH | 15 min | Delete SimpleToastProvider (zero consumers) |
| 9 | 1A-2 | MEDIUM | 2-3 days | Consolidate useToast + Sonner → Sonner only |
| 10 | 1C-5 | MEDIUM | 1 day | Extract shared email helpers from send-nda-email / send-fee-agreement-email |
| 11 | 1D-1 | MEDIUM | 2-3 days | Extract shared outreach resolver for HeyReach/Smartlead |
| 12 | 1E-2 | MEDIUM | 4-6 hrs | Extract shared PandaDoc notification helper, add advisory lock |
| 13 | 7-4 | MEDIUM | 4-6 hrs | Clarify/consolidate dual NDA paths (PandaDoc vs Brevo email) |
| 14 | 7-1 | MEDIUM | 2-4 hrs | Move introduction_status_log to DB trigger |
| 15 | 3-3 | MEDIUM | 1-2 hrs | Verify deal_pipeline contact columns against live DB |

### Sprint 3 — Next Quarter (Dead Code Cleanup & Table Drops)

| # | Finding | Severity | Effort | Description |
|---|---------|----------|--------|-------------|
| 16 | 2-1 | MEDIUM | 2-3 hrs | Drop 8 confirmed dead tables (archive data first) |
| 17 | 2-2 | MEDIUM | 1-2 hrs | Verify and drop 4 likely dead tables |
| 18 | 4-1 | MEDIUM | 1-2 hrs | Delete 4 dead edge functions |
| 19 | 4-2 | LOW | 4-6 hrs | Rename apify-* functions to reflect actual providers |
| 20 | 1C-1 | MEDIUM | 30 min | Delete send-transactional-email (never-completed consolidation) |
| 21 | 1C-2 | LOW | 15 min | Delete send-templated-approval-email |
| 22 | 5A-1 | MEDIUM | 4-6 hrs | Upgrade AdminFeatureIdeas to DB persistence or remove |
| 23 | 5B-1 | LOW | 15 min | Delete src/seed.ts |
| 24 | 5B-2 | LOW | 30 min | Merge buyer/ and buyers/ directories |
| 25 | 5C-1 | LOW | 5 min | Delete dead use-admin.ts hook |
| 26 | 5D-2 | LOW | 15 min | Add /admin/approvals to sidebar or remove route |
| 27 | 3-6 | MEDIUM | 2 days | Audit listings table 150+ columns for population rates |

### Never-Do (Things That Look Dead but Must Be Kept)

| Finding | Why Keep |
|---------|----------|
| pandadoc-integration-test | Active admin health check tool used by PandaDocHealthCheck.tsx and system test runner |
| test-classify-buyer | Active admin QA tool for verifying AI classification accuracy |
| sync-missing-profiles | Emergency repair utility for auth/profile sync issues. Harmless, occasionally critical |
| apify-google-reviews / apify-linkedin-scrape | Actively called by enrichment pipeline — names are misleading but functions are live |
| salesforce-remarketing-webhook | Active n8n integration with dedicated frontend UI (SalesforceInfoCard, DealSourceBadge) |
| send-data-recovery-email | Full admin UI flow exists (DataRecoveryPage, sidebar link, 2 callers) |
| test_run_results / test_run_tracking | Active internal test infrastructure tables |
| Both HeyReach AND Smartlead tables | Both integrations are actively used; neither is deprecated (business decision to maintain both) |
| score_snapshots | Actively queried by AI command center signal-tools |
| deal_scoring_adjustments | Referenced in remarketing frontend and AI command center |
| buyer_learning_history | Used by remarketing deal matching and AI command center |
| registration_funnel | Actively tracked by signup analytics hooks |

---

## APPENDIX: Runtime Verification Needed

The following findings cannot be fully resolved from code analysis alone. Runtime data from the Supabase dashboard is needed:

1. **pe_backfill_log / pe_backfill_review_queue**: `SELECT count(*), max(created_at) FROM pe_backfill_log` — if last write was months ago, safe to drop
2. **incoming_leads**: `SELECT count(*) FROM incoming_leads` — if empty, drop; if populated, migrate receive-valuation-lead to stop writing
3. **deal_pipeline contact columns**: `SELECT column_name FROM information_schema.columns WHERE table_name='deal_pipeline' AND column_name IN ('contact_name','contact_email','contact_company','contact_phone')` — determines which migration state is current
4. **global_activity_queue schema**: `\d+ global_activity_queue` — determines which of the two divergent CREATE schemas was actually applied
5. **audit_log (singular) row count**: `SELECT count(*) FROM audit_log` — determines how much trigger data exists that nobody is reading
6. **Email delivery logs for deal reassignment**: Check if previous owners are actually receiving duplicate emails by querying email_delivery_logs for same recipient + deal within 1 minute
7. **interest_signals vs engagement_signals**: `SELECT count(*) FROM interest_signals` — if empty, confirm dead
8. **collection_items**: `SELECT count(*) FROM collection_items` — if empty, confirm dead

---

*Audit performed March 14, 2026. Codebase: SourceCoDeals/connect-market-nexus @ main branch.*
*47 findings across 7 domains. 2 CRITICAL, 4 HIGH, 11 MEDIUM, remainder LOW/INFO.*
