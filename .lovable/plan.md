

# Root Cause: "Failed to request connection" Error

## What's Happening

Two issues combine to cause the error:

### Issue 1: No visual NDA gate on the listing page
The `ConnectionButton` silently blocks clicks when NDA isn't signed (line 53: `if (coverage && !coverage.nda_covered) return;`) — the button just does nothing. There is **no UI telling the user they need to sign an NDA**. The profile completeness gate has a nice visual block with instructions; the NDA gate has nothing.

### Issue 2: Race condition lets the click through
When `coverage` is still loading (undefined), the guard `coverage && !coverage.nda_covered` evaluates to `false` (because `coverage` is falsy), so the click passes through → dialog opens → user submits → the server-side RPC enforces NDA and raises `'NDA must be signed before requesting deal access'` → error toast.

### Issue 3 (separate): `get_user_firm_agreement_status` RPC broken
The console is spammed with `column fa.nda_pandadoc_signed_url does not exist` because the PandaDoc migration (`20260310000000`) hasn't been applied to the database. This doesn't directly cause the connection error but is a separate DB schema issue that needs a migration fix.

### Issue 4: Gmail users can never get domain-based NDA coverage
`gmail.com` is in the `generic_email_domains` table, so `check_agreement_coverage` always returns `is_covered: false`. These users need to sign an NDA through PandaDoc directly — which requires the NDA signing UI gate to be visible.

## Plan

### File 1: `src/components/listing-detail/ConnectionButton.tsx`

Add a **visual NDA gate block** (similar to the profile completeness block) that renders when `coverage` exists and `nda_covered` is false. Shows:
- "NDA Required" heading
- Brief explanation that an NDA must be signed before requesting access
- Link/button to initiate NDA signing (or message to contact support if no firm resolved)

Also fix the race condition: change the `handleButtonClick` guard to block when `coverage` is **undefined** (still loading) — `if (!isAdmin && (!coverage || !coverage.nda_covered)) return;`

### File 2: Migration — fix `get_user_firm_agreement_status` RPC

Create a migration that either:
- Adds the missing `nda_pandadoc_signed_url` column to `firm_agreements` (the PandaDoc migration should have done this)
- OR updates the RPC to not reference that column

Since the column addition migration exists but wasn't applied, the simplest fix is a new migration that re-runs the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements for the PandaDoc columns, then re-creates the RPC.

### Technical Details

- The NDA gate visual block goes between the profile completeness block (line 178) and the closed/sold block (line 181)
- The guard fix changes line 53 from `coverage &&` to `(!coverage ||` to be safe-by-default
- The migration adds 6 PandaDoc columns with `IF NOT EXISTS` (idempotent) and re-creates `get_user_firm_agreement_status`

