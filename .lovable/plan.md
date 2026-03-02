

## Fix Sidebar Active State and Performance Issues

### Problem 1: Both sidebar items show as active
When viewing the "Owners" tab (`/admin/marketplace/users?view=owners`), both "Marketplace Users" and "Owner/Seller Leads" sidebar items appear active. This happens because the `isItemActive` function matches "Marketplace Users" on any URL starting with `/admin/marketplace/users` -- it has no search parameter qualifier, so it matches even when `?view=owners` is present.

### Problem 2: Page is laggy and slow
All three data sources (marketplace users, non-marketplace users, owner leads) are fetched simultaneously on mount regardless of which tab is active. With 596+ buyers, this causes unnecessary load.

---

### Fix 1: Sidebar active state logic

**File: `src/components/admin/UnifiedAdminSidebar.tsx`**

Update `isItemActive` to handle the case where a sibling item has a search qualifier for the same path. When the current item has NO search qualifier but another sibling at the same path DOES have one and it matches -- the current item should NOT be active.

Simpler approach: Mark "Marketplace Users" with `exact: true` so it only matches `/admin/marketplace/users` without query params. But this won't work since `exact` checks pathname only.

Best approach: Update `isItemActive` so that when an item has no `itemSearch` but the current URL does have a search string, check if any sibling item's search matches -- if so, defer to that sibling. Concretely:

```
if (!itemSearch && location.search) {
  // Check if any sibling nav item targets the same path with a search qualifier that matches
  const allItems = sections.flatMap(s => s.items);
  const siblingMatch = allItems.some(other => {
    if (other === item) return false;
    const [otherPath, otherSearch] = other.href.split('?');
    return otherPath === itemPath && otherSearch && location.search.includes(otherSearch);
  });
  if (siblingMatch) return false;
}
```

This ensures "Marketplace Users" defers to "Owner/Seller Leads" when `?view=owners` is in the URL.

The same fix applies to `getActiveSectionId` which has the same logic pattern.

### Fix 2: Lazy data loading for performance

**File: `src/pages/admin/AdminUsers.tsx`**

Add `enabled` flags to the data hooks so they only fetch when their respective view is active:

- Marketplace users (`useAdmin().users`): Already always loads (needed for count in tab). Keep as-is but ensure the heavy table rendering is deferred.
- Non-marketplace users: Only fetch when `secondaryView === 'non-marketplace'` AND `primaryView === 'buyers'`
- Owner leads: Only fetch when `primaryView === 'owners'`

Since `useNonMarketplaceUsers` and `useOwnerLeads` are custom hooks, add an `enabled` option to each:

**File: `src/hooks/admin/use-non-marketplace-users.ts`** -- Add optional `enabled` parameter
**File: `src/hooks/admin/use-owner-leads.ts`** -- Add optional `enabled` parameter

Then in `AdminUsers.tsx`, pass the enabled flags:
```tsx
const { data: nonMarketplaceUsers = [], isLoading: isLoadingNonMarketplace } = 
  useNonMarketplaceUsers({ enabled: isBuyersView && secondaryView === 'non-marketplace' });
const { data: ownerLeads = [], isLoading: isLoadingOwnerLeads } = 
  useOwnerLeads({ enabled: primaryView === 'owners' });
```

Additionally, switch from `hidden` CSS class (which still renders the DOM) to conditional rendering for inactive views to avoid rendering 596 table rows when they're not visible.

---

### Files to change

| File | Change |
|------|--------|
| `src/components/admin/UnifiedAdminSidebar.tsx` | Fix `isItemActive` and `getActiveSectionId` to handle sibling search-param items |
| `src/hooks/admin/use-owner-leads.ts` | Add optional `enabled` parameter |
| `src/hooks/admin/use-non-marketplace-users.ts` | Add optional `enabled` parameter |
| `src/pages/admin/AdminUsers.tsx` | Pass `enabled` flags; use conditional rendering instead of `hidden` for inactive views |

