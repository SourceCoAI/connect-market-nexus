

# Fix Document Signing — Root Causes Found

## Summary of Findings

Three concrete bugs are preventing the system from working:

### Bug 1: `selfHealFirm()` called with wrong arguments (CRITICAL)
In `supabase/functions/request-agreement-email/index.ts`, `selfHealFirm` is called with 2 arguments on lines 85 and 117, but the function signature requires 3 (`supabaseAdmin, userId, profile`). For any user without an existing firm (like Gmail users), this crashes with `TypeError: Cannot read properties of undefined (reading 'company')`, killing the entire request silently.

### Bug 2: `get_my_agreement_status` RPC missing timestamp fields
The modal tries to read `nda_requested_at` and `fee_requested_at` from `useMyAgreementStatus()`, but the underlying RPC only returns coverage booleans and status strings — no timestamps. So the "previously requested" info line never shows.

### Bug 3: Field name mismatch in modal
Line 46 of `AgreementSigningModal.tsx` reads `fee_requested_at` but the DB column and edge function use `fee_agreement_requested_at`.

## Why Document Tracking Appears Unchanged
The Document Tracking page code IS intact (pending queue, amber highlighting, etc.). But since the edge function crashes before inserting into `document_requests` or updating `firm_agreements`, there is no new data for the page to display. Fix the edge function and data will flow.

---

## Implementation Plan

### Step 1: Fix selfHealFirm calls in edge function
**File:** `supabase/functions/request-agreement-email/index.ts`

On line 85 (admin branch), profile data is already fetched but not passed:
```typescript
// Line 85 — currently:
const healResult = await selfHealFirm(supabaseAdmin, targetUserId);
// Fix to:
const { data: healProfile } = await supabaseAdmin
  .from('profiles').select('email, company').eq('id', targetUserId).maybeSingle();
const healResult = await selfHealFirm(supabaseAdmin, targetUserId, {
  email: overrideEmail, company: healProfile?.company
});
```

On line 117 (buyer branch), profile is already fetched on line 97-101:
```typescript
// Line 117 — currently:
const healResult = await selfHealFirm(supabaseAdmin, userId);
// Fix to:
const healResult = await selfHealFirm(supabaseAdmin, userId, {
  email: profile.email, company: profile.company
});
```

Then redeploy the function.

### Step 2: Add timestamp fields to `get_my_agreement_status` RPC
**Migration:** Update the RPC to also return `nda_requested_at` and `fee_agreement_requested_at` from `firm_agreements`, so the buyer modal can show request history.

The RPC already resolves `firm_id` via `check_agreement_coverage`. Add a lookup to `firm_agreements` for the timestamps and include them in the return columns.

### Step 3: Fix field name mismatch in AgreementSigningModal
**File:** `src/components/pandadoc/AgreementSigningModal.tsx`

Line 46: change `fee_requested_at` to `fee_agreement_requested_at`.

Update the `AgreementCoverage` interface in `use-agreement-status.ts` to include the two new timestamp fields.

### Step 4: Verify end-to-end
After deploying, test by requesting an NDA as a Gmail user. Confirm:
- Edge function returns 200
- `document_requests` row is inserted
- `firm_agreements` timestamps are updated
- Document Tracking page shows the pending request
- Modal shows "email sent on [date]" on reopening

---

## Files Changed
- `supabase/functions/request-agreement-email/index.ts` — pass profile to selfHealFirm (2 call sites)
- `src/components/pandadoc/AgreementSigningModal.tsx` — fix `fee_requested_at` to `fee_agreement_requested_at`
- `src/hooks/use-agreement-status.ts` — add timestamp fields to AgreementCoverage interface
- New migration: update `get_my_agreement_status` RPC to return request timestamps

