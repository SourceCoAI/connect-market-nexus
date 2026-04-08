# Remarketing Pipeline & Buyer Introductions — Definitive Audit
**Date:** April 7, 2026 | **Auditor:** Claude Code | **Depth:** 10/10

---

## EXECUTIVE SUMMARY

**Pipeline creation from buyer introductions has a 100% failure rate.** Every single time an admin has marked a buyer as "Fit & Interested" (3 occurrences total), the system failed to create a pipeline entry. The user was told it succeeded each time.

The root cause is a **contacts table schema mismatch**: the code uses `.upsert({}, { onConflict: 'email' })` but the contacts table has **partial unique indexes** (not simple unique constraints). Supabase can't match `onConflict: 'email'` to a partial index, so every upsert crashes. The error is caught silently, and the pipeline INSERT never executes.

Beyond this critical bug, the audit uncovered **47 distinct issues** across pipeline, introductions, AI scoring, logging, and data integrity.

---

## SECTION 1: CRITICAL BUGS (Must Fix)

### CRIT-1: Contact Upsert Fails on Every Call (ROOT CAUSE)
**File:** `src/hooks/use-buyer-introductions.ts:253`
**Impact:** 100% pipeline creation failure rate — 3/3 attempts failed
**Cause:** `contacts` table uses partial unique index `idx_contacts_buyer_email_unique` on `lower(email) WHERE contact_type='buyer' AND archived=false`. The Supabase client's `.upsert({}, { onConflict: 'email' })` requires a simple unique CONSTRAINT, not a partial index. Every upsert throws, the catch block swallows it, and the pipeline INSERT never runs.
**Evidence:** Zero `deal_pipeline` rows with `source = 'remarketing'` in production. All 3 `fit_and_interested` transitions (LP First Capital, Integra Testing Services, Stonehenge) have no pipeline entry.
**Status:** ✅ FIXED — Replaced with SELECT-then-INSERT pattern

### CRIT-2: Same Bug Exists in CreateDealModal
**File:** `src/components/admin/CreateDealModal/useCreateDealForm.ts:200`
**Impact:** Manual deal creation with buyer contact fails silently
**Status:** ✅ FIXED — Same SELECT-then-INSERT pattern applied

### CRIT-3: Null remarketing_buyer_id Falls Through to Introduction UUID
**File:** `src/hooks/use-buyer-introductions.ts:274`
**Cause:** `buyer.remarketing_buyer_id || buyer.id` — when buyer_id is null, uses the introduction's own UUID, causing FK violation
**Status:** ✅ FIXED — Changed to `buyer.remarketing_buyer_id || null`

### CRIT-4: Success Toast Shows When Pipeline Creation Fails
**File:** `src/hooks/use-buyer-introductions.ts:189`
**Cause:** `onSuccess` always fires after status update succeeds, regardless of whether `createDealFromIntroduction` worked
**Status:** ✅ FIXED — Now returns boolean, shows warning toast on failure

### CRIT-5: `deal_created` Status Not in DB CHECK Constraint
**DB:** `buyer_introductions_introduction_status_check`
**Allowed:** `need_to_show_deal`, `outreach_initiated`, `meeting_scheduled`, `not_a_fit`, `fit_and_interested`
**Missing:** `deal_created` — code defines this status but DB would reject it
**Status:** ⬜ NOT YET FIXED — needs ALTER TABLE migration

### CRIT-6: Recommendation Cache Not Invalidated on Listing Changes
**File:** `supabase/functions/score-deal-buyers/index.ts:72`
**Cause:** Cache key is only `listing_id`. When deal's industry/category/geography changes, stale cached recommendations persist for 4 hours.
**Status:** ⬜ NOT YET FIXED — needs cache invalidation trigger on listings table

### CRIT-7: Universe Weights Don't Affect Cache Key
**File:** `supabase/functions/score-deal-buyers/index.ts:72`
**Cause:** If a deal moves between universes with different scoring weights, the old cached scores are returned
**Status:** ⬜ NOT YET FIXED

### CRIT-8: `under_loi` Flag Missing from Pipeline RPC
**File:** `get_deals_with_buyer_profiles()` RPC
**Cause:** RPC SELECT doesn't include `d.under_loi`, so pipeline cards show stale LOI toggle state
**Status:** ⬜ NOT YET FIXED — needs RPC migration

---

## SECTION 2: HIGH-PRIORITY BUGS

