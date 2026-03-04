# SourceCo Data Architecture Deep Dive Audit

**Date:** 2026-03-04
**Prepared for:** Tomos, CEO
**Scope:** Full codebase — 151 tables, 153 edge functions, 767 migrations, ~407K LOC

---

## Executive Summary

This audit examines SourceCo's entire data architecture across 151 database tables, 153 edge functions, 767 migrations, and approximately 407,000 lines of code. The goal is to assess how well the current foundation supports scaling to significantly more data volume, more features, and more users layered on top.

**The bottom line:** SourceCo has made impressive progress cleaning up technical debt over the past few months. The recent schema refactors (renaming tables to clearer names, dropping dead code, unifying contacts) show strong architectural instincts. However, there are structural patterns that will become serious bottlenecks as you scale. This audit identifies those patterns and provides a concrete roadmap to fix them.

The findings are organized into three tiers:

| Tier | Focus | Examples |
|------|-------|---------|
| **Tier 1** | Foundational issues that block scaling | Data duplication, migration sprawl, edge function complexity |
| **Tier 2** | Structural improvements for maintainability | Query patterns, type safety, table consolidation |
| **Tier 3** | Growth-enabling investments | Event-driven architecture, caching, separation of concerns |

---

## Current State Snapshot

| Metric | Current State |
|--------|--------------|
| Database tables | 151 tables (plus views) in PostgreSQL 15 on Supabase |
| Migrations | 767 migration files spanning July 2025 to May 2026 |
| Edge functions | 153 Deno-based serverless functions |
| Shared modules | 43 shared TypeScript modules used across edge functions |
| Frontend code | ~252,000 lines across components, hooks, pages, and lib |
| Custom hooks | 241 React hooks for data fetching and business logic |
| RPC functions | 90+ database functions called from frontend or edge functions |
| Tables queried from frontend | ~80 tables directly accessed via Supabase client |
| Codebase total | ~407,000 lines of TypeScript and SQL |

---

## What Is Working Well

### [STRENGTH] Recent cleanup momentum is excellent
The Phase 0 cleanup (dropping 9 orphaned tables, 15 dead functions, 200+ dead frontend files) and subsequent work show strong discipline. The schema refactor strategy document is thorough and well-prioritized.

### [STRENGTH] Table naming is improving
Renaming `deals` to `deal_pipeline` and `remarketing_buyers` to `buyers` with backward-compatible views is the right approach. It eliminates real confusion without breaking anything.

### [STRENGTH] Row Level Security coverage is solid
RLS is enabled on all tables. The recent security hardening migration caught the critical gap on `connection_requests` (the core deal table had no RLS). The standardization to `is_admin(auth.uid())` as the canonical check is correct.

### [STRENGTH] Soft delete pattern is consistent
Using `deleted_at` timestamps rather than hard deletes across the platform protects against data loss and enables recovery. This is a mature pattern.

### [STRENGTH] Unified contacts table is the right direction
Consolidating buyer, seller, and firm contacts into a single `contacts` table with type discriminators is architecturally sound and eliminates a major source of data fragmentation.

### [STRENGTH] Database utility layer exists
The `src/lib/database.ts` module provides type-safe query builders (`fetchRows`, `fetchById`, `insertRows`, `updateRow`, `deleteRow`, `paginatedFetch`) with error handling via `safeQuery`. This is a solid foundation to build the data access layer on.

### [STRENGTH] Shared edge function modules are well-organized
43 shared modules in `supabase/functions/_shared/` cover auth, AI providers, external API clients, rate limiting, and validation — with test coverage for critical utilities.

---

## Tier 1: Foundational Issues

These are the patterns that will become serious bottlenecks as you add more data and features. They should be the highest priority.

### 1A. Data Lives in Too Many Places

This is the single biggest risk to your data architecture. The same piece of information is stored in multiple tables, with different sync mechanisms that can fall out of step.

**Why this matters for scaling:** Every new feature you build has to answer "where do I read buyer type from?" or "which revenue number is correct?" If there are 3 answers, bugs are inevitable. And each sync trigger you add to keep copies aligned is another point of failure.

