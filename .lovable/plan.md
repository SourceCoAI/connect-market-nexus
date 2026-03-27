

# Listing Lifecycle Deep Dive: Audit & Optimization Roadmap

## Current Architecture Overview

```text
LISTING CREATION PATHS (3 entry points):
                                                         
  1. Remarketing Deals ──push_to_marketplace──▶ Marketplace Queue ──create──▶ CreateListingFromDeal
     (SourceCo, GP Partner,                       (MarketplaceQueue.tsx)        (AI content gen +
      CapTarget, Valuation Leads)                                               anonymization)
                                                                                     │
  2. Admin "Manage Listings" ──────────────────────────────────────────────▶ ImprovedListingEditor
     (ListingsManagementTabs.tsx)                                                     │
                                                                                     ▼
  3. AddDealToUniverseDialog ──direct insert──▶ listings table              listings table INSERT
     (inline "New Deal" form)                   (is_internal_deal=true)      (is_internal_deal=true)

PUBLISHING PATH:
  AdminListingCard ──▶ usePublishListing ──▶ publish-listing edge function
                                              │  Validates: title≥5, desc≥50, category, location,
                                              │  revenue>0, EBITDA, image, Lead Memo PDF, Teaser PDF
                                              ▼
                                         UPDATE is_internal_deal=false, published_at, published_by

BYPASS (BUG):
  DealMarketplacePanel ──direct UPDATE──▶ is_internal_deal=false (NO validation, NO published_at)
```

## Critical Findings

### 1. SECURITY: DealMarketplacePanel Bypasses All Publishing Gates
**Severity: Critical**

`DealMarketplacePanel.tsx` line 54-57 directly sets `is_internal_deal: false` via a raw UPDATE — completely bypassing the `publish-listing` edge function's quality validation (title, description, image, memo PDFs, etc.) and audit trail (`published_at`, `published_by_admin_id`).

A deal with no image, no description, no memos can be published to the marketplace with one click from the deal detail page.

**Fix:** Replace direct UPDATE with `supabase.functions.invoke('publish-listing')`.

### 2. NO SINGLE SOURCE OF TRUTH for "All Listings"
**Severity: High — Admin UX**

Admins currently see listings fragmented across:
- **Manage Listings** (`/admin/marketplace/listings`) — only `is_internal_deal=false` with images
- **Marketplace Queue** (`/admin/marketplace/queue`) — only `pushed_to_marketplace=true` AND `is_internal_deal=true`
- **Remarketing Deals** (`/admin/deals`) — all deals in listings table, filtered by deal_source/tabs
- **AddDealToUniverseDialog** — fetches its own separate listing list

There is no single page where an admin can see ALL listings (internal + marketplace + queue) with their full status. The "Manage Listings" page misleadingly only shows published marketplace listings.

**Fix:** Add a unified "All Listings" view or add tabs to Manage Listings showing all states.

### 3. Marketplace Queue → Listing Gap: Deals Stay in Queue Forever
**Severity: Medium**

When a listing is created from a queue deal (via `source_deal_id`), the deal is NOT removed from the queue. It shows a "Listing Created" badge but stays in the queue indefinitely. There's no auto-cleanup or archival.

### 4. `useListingsByType('marketplace')` Excludes Unpublished Drafts
**Severity: Medium — Admin UX**

`use-listings-by-type.ts` line 50-55: marketplace filter requires `is_internal_deal=false` AND image. This means:
- A listing created from queue (draft, `is_internal_deal=true`) is invisible in Manage Listings
- Admins must go to the deal detail to find it
- Once published and then unpublished, it disappears from Manage Listings entirely

### 5. Duplicate Listing Creation Not Fully Prevented
**Severity: Medium**

`CreateListingFromDeal.tsx` checks for existing listings with matching `source_deal_id`, but only shows a warning — the "Create Listing" button in the queue (line 384-404) doesn't pass `disabled` when a listing already exists (it's handled by `hasExistingListing` which shows a different button). However, nothing prevents navigating directly to `/admin/marketplace/create-listing?fromDeal=X` to create a duplicate.