### HIGH-1: Buyer Search Too Narrow
**File:** `src/components/remarketing/deal-detail/AddBuyerIntroductionDialog.tsx:108-118`
**Issue:** Only searches company_name, buyer_type, pe_firm_name, location, website. Cannot search by contact name, target industries, investment criteria, thesis summary, or deal size.
**Status:** ✅ FIXED — Added target_services, target_industries, industry_vertical, thesis_summary to search terms

### HIGH-2: No Email Validation on Buyer Forms
**File:** `src/components/remarketing/deal-detail/AddBuyerIntroductionDialog.tsx`
**Issue:** Accepts any string as email (e.g., `pgdavies@tonehengepartners.com/`)
**Status:** ✅ FIXED — Added regex validation and trailing slash removal

### HIGH-3: No Realtime Subscriptions for Buyer Introductions
**File:** `src/hooks/use-realtime-admin.ts`
**Issue:** Changes to `buyer_introductions`, `introduction_status_log`, `deal_activities` don't trigger UI updates. Two admins working simultaneously see stale data.
**Status:** ⬜ NOT YET FIXED

### HIGH-4: No History/Audit Trail Visibility in Kanban
**Issue:** Status changes are logged to `introduction_status_log` but there's NO UI to view this history. Admins can't see who moved what, when, or why.
**Status:** ⬜ NOT YET FIXED — needs history modal on cards

### HIGH-5: No Link Between Pipeline Deal and Source Introduction
**Issue:** `deal_pipeline` has `remarketing_buyer_id` but NO `buyer_introduction_id`. Admins can't trace a pipeline deal back to its introduction record. No "View Introduction" button in pipeline detail.
**Status:** ⬜ NOT YET FIXED — needs column + UI

### HIGH-6: Backward Drag Allowed Without Validation
**File:** `src/components/admin/deals/buyer-introductions/kanban/KanbanBoard.tsx:74-111`
**Issue:** Cards can be dragged backward (Interested → Introduced → To Introduce) with no confirmation or guard. Creates nonsensical status history.
**Status:** ⬜ NOT YET FIXED

### HIGH-7: Duplicate Pipeline Deals Possible (Race Condition)
**File:** `src/hooks/use-buyer-introductions.ts:210-319`
**Issue:** No check if a `deal_pipeline` entry already exists for this buyer+listing pair. Two admins approving simultaneously could create duplicates. No unique constraint on `(listing_id, remarketing_buyer_id)`.
**Status:** ⬜ NOT YET FIXED

### HIGH-8: Inconsistent Activity Type Names
**File:** `supabase/functions/ai-command-center/tools/action-tools.ts`
**Issue:** Uses `status_change` instead of `stage_change`, `data_room` and `task_reassigned` and `contacts_added` — none are in the DealActivityType enum.
**Status:** ⬜ NOT YET FIXED

### HIGH-9: Serper Website Lookup Failure Discards Good Buyers
**File:** `supabase/functions/seed-buyers/index.ts:886`
**Issue:** If Serper fails to find a website for an AI-discovered buyer, the buyer is SKIPPED entirely. Should insert with `company_website=NULL` instead.
**Status:** ⬜ NOT YET FIXED

---

## SECTION 3: MEDIUM-PRIORITY ISSUES

### MED-1: `introduction_activity` Table is Orphaned
- Schema exists (defined in migration) but zero production usage
- System uses `introduction_status_log` instead
- Should either use or drop

### MED-2: Buyer Introduction Creation Not Logged to deal_activities
- When a buyer is first added to an introduction, NO entry in `deal_activities`
- Only `introduction_status_log` captures SUBSEQUENT changes
- Initial creation event is invisible in audit trail

### MED-3: Frontend vs Edge Function Pipeline Creation Divergence
- Frontend `createDealFromIntroduction()`: simpler, no firm_agreement creation
- Edge function `convert-to-pipeline-deal`: creates firm_agreements, more complete
- Two parallel implementations that may diverge

### MED-4: Contact Discovery is Fire-and-Forget
- `findIntroductionContacts()` called without await
- If it fails, user sees error toast but no retry mechanism
- Not logged if buyer has no deal_pipeline entry

### MED-5: Score Snapshot Never Updated
- Buyer cards show `score_snapshot` from time of approval
- If buyer data changes, card shows stale score
- No refresh mechanism

### MED-6: Reactivate from "Passed" Goes to "To Introduce" Not "Interested"
- User clicks "Reactivate" and expects buyer to return to where they were
- Instead goes all the way back to start
- No confirmation explaining the behavior