| Data Point | Where It Lives | Sync Mechanism | Risk |
|-----------|---------------|----------------|------|
| Company name | `profiles.company`, `profiles.company_name`, `buyers.company_name` | Approval trigger + AI extraction | 3 fields, 2 write paths, no cascade |
| Buyer type | `profiles.buyer_type` (camelCase), `buyers.buyer_type` (snake_case) | Approval trigger + AI classification | Type mapping in 2 different places |
| Revenue targets | `profiles.target_deal_size_min/max`, `buyers.target_revenue_min/max` | Approval trigger + AI overwrite | AI can silently overwrite user-entered values |
| Buyer priority score | Computed on `connection_requests`, copied to `deal_pipeline` | Two SQL triggers in sequence | Goes stale if profile updated outside trigger path |
| Agreement status | `firm_agreements`, `profiles` booleans, `contacts` booleans | Multiple triggers + RPC | Three sources of truth for business-critical decision |
| Contact info | `profiles`, `buyers`, `contacts`, `connection_requests` lead fields | Mirror trigger + backfill migrations | Four places to check for a buyer's email or phone |

**What to do about it:**

1. **Buyer identity:** The `buyers` table should be the single source of truth for all buyer organization data: company name, buyer type, revenue targets, thesis, geographic focus. The `profiles` table should only hold authentication and personal info. When the frontend needs buyer org data, join `profiles` to `buyers`.

2. **Contact info:** The unified `contacts` table should be the only place contact details live. Finish the Phase 1 migration from the schema refactor strategy, then stop writing `lead_name`/`lead_email`/`lead_company` to `connection_requests`. Have `connection_requests` reference a `contact_id` instead.

3. **Agreement status:** `firm_agreements` should be the single source. Drop the boolean flags on `profiles` and `contacts`. The `resolve_contact_agreement_status()` RPC already exists — route all reads through it.

---

### 1B. 767 Migrations Is a Maintenance Problem

With 767 migration files, your migration history has become documentation of every trial-and-error decision ever made rather than a clean record of your schema. Many triggers and functions have been recreated 3-8 times across different migrations.

| Object | Times Recreated | Impact |
|--------|----------------|--------|
| `auto_create_deal_from_connection_request` trigger | 4 versions | Hard to know which logic is actually running |
| `set_chat_conversations_updated_at` trigger | 8 versions | Recreated across 4 chatbot attempts |
| `delete_user_completely()` function | 7 versions | Only latest is active |
| `auto_enrich_new_listing` trigger | 5+ versions | Could cause duplicate enrichment jobs |
| `sync_connection_request_firm_trigger` | 4 versions | Rapid iteration in a single week |

**Migration distribution shows the problem clearly:**
- February 2026: **326 migrations** (42% of all migrations in one month)
- August 2025: 93 migrations
- October 2025: 72 migrations
- Remaining months: 10-50 each

**What to do about it:**
1. **Squash migrations:** Create a single "baseline" migration that represents the current schema exactly as it exists in production today. Archive the 767 historical files. New environments start from the single baseline.
2. **Establish migration discipline:** Going forward, each migration should be self-contained and idempotent. Use `IF NOT EXISTS` and `CREATE OR REPLACE` consistently.

---

### 1C. Edge Functions Are Too Large and Overlapping

You have 153 edge functions, and several of the most important ones are enormous monoliths. Beyond size, there is significant overlap — particularly in email/notification sending.

**Size outliers:**

| Function | Lines | What It Does |
|----------|-------|-------------|
| `score-buyer-deal` | 1,952 | Multi-dimensional buyer-deal scoring |
| `enrich-deal` | 1,699 | Full deal enrichment pipeline |
| `generate-ma-guide` | 1,480 | M&A guide generation |
| `enrich-buyer` | 1,360 | Buyer enrichment via multiple AI calls |

**Email/notification sprawl — 32 functions:**
- 20 `send-*` functions (emails for approval, NDA, fee agreements, verification, notifications, etc.)
- 12 `notify-*` functions (buyer rejection, deal reassignment, admin alerts, etc.)
- All share the same 2 utilities: `brevo-sender.ts` and `email-logger.ts`

**What to do about it:**
1. **Consolidate email functions:** Replace 32 email/notification functions with a single `send-transactional-email` function that takes a template name and variables, plus a `send-notification` function for in-app notifications. This alone reduces function count by ~20%.
2. **Break up monoliths:** `score-buyer-deal` should be split into scoring modules (geography, size, service alignment) composed together.
3. **Target ~60-70 functions:** The schema refactor strategy already identifies the consolidation path.

---

### 1D. No Coordinated Rate Limiting Across Queues

