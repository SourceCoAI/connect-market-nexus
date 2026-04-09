

# Add Notification Badge for New Match Tool Leads

## Problem
When a new lead comes in via the match tool, there's no notification dot/badge on the sidebar — unlike Marketplace, Deal Sourcing, etc.

## How It Works (Existing Pattern)
1. `admin_view_state` table stores `(admin_id, view_type, last_viewed_at)`
2. A hook queries "count of items created after `last_viewed_at`" + subscribes to realtime INSERTs
3. The count is passed as a `badge` on the sidebar nav item
4. When the admin visits the page, a "mark as viewed" mutation upserts `last_viewed_at = now()`

## Plan

### 1. Create `useUnviewedMatchToolLeads` hook
New file: `src/hooks/admin/use-unviewed-match-tool-leads.ts`

Follows the exact same pattern as `use-unviewed-deal-sourcing.ts`:
- Query `admin_view_state` for `view_type = 'match_tool_leads'`
- Count rows in `match_tool_leads` where `created_at > last_viewed_at`
- Realtime subscription on `match_tool_leads` INSERT events to invalidate the count

### 2. Create `useMarkMatchToolLeadsViewed` hook
New file: `src/hooks/admin/use-mark-match-tool-leads-viewed.ts`

Same pattern as `use-mark-connection-requests-viewed.ts`:
- Calls `markAdminViewAsViewed(user.id, 'match_tool_leads')`
- Invalidates the unviewed count query

### 3. Update ViewType
In `src/lib/data-access/admin.ts`, add `'match_tool_leads'` to the `ViewType` union.

### 4. Wire badge into sidebar
In `UnifiedAdminSidebar.tsx`:
- Import and call `useUnviewedMatchToolLeads`
- Add `badge: unviewedMatchToolLeadsCount` to the "Match Tool Leads" nav item (line ~283)
- Add to the `useMemo` dependency array

### 5. Mark as viewed on page visit
In `src/pages/admin/remarketing/MatchToolLeads/index.tsx`:
- Import `useMarkMatchToolLeadsViewed`
- Call `markAsViewed()` in a `useEffect` on mount

### 6. Export hooks
Add exports to `src/hooks/admin/index.ts`.

## No migration needed
The `view_type` column is plain text with no CHECK constraint — adding a new value is safe.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/admin/use-unviewed-match-tool-leads.ts` | New — count unviewed leads |
| `src/hooks/admin/use-mark-match-tool-leads-viewed.ts` | New — mark as viewed |
| `src/lib/data-access/admin.ts` | Add `'match_tool_leads'` to ViewType |
| `src/components/admin/UnifiedAdminSidebar.tsx` | Wire badge to Match Tool Leads item |
| `src/pages/admin/remarketing/MatchToolLeads/index.tsx` | Mark as viewed on mount |
| `src/hooks/admin/index.ts` | Export new hooks |