### MED-7: "Interested" Column Has No "Pass" Button
- Only way to move from "Interested" to "Passed" is drag-and-drop
- All other transitions have action buttons
- UX inconsistency

### MED-8: Follow-up Notes Only in "Introduced" Column
- Can't log follow-ups for "Interested" or "Passed" buyers
- Notes only tracked during introduction phase

### MED-9: No Bulk Operations in Kanban
- Can't select and move/archive multiple buyers at once
- Deal detail view has batch ops, kanban doesn't

### MED-10: Archive/Remove Only in "To Introduce"
- Can't remove buyers from "Introduced", "Interested", or "Passed"
- Stuck with unwanted entries

### MED-11: No Filter/Search in Kanban
- Can't filter by score tier, source, firm, etc.
- Large kanban boards become unmanageable

### MED-12: Pipeline Deal Visibility Edge Case
- RPC requires `cr.status = 'approved'` when `connection_request_id` is set
- Deals with pending/rejected connection requests are hidden from ALL pipeline views

### MED-13: Rejection Feedback Only Per-Deal, Not Per-Niche for Scoring
- `score-deal-buyers` excludes rejected buyers only for SAME listing
- Rejecting a buyer on Deal A doesn't prevent them from scoring high on Deal B
- `seed-buyers` DOES use niche-level feedback for AI calibration (different logic)

### MED-14: Fuzzy Matching Breaks on Hyphens/Underscores
- `scoreService()` uses word boundary regex (`\b`)
- "HVAC-Services" won't match "HVAC Services"
- "Fleet_Maintenance" won't match "Fleet Maintenance"

### MED-15: Extract Deal Keywords Can Pollute Categories
- If deal description mentions "healthcare" AND "utility services", both become scoring categories
- Can create false positive matches for adjacent industries

---

## SECTION 4: LOW-PRIORITY / UX ISSUES

### LOW-1: No Loading State for Cache Refresh (double-click risk)
### LOW-2: `size_score` Field is Dead Code (never computed in v3)
### LOW-3: Modal Operations Have No Error Handling (IntroduceModal, PassReasonModal)
### LOW-4: Stale Indicator on Cards Has No Action Button
### LOW-5: PE Firm Arrow Display Confusing (`peFirmName → buyerFirmName`)
### LOW-6: No Expected Close Date Visible on Pipeline Cards
### LOW-7: No Deal Probability Adjustment UI
### LOW-8: Collapsed "Passed" Column Can Be Forgotten
### LOW-9: No "What's New" Filter Preset for Pipeline
### LOW-10: `deal.location` Reference in Fallback Email Template is Undefined

---

## SECTION 5: 100 USE CASES — FULL RESULTS

### Pipeline Entry & Tracking (1-15)
| # | Scenario | Status |
|---|----------|--------|
| 1 | Deal created from CapTarget import | ✅ |
| 2 | Deal created manually | ✅ |
| 3 | Buyer approved to meet → pipeline entry | ❌ CRIT-1,3,4 — 100% failure rate |
| 4 | Move deal between pipeline stages | ✅ |
| 5 | Assign deal owner | ✅ |
| 6 | Pipeline shows buyer contact info | ⚠️ Only if contact created |
| 7 | Pipeline deal links to listing | ✅ |
| 8 | Pipeline deal links to buyer introduction | ❌ HIGH-5 — no link |
| 9 | Multiple buyers on same deal | ✅ (if creation worked) |
| 10 | Closed Won updates introduction status | ❌ Not implemented |
| 11 | Under LOI flag | ⚠️ CRIT-8 — not fetched from RPC |
| 12 | Meeting scheduled flag | ✅ |
| 13 | Follow-up tracking | ✅ |
| 14 | SLA tracking | ⚠️ stage_entered_at exists but no alerts |
| 15 | Deal score shown | ✅ |

