

# Reorganize Listings Management for Clear Publish Workflow

## Current Problem

The tabs are:
- **All Listings (7727)** - everything mixed together
- **Published (65)** - listings live on marketplace (`is_internal_deal = false`)
- **Internal/Drafts (7662)** - all remarketing deals AND unpublished marketplace drafts lumped together

When you create a listing from the marketplace queue, it lands in "Internal/Drafts" buried among 7,662 remarketing deals. There is no way to find it quickly or know it needs publishing. The publish action is hidden inside a dropdown menu (three-dot menu > "Publish to Marketplace").

## How Publishing Works Today

A listing created from the queue has `is_internal_deal = false` but no `published_at`. To publish:
1. Find it in Listings Management
2. Click Edit (or three-dot menu)
3. In the editor, use the `PublishStatusBanner` toggle at the top
4. OR from the card's dropdown menu, click "Publish to Marketplace"

This calls the `publish-listing` edge function which validates quality gates and sets `published_at`.

## New Tab Structure

```text
  Ready to Publish (2)  |  Live on Marketplace (65)  |  All Internal (7662)
```

**Tab 1: Ready to Publish** (default tab)
- Query: `is_internal_deal = false AND published_at IS NULL AND deleted_at IS NULL`
- These are listings created from the queue that need review and publishing
- Each card gets a prominent **"Publish"** button directly on the card (not buried in a dropdown)
- Empty state: "No listings waiting to be published. Push deals from the Marketplace Queue to get started."

**Tab 2: Live on Marketplace**
- Query: `is_internal_deal = false AND published_at IS NOT NULL AND deleted_at IS NULL`
- Currently published and visible to buyers
- Cards show "Unpublish" action prominently

**Tab 3: All Internal**
- Query: `is_internal_deal = true AND deleted_at IS NULL`
- The 7,662 remarketing deals (unchanged from current "Internal/Drafts")

## Files Changed

### File 1: `src/hooks/admin/listings/use-listings-by-type.ts`
- Change `ListingType` from `'marketplace' | 'research' | 'all'` to `'ready_to_publish' | 'live' | 'internal' | 'all'`
- **ready_to_publish** query: `.eq('is_internal_deal', false).is('published_at', null)`
- **live** query: `.eq('is_internal_deal', false).not('published_at', 'is', null)`
- **internal** query: `.eq('is_internal_deal', true)` (same as current 'research')
- Update `useListingTypeCounts` to return counts for all three new types

### File 2: `src/components/admin/ListingsManagementTabs.tsx`
- Replace three tabs with new labels: "Ready to Publish", "Live on Marketplace", "All Internal"
- Default active tab: `'ready_to_publish'` (so you land on what needs action)
- Update subtitle: "Review, publish, and manage marketplace listings"
- Remove em dash from subtitle

### File 3: `src/components/admin/ListingsTabContent.tsx`
- Update empty state messages for each new tab type
- Pass new type values to `useListingsByType`

### File 4: `src/components/admin/AdminListingCard.tsx`
- When `listingType === 'ready_to_publish'`: Add a visible **"Publish to Marketplace"** button directly on the card (not in the dropdown). Use the existing `publishListing` from `usePublishListing` hook.
- When `listingType === 'live'`: Show a visible **"Unpublish"** button
- Keep the dropdown menu actions as they are for additional options

### File 5: `src/hooks/admin/listings/use-listings-query.ts`
- Update the status mapping to work with the new `ListingType` values (this is used by other admin hooks)

## Outcome
- You create a listing from the queue, it appears immediately under "Ready to Publish"
- One click to publish it live
- "Live on Marketplace" shows exactly what buyers see
- Internal deals are separated and clearly labeled
- No more hunting through 7,000+ records to find the listing you just created

