

# Marketplace Queue End-to-End Audit: Deep Dive Findings

## Methodology

Cross-referenced: MarketplaceQueue.tsx, publish-listing edge function, ListingsManagementTabs, use-listings-by-type, DealMarketplacePanel, buyer-facing hooks (use-listings.ts), ConnectionButton, enhanced_merge_or_create_connection_request RPC, connection_requests data, data_room_documents, and live database state.

## Architecture Summary

```text
Remarketing Deal ──Push──▸ Queue ──Create Listing──▸ Draft ──Publish──▸ Marketplace
(is_internal=true)      (pushed_to_marketplace=true)    (is_internal=true)   (is_internal=false)
                                                         source_deal_id set    published_at set
```

## What's Working Correctly

| Area | Status | Detail |
|------|--------|--------|
| Queue query | Pass | Filters `pushed_to_marketplace=true AND is_internal_deal=true` |
| Stale flag cleanup | Pass | Previous migration fixed it — 0 published listings with `pushed_to_marketplace=true` |
| Publish validation | Pass | Edge function gates on title, description, category, location, revenue, image, both memo PDFs |
| Auto-cleanup on publish | Pass | `publish-listing` clears `pushed_to_marketplace` on source deal |
| Buyer-facing isolation | Pass | `use-listings.ts` enforces `.eq('is_internal_deal', false)` with `MARKETPLACE_SAFE_COLUMNS` |
| Profile completeness gate | Pass | ConnectionButton blocks at 90% threshold |
| Fee Agreement gate (client) | Pass | ConnectionButton checks `coverage.fee_covered` |
| Fee Agreement gate (server) | Pass | `enhanced_merge_or_create_connection_request` RPC checks `check_agreement_coverage` |
| Business owner block (client+server) | Pass | Both ConnectionButton and RPC block `businessOwner` type |
| Duplicate request prevention | Pass | RPC merges instead of creating duplicates |
| Memo PDF prerequisite in queue | Pass | "Create Listing" disables when teaser/memo missing |
| DealMarketplacePanel | Pass | Shows publish/unpublish with analytics (views + connection requests) |
| Listing status tags | Pass | Published (green), Draft, Unpublished (orange) in admin view |

## Single Source of Truth: Where You Manage All Listings

**`/admin/marketplace/listings`** (Listings Management page) is the single source of truth with three tabs:
- **All Listings**: 65 marketplace + 7,661 research = everything
- **Published** (Marketplace tab): 65 listings where `is_internal_deal=false` (61 active, 4 inactive)
- **Internal / Drafts** (Research tab): 7,661 remarketing deals where `is_internal_deal=true`

This is accessible from sidebar under **Marketplace > Manage Listings**.

## Issues Found

### Issue 1: Server-Side RPC Does NOT Gate Against Internal Deals (Medium Risk)
The `enhanced_merge_or_create_connection_request` RPC does **not** check `is_internal_deal` on the listing. A technically savvy user could craft a direct RPC call with an internal deal's ID and create a connection request against it. Currently, 107 connection requests exist against internal deals (across 12 deals) — these are legacy records from before proper isolation was added, but the gap remains open.

**Recommended fix**: Add a check in the RPC:
```sql
SELECT is_internal_deal INTO v_is_internal FROM public.listings WHERE id = p_listing_id;
IF v_is_internal IS TRUE THEN
  RAISE EXCEPTION 'Cannot request connection to an internal deal';
END IF;
```

### Issue 2: No `source_deal_id` on Any Published Listing (Known, Low Risk)
All 65 published listings have `source_deal_id = null` — they were all created directly, not through the queue flow. The queue's duplicate-prevention badge system (`existingListingsMap`) has never been exercised in production. **Architecturally sound but untested with real data.**

### Issue 3: Queue Deals Missing Teaser PDFs (Working as Designed)
4 queued deals lack anonymous teasers: JumpstartMD, National Tab Intelligence, Saks Metering, Sharp Interiors. 2 deals lack both memo and teaser: Classic Restoration, Clear Choice Windows. The "Create Listing" button correctly disables for these. **No fix needed.**

### Issue 4: 107 Legacy Connection Requests Against Internal Deals (Data)
These include deals like "National Painting" (29 requests), "Regional Fire Protection" (18 requests). All of these internal deals have `published_at = null` and statuses of `inactive` or `archived`, confirming they were never properly published. These are legacy records that don't affect buyers (marketplace only shows `is_internal_deal=false`), but they clutter admin views.

**Optional cleanup**: These could be archived or annotated, but they don't cause functional issues.

### Issue 5: `get_user_firm_agreement_status` RPC (Fixed)
Previously returning errors due to missing `nda_pandadoc_signed_url` column — **already fixed** in our last migration with `NULL::text` fallbacks.

## Recommended Fix

Only one fix is recommended — it's a security hardening for the server-side RPC:

**Add `is_internal_deal` check to `enhanced_merge_or_create_connection_request`** to prevent crafted requests against internal deals. This is the only gap where a determined user could bypass client-side gating.

### Files changed
- One SQL migration: Add `is_internal_deal` check to the `enhanced_merge_or_create_connection_request` RPC

No frontend code changes needed. The queue flow, gating, listing management, and buyer isolation are all working correctly.