### Buyer Introduction Lifecycle (16-35)
| # | Scenario | Status |
|---|----------|--------|
| 16 | Add buyer from existing database | ✅ |
| 17 | Add new buyer manually | ✅ |
| 18 | Status transitions logged | ✅ |
| 19 | fit_and_interested creates pipeline | ❌ CRIT-1 — always fails |
| 20 | Kanban drag-and-drop | ✅ |
| 21 | Drag to "Introduced" opens modal | ✅ |
| 22 | Drag to "Passed" opens modal | ✅ |
| 23 | Revert from fit_and_interested | ⚠️ HIGH-6 — allowed without guard |
| 24 | Archive introduction | ✅ |
| 25 | Duplicate prevention | ✅ |
| 26 | Notes on introduction | ✅ |
| 27 | Next step + date | ✅ |
| 28 | Score snapshot preserved | ✅ |
| 29 | Targeting reason shown | ✅ |
| 30 | Auto contact discovery | ✅ |
| 31 | PE firm contact cascade | ✅ |
| 32 | Company contact cascade | ✅ |
| 33 | Batch archive | ✅ |
| 34 | AI vs manual source distinction | ⚠️ Partial |
| 35 | Intro on Closed Won deal | ⚠️ No guard |

### Buyer Search & Discovery (36-55)
| # | Scenario | Status |
|---|----------|--------|
| 36 | Search by company name | ✅ |
| 37 | Search by contact/person name | ❌ HIGH-1 |
| 38 | Search by investment criteria | ✅ FIXED |
| 39 | Search by target industry | ✅ FIXED |
| 40 | Search by deal size range | ❌ Not implemented |
| 41 | AI recommendations load | ✅ |
| 42 | AI shows fit reasons | ✅ |
| 43 | AI shows tier classification | ✅ |
| 44 | Add AI recommendation as introduction | ✅ |
| 45 | AI universe generation | ✅ |
| 46 | needs_buyer_search flag | ⚠️ Manual only |
| 47 | AI considers industry | ✅ |
| 48 | AI considers geography | ✅ |
| 49 | AI considers deal size | ⚠️ Removed in v3 |
| 50 | AI excludes already-introduced | ⚠️ Only rejected via feedback |
| 51 | AI excludes rejected buyers | ✅ |
| 52 | Refresh AI recommendations | ✅ |
| 53 | AI seed discovers via Google | ✅ |
| 54 | AI seed deduplicates | ✅ |
| 55 | AI seed logs reasoning | ✅ |

### Data Quality (56-65)
| # | Scenario | Status |
|---|----------|--------|
| 56 | Email validation | ✅ FIXED |
| 57 | Phone validation | ❌ Not implemented |
| 58 | LinkedIn URL validation | ❌ Not implemented |
| 59 | Duplicate buyer detection | ⚠️ No fuzzy matching |
| 60 | Malformed email breaks pipeline | ✅ FIXED |
| 61 | Buyer with no email | ✅ Works |
| 62 | Buyer with no company name | ⚠️ Allows empty |
| 63 | Deal with no summary → AI search | ⚠️ Uses fallback fields |
| 64 | Deal with no industry → AI search | ⚠️ Degraded results |
| 65 | Multiple contacts at buyer | ✅ |

### Cross-System Integration (66-80)
| # | Scenario | Status |
|---|----------|--------|
| 66 | Pipeline → PhoneBurner | ✅ |
| 67 | Pipeline → Smartlead | ✅ |
| 68 | Intro → email draft | ✅ |
| 69 | NDA/Fee on pipeline | ✅ |
| 70 | Buyer scoring → pipeline priority | ⚠️ Partial |
| 71 | Pipeline → data room | ✅ |
| 72 | Edge fn creates firm_agreement | ✅ |
| 73 | Frontend creates firm_agreement | ❌ MED-3 — doesn't |
| 74 | Owner notification | ⚠️ Edge fn only |
| 75 | Realtime updates | ⚠️ HIGH-3 — no intro subscriptions |
| 76 | Pipeline ↔ introduction sync | ❌ Not implemented |
| 77 | Introduction link in pipeline | ❌ HIGH-5 |
| 78 | Bulk approve AI recommendations | ❌ Not implemented |
| 79 | Export pipeline data | ❌ Not implemented |
| 80 | Export introduction data | ❌ Not implemented |

### Reporting (81-90)
| # | Scenario | Status |
|---|----------|--------|
| 81 | All introductions across deals | ✅ |
| 82 | Filter by status | ✅ |
| 83 | History/timeline | ❌ HIGH-4 — no UI |
| 84 | Introduction count on deal | ⚠️ Tab label only |
| 85 | Pipeline value per stage | ✅ |
| 86 | Dashboard metrics | ⚠️ Basic |
| 87 | Who created introduction | ✅ |
| 88 | Who changed status | ✅ (in log, not UI) |
| 89 | Score comparison | ✅ |
| 90 | Historical score data | ✅ (snapshot) |

