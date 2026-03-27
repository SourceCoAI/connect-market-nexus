

# Phase 3: Connection Request System — Verification & Remaining Gaps

## Verification: What's Implemented and Working

All Phase 1 and Phase 2 fixes are confirmed in the code:

| Fix | Status | Evidence |
|-----|--------|----------|
| Profile completeness gate on ListingCardActions | Done | Lines 19, 37, 100-101, 132-159 |
| Fee agreement gate on ListingCardActions | Done | Lines 22, 40, 104-107 |
| Buyer type block on ListingCardActions | Done | Lines 21, 39, 98, 120-129 |
| listingId prop on ListingCardActions | Done | Lines 17, 36, 169, 243 |
| ListingCard passes all gating props | Done | Lines 49-53, 209-213 |
| isAdmin={isAdmin} in ListingDetail | Done | Line 357 |
| "Request Again" text for rejected | Done | Line 210 |
| Fee gate fallback for missing firmId | Done | Lines 225-231, 269-275 |
| Dead ndaGateDismissed removed | Done | Lines 57-58, no state |
| View Deal Details navigates | Done | Line 169 Link wrapper |

## Remaining Issues Found

### Issue 1: ConnectionRequestDialog missing `listingId` in the rejected state block

In `ConnectionButton.tsx`, the rejected state block (lines 194-234) renders `handleButtonClick` which opens the fee gate or sets `isDialogOpen(true)`. But there is **no `ConnectionRequestDialog` rendered** in that rejected block. The dialog only exists in the default return (line 248). When a rejected user clicks "Request Again", `isDialogOpen` becomes true, but the component returns at line 194 before reaching the dialog at line 248.

**Result**: Rejected users on the listing detail page click "Request Again" and nothing happens — the dialog never opens because the early return prevents it from mounting.

**Fix**: Move the `ConnectionRequestDialog` inside the rejected block (after the fee gate components), or restructure so the dialog is always rendered regardless of which status branch returns.

### Issue 2: No success confirmation linking to My Deals after submission

After a user submits a connection request, the only feedback is a toast notification (use-connections.ts line 171-175): "Request sent. We'll review your request within 1-2 business days." This toast disappears after a few seconds. There is **no persistent UI** directing the user to their My Deals page where they can track the request.

**Fix**: Enhance the success toast to include an action button linking to `/my-deals`, or show a brief confirmation overlay on the listing detail page with a "View in My Deals" link.

### Issue 3: `onFeeGateOpen` prop not wired in ListingCard

`ListingCardActions` accepts an `onFeeGateOpen` callback (line 23) for when fee agreement is missing, but `ListingCard.tsx` never passes this prop (lines 199-214). When a user without fee coverage clicks "Request Access" on a card, `onFeeGateOpen?.()` is called with optional chaining — it silently does nothing. The user sees no feedback.

**Fix**: In `ListingCard.tsx`, add an `onFeeGateOpen` handler that either navigates to `/profile?tab=documents` or shows a toast explaining they need a fee agreement. Since `FeeAgreementGate` requires a firmId (which ListingCard doesn't have), the simplest approach is a toast + navigate to profile documents tab.

### Issue 4: "Details" button in ListingCardActions does nothing

Line 209-216 in `ListingCardActions.tsx` renders a "Details" ghost button that has **no onClick handler and no Link wrapper**. It's a dead button.

**Fix**: Wrap it in a `Link` to `/listing/{listingId}` — same as the card click, but lets users explicitly click "Details" to navigate.

### Issue 5: No empty state CTA in My Deals page

The empty state (MyRequests.tsx lines 199-221) shows "Browse the marketplace and request an introduction" text but has **no button or link** to navigate to the marketplace. The user has to manually navigate.

**Fix**: Add a "Browse Marketplace" button linking to `/marketplace`.

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/listing-detail/ConnectionButton.tsx` | Move `ConnectionRequestDialog` so it renders in all status branches (fix rejected state dialog) |
| `src/hooks/marketplace/use-connections.ts` | Add action button to success toast linking to My Deals |
| `src/components/ListingCard.tsx` | Wire `onFeeGateOpen` callback with toast + navigate to profile documents |
| `src/components/listing/ListingCardActions.tsx` | Wrap "Details" button in Link to listing page |
| `src/pages/MyRequests.tsx` | Add "Browse Marketplace" button to empty state |

