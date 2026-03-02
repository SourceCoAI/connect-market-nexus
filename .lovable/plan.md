

## Show Owner Sign-ups in the Users Dashboard

### Problem
Owner/Seller leads exist in the database (7 leads) and the Users page (`/admin/marketplace/users`) already has a Buyers/Owners tab switcher. However:

1. The sidebar "Owner/Seller Leads" link is buried under **Remarketing**, pointing to a standalone page (`/admin/settings/owner-leads`) -- not the Users tab
2. The Owners tab in the Users page is missing bulk actions (no checkboxes, no "Push to Dialer", no "Not a Fit" filtering) that the standalone page has
3. There's no sidebar indication that Owners live inside the Users section

### Solution

**1. Move "Owner/Seller Leads" sidebar link into the Marketplace section (next to Marketplace Users)**

In `UnifiedAdminSidebar.tsx`:
- Remove "Owner/Seller Leads" from the Remarketing section
- Add it to the Marketplace section as a new item pointing to `/admin/marketplace/users?view=owners` (or keep the standalone page route)
- Keep its unviewed badge count

**2. Upgrade the Owners tab in AdminUsers to match the standalone page's features**

In `AdminUsers.tsx`, bring over the missing features from `OwnerLeadsPage`:
- Add `selectedIds` state and pass it to `OwnerLeadsTableContent` (enables checkboxes)
- Add the "Hide Not a Fit" toggle button
- Add the bulk action bar (Push to Dialer, Push to Smartlead, Mark Not a Fit)
- Add the "Not a Fit" confirmation dialog
- Import `PushToDialerModal` and `PushToSmartleadModal`

**3. Auto-select Owners tab from sidebar link**

- Update the sidebar link to `/admin/marketplace/users?view=owners`
- In `AdminUsers.tsx`, read the `view` query param on mount to set `primaryView` to `'owners'` when `?view=owners` is present
- This way, clicking "Owner/Seller Leads" in the sidebar takes admins directly to the Owners tab within Users

**4. Keep the standalone OwnerLeadsPage as-is** (no breaking changes to existing bookmarks/routes)

### Files to Change

| File | Change |
|------|--------|
| `src/components/admin/UnifiedAdminSidebar.tsx` | Move Owner/Seller Leads from Remarketing to Marketplace section, update href to `/admin/marketplace/users?view=owners` |
| `src/pages/admin/AdminUsers.tsx` | (1) Read `?view=owners` query param to auto-select Owners tab. (2) Add selectedIds state, bulk action bar, "Hide Not a Fit" toggle, PushToDialer/Smartlead modals, and Not a Fit confirmation dialog -- mirroring `OwnerLeadsPage` functionality |

### What stays the same
- All data queries (useOwnerLeads, useUpdateOwnerLeadStatus, etc.) remain unchanged
- The standalone `/admin/settings/owner-leads` page continues to work
- Buyers tab is unaffected
- All badge counts stay wired up

