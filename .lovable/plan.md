

# Marketplace Queue End-to-End Audit: Findings

## Methodology
Cross-referenced: MarketplaceQueue.tsx, publish-listing edge function, ListingsManagementTabs, use-listings-by-type, DealMarketplacePanel, buyer-facing hooks (use-listings.ts), connection_requests data, data_room_documents, and live database state.

## Architecture Summary (Working Correctly)

The flow is: **Remarketing Deal → Push to Queue → Create Listing → Publish to Marketplace**

1. **Push to Queue**: Sets `pushed_to_marketplace=true` on the deal (listings table, `is_internal_deal=true`)
2. **Queue Page** (`/admin/marketplace/queue`): Queries `pushed_to_marketplace=true AND is_internal_deal=true` — correct
3. **Create Listing**: Creates a new `listings` row with `source_deal_id` linking back, `is_internal_deal=true` (draft)
4. **Publish**: `publish-listing` edge function validates quality + memo PDFs, sets `is_internal_deal=false`, clears source deal's `pushed_to_marketplace` flag
5. **Buyer-facing**: `use-listings.ts` filters `.eq('is_internal_deal', false)` with safe columns — correct
6. **Gating**: ConnectionButton enforces auth → email verified → approved → buyer type → 90% profile → Fee Agreement → active listing

## Issues Found

### Issue 1: HVAC Listing — Stale `pushed_to_marketplace` Flag (Data)
**Listing `b28846a6`** ("Multi-Location HVACR Platform") is `is_internal_deal=false` (published) but still has `pushed_to_marketplace=true`. This means it shows up in the Marketplace Queue even though it's already live. This happened because it was published *before* the auto-cleanup logic was added to `publish-listing`. **Fix**: One-time data cleanup migration to set `pushed_to_marketplace=false` for all listings where `is_internal_deal=false`.

### Issue 2: No `source_deal_id` on Any Published Listing (Architecture Gap)
All 20+ published listings have `source_deal_id = null`. This means none were created through the queue → create listing flow. They were all created directly. The `existingListingsMap` query in MarketplaceQueue checks `source_deal_id` to show the "Listing Created" badge, but since the current flow creates listings as *new rows* with `source_deal_id` pointing back, **the badge/duplicate-prevention system has never been used in production**. This works correctly in theory but is untested with real data.

### Issue 3: Connection Requests on Internal Deals (Orphaned Data)
5 connection requests exist against `is_internal_deal=true` listings (including a "General Inquiry" phantom listing `00000000-...`). These are likely legacy/test records. They don't affect buyers since the marketplace only shows `is_internal_deal=false` listings. **Low priority** — no action needed unless you want cleanup.

### Issue 4: Missing Teaser PDFs in Queue (Gating Works Correctly)
Several queued deals are missing anonymous teaser PDFs (e.g., JumpstartMD, National Tab Intelligence, Sharp Interiors, Saks Metering). The "Create Listing" button correctly disables for these, and `publish-listing` would reject them. **Working as designed.**

### Issue 5: `nda_pandadoc_signed_url` Column Missing (Unrelated but Active Error)
The `get_user_firm_agreement_status` RPC references `fa.nda_pandadoc_signed_url` which doesn't exist in the `firm_agreements` table. This fires on every page load for every admin user, generating dozens of console warnings. **Should be fixed** — the RPC needs updating to remove this column reference.

### Issue 6: Published Listings Not Visible in "All" View with Source Linking
The Listings Management page (`/admin/marketplace`) has "All", "Marketplace", and "Research" tabs. Published listings (`is_internal_deal=false`) appear under "Marketplace" tab. Queue deals (`is_internal_deal=true`) appear under "Research". **This is the single source of truth** for seeing all listings, but there's no way to trace a marketplace listing back to its source deal from this view (no `source_deal_id` column displayed).

## Recommended Fixes

### Fix 1: Data cleanup migration
```sql
UPDATE listings 
SET pushed_to_marketplace = false 
WHERE is_internal_deal = false 
  AND pushed_to_marketplace = true;
```

### Fix 2: Fix `get_user_firm_agreement_status` RPC
Remove the `nda_pandadoc_signed_url` column reference that's causing the repeated console errors.

### Fix 3: No code changes needed for queue flow
The queue → create listing → publish flow is architecturally sound. Gating (quality validation, memo PDFs, admin auth) all work correctly. Buyer-facing isolation (`is_internal_deal` filter, safe columns) is properly enforced.

## What's Working Well
- Quality validation gate in `publish-listing` (title, description, category, location, revenue, image, memos)
- Memo PDF prerequisite checking in queue UI
- Auto-cleanup of `pushed_to_marketplace` flag on publish
- Duplicate listing prevention via `source_deal_id` check
- Buyer data isolation via `MARKETPLACE_SAFE_COLUMNS`
- Connection request gating (auth, profile, agreements)
- DealMarketplacePanel shows correct publish/unpublish state with analytics