### 6. Editor Doesn't Show Publishing Status or Publish Action
**Severity: Medium — UX**

`ImprovedListingEditor.tsx` has no indication of whether a listing is published, draft, or internal. There's no way to publish from the editor — you must go back to the card view. The editor also doesn't show the pipeline check results.

### 7. Multiple Listing Update Hooks (Fragmented)
**Severity: Low — Maintainability**

Two different update hooks exist:
- `src/hooks/admin/listings/use-update-listing.ts` — full validation, image upload, published-state protection
- `src/hooks/admin/use-update-listing.ts` — bare `supabase.update()` with no validation

Both are used in different parts of the app. The bare version could update a published listing into an invalid state.

### 8. Analytics Fragmentation
**Severity: Low**

Listing analytics are scattered:
- `listing_analytics` table — views, saves, time_spent
- `page_views` table — landing page views by path
- `connection_requests` — by listing_id + source
- `DealMarketplacePanel` queries `listing_analytics` with `as never` cast (line 38)
- `LandingPageAnalytics` component queries different tables
- No unified analytics view per listing

### 9. `use-listings-query.ts` vs `use-listings-by-type.ts` Redundancy
**Severity: Low**

Two separate query hooks for admin listings:
- `use-listings-query.ts` — used by `useAdminListings()`, selects 16 columns, filters by status only
- `use-listings-by-type.ts` — used by `ListingsTabContent`, selects 13 columns, filters by type+status

Both do basically the same thing with slightly different column sets and filters.

### 10. Listing Editor Form Drops Enrichment Fields
**Severity: Low — Data Loss Risk**

`CreateListingFromDeal.tsx` lines 295-311 manually re-merges enrichment fields (`customer_geography`, `investment_thesis`, etc.) because the Zod schema doesn't include them. If admin edits and saves an existing listing through the editor, these fields would be overwritten/lost since `handleFormSubmit` only passes form values.

---

## Proposed Phases

| Phase | Area | Priority | Impact |
|-------|------|----------|--------|
| **58** | Fix DealMarketplacePanel publish bypass | **Critical** | Security |
| **59** | Unified "All Listings" admin view | **High** | Admin UX |
| **60** | Show publish status + actions in editor | **Medium** | Admin UX |
| **61** | Prevent duplicate listing creation via URL | **Medium** | Data integrity |
| **62** | Consolidate update hooks (remove bare version) | **Medium** | Maintainability |
| **63** | Protect enrichment fields during editor saves | **Medium** | Data preservation |
| **64** | Queue auto-cleanup after publish | **Low** | UX polish |
| **65** | Consolidate listing query hooks | **Low** | Code quality |
| **66** | Unified per-listing analytics dashboard | **Low** | Admin insight |

## Implementation Details

**Phase 58** — Replace `DealMarketplacePanel`'s direct `supabase.update({ is_internal_deal })` with `supabase.functions.invoke('publish-listing', { body: { listingId, action } })`. Use `usePublishListing` hook. Remove the raw toggle mutation.

**Phase 59** — Add "All", "Published", "Drafts", "Queue" tabs to `ListingsManagementTabs`. Modify `useListingsByType` to accept an `'all'` type that returns everything. Show `is_internal_deal` and `published_at` status badges.

**Phase 60** — Add publish status banner + publish/unpublish button to `ImprovedListingEditor`. Show pipeline check summary.

**Phase 61** — In `CreateListingFromDeal`, if `existingListing` exists, redirect to edit instead of allowing duplicate creation.

**Phase 62** — Remove `src/hooks/admin/use-update-listing.ts` and migrate all consumers to the validated version in `listings/use-update-listing.ts`.

**Phase 63** — Preserve enrichment fields during editor updates by reading current DB values for non-form fields before saving.

**Phase 64** — Auto-remove deal from queue when listing is published (not just created).

**Phase 65** — Merge `use-listings-query.ts` into `use-listings-by-type.ts` with configurable column set.

**Phase 66** — Create `ListingAnalyticsSummary` component aggregating views, saves, connections, landing page stats.