You have three independent queue systems (deal enrichment, buyer enrichment, guide generation) that can all fire simultaneously. Each hits the same external APIs (Gemini, Claude, Firecrawl) with no coordination between them.

The `_shared/rate-limiter.ts` and `_shared/cost-tracker.ts` modules exist but are not wired into a global coordination system.

**What to do about it:**
1. **Implement a global semaphore:** Use a database-backed semaphore table that tracks concurrent API calls across all queue processors.
2. **Wire up cost tracking:** The `cost-tracker.ts` shared module and `enrichment_cost_log` table exist but aren't being used consistently. Wire every AI call through cost tracking.
3. **Unify queue processing:** Long term, consider a single queue processor with a shared concurrency pool.

---

## Tier 2: Structural Improvements

These issues create friction that compounds over time. Fixing them makes the platform significantly easier to build on.

### 2A. Frontend Queries Are Too Direct and Scattered

The frontend makes 800+ direct Supabase `.from()` calls spread across 241 hooks, querying ~80 different tables. Meanwhile, only ~30 hooks use `.rpc()` calls. This means the frontend knows intimate details about the database schema.

The existing `src/lib/database.ts` provides generic query builders but not domain-specific data access functions. The next step is to build typed, domain-specific functions on top of this foundation.

**What to do about it:**
1. **Create a data access layer:** Build typed functions like `getActiveListings()`, `getListingById(id)`, `getBuyerMatchesForListing(id)` in `src/lib/data-access/`. These wrap the existing `database.ts` utilities.
2. **Use more RPCs for complex queries:** Anything joining 3+ tables should be a database RPC, not a frontend query.
3. **Standardize query patterns:** Pick one pattern and use it everywhere.

---

### 2B. 151 Tables Is Too Many for This Stage

Most B2B SaaS platforms at SourceCo's stage operate with 30-50 core tables. Examples of table proliferation:

**Admin view state — 4 identical tables:**
- `admin_connection_requests_views`
- `admin_deal_sourcing_views`
- `admin_owner_leads_views`
- `admin_users_views`

All have the same structure: `admin_id`, `last_viewed_at`, `created_at`, `updated_at`. These should be one table with a `view_type` column.

**Integration tables — 11 tables across 3 integrations:**
- HeyReach: campaigns, leads, webhook tables
- SmartLead: campaigns, leads, webhook tables
- PhoneBurner: contacts, webhook, OAuth tables

Each follows a slightly different pattern.

**Analytics — 8+ tables tracking overlapping user behavior:**
- `user_sessions`, `page_views`, `user_events`, `user_activity`, `listing_analytics`, `search_analytics`, `engagement_scores`, `daily_metrics`

**What to do about it:**
1. **Consolidate admin view tables** → single `admin_view_state` table with `view_type` column
2. **Unify analytics tables** → consider a single `events` table with event types
3. **Standardize integration patterns** → generic `integration_campaigns`, `integration_leads`, `integration_events`

---

### 2C. Multi-Trigger Chains Are Fragile

**Pipeline conversion chain (4 triggers on a single INSERT):**
```
connection_requests INSERT
  → ensure_source_from_lead() trigger
  → update_buyer_priority_score() trigger
  → auto_create_deal_from_connection_request() trigger
    → writes to deals table
      → notify_user_on_stage_change() trigger
```

**Agreement propagation chain:**
```
firm_agreements UPDATE
  → log_agreement_status_change() trigger
  → sync_fee_agreement_to_remarketing() trigger
    → writes to remarketing_buyers
```

**What to do about it:**
1. **Replace chains with explicit RPCs:** Create `create_pipeline_deal(connection_request_id)` that does all steps in one function with proper error handling.
2. **Keep simple triggers:** `updated_at` timestamp triggers and basic audit logging are fine.
3. **Add observability:** Log trigger activity to `trigger_logs` or `cron_job_logs`.

---

### 2D. Generated Types Are Stale and Incomplete

The Supabase-generated types file (`src/integrations/supabase/types.ts`) is 12,899 lines and includes type definitions for tables that have been dropped. The `buyer_type` field uses camelCase values in `profiles` but snake_case in `buyers`.

**What to do about it:**
1. **Regenerate types** after every migration batch and commit the result.
2. **Normalize enums** — pick snake_case (the Postgres convention) everywhere.

---

## Tier 3: Growth-Enabling Changes

These are investments that will let you confidently build the next generation of features.

### 3A. Move Toward Event-Driven Architecture

