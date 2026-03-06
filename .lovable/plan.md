

# Plan: Fix Edge Function Build Errors & Deploy All

The build errors are all TypeScript type-safety issues across 5 edge functions. Once fixed, all functions can be deployed.

## Errors & Fixes

### 1. `auto-create-firm-on-approval/index.ts` (1 error)
**Problem:** `SupabaseClient` type mismatch when passing to `requireAdmin()` — caused by mismatched `@supabase/supabase-js` import versions between `_shared/auth.ts` (uses `@2`) and this file.
**Fix:** Align the import to use the same specifier: `https://esm.sh/@supabase/supabase-js@2` (not a pinned patch like `@2.49.4`). Alternatively, cast the client with `as any` in the call.

### 2. `bulk-import-remarketing/index.ts` (2 errors)
**Problem:** `ImportData` interface doesn't have an index signature, so `data[field]` where `field` is `string` fails.
**Fix:** Add `[key: string]: unknown;` index signature to the `ImportData` interface, or cast `data as Record<string, unknown>` in the validation loop.

### 3. `calculate-deal-quality/index.ts` (24 errors)
**Problem:** The `calculateScoresFromData` function parameter is typed as `Record<string, unknown>`, so all property accesses like `.toLowerCase()`, `.join()`, and comparisons like `>= 500` fail because values are `unknown`/`{}`.
**Fix:**
- Define a `DealRecord` interface with typed fields (e.g., `google_review_count: number`, `address_city: string`, etc.) and use it as the parameter type.
- Type `listingsToScore` as `DealRecord[]` instead of implicit `unknown[]`.

### 4. `clarify-industry/index.ts` (1 error)
**Problem:** `result.data?.questions` resolves to `{}` instead of an array, so assignment to `ClarifyQuestion[]` fails.
**Fix:** Cast: `(result.data?.questions as ClarifyQuestion[]) || []`.

### 5. `confirm-agreement-signed/index.ts` (3 errors)
**Problem:** Dynamic column access via `firm[signedCol]` and `docData?.[docUrlCol]` fails because the `.select()` with template literals returns a union type.
**Fix:** Cast `firm` and `docData` to `Record<string, unknown>` or use `as any` for dynamic access.

## After Fixes
Deploy all edge functions using the deployment tool.

## Summary of Changes
| File | Change |
|------|--------|
| `bulk-import-remarketing/index.ts` | Add index signature to `ImportData` |
| `calculate-deal-quality/index.ts` | Add `DealRecord` interface, type arrays and function params |
| `clarify-industry/index.ts` | Cast `result.data?.questions` to array |
| `confirm-agreement-signed/index.ts` | Cast dynamic column access |
| `auto-create-firm-on-approval/index.ts` | Align supabase-js import version |
| Deploy all ~148 functions | After fixes pass |

