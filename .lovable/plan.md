

# Audit: All 4 Planned Fixes — Verified Implemented

## Confirmed Working

| Fix | Status | Evidence |
|-----|--------|----------|
| Stable query key | Done | Line 27: `[...userIds].sort().join(',')` |
| `undefined` in UserFirmBadge | Done | Line 15: `firmData !== undefined ? undefined : userId` |
| Map-based role lookup | Done | Lines 70-80: `useMemo` builds `Map`, line 80: O(1) `.get()` |
| Default empty Map | Done | Line 499 AdminUsers: `firmDataMap ?? new Map()` |
| Removed `useEnhancedUserExport` | Done | Import and call removed |
| Removed `usePermissions` | Done | Import and call removed |

## Remaining Issues Worth Fixing

### Issue 1: `useMemo` used for side effects (bug)
Lines 93-97 of `UsersTable.tsx` use `useMemo` to call `setCurrentPage` — this is a React anti-pattern. `useMemo` is for computing values, not triggering state updates. Should be `useEffect`.

### Issue 2: No memoization on row sub-components
`BuyerTierBadge`, `BuyerScoreBadge`, `UserDataCompleteness`, `DualFeeAgreementToggle`, `DualNDAToggle`, `UserFirmBadge` — none are wrapped in `React.memo`. Every expand/collapse or page change re-renders all 50 rows and their 6+ children. This is the main remaining rendering bottleneck.

### Issue 3: Inline closures recreated every render
Lines 252, 260 create new arrow functions `(user) => setSelectedUserForEmail(user)` on every render, defeating any future memoization. Should use `useCallback`.

### Issue 4: `useRoleManagement()` fetches audit log unnecessarily
The hook returns `auditLog` and `isLoadingAudit` — UsersTable doesn't use either. The audit log query (`get_permission_audit_log` with 100 rows) fires on every table mount for no reason. The hook should be split, or UsersTable should use a lighter variant.

### Issue 5: Query key with 600+ sorted UUIDs
Line 27 joins all 600+ UUIDs into one massive string for the query key. React Query serializes this on every render for cache comparison. For 600 UUIDs × 36 chars = ~22KB string. A hash would be more efficient, but this is a minor concern — the current approach is correct, just slightly heavy.

## Recommended Next Fix

Focus on Issues 1-3 as they're quick wins with real impact:

### File: `src/components/admin/UsersTable.tsx`
- Change `useMemo` on line 93 to `useEffect` for page reset
- Wrap `onSendEmail` callbacks in `useCallback`
- Extract row rendering into a `React.memo` wrapped `UserTableRow` component

### Files: Badge/Toggle components
- Wrap `BuyerTierBadge`, `BuyerScoreBadge`, `UserFirmBadge`, `DualFeeAgreementToggle`, `DualNDAToggle` exports in `React.memo`

## Expected Impact

| Improvement | Effect |
|-------------|--------|
| `useEffect` fix | Prevents potential render-loop bugs from state updates in `useMemo` |
| `React.memo` on sub-components | Prevents ~300 unnecessary re-renders per interaction (50 rows × 6 components) |
| `useCallback` for handlers | Enables `React.memo` to actually skip re-renders |

## Files Changed

| File | Change |
|------|--------|
| `src/components/admin/UsersTable.tsx` | Fix `useMemo`→`useEffect`, add `useCallback`, extract memoized row |
| `src/components/admin/BuyerQualityBadges.tsx` | Wrap in `React.memo` |
| `src/components/admin/UserFirmBadge.tsx` | Wrap in `React.memo` |
| `src/components/admin/DualFeeAgreementToggle.tsx` | Wrap in `React.memo` |
| `src/components/admin/DualNDAToggle.tsx` | Wrap in `React.memo` |

