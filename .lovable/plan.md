

## Root Cause

The route `/admin/marketplace/users` renders `MarketplaceUsersPage` -- a **buyers-only** page that has no awareness of the `?view=owners` query parameter. When the sidebar link "Owner/Seller Leads" navigates to `/admin/marketplace/users?view=owners`, the page still renders the Marketplace Users view because `MarketplaceUsersPage` simply ignores the query param.

Meanwhile, `AdminUsers.tsx` -- the component that actually contains the Buyers/Owners tab switcher, owner leads table, stats, filters, and bulk actions -- is **not mounted on this route at all**. It appears to be an orphaned component.

## Fix: Replace MarketplaceUsersPage with AdminUsers

The cleanest fix is to swap the route to use `AdminUsers` instead of `MarketplaceUsersPage`. `AdminUsers` already has:
- URL-synced `?view=owners` / `?view=buyers` switching
- Owner leads stats, filters, bulk actions
- Marketplace/Non-marketplace secondary tabs for buyers
- All the same buyer management features as `MarketplaceUsersPage`

### Changes

**1. Update route definition** (`src/routes/admin-routes.tsx` and `src/App.tsx`)

Replace the lazy import of `MarketplaceUsersPage` with `AdminUsers`:

```ts
// Before
const MarketplaceUsersPage = lazyWithRetry(() => import('@/pages/admin/MarketplaceUsersPage'));

// After
const MarketplaceUsersPage = lazyWithRetry(() => import('@/pages/admin/AdminUsers'));
```

This single change in both files makes the route render `AdminUsers` (which reads `?view=owners` from the URL) instead of the buyers-only `MarketplaceUsersPage`.

**2. Make AdminUsers the default export** (`src/pages/admin/AdminUsers.tsx`)

Currently `AdminUsers` uses a named export (`const AdminUsers = ...`). Add a `default` export at the bottom so the lazy import works:

```ts
export default AdminUsers;
```

**3. Port the error boundary and remarketing banner** from `MarketplaceUsersPage` into `AdminUsers`

- Copy the `TableErrorBoundary` class component (wraps the users table to catch render crashes)
- Copy the remarketing linked-buyer count banner (blue info bar at top)

Both are small additions that ensure feature parity.

### Files to Change

| File | Change |
|------|--------|
| `src/routes/admin-routes.tsx` | Point lazy import to `AdminUsers` |
| `src/App.tsx` | Same lazy import change |
| `src/pages/admin/AdminUsers.tsx` | Add `export default`, add `TableErrorBoundary`, add remarketing banner |

### What This Fixes

- Clicking "Owner/Seller Leads" in the sidebar will show the owners view with stats, filters, and leads table
- Clicking "Marketplace Users" will show the buyers view (same as before)
- URL `?view=owners` is properly read and applied
- No orphaned components or duplicate pages

