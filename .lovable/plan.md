

# Operations Hub Fixes + Remove Test Data

## Remaining Bugs Found

### 1. Wrong FK hint in two cards (WILL CRASH)
Both **UnreadMessagesCard** (line 128) and **ConnectionRequestsCard** (line 220) use `connection_requests_user_id_fkey` but the actual FK name is `connection_requests_user_id_profiles_fkey`. This will cause PostgREST to return an error.

### 2. Test data to delete
The user `adambhaile00@gmail.com` created test firm agreements and document requests that should be cleaned up. The test firms visible in the screenshot are: **AdamCo**, **Acme Inc**, **test**, **Great company**. Their document_requests and firm_agreements (plus firm_members) need to be deleted.

Everything else in the Operations Hub is correctly implemented -- column names, queries, grouping logic, and display are all valid.

## Changes

| # | What | Detail |
|---|------|--------|
| 1 | Fix FK hint in `OperationsHub.tsx` line 128 | Change `connection_requests_user_id_fkey` → `connection_requests_user_id_profiles_fkey` |
| 2 | Fix FK hint in `OperationsHub.tsx` line 220 | Change `connection_requests_user_id_fkey` → `connection_requests_user_id_profiles_fkey` |
| 3 | Database migration: delete test data | Delete `document_requests` for test firms, then `firm_members` for test firms, then the 4 `firm_agreements` rows (AdamCo, Acme Inc, test, Great company) by their known IDs |

### Test firm IDs to delete
- `f3fe049d-143a-4fd5-837b-8e839cf58094` (AdamCo)
- `5eccb4d6-f52a-440f-bf3c-02a1426da85a` (Acme Inc)
- `285ad5e8-7447-4681-977d-4727e1de14a4` (test)
- `ab961d3a-5a90-462c-9063-8b4b6c462e39` (Great company)

No other issues remain. The OperationsHub will work correctly after these two FK fixes.

