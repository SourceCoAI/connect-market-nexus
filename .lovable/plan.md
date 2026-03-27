

# Fix: Add "Score All Unscored" Button to the Correct File

## Root Cause

The "Score All Unscored" button was added to `src/pages/admin/MarketplaceUsersPage.tsx`, which is **dead code**. In `App.tsx` line 109, the route alias `MarketplaceUsersPage` actually imports `AdminUsers.tsx`:

```
const MarketplaceUsersPage = lazyWithRetry(() => import('@/pages/admin/AdminUsers'));
```

So the user's `/admin/marketplace/users` page renders `AdminUsers.tsx`, not `MarketplaceUsersPage.tsx`.

## Fix

### File: `src/pages/admin/AdminUsers.tsx`

1. Add `Zap` to the lucide imports
2. Add `isBulkScoring` state and `handleBulkScoreUnscored` handler (same logic from MarketplaceUsersPage)
3. Add the "Score All Unscored" button in the header next to the title (lines 298-307)
4. Import `toast` from sonner and `queueBuyerQualityScoring` dynamically

The button filters `usersData` for users with `buyer_type` set but `buyer_quality_score == null`, then calls the scoring queue.

| File | Change |
|------|--------|
| `src/pages/admin/AdminUsers.tsx` | Add "Score All Unscored" button to header |

