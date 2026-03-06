

## Build Errors — Root Causes & Fixes

There are **4 distinct issues** across 4 files, mostly caused by Supabase client version mismatches and missing type casts.

---

### 1. Supabase Client Version Mismatch (3 files)

**Root cause:** Different edge functions import `@supabase/supabase-js` at different versions (`@2`, `@2.47.10`, `@2.49.4`), creating incompatible `SupabaseClient` types when passed to shared helpers like `requireAdmin()` and `processChat()`.

| File | Current Import | Fix |
|------|---------------|-----|
| `_shared/auth.ts` | `@2` (bare) | Keep as canonical |
| `create-docuseal-submission/index.ts` | `@2.47.10` | Change to `@2` |
| `bulk-import-remarketing/index.ts` | `@2.49.4` | Change to `@2` |
| `ai-command-center/index.ts` | `@2` | Already correct — fix `processChat` param type |

**Fix:** Align all imports to `https://esm.sh/@supabase/supabase-js@2` and type the `processChat` function parameter as `SupabaseClient` (imported from the same specifier) instead of `ReturnType<typeof createClient>`.

---

### 2. `row.name` Type Error — `bulk-import-remarketing/index.ts:582`

**Root cause:** `row` is from a `Record<string, unknown>[]` array, so `row.name` is `unknown` — no `.trim()` method.

**Fix:** Cast to string: `String(row.name || 'Unknown').trim()`

---

### 3. `results` Type Mismatch — `ai-command-center/tools/buyer-tools.ts:468+`

**Root cause:** Line 423 assigns `let results = data || []` where `data` comes from an untyped Supabase `.select()`. TypeScript infers a generic type, not `BuyerRecord[]`. All subsequent `.map()` and `.filter()` calls with `(b: BuyerRecord)` annotations then fail.

**Fix:** Cast at assignment: `let results: BuyerRecord[] = (data as BuyerRecord[]) || [];`

---

### 4. `ai_command_center_usage` Insert Error — `ai-command-center/index.ts:286`

**Root cause:** Same version mismatch — the `supabase` client passed to `trackUsage()` has mismatched generic types, causing `.from().insert()` to resolve to `never`.

**Fix:** Resolved by fix #1 (aligning the import) plus typing the `supabase` parameter as `SupabaseClient` from the shared import.

---

### Summary of Changes

1. **`supabase/functions/create-docuseal-submission/index.ts`** — Change import from `@2.47.10` to `@2`
2. **`supabase/functions/bulk-import-remarketing/index.ts`** — Change import from `@2.49.4` to `@2`; fix line 582 to `String(row.name || 'Unknown').trim()`
3. **`supabase/functions/ai-command-center/index.ts`** — Type `processChat` and `trackUsage` params as `SupabaseClient` instead of `ReturnType<typeof createClient>`
4. **`supabase/functions/ai-command-center/tools/buyer-tools.ts`** — Cast `results` to `BuyerRecord[]` at line 423