### Edge Cases (91-100)
| # | Scenario | Status |
|---|----------|--------|
| 91 | AI scores 0 matches | ✅ |
| 92 | AI timeout | ✅ |
| 93 | AI returns duplicate | ✅ |
| 94 | Buyer passed on similar deal | ⚠️ MED-13 — not flagged |
| 95 | Archive intro → pipeline orphaned | ⚠️ Not linked |
| 96 | Delete pipeline deal → intro unaffected | ✅ |
| 97 | Concurrent status updates | ⚠️ HIGH-7 — race condition |
| 98 | Large buyer pool (10K+) | ⚠️ Capped at 10K per query |
| 99 | Buyer in multiple universes | ✅ |
| 100 | Universe weights customize scoring | ✅ |

---

## SECTION 6: LOGGING COVERAGE MAP

| Action | Logged To | Status |
|--------|-----------|--------|
| Pipeline stage change | deal_activities (via RPC) | ✅ |
| Deal owner assignment | deal_activities (via RPC) | ✅ |
| Introduction status change | introduction_status_log | ✅ |
| **Introduction creation** | **NOWHERE** | ❌ MED-2 |
| Pipeline deal created | deal_activities | ❌ Fails due to CRIT-1 |
| Contact discovery | enrichment_events (if deal exists) | ⚠️ |
| AI buyer search | buyer_seed_log | ✅ |
| AI scoring | buyer_recommendation_cache | ✅ |
| Buyer feedback (accept/reject) | buyer_discovery_feedback | ✅ |
| Task creation/completion | deal_activities | ✅ |
| **Introduction activity (email/call)** | **introduction_activity (ORPHANED TABLE)** | ❌ |

---

## SECTION 7: DATA INTEGRITY — LIVE PRODUCTION

| Check | Result |
|-------|--------|
| `fit_and_interested` intros with no pipeline entry | **3 orphaned** (100% failure) |
| Pipeline deals with `source = 'remarketing'` | **0** (never successfully created) |
| Orphaned pipeline deals (deleted listings) | 1 test record |
| Active pipeline deals | 207 |
| Active buyer introductions | 221 (153 to_introduce, 55 outreach, 4 meeting, 3 fit_interested, 6 not_fit) |
| Active buyers | 1,256 |
| Active contacts | 9,701 |

---

## SECTION 8: FIXES APPLIED IN THIS SESSION

| Fix | File | Status |
|-----|------|--------|
| Contact upsert → SELECT-then-INSERT | use-buyer-introductions.ts | ✅ |
| Same fix in CreateDealModal | useCreateDealForm.ts | ✅ |
| remarketing_buyer_id null fallback | use-buyer-introductions.ts | ✅ |
| Conditional success/warning toast | use-buyer-introductions.ts | ✅ |
| Email sanitization + validation | use-buyer-introductions.ts | ✅ |
| Email validation in AddBuyerIntroductionDialog | AddBuyerIntroductionDialog.tsx | ✅ |
| Expanded buyer search terms | AddBuyerIntroductionDialog.tsx | ✅ |
| Pipeline creation returns boolean | use-buyer-introductions.ts | ✅ |

---

## SECTION 9: PRIORITY FIX LIST (REMAINING)

### P0 — Data Fixes (manual SQL to fix orphaned records)
1. Create pipeline entries for the 3 orphaned `fit_and_interested` introductions

### P1 — Critical Code Fixes
1. Add `deal_created` to DB CHECK constraint
2. Add listing change trigger to invalidate recommendation cache
3. Add `under_loi` to pipeline RPC SELECT
4. Add duplicate pipeline prevention (unique constraint or check)

### P2 — High-Priority Features
1. Add `buyer_introduction_id` column to `deal_pipeline`
2. Add realtime subscriptions for `buyer_introductions`
3. Add status history modal on kanban cards
4. Add backward drag validation/confirmation
5. Fix Serper website lookup to not discard buyers

### P3 — Medium-Priority Features
1. Add introduction creation logging to deal_activities
2. Drop orphaned `introduction_activity` table
3. Align frontend/edge function pipeline creation
4. Add "Pass" button on "Interested" column cards
5. Add follow-up notes to all columns
6. Add bulk operations to kanban
7. Standardize activity type names in edge functions
8. Add contact name search to buyer search dialog

### P4 — Low-Priority/UX
1. Add expected close date to pipeline cards
2. Add "What's New" filter preset
3. Fix fallback email template `deal.location`
4. Add loading guards for cache refresh
5. Clean up dead `size_score` code
