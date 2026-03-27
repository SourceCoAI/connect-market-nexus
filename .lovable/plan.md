

# Phase 4: Connection Request System — Audit & Remaining Fixes

## Verification: All Previous Phases Confirmed

| Phase | Fix | Status |
|-------|-----|--------|
| 1 | Profile/fee/buyer gates on ListingCardActions | Done |
| 1 | ListingCard passes gating props | Done |
| 1 | isAdmin={isAdmin} in ListingDetail | Done |
| 1 | "Request Again" text for rejected | Done |
| 1 | ArchivedDeals/ValuationLeads build fixes | Done |
| 2 | Fee gate fallback for missing firmId | Done |
| 2 | Dead ndaGateDismissed removed | Done |
| 2 | View Deal Details navigates | Done |
| 2 | listingId passed to dialog | Done |
| 3 | Dialog in rejected block | Done |
| 3 | Success toast mentions My Deals | Done |
| 3 | onFeeGateOpen wired in ListingCard | Done |
| 3 | Details button wrapped in Link | Done |
| 3 | Browse Marketplace button in empty state | Done |

## Remaining Issues Found

### Issue 1: Card click propagation conflict with inner Links

`ListingCard.tsx` line 104 wraps the entire card in `<div onClick={handleCardClick}>`. The `handleCardClick` checks for `button` elements but **not** `a` or `Link` elements. When a user clicks the "Details" Link or "View Deal Details" Link inside `ListingCardActions`, the click bubbles up and `handleCardClick` also fires, causing a double navigation — once from the Link, once from `navigate(/listing/${listing.id})`.

**Fix**: Update `handleCardClick` to also skip when `(e.target as HTMLElement).closest('a')` is truthy.

### Issue 2: `handleCardClick` skips buttons but dialog still opens on card click

When a user clicks the card body (not a button), `handleCardClick` navigates to `/listing/${listing.id}`. But the `ConnectionRequestDialog` uses a Radix Dialog which renders a portal overlay. If a user has the dialog open and clicks outside it, the card's `onClick` could interfere. This is minor since the dialog backdrop handles its own close, but worth noting — no fix needed.

### Issue 3: Fee agreement gate on ListingCardActions — no signing flow

The `onFeeGateOpen` callback in `ListingCard` shows a toast with a link to `/profile?tab=documents`. This is functional but suboptimal — the user leaves the marketplace, signs, then has to navigate back. The `ConnectionButton` on the listing detail page offers an inline `FeeAgreementGate` (PandaDoc embed). The marketplace card can't do this without the firmId.

This is acceptable for now. No change needed — the listing detail page provides the superior signing experience.

### Issue 4: No "on_hold" status handling in buyer-facing UI

The `ConnectionButton` and `ListingCardActions` handle `pending`, `approved`, and `rejected` statuses. But the admin can set status to `on_hold`. When `on_hold`, the buyer sees the default "Request connection" button (not disabled), which would create a duplicate request. The RPC handles this (merges), but the UX is confusing.

**Fix**: Add `on_hold` case to both `ConnectionButton.getButtonContent()` and `ListingCardActions.getConnectionButtonContent()` — show same UI as `pending` ("Request Under Review").

### Issue 5: Profile completeness link in ConnectionRequestDialog goes to `/welcome`

In `ConnectionRequestDialog.tsx` line 180, the low-profile warning links to `/welcome`. This is the onboarding wizard. Users who have already completed onboarding should go to `/profile` instead.

**Fix**: Change the link from `/welcome` to `/profile`.

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/ListingCard.tsx` | Add `closest('a')` check to `handleCardClick` to prevent double navigation |
| `src/components/listing-detail/ConnectionButton.tsx` | Add `on_hold` case showing "Request Under Review" (same as pending) |
| `src/components/listing/ListingCardActions.tsx` | Add `on_hold` case showing "Under Review" (same as pending) |
| `src/components/connection/ConnectionRequestDialog.tsx` | Change profile link from `/welcome` to `/profile` |

