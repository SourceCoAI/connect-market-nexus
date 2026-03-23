# Buyer Universe & Deal Approval Workflow Audit Report

**Date**: 2026-03-17
**Scope**: End-to-end buyer universe generation, deal assignment, scoring, and approval workflow

---

## 1. CONFIRMED BUGS

### Bug 1 — Divergent AI Prompts Between Single and Batch Generation

**Status**: CONFIRMED and FIXED

**Files**:
- `supabase/functions/generate-buyer-universe/index.ts` (lines 110–146) — CORRECT prompt
- `supabase/functions/process-buyer-universe-queue/index.ts` (lines 205–219) — OLD prompt (now fixed)

**Root Cause**: The queue worker's `generateForListing()` function (line 147) is a full copy-paste of the standalone function's logic. When the standalone function's prompt was updated to add geography rules and better examples, the queue worker was not updated.

**Specific Divergences Found**:

| Aspect | generate-buyer-universe (CORRECT) | process-buyer-universe-queue (OLD) |
|--------|-----------------------------------|-------------------------------------|
| Label framing | "SPECIFIC TYPE of business or service vertical" | "WHO would BUY this type of company" |
| Geography rule | "NEVER lead with geography" (explicit, with examples) | No geography restriction; "Southeast Mechanical Services Add-On" given as a GOOD example |
| Examples | 7 good + 6 bad examples with explanations | 4 examples (2 good, 2 bad), some geography-leading shown as GOOD |
| Tool description | "Never lead with geography" | "buyer perspective, not seller" |
| Closing instruction | "Focus on specialization and deal thesis, not geography" | "Reference geography, specialization, and deal thesis where possible" (encourages geography) |

**Architectural Note**: The duplication is clearly an oversight, not intentional. The comment on line 142–145 says "Same logic as the generate-buyer-universe edge function, inlined here so the processor can call it directly without an HTTP round-trip." A shared module would be cleaner but is harder in Deno edge functions (each function is an isolated bundle). Given the codebase pattern of self-contained edge functions, **copying the correct prompt** is the pragmatic fix.

**Fix Applied**: Replaced the old prompt in `process-buyer-universe-queue/index.ts` with the exact prompt from `generate-buyer-universe/index.ts`. Also updated the tool description to match.

---

### Bug 2 — UniverseAssignmentButton Shows Only One Universe Per Deal

**Status**: CONFIRMED and FIXED

**File**: `src/components/remarketing/deal-detail/UniverseAssignmentButton.tsx` (line 40–41)

**Root Cause**: The query uses `.limit(1).maybeSingle()` which returns at most one row. The `remarketing_universe_deals` table has a composite key of `(universe_id, listing_id)`, confirming that a deal can be in multiple universes. Other parts of the codebase (e.g., `AddDealToUniverseDialog.tsx` line 133–141) fetch ALL universe associations for a listing without limit.

**Impact**: When a deal is in multiple universes, the component only sees the first assignment. It shows a single "View Buyer Matches" link and hides the universe assignment dropdown (since it thinks the deal is already assigned). The user cannot see or manage additional universe assignments from this component.

**Fix Applied**: Changed the query to fetch all active assignments (removed `.limit(1).maybeSingle()`, now returns an array). Updated the render logic to show a count indicator ("in N universes") when multiple assignments exist. The "View Buyer Matches" link still goes to the matching page (which already handles multiple universes via `remarketing_universe_deals` joins).

**Other `.limit(1)` / `.single()` checks on `remarketing_universe_deals`**: No other inappropriate uses found. The `score-deal-buyers/index.ts` correctly fetches all universe links (line 110–114). The `queueDealScoringAllUniverses` in `queueScoring.ts` (line 153–157) correctly fetches all. The `BulkAssignUniverseDialog` (line 66–71) correctly checks for existing per-universe.

---

### Bug 3 — Wrong buyer_id in Outreach Records During Bulk Approval

**Status**: CONFIRMED and FIXED

**File**: `src/components/remarketing/BulkApproveForDealsDialog.tsx` (line 264 in original)

