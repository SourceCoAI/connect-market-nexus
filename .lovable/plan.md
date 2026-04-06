

# Phase 5: My Deals Deep Dive — Mobile Optimization

## Audit Summary

Phase 4 applied broad responsive fixes (padding, stacking). This deep dive catches remaining issues across My Deals, Messages, Saved Listings, and Profile at 375px.

## Issues Found

### Issue 1: DealDetailHeader — `px-6` Not Responsive
**File:** `src/components/deals/DealDetailHeader.tsx` line 56
The header container uses `px-6` (24px). All sibling sections (tabs, tab content) were updated to `px-4 sm:px-6` in Phase 4, but the header was missed.

**Fix:** Change `px-6` to `px-4 sm:px-6`.

### Issue 2: DealDocumentsCard Locked-State Text Too Wide on Mobile
**File:** `src/components/deals/DealDocumentsCard.tsx` lines 330-345
The locked placeholder rows use `pl-[30px]` left indent. On 375px, long labels like "Confidential Company Profile" and "Detailed Financial Statements" overflow or wrap awkwardly.

**Fix:** Change `pl-[30px]` to `pl-4 sm:pl-[30px]` on the locked content wrapper (lines 330, 355, 361).

### Issue 3: Messages Page — No Mobile Back Navigation When Thread Selected
**File:** `src/pages/BuyerMessages/index.tsx` line 108
The two-column layout shows both ConversationList and ThreadView side-by-side. `ConversationList` hides itself on mobile when a thread/general is selected (line 44-45 of ConversationList). The ThreadView has a back button (`md:hidden`). This works correctly. No fix needed.

### Issue 4: SavedListings — Title `text-3xl` + Pagination "Previous"/"Next" Text
**File:** `src/pages/SavedListings.tsx` line 259, 389-391, 410-417
Title is `text-3xl` — should be `text-2xl sm:text-3xl`. Pagination buttons show full "Previous"/"Next" text which overflows on 375px with page numbers.

**Fix:** 
- Line 259: Change `text-3xl` to `text-2xl sm:text-3xl`
- Lines 389, 416: Hide "Previous"/"Next" text on mobile, keep chevron icons

### Issue 5: SavedListings — "Results per page:" Label Wastes Space on Mobile
**File:** `src/pages/SavedListings.tsx` line 273
The label "Results per page:" takes ~120px on mobile, cramping the toolbar.

**Fix:** Hide the label on mobile: `<span className="text-sm hidden sm:inline">Results per page:</span>`

### Issue 6: SavedListings — Skeleton Card `p-6` Padding Excessive
**File:** `src/pages/SavedListings.tsx` line 233
Skeleton cards use `p-6` which matches the grid card fix from Phase 2 where we used `p-4 sm:p-6`.

**Fix:** Change to `p-4 sm:p-6`.

### Issue 7: DealMessagesTab Compose Bar Padding Not Responsive
**File:** `src/components/deals/DealMessagesTab.tsx` — the compose area uses `px-5`. On mobile within the My Deals detail panel, this is fine at 375px since it's inset in the tab content. No change needed.

### Issue 8: BuyerMessages Loading Skeleton Height Too Tall on Mobile
**File:** `src/pages/BuyerMessages/MessageThread.tsx` line 252
`min-h-[500px]` fills the entire mobile viewport during loading.

**Fix:** Change to `min-h-[300px] sm:min-h-[500px]`.

### Issue 9: Profile Container Padding
**File:** `src/pages/Profile/index.tsx` line 49
Uses `container max-w-4xl py-8` — the `container` class includes responsive padding by default. This is fine. No change needed.

## Files Changed

| File | Change |
|------|--------|
| `src/components/deals/DealDetailHeader.tsx` | Responsive padding `px-4 sm:px-6` |
| `src/components/deals/DealDocumentsCard.tsx` | Reduce locked-state indent on mobile |
| `src/pages/SavedListings.tsx` | Smaller title, hidden pagination text, hidden "Results per page" label, responsive skeleton padding |
| `src/pages/BuyerMessages/MessageThread.tsx` | Responsive skeleton min-height |

## Implementation Order

1. DealDetailHeader responsive padding
2. DealDocumentsCard locked indent
3. SavedListings title + pagination + toolbar + skeleton
4. BuyerMessages skeleton height

