

# Fix: Admin Users Page Extreme Slowness

## Root Cause

The page renders **614 users** and each row makes **3 individual Supabase RPC calls** (`resolve_user_firm_id` + `firm_agreements` fetch):

1. `UserFirmBadge` → `useUserFirm(userId)` — 614 calls
2. `DualFeeAgreementToggle` → `useUserFirm(user.id)` — 614 calls  
3. `DualNDAToggle` → `useUserFirm(user.id)` — 614 calls

That's **~1,842 individual database round-trips** on page load. Each involves an RPC call to `resolve_user_firm_id` followed by a `firm_agreements` query. This is why every row shows "Loading..." and the page crawls.

Additionally, `useRoleManagement()` inside `UsersTable` fetches all roles, and `useEnhancedUserExport()` runs on every render.

## Fix Strategy

### 1. Batch-fetch all firm data in ONE query (biggest win)

Create a new hook `useBulkUserFirms` that:
- Takes the full list of user IDs
- Calls a single RPC or direct query to resolve all firms at once
- Returns a `Map<userId, firmData>`
- Pass the map down as a prop to `UsersTable`, `DualFeeAgreementToggle`, `DualNDAToggle`, and `UserFirmBadge`

This replaces **1,842 queries** with **1 query**.

The RPC `resolve_user_firm_id` only handles one user. We'll create a new approach:
- Query `firm_members` joined with `firm_agreements` for all user IDs in one call
- Fall back gracefully for users without firm membership

### 2. Virtualize the table

614 rows means 614 × ~12 components per row = ~7,000+ mounted React components. Use `@tanstack/react-virtual` to only render visible rows (~15-20 at a time).

### 3. Remove per-row hooks from toggle components

`DualFeeAgreementToggle` and `DualNDAToggle` each call `useUserFirm` internally. Refactor them to accept firm data as a prop instead.

### 4. Paginate or lazy-load as fallback

If virtualization is complex with expandable rows, add simple pagination (50 users per page) as an alternative.

## Implementation

### File 1: `src/hooks/admin/use-bulk-user-firms.ts` (NEW)

Single query that joins `firm_members` → `firm_agreements` for all users:

```ts
const { data } = await supabase
  .from('firm_members')
  .select(`
    user_id,
    firm:firm_agreements(
      id, primary_company_name,
      nda_signed, nda_signed_at, nda_signed_by_name, nda_email_sent, nda_email_sent_at,
      fee_agreement_signed, fee_agreement_signed_at, fee_agreement_signed_by_name,
      fee_agreement_email_sent, fee_agreement_email_sent_at
    )
  `)
  .in('user_id', userIds);
```

Returns `Map<string, FirmData>`.

### File 2: `src/components/admin/UsersTable.tsx`

- Accept `firmDataMap: Map<string, FirmData>` as a prop
- Pass firm data to `UserFirmBadge`, `DualFeeAgreementToggle`, `DualNDAToggle` as props
- Add pagination: show 50 users per page with prev/next controls

### File 3: `src/components/admin/UserFirmBadge.tsx`

- Accept optional `firmData` prop
- If provided, skip `useUserFirm` hook call
- Eliminates 614 individual queries

### File 4: `src/components/admin/DualFeeAgreementToggle.tsx`

- Accept optional `firmData` prop
- If provided, use it instead of calling `useUserFirm`
- Eliminates 614 individual queries

### File 5: `src/components/admin/DualNDAToggle.tsx`

- Same pattern as DualFeeAgreementToggle
- Eliminates 614 individual queries

### File 6: `src/pages/admin/AdminUsers.tsx`

- Call `useBulkUserFirms(userIds)` once
- Pass `firmDataMap` to `UsersTable`

## Also fix: Build errors

The build errors in `data-room-upload`, `firm-self-heal`, and `enrich-deal` edge functions need type fixes:

- `firm-self-heal.ts:104` — add `as string` assertion or null check for `firmId`
- `data-room-upload/index.ts:199` — fix the Supabase client type mismatch (add `.then()` or cast)
- `enrich-deal` — update `DealTranscriptRow` type to make new fields optional, fix `Date` constructor argument types

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| DB queries on load | ~1,842 | ~2 |
| Mounted rows | 614 | 50 (paginated) |
| Time to interactive | 10-15s+ | <2s |

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/admin/use-bulk-user-firms.ts` | NEW — batch firm lookup |
| `src/pages/admin/AdminUsers.tsx` | Call bulk hook, pass map to table |
| `src/components/admin/UsersTable.tsx` | Accept firmDataMap prop, add pagination |
| `src/components/admin/UserFirmBadge.tsx` | Accept optional firmData prop |
| `src/components/admin/DualFeeAgreementToggle.tsx` | Accept optional firmData prop |
| `src/components/admin/DualNDAToggle.tsx` | Accept optional firmData prop |
| `supabase/functions/data-room-upload/index.ts` | Fix TS type error |
| `supabase/functions/_shared/firm-self-heal.ts` | Fix null type error |
| `supabase/functions/enrich-deal/index.ts` | Fix DealTranscriptRow type mismatches |
| `supabase/functions/enrich-deal/external-enrichment.ts` | Fix Date constructor type |