**Root Cause**: The outreach creation loop uses `buyerIds.find(() => true)` which is equivalent to `buyerIds[0]` — it always returns the first buyer ID in the array regardless of which score is being processed. In a bulk approval of N buyers across M deals, ALL outreach records get buyer #1's ID.

Additionally, the loop iterates over `newScoreIds.filter(() => true)` which is equivalent to `[...newScoreIds]` — it doesn't filter by group, meaning newScoreIds from ALL groups get outreach records created for EVERY group (duplicating and misattributing).

**Comparison with ApproveBuyerMultiDealDialog (single buyer)**:
The single-buyer version (`ApproveBuyerMultiDealDialog.tsx` lines 235–257) handles this correctly because there's only one `buyerId` (a prop, not an array), so `buyer_id: buyerId` is always correct. It also correctly maps score IDs to deals using the index offset between `existingScoreIds` and `unscoredDeals`.

**Fix Applied**:
1. After approving existing scores, fetch `(id, buyer_id)` pairs from `remarketing_scores` to build a `scoreIdToBuyerId` map
2. For newly created scores, track the buyer_id per score using the insertion order (each group's `unscoredBuyerIds` maps 1:1 to the returned score IDs)
3. Use the map to set the correct `buyer_id` on each outreach record

**SQL to find corrupted records** (see Section 3):
```sql
SELECT ro.id, ro.score_id, ro.buyer_id AS outreach_buyer_id,
       rs.buyer_id AS score_buyer_id, ro.listing_id
FROM remarketing_outreach ro
JOIN remarketing_scores rs ON rs.id = ro.score_id
WHERE ro.buyer_id != rs.buyer_id;
```

---

## 2. ADDITIONAL BUGS FOUND

### Additional Bug A — DealCSVImport Does NOT Queue Scoring After Import

**Status**: CONFIRMED and FIXED

**Severity**: High

**File**: `src/components/remarketing/DealCSVImport.tsx`

**Details**: The `importMutation.onSuccess` callback invalidated query caches and called `onImportComplete?.()` but **never queued background scoring** for the imported deals. Compare with `AddDealToUniverseDialog` which explicitly calls `queueDealScoring()` after adding deals. CSV-imported deals sat in the universe with no buyer scores until someone manually triggered scoring. Also missing cache invalidation for `['remarketing', 'deals', 'universe', universeId]`.

**Fix Applied**: Added `linkedListingIds` tracking to `DetailedImportResults`. Both new inserts and merged deals now push their listing IDs into this array during import. In `onSuccess`, `queueDealScoring()` is called with all linked IDs. Also added missing cache invalidation key.

---

### Additional Bug B — extract-buyer-criteria-background Bypasses Source Priority

**Status**: CONFIRMED and FIXED

**Severity**: Medium

**File**: `supabase/functions/extract-buyer-criteria-background/index.ts` (lines 267–275)

**Details**: The background version directly updated `buyer_universes` with extracted criteria WITHOUT checking source priority. The foreground `extract-buyer-criteria/index.ts` correctly implements source priority checks — it skips overwriting fields that already have transcript-sourced data. The background version calls the foreground version via HTTP (which applies source priority), but then ALSO did its own unconditional update that could clobber transcript-priority data.

**Fix Applied**: Removed the direct `buyer_universes` update. The HTTP call to `extract-buyer-criteria` already handles the universe update with proper source-priority-aware logic.

---

### Additional Bug C — BulkApproveForDealsDialog Creates Introductions for ALL Buyers x ALL Deals

**Status**: CONFIRMED and FIXED

**Severity**: Medium

**File**: `src/components/remarketing/BulkApproveForDealsDialog.tsx` (lines 333–342)

**Details**: The buyer introduction creation loop iterated over ALL `buyerIds` for ALL selected groups, not just the buyers that were actually scored/approved for each group. If buyer A has scores only for deals 1 and 2, and buyer B only for deal 3, approving all three deals created introductions for buyer A on deal 3 and buyer B on deals 1 and 2 — even though those buyer-deal pairs were never scored or approved.

**Fix Applied**: Now collects the actual approved buyer IDs per group from `scoreIdToBuyerId` (for pending scores) and `unscoredBuyerIds` (for newly created scores), creating introductions only for buyer-deal pairs that were actually approved.

---

### Additional Bug D — Contact Discovery Fires for ALL Buyers Regardless of Selection

**Status**: CONFIRMED and FIXED

**Severity**: Low

**File**: `src/components/remarketing/BulkApproveForDealsDialog.tsx` (line 309)

**Details**: `Promise.allSettled(buyerIds.map(...))` fired contact discovery for ALL buyers passed to the dialog, not just those that were actually approved (some deals may not be selected). This was wasteful but not data-corrupting since contact discovery is idempotent.

**Fix Applied**: Now collects unique buyer IDs from the `scoreIdToBuyerId` map and `unscoredBuyerIds` across selected groups, firing contact discovery only for buyers that were actually approved.

---

## 3. DATA INTEGRITY QUERIES

### Query 1: Soft-deleted deals still in universes
```sql
SELECT rud.id AS universe_deal_id, rud.universe_id, rud.listing_id,
       l.title, l.deleted_at, bu.name AS universe_name
FROM remarketing_universe_deals rud
JOIN listings l ON l.id = rud.listing_id
JOIN buyer_universes bu ON bu.id = rud.universe_id
WHERE l.deleted_at IS NOT NULL
  AND rud.status = 'active';
```

### Query 2: Approved scores without outreach records
```sql
SELECT rs.id AS score_id, rs.listing_id, rs.buyer_id, rs.status,
       rs.updated_at AS approved_at
FROM remarketing_scores rs
LEFT JOIN remarketing_outreach ro ON ro.score_id = rs.id
WHERE rs.status = 'approved'
  AND ro.id IS NULL;
```

### Query 3: Outreach records with mismatched buyer_id (Bug 3 corruption)
```sql
SELECT ro.id AS outreach_id, ro.score_id,
       ro.buyer_id AS outreach_buyer_id,
       rs.buyer_id AS score_buyer_id,
       ro.listing_id,
       ro.created_at
FROM remarketing_outreach ro
JOIN remarketing_scores rs ON rs.id = ro.score_id
WHERE ro.buyer_id != rs.buyer_id;
```

### Query 4: Invalid scoring weights (should sum to 100)
```sql
SELECT id, name,
       geography_weight, size_weight, service_weight, owner_goals_weight,
       (COALESCE(geography_weight, 0) + COALESCE(size_weight, 0) +
        COALESCE(service_weight, 0) + COALESCE(owner_goals_weight, 0)) AS total_weight
FROM buyer_universes
WHERE (COALESCE(geography_weight, 0) + COALESCE(size_weight, 0) +
       COALESCE(service_weight, 0) + COALESCE(owner_goals_weight, 0)) != 100
  AND archived = false;
```

### Query 5: Orphaned scoring queue entries (stuck in processing)
```sql
SELECT id, universe_id, listing_id, score_type, status, attempts,
       created_at, updated_at
FROM remarketing_scoring_queue
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '10 minutes';
```

---

## 4. ARCHITECTURAL OBSERVATIONS

### 4.1 Duplicated Prompt Logic (Systemic Risk)
The `generateForListing()` function in `process-buyer-universe-queue` is a full copy-paste of `generate-buyer-universe`. This caused Bug 1 and will cause future drift whenever the prompt is updated. Deno edge functions make shared modules harder (each function is bundled independently), but the prompts could be extracted to `_shared/prompts/buyer-universe.ts` to reduce this risk. Both functions already import from `_shared/ai-providers.ts`, so the pattern is established.

### 4.2 Score Weights Mismatch Between Pipeline Stages
The `buyer_universes` table has per-universe weights (`geography_weight`, `size_weight`, `service_weight`, `owner_goals_weight`) that sum to 100. However, the `score-deal-buyers` function uses hardcoded weights in `_shared/scoring/types.ts` (service: 0.70, geography: 0.15, bonus: 0.15) and completely ignores the per-universe weights. The per-universe weights appear to be a data model that was designed but never wired into the scoring pipeline. This means editing weights in the UI has no effect on actual scoring.

### 4.3 Queue Deduplication Gap on Re-Add
When a deal is removed from a universe and re-added, `queueDealScoring()` checks for `pending` or `processing` queue entries but NOT `completed` ones. This means re-adding correctly creates a new queue entry (the old `completed` entry doesn't block it). This is correct behavior.

However, if a queue entry is stuck in `failed` status (after MAX_ATTEMPTS), re-adding the deal will also not be blocked (since `failed` is not in the checked statuses). The stale recovery in `process-scoring-queue` only resets `processing` items older than 5 minutes — it does not retry `failed` items. Failed items require manual intervention or a separate cleanup job.

### 4.4 Missing Cache Invalidation in Some Paths (FIXED)
`DealCSVImport` previously invalidated `['remarketing', 'universe-deals', universeId]` and `['listings']` but not `['remarketing', 'deals', 'universe', universeId]` which is used by the universe detail page. Fixed as part of Additional Bug A.

### 4.5 Buyer Universe Label Regeneration Requires Manual Trigger
The migration `20260402000001` reset all `buyer_universe_generated_at` to NULL. The `generate-buyer-universe` function checks this field and returns cached values when set (line 64). After the migration, labels will only regenerate when:
1. The standalone function is called for a specific listing (manual trigger from UI)
2. The queue worker processes a listing in a batch operation

There is no automatic trigger — labels do NOT regenerate on page load or deal view. Someone must either click a "Generate" button or run a batch regeneration. The `buyer_universe_label` is purely for display/organizational purposes — it is NOT used in the scoring pipeline.

---

## 5. WHAT IS WORKING CORRECTLY

### Scoring Pipeline
- `score-deal-buyers/index.ts` correctly fetches all universe links for a deal (no `.limit(1)`)
- Score weights are consistently applied via `SCORE_WEIGHTS` in `_shared/scoring/types.ts`
- Service gate multiplier correctly prevents wrong-industry buyers from ranking high
- The `process-scoring-queue` worker has robust recovery: stale processing items are reset, circuit breaker stops cascading failures, self-continuation handles large queues

### Queue Deduplication
- `queueDealScoring()` correctly checks for existing `pending`/`processing` entries before inserting
- Uses RPC (`upsert_deal_scoring_queue`) to handle partial unique indexes correctly
- Fire-and-forget worker invocation with retry (maxRetries: 2)

### Deal-to-Universe Assignment Paths (Scoring Triggered)
All five assignment paths correctly trigger scoring after adding a deal:
- `AddDealToUniverseDialog` — calls `queueDealScoring()` in both `addDealsMutation.onSuccess` and `createDealMutation.onSuccess`
- `UniverseAssignmentButton` — calls `queueDealScoring()` in `assignMutation`
- `AddToUniverseQuickAction` — calls `queueDealScoring()` in `handleAddAndScore`
- `BulkAssignUniverseDialog` — calls `queueDealScoring()` in `handleAssign`
- **Exception**: `DealCSVImport` does NOT queue scoring (see Additional Bug A)

### Duplicate Assignment Checks
- `BulkAssignUniverseDialog` (lines 66–75) explicitly checks for existing assignments before inserting
- `AddDealToUniverseDialog` filters out deals already in the universe from the listing (line 160)
- `DealCSVImport` uses upsert with `onConflict: 'universe_id,listing_id'` for merge scenarios

### URL Normalization
`AddDealToUniverseDialog` (lines 261–266) correctly normalizes URLs by stripping protocol, `www.` prefix, and trailing slashes before comparison. This handles http/https, www/no-www, and trailing slash variations.

### Single-Buyer Approval Workflow
`ApproveBuyerMultiDealDialog.tsx` correctly handles the full approval flow:
- Updates existing scores to 'approved'
- Creates score records for unscored deals
- Creates outreach records with the correct `buyerId` (single buyer, so no mapping needed)
- Fires contact discovery once per buyer
- Creates buyer introductions per deal
- Invalidates all relevant query caches

### Extract-Buyer-Criteria (Foreground)
The foreground `extract-buyer-criteria/index.ts` correctly implements source priority (guide priority 60 < transcript priority 100) and only fills empty fields when transcript data exists.

### Buyer Introduction Creation
`createBuyerIntroductionFromApproval()` correctly deduplicates by `(remarketing_buyer_id, listing_id)` before inserting, making repeated approvals safe no-ops.