Today, side effects are handled through a mix of database triggers, inline edge function calls, and frontend-initiated follow-up calls. There is no central event bus.

The `global_activity_queue` table and `_shared/global-activity-queue.ts` module already exist. Expand this to be a proper event log.

**How to get there:**
1. **Expand `global_activity_queue`** to record every significant platform action with a standard schema.
2. **Build event subscribers:** Edge functions that poll for specific event types.
3. **Use Supabase Realtime** for live events — already used for admin dashboard updates.

### 3B. Implement a Proper Caching Layer

The `buyer_recommendation_cache` and `buyer_seed_cache` tables show caching awareness, but there's no systematic strategy.

**How to get there:**
1. **Tier stale times:** Static data (categories, stages) at 30-60min. Transactional data at 5min. Real-time data via subscriptions.
2. **Cache expensive computations:** Extend the recommendation cache pattern to scoring and analytics.

### 3C. Separate Platform Data from Business Logic Data

Operational, analytics, configuration, and audit data all live in the same schema with the same access patterns.

**How to get there:**
1. **Schema separation:** Move analytics tables into an `analytics` schema.
2. **Consider a read replica** for reporting queries.
3. **Archive old analytics data** on a rolling basis.

---

## Scaling Readiness Scorecard

| Dimension | Readiness | Limiting Factor | Fix |
|-----------|-----------|----------------|-----|
| More deals (10x listings) | **Good** | Enrichment queue lacks rate coordination | Global semaphore + cost tracking |
| More buyers (10x accounts) | **Moderate** | Profile/buyer data duplication creates sync issues | Single source of truth migration |
| More pipeline volume (10x deals) | **Good** | Trigger chains could slow under load | Replace chains with RPCs |
| More team members (5-10 admins) | **Good** | Admin view state is fragmented but functional | Consolidate admin view tables |
| More integrations | **Moderate** | Each integration creates 3-4 new tables | Standardized integration schema |
| More AI features | **Moderate** | No cost visibility, no rate coordination | Rate limiter + function decomposition |
| More analytics/reporting | **Low** | Analytics and transactional data compete | Schema separation + read replica |
| New developer onboarding | **Low** | 767 migrations, 151 tables, 153 functions | Migration squash + data access layer |

---

## Priority Roadmap

See [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md) for the detailed, phase-by-phase implementation plan with concrete code changes, migration SQL, and effort estimates.

| Phase | What | Effort | Impact |
|-------|------|--------|--------|
| Phase 1 | Finish single-source-of-truth for buyer data | 2-3 weeks | Eliminates #1 source of data inconsistency |
| Phase 2 | Squash migrations to a single baseline | 1 week | Dramatically simplifies onboarding and debugging |
| Phase 3 | Consolidate email edge functions (32 → 2) | 1-2 weeks | Quick win — reduces function count by ~20% |
| Phase 4 | Replace trigger chains with explicit RPCs | 2 weeks | Eliminates fragile hidden side effects |
| Phase 5 | Global rate limiter and cost tracking | 1 week | Prevents API overages, gives cost visibility |
| Phase 6 | Create frontend data access layer | 3-4 weeks | Makes every future schema change 10x easier |
| Phase 7 | Consolidate analytics tables + schema separation | 2 weeks | Prepares for data volume growth |
| Phase 8 | Break up monolith edge functions | 3-4 weeks | Makes scoring and enrichment testable |
| Phase 9 | Event-driven architecture via global_activity_queue | 4-6 weeks | Enables decoupled feature development |

---

## Closing Thoughts

The most important takeaway from this audit is that SourceCo's data architecture is not broken — it is growing up. The patterns that got you to $215K MRR and $175M+ in closed enterprise value were the right patterns for that stage. The question now is which patterns need to evolve for the next stage.

The recent cleanup work (dropping dead tables, renaming confusing tables, unifying contacts) shows you are already thinking about this correctly. This audit is about accelerating that trajectory and making sure the foundation is rock-solid before you layer on the next wave of features.

**The single most impactful thing you can do is complete the single-source-of-truth migration for buyer data.** Everything else — better caching, event-driven architecture, function decomposition — becomes easier once you have clean, canonical data to build on.

---

*This audit was prepared based on analysis of the full SourceCo codebase (connect-market-nexus repository), including all 767 migrations, 153 edge functions, 151 database table definitions, and ~407,000 lines of frontend and backend code.*
