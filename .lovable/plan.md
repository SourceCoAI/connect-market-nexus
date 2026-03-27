

# Audit: Admin Users Page Optimization — Implementation Status & Remaining Issues

## What Was Implemented Correctly

1. **`useBulkUserFirms` hook** — Created and working. Batch-fetches firm_members + firm_agreements in 2 queries instead of 1,842.
2. **Pagination** — `PAGE_SIZE = 50` with prev/next controls in UsersTable.
3. **`firmDataMap` prop threading** — AdminUsers calls `useBulkUserFirms(userIds)` and passes the map to `UsersTable`, which passes it to `UserFirmBadge`, `DualFeeAgreementToggle`, and `DualNDAToggle`.
4. **Conditional skip in toggles** — Both `DualFeeAgreementToggle` and `DualNDAToggle` skip `useUserFirm()` when `firmData` is provided.

## Issues Found

### Issue 1: `useBulkUserFirms` query key is unstable
**Line 27**: `queryKey: ['bulk-user-firms', userIds.length]` — Uses only the *count* of user IDs, not their actual values. If users are filtered/sorted but the count stays the same, stale data is returned. Should use a hash or sorted ID list.

### Issue 2: `useUserFirm` still called unconditionally in `UserFirmBadge`
**Line 15** of `UserFirmBadge.tsx`: `useUserFirm(firmData !== undefined ? null : userId)` — Passing `null` still triggers the hook (React hooks can't be conditional). The hook's `enabled: !!userId` check means it won't *fire* a query for `null`, but it still creates a query observer per row. When `firmData` is `undefined` (e.g., map hasn't loaded yet), all 50 visible rows fire individual queries. **Fix**: pass `undefined` instead of `null` to match the hook's `enabled` check, and ensure `firmDataMap` defaults to an empty Map rather than `undefined` during loading.

### Issue 3: `useUserFirm` from `use-firm-agreement-actions.ts` still called in dialogs
`SimpleFeeAgreementDialog` and `SimpleNDADialog` each call `useUserFirm(userId)` individually. These are only opened one at a time (modal), so this is acceptable — NOT a perf issue.

### Issue 4: `useEnhancedUserExport()` called inside UsersTable with no arguments
Line 70 — This hook runs on every render of the table. If it triggers queries or side effects, it adds unnecessary overhead. Should be verified and potentially moved to the page level or memoized.

### Issue 5: `usePermissions()` called without using return value
Line 71 — Fires a query on every render with no visible consumer. May be setting up a context or side effect, but should be audited.

### Issue 6: `useRoleManagement()` fetches all user roles on every table render
Line 72 — This is a single query (acceptable), but `getUserRole()` does a linear scan (`allUserRoles.find()`) for every row. Should be converted to a Map lookup.

### Issue 7: No `React.memo` on row sub-components
`BuyerTierBadge`, `BuyerScoreBadge`, `UserDataCompleteness`, `DualFeeAgreementToggle`, `DualNDAToggle`, `UserFirmBadge` — none are memoized. When any state changes (e.g., expanding a row, changing page), all 50 visible rows re-render with all their children.

## Plan

### File 1: `src/hooks/admin/use-bulk-user-firms.ts`
- Fix query key to use a stable hash: `queryKey: ['bulk-user-firms', userIds.sort().join(',')]` or use the length + a hash of the first/last IDs.

### File 2: `src/components/admin/UserFirmBadge.tsx`
- Change `useUserFirm(firmData !== undefined ? null : userId)` → `useUserFirm(firmData !== undefined ? undefined : userId)` for consistency with the hook's `enabled` check.

### File 3: `src/components/admin/UsersTable.tsx`
- Convert `getUserRole` to use a `Map` built from `allUserRoles` via `useMemo`
- Remove the bare `usePermissions()` call (line 71) — it's not used
- Wrap row rendering in `React.memo` or extract a `UserTableRow` component with `React.memo`

### File 4: `src/pages/admin/AdminUsers.tsx`
- Ensure `firmDataMap` passes as `firmDataMap ?? new Map()` to avoid the `undefined` case triggering per-row queries

## Expected Additional Impact

| Improvement | Effect |
|-------------|--------|
| Stable query key | Prevents stale cache hits on filter changes |
| `undefined` fix in UserFirmBadge | Prevents 50 individual queries during bulk load |
| Map-based role lookup | O(1) vs O(n) per row |
| Memoized rows | Prevents 50×12 re-renders on page/expand changes |

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/admin/use-bulk-user-firms.ts` | Fix query key stability |
| `src/components/admin/UserFirmBadge.tsx` | Fix null→undefined for hook skip |
| `src/components/admin/UsersTable.tsx` | Memoize row component, Map-based role lookup, remove unused hook |
| `src/pages/admin/AdminUsers.tsx` | Default firmDataMap to empty Map |

