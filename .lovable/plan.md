

# Phase 67-72: User-Facing Listing Publishing Pipeline — End-to-End Audit & Fixes

## Architecture Summary

```text
PATH A: Marketplace Queue Flow
  Remarketing Deal ──push_to_marketplace──▶ MarketplaceQueue.tsx
    ──"Create Listing"──▶ CreateListingFromDeal (AI content gen, anonymization)
    ──INSERT──▶ listings (is_internal_deal=true, source_deal_id set)
    ──admin edits in ImprovedListingEditor──▶ useUpdateListing
    ──"Publish"──▶ publish-listing edge fn (validates, sets is_internal_deal=false)
    ──LIVE on marketplace──▶ useSimpleListings / useListing / useSavedListings

PATH B: Direct Create via Manage Listings
  Admin clicks "Create Listing" in ListingsManagementTabs
    ──▶ ImprovedListingEditor (blank form)
    ──INSERT──▶ listings (is_internal_deal=true via useRobustListingCreation)
    ──"Publish"──▶ publish-listing edge fn
    ──LIVE

PUBLIC BUYER HOOKS (all enforce is_internal_deal=false):
  ✅ useSimpleListings — marketplace grid
  ✅ useListings (use-listings.ts) — alternate marketplace hook
  ✅ useSavedListings — saved listings page
  ✅ useListing — single listing detail (admin bypass for preview)
  ⚠️ useSimilarListings — LEAKS internal fields (see below)
```

## Findings

### Phase 67: useSimilarListings Leaks Confidential Admin Fields
**Severity: High — Data Exposure**

`use-similar-listings.ts` line 18 selects `internal_company_name, internal_primary_owner, primary_owner_id, internal_salesforce_link, internal_deal_memo_link, internal_contact_info, internal_notes` — all confidential admin fields. These are then mapped into the `Listing` object and returned to the buyer-facing `SimilarListingsCarousel`. While `is_internal_deal=false` is correctly filtered, the **column selection** exposes admin data to any buyer in DevTools.

**Fix:** Replace the select with `BUYER_VISIBLE_COLUMNS` (matching `use-simple-listings.ts`).

### Phase 68: Unpublish Doesn't Set status='inactive'
**Severity: Medium — Consistency Gap**

The `publish-listing` edge function's unpublish action (line 247-254) sets `is_internal_deal: true` but does NOT change `status` from `'active'`. This means an unpublished listing is `is_internal_deal=true, status='active'` — it won't appear on the marketplace (correct), but it's confusing for admins and the "Published" tab filter (`is_internal_deal=false`) won't show it while the "Internal/Drafts" tab will show it as "active". Consider setting `status: 'inactive'` on unpublish for clarity.

### Phase 69: Marketplace Tab Count Mismatch After Unpublish
**Severity: Medium — Admin UX**

`useListingTypeCounts` counts marketplace as `is_internal_deal=false AND image_url IS NOT NULL`. But a listing that was published, then unpublished, becomes `is_internal_deal=true` — it moves to the Research count. If the admin wants to re-publish, they must find it in Internal/Drafts. The tab badge counts don't reflect "previously published" state.

**Fix:** Show `published_at IS NOT NULL` listings in a distinct state (e.g., "Unpublished" badge in Internal tab), so admins can find them.

### Phase 70: MARKETPLACE_SAFE_COLUMNS Duplicated in 3 Files
**Severity: Low — Maintainability**

The buyer-safe column list is defined independently in:
1. `use-listings.ts` (~50 columns)
2. `use-simple-listings.ts` (~30 columns)
3. `use-saved-listings-query.ts` (~30 columns)

These lists are slightly different (e.g., `use-listings.ts` includes `published_at`, `is_internal_deal`, `custom_sections`, `presented_by_admin_id` that the others don't). Should be a single shared constant.

### Phase 71: Listing Created from Queue Stays "Internal" Until Manual Publish
**Severity: Low — UX Clarity**

After `CreateListingFromDeal` creates a listing (`is_internal_deal=true`), the admin is redirected to the queue page. The queue shows a "Listing Created" badge, but the admin must then navigate to Manage Listings → Internal/Drafts → find the listing → click Publish. The post-creation flow should offer a direct "Review & Publish" action.

### Phase 72: `useListingsByType('marketplace')` Requires image_url
**Severity: Low — Edge Case**

The marketplace tab filter (line 50-55 of `use-listings-by-type.ts`) requires `not('image_url', 'is', null)`. A published listing that somehow has its image deleted would vanish from the admin's Published tab but remain visible to buyers (since `use-simple-listings.ts` doesn't filter by image). Unlikely but creates a blind spot.

---

## Implementation Plan

### Phase 67 — Fix useSimilarListings data exposure (HIGH)
- Replace the 30+ column select in `use-similar-listings.ts` with a buyer-safe subset: `id, title, category, categories, location, revenue, ebitda, description, hero_description, tags, image_url, status, status_tag, acquisition_type, visible_to_buyer_types, created_at, updated_at, full_time_employees`
- Remove all `internal_*` fields from the formatted listing output
- 1 file changed

### Phase 68 — Set status='inactive' on unpublish (MEDIUM)
- In `supabase/functions/publish-listing/index.ts` unpublish block, add `status: 'inactive'` to the update
- 1 file changed + redeploy

### Phase 69 — "Previously Published" indicator for unpublished listings (MEDIUM)
- In `AdminListingCard.tsx` or `ListingsTabContent`, show a "Previously Published" badge when `is_internal_deal=true AND published_at IS NOT NULL`
- Helps admins find unpublished listings for re-publishing
- 1 file changed

### Phase 70 — Extract shared MARKETPLACE_SAFE_COLUMNS constant (LOW)
- Create `src/lib/marketplace-columns.ts` with the canonical buyer-safe column list
- Import in `use-listings.ts`, `use-simple-listings.ts`, `use-saved-listings-query.ts`
- 4 files changed

### Phase 71 — Post-creation "Review & Publish" redirect (LOW)
- After successful listing creation in `CreateListingFromDeal`, navigate to the editor with the new listing pre-loaded (or show a publish prompt inline)
- 1 file changed

### Phase 72 — Remove image_url filter from admin marketplace tab (LOW)
- In `use-listings-by-type.ts`, remove `.not('image_url', 'is', null).neq('image_url', '')` from marketplace filter — `is_internal_deal=false` is sufficient
- Same for `useListingTypeCounts`
- 1 file changed

## Estimated Effort

6 phases, all focused. Can be completed in **2 responses** — Phases 67-69 (high/medium priority) in response 1, Phases 70-72 (low priority) in response 2.

